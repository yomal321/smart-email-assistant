// POST /api/settings/cleanup — selective removal of low-value mail.
//
// The existing /api/settings/purge is all-or-nothing: it empties every table
// for the account. That is the wrong tool for "my inbox filled up with Temu
// and LinkedIn noise", which is the common case and wants a scalpel.
//
// Rule: an email is a candidate when Gmail tagged it CATEGORY_PROMOTIONS or
// CATEGORY_SOCIAL, or when Triage classified it `promotional`/`low_priority`.
// CATEGORY_UPDATES is deliberately NOT included — that bucket carries bank
// notices, receipts and account-security alerts.
//
// Three guards keep it from eating real work. Starred and user-sent mail are
// never candidates, and neither is any email that already has a task, draft
// or commitment hanging off it — 04-data-model.md ("Deletion propagation")
// warns that cascading here would silently delete commitments the user still
// owes. An email carrying extracted work is, by definition, not noise.
//
// Deletion order matches purge/route.ts: no FK in this schema has ON DELETE
// CASCADE, so children go first. The activity_log row is written before the
// delete, never after.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";

const BULK_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"];
const BULK_CATEGORIES = ["promotional", "low_priority"];

// email_id-bearing children, in FK-safe order. `nudges` precedes `commitments`
// because it references both; the work-guard below means candidates carry no
// commitments/tasks/drafts anyway, but the order stays correct regardless.
const CHILD_TABLES = ["nudges", "rule_runs", "thread_entries"];

type Candidate = {
  id: string;
  subject: string | null;
  category: string | null;
  received_at: string | null;
  sender: string;
  reason: string;
};

function senderOf(participants: unknown): string {
  if (!Array.isArray(participants)) return "";
  const from = participants.find((p) => p?.role === "from");
  return typeof from?.address === "string" ? from.address.toLowerCase() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const dryRun = body?.dryRun !== false; // default to a dry run — execution must be explicit
  const olderThanDays = Number.isFinite(body?.olderThanDays) ? Number(body.olderThanDays) : null;
  // Optional narrowing for the delete call, e.g. the caller's search/reason
  // filters over an already-fetched candidate list. Only ever narrows: it is
  // intersected with the candidate set this route recomputes independently
  // below, never trusted on its own, so a stale or tampered id list can never
  // widen a deletion past what actually qualifies right now.
  const onlyIds: string[] | null = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : null;

  if (!dryRun && body?.confirm !== "CLEANUP") {
    return NextResponse.json({ error: 'confirm must be exactly "CLEANUP" to delete' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  // Candidates, gathered as separate queries and unioned here rather than as
  // one `.or()` string — jsonb `contains` needs bracket-and-quote escaping
  // inside an or-filter, and getting that subtly wrong would silently widen
  // what gets deleted.
  const base = () =>
    supabase
      .from("emails")
      .select("id, subject, category, received_at, participants")
      .eq("account_id", accountId)
      .eq("is_starred", false)
      .eq("is_from_user", false);

  const byReason = new Map<string, string>();
  const rows = new Map<string, Record<string, unknown>>();

  for (const label of BULK_LABELS) {
    // supabase-js's .contains() serializes a JS array as a Postgres array
    // literal (cs.{a,b}), which is for a real array column, not jsonb. labels
    // is jsonb storing a JSON array, so it needs cs.["value"] instead -- pass
    // the JSON text directly so the string branch forwards it as-is.
    const { data, error } = await base().contains("labels", JSON.stringify([label]));
    if (error) return NextResponse.json({ error: `failed to scan label ${label}` }, { status: 500 });
    for (const row of data ?? []) {
      rows.set(row.id, row);
      byReason.set(row.id, byReason.has(row.id) ? `${byReason.get(row.id)}+${label}` : label);
    }
  }

  const { data: byCategory, error: catError } = await base().in("category", BULK_CATEGORIES);
  if (catError) return NextResponse.json({ error: "failed to scan categories" }, { status: 500 });
  for (const row of byCategory ?? []) {
    rows.set(row.id, row);
    byReason.set(row.id, byReason.has(row.id) ? `${byReason.get(row.id)}+${row.category}` : String(row.category));
  }

  let ids = [...rows.keys()];

  if (olderThanDays !== null) {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    ids = ids.filter((id) => {
      const at = rows.get(id)?.received_at;
      return typeof at === "string" && new Date(at).getTime() < cutoff;
    });
  }

  // The work guard: drop any candidate that already produced a task, draft or
  // commitment. Chunked because `in.()` goes into the query string.
  const protectedIds = new Set<string>();
  for (const table of ["tasks", "drafts", "commitments"]) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const { data, error } = await supabase.from(table).select("email_id").in("email_id", chunk);
      if (error) return NextResponse.json({ error: `failed to check ${table}` }, { status: 500 });
      for (const row of data ?? []) if (row.email_id) protectedIds.add(row.email_id);
    }
  }

  let finalIds = ids.filter((id) => !protectedIds.has(id));
  if (onlyIds !== null) {
    const requested = new Set(onlyIds);
    finalIds = finalIds.filter((id) => requested.has(id));
  }

  const candidates: Candidate[] = finalIds.map((id) => {
    const row = rows.get(id)!;
    return {
      id,
      subject: (row.subject as string) ?? null,
      category: (row.category as string) ?? null,
      received_at: (row.received_at as string) ?? null,
      sender: senderOf(row.participants),
      reason: byReason.get(id) ?? "",
    };
  });

  const bySender: Record<string, number> = {};
  for (const c of candidates) {
    const domain = c.sender.split("@").pop() || "(unknown)";
    bySender[domain] = (bySender[domain] ?? 0) + 1;
  }

  if (dryRun) {
    // Total stored mail, so the caller can show what share of the mailbox is
    // low-value rather than an unanchored count. head+count fetches no rows.
    const { count: totalStored } = await supabase
      .from("emails")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    return NextResponse.json({
      dryRun: true,
      totalStored: totalStored ?? 0,
      wouldDelete: candidates.length,
      skippedBecauseTheyHaveWork: protectedIds.size,
      bySenderDomain: bySender,
      candidates,
    });
  }

  const { error: logError } = await supabase.from("activity_log").insert({
    account_id: accountId,
    action: "Cleaned up low-value mail",
    target: `${finalIds.length} emails (promotions/social labels or promotional/low_priority category)`,
    cause: `Selective cleanup${olderThanDays !== null ? `, older than ${olderThanDays}d` : ""}. ${protectedIds.size} kept for having extracted work.`,
    undoable: false,
  });
  if (logError) {
    return NextResponse.json({ error: "failed to record cleanup — aborted before deleting anything" }, { status: 500 });
  }

  for (const table of [...CHILD_TABLES, "emails"]) {
    const column = table === "emails" ? "id" : "email_id";
    for (let i = 0; i < finalIds.length; i += 200) {
      const chunk = finalIds.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const { error } = await supabase.from(table).delete().in(column, chunk);
      if (error) {
        return NextResponse.json({ error: `cleanup failed partway through, at table "${table}"` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, deleted: finalIds.length, kept: protectedIds.size });
}
