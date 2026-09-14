// PATCH /api/action-items/:id — mirrors action-items-provider.tsx's reducer
// update cases server-side, {status?, dueDate?, priority?} -> status=$status,
// deadline=$dueDate, priority=$priority (spec.md FR3/FR9, design.md "API
// Changes").
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";

// Mirrors TaskRow's field list exactly (lib/data/task-mapping.ts) — never
// `select("*")` (field-minimization convention).
const SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.status !== undefined) update.status = body.status;
  if (body?.dueDate !== undefined) update.deadline = body.dueDate;
  if (body?.priority !== undefined) update.priority = body.priority;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one of status, dueDate, priority is required" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update action item" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as TaskRow[];
  // An id that doesn't match any row (unknown, or belongs to a different
  // account) affects zero rows — a silent no-op, not a 404, matching
  // messages/[id]/platform's convention for unknown ids.
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = mapTaskRowToActionItem(rows[0]);
  return NextResponse.json({ updated });
}
