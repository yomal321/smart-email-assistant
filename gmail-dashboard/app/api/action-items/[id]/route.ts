// PATCH /api/action-items/:id — mirrors action-items-provider.tsx's reducer
// update cases server-side, {status?, dueDate?, priority?} -> status=$status,
// deadline=$dueDate, priority=$priority (spec.md FR3/FR9, design.md "API
// Changes"). Also accepts planId (013-life-hub, spec.md FR4) and the
// 0016_life_load.sql ranking fields (type/sourceId/courseId/dueAt/startsAt/
// durationMinutes/effortMinutes/weight) — everything else here is unchanged.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";

// Mirrors TaskRow's field list exactly (lib/data/task-mapping.ts) — never
// `select("*")` (field-minimization convention).
const SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence, plan_id, type, source_id, course_id, due_at, starts_at, duration_minutes, effort_minutes, weight";

// Postgres foreign-key-violation code — surfaced as a 400 (an unknown planId)
// rather than a raw 500 (spec.md Edge Cases).
const FOREIGN_KEY_VIOLATION = "23503";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.status !== undefined) {
    update.status = body.status;
    // Set here, not by each caller, so every writer of `status` — the mail
    // module's action-items-provider, the hub's Today/Tasks pages, and any
    // future bot/n8n write — gets it for free. Cleared on any move away from
    // 'done' (not just an explicit undo) so completed_at never lags status.
    update.completed_at = body.status === "done" ? new Date().toISOString() : null;
  }
  if (body?.dueDate !== undefined) update.deadline = body.dueDate;
  if (body?.priority !== undefined) update.priority = body.priority;
  if (body?.planId !== undefined) update.plan_id = body.planId;
  if (body?.type !== undefined) update.type = body.type;
  if (body?.sourceId !== undefined) update.source_id = body.sourceId;
  if (body?.courseId !== undefined) update.course_id = body.courseId;
  if (body?.dueAt !== undefined) update.due_at = body.dueAt;
  if (body?.startsAt !== undefined) update.starts_at = body.startsAt;
  if (body?.durationMinutes !== undefined) update.duration_minutes = body.durationMinutes;
  if (body?.effortMinutes !== undefined) update.effort_minutes = body.effortMinutes;
  if (body?.weight !== undefined) update.weight = body.weight;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one recognized field is required" },
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
    if (error.code === FOREIGN_KEY_VIOLATION) {
      return NextResponse.json({ error: "planId does not reference an existing plan" }, { status: 400 });
    }
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
