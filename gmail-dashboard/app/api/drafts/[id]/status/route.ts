// POST /api/drafts/:id/status — status transitions for a draft (approved/
// sent/discarded) (spec.md FR13, design.md "API Changes"). "pending" isn't
// settable here — it's only the initial value n8n's generation writes.
// Approving stamps approved_at once and never moves it on a repeat approval.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapDraftRowToDraft, type DraftRow } from "@/lib/data/draft-mapping";

const SETTABLE_STATUSES = ["approved", "sent", "discarded"] as const;

// Mirrors DraftRow's field list exactly (lib/data/draft-mapping.ts) — never
// `select("*")`.
const DRAFT_COLUMNS =
  "id, email_id, draft_body, generated_body, tone, length, status, created_at, approved_at, edit_distance";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const status: unknown = body?.status;

  if (typeof status !== "string" || !SETTABLE_STATUSES.includes(status as (typeof SETTABLE_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${SETTABLE_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const update: Record<string, unknown> = { status };

  if (status === "approved") {
    const { data: current, error: readError } = await supabase
      .from("drafts")
      .select("approved_at")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: "failed to read draft" }, { status: 500 });
    }

    // Approving twice must not move the timestamp — only stamp approved_at
    // the first time it's set (spec Edge Cases).
    if (!current?.approved_at) {
      update.approved_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase.from("drafts").update(update).eq("id", id).select(DRAFT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update draft status" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as DraftRow[];
  // An id that doesn't match any row is a silent no-op, not a 404, matching
  // /api/messages/:id/platform's convention (spec Edge Cases).
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = mapDraftRowToDraft(rows[0]);
  return NextResponse.json({ updated });
}
