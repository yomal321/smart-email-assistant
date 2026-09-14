// PATCH /api/drafts/:id — edits a draft's body/tone/length (spec.md FR11/
// FR12, design.md "API Changes"). Editing `body` recomputes edit_distance
// against the immutable generated_body via draft-mapping.ts's
// computeEditDistance (T6) — the client never computes or sends
// edit_distance itself.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapDraftRowToDraft, computeEditDistance, type DraftRow } from "@/lib/data/draft-mapping";

// Mirrors DraftRow's field list exactly (lib/data/draft-mapping.ts) — never
// `select("*")`.
const DRAFT_COLUMNS =
  "id, email_id, draft_body, generated_body, tone, length, status, created_at, approved_at, edit_distance";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const draftBody: unknown = body?.body;
  const tone: unknown = body?.tone;
  const length: unknown = body?.length;

  const supabase = getSupabaseServerClient();
  const update: Record<string, unknown> = {};

  if (typeof draftBody === "string") {
    // Read the pre-edit generated_body so edit_distance always diffs
    // against the immutable original, never against whatever draft_body
    // already held.
    const { data: current, error: readError } = await supabase
      .from("drafts")
      .select("generated_body")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: "failed to read draft" }, { status: 500 });
    }

    update.draft_body = draftBody;
    update.edit_distance = computeEditDistance(draftBody, current?.generated_body ?? null);
  }
  if (typeof tone === "string") {
    update.tone = tone;
  }
  if (typeof length === "string") {
    update.length = length;
  }

  const { data, error } = await supabase.from("drafts").update(update).eq("id", id).select(DRAFT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update draft" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as DraftRow[];
  // An id that doesn't match any row (unknown, or belongs to a different
  // account) affects zero rows — a silent no-op, not a 404, matching
  // /api/messages/:id/platform's convention (spec Edge Cases).
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = mapDraftRowToDraft(rows[0]);
  return NextResponse.json({ updated });
}
