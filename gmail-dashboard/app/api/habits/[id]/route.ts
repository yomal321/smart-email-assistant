// PATCH /api/habits/:id — archive/unarchive (soft delete; no hard-delete
// route). See PHASE-7-IMPLEMENTATION-PLAN.md Wave 3.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapHabitRowToHabit, type HabitRow } from "@/lib/data/habit-mapping";

const SELECT_COLUMNS = "id, name, cadence, archived_at, created_at";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.name !== undefined) update.name = body.name;
  if (body?.archivedAt !== undefined) update.archived_at = body.archivedAt;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "at least one of name, archivedAt is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("habits").update(update).eq("id", id).select(SELECT_COLUMNS).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to update habit" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "habit not found" }, { status: 404 });
  }

  const habit = mapHabitRowToHabit(data as unknown as HabitRow, []);
  return NextResponse.json({ habit });
}
