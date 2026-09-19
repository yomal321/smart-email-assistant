// POST /api/settings/purge — the Settings page's "Purge all processed data.
// This cannot be undone." box, gated by typing "PURGE" (matches the UI's
// own confirmation-string gate).
//
// None of this schema's FKs have ON DELETE CASCADE (checked 0001-0011 — all
// plain `references`), so children are deleted explicitly, in FK-safe
// order, before `emails` and `contacts`. The activity_log entry is written
// *before* deleting, never after — otherwise the purge would erase its own
// record the instant it ran (PHASE-4-IMPLEMENTATION-PLAN.md Wave 4).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";

// Deletion order: children before the parents they reference. `rule_runs`
// is included even though it isn't itself "processed email data" — it FKs
// to `emails` and would block the final `emails` delete otherwise.
const CHILD_TABLES = ["nudges", "commitments", "contact_tone_history", "rule_runs", "thread_entries", "drafts", "tasks"];
const PARENT_TABLES = ["contacts", "emails"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const confirm: unknown = body?.confirm;

  if (confirm !== "PURGE") {
    return NextResponse.json({ error: 'confirm must be exactly "PURGE"' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { error: logError } = await supabase.from("activity_log").insert({
    account_id: accountId,
    action: "Purged processed data",
    target: "all emails, tasks, drafts, commitments, contacts, and derived data",
    cause: `Manual purge, confirmed by typing "PURGE"`,
    undoable: false,
  });
  if (logError) {
    return NextResponse.json({ error: "failed to record purge — aborted before deleting anything" }, { status: 500 });
  }

  for (const table of [...CHILD_TABLES, ...PARENT_TABLES]) {
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) {
      return NextResponse.json({ error: `purge failed partway through, at table "${table}"` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
