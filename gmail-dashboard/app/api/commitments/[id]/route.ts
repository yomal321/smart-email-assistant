// PATCH /api/commitments/:id — {status: "met" | "missed"} -> commitments.status
// (spec 011-followups-contacts-api). Mirrors action-items/[id]/route.ts's
// partial-update convention: at least one recognized field required (here,
// just `status`), and an unknown id is a silent no-op, not a 404.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapCommitmentRowToCommitment, type CommitmentRow } from "@/lib/data/commitment-mapping";

// Mirrors CommitmentRow's field list exactly (lib/data/commitment-mapping.ts)
// — never `select("*")` (field-minimization convention).
const SELECT_COLUMNS =
  "id, email_id, direction, text, trigger_sentence, counterparty_id, due_date, status, confidence, created_at";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const status: unknown = body?.status;

  if (status !== "met" && status !== "missed") {
    return NextResponse.json({ error: "status must be 'met' or 'missed'" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("commitments")
    .update({ status })
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update commitment" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as CommitmentRow[];
  // An id that doesn't match any row affects zero rows — a silent no-op, not
  // a 404, matching action-items/[id]/route.ts's convention for unknown ids.
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = mapCommitmentRowToCommitment(rows[0]);
  return NextResponse.json({ updated });
}
