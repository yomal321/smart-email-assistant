// GET /api/commitments — the bounded list read backing the commitments view
// (spec 011-followups-contacts-api). Every row maps through
// lib/data/commitment-mapping.ts's shared mapper so the counterparty/
// days-elapsed logic lives in exactly one place.
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const direction = searchParams.get("direction");

  const supabase = getSupabaseServerClient();
  let query = supabase.from("commitments").select(SELECT_COLUMNS);

  if (direction) {
    query = query.eq("direction", direction);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read commitments" }, { status: 500 });
  }

  const items = ((data ?? []) as unknown as CommitmentRow[]).map(mapCommitmentRowToCommitment);
  return NextResponse.json(items);
}
