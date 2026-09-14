// PATCH /api/contacts/:id/vip — mirrors messages/[id]/star's
// update-by-id pattern, {value} -> is_vip=$value. An id that doesn't match
// any row (unknown, or belongs to a different account) affects zero rows —
// a silent no-op, not a 404, matching action-items/[id] and
// messages/[id]/star's own convention for unknown ids on an update route
// (as opposed to the single-GET routes, which do 404).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapContactRowToContact, type ContactRow } from "@/lib/data/contact-mapping";

// Mirrors ContactRow's field list exactly (lib/data/contact-mapping.ts) —
// never `select("*")`.
const SELECT_COLUMNS = "id, account_id, name, email, domain, avatar_url, is_vip";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const value: unknown = body?.value;

  if (typeof value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ is_vip: value })
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update contact" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ContactRow[];
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = await mapContactRowToContact(rows[0]);
  return NextResponse.json({ updated });
}
