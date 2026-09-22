// GET/PATCH/DELETE /api/plans/:id — plan detail (with its tasks), edit, and
// delete, backing app/plans/[id]/page.tsx (spec.md FR6/FR8, design.md "API
// Changes").
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapPlanRowToPlan, type PlanRow } from "@/lib/data/plan-mapping";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";

const SELECT_COLUMNS = "id, title, description, status, target_date, category, created_at, updated_at";

// Mirrors TaskRow's field list exactly (lib/data/task-mapping.ts) — never
// `select("*")`.
const TASK_SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence, plan_id";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  const [planRes, tasksRes] = await Promise.all([
    supabase.from("plans").select(SELECT_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("tasks").select(TASK_SELECT_COLUMNS).eq("plan_id", id),
  ]);

  if (planRes.error || tasksRes.error) {
    return NextResponse.json({ error: "failed to read plan" }, { status: 500 });
  }
  // A detail read has no meaningful empty success to return, unlike
  // action-items/[id]'s silent-no-op convention for an unknown id
  // (spec.md Edge Cases).
  if (!planRes.data) {
    return NextResponse.json({ error: "plan not found" }, { status: 404 });
  }

  const taskRows = (tasksRes.data ?? []) as unknown as TaskRow[];
  const plan = mapPlanRowToPlan(planRes.data as unknown as PlanRow, taskRows);
  const tasks = taskRows.map(mapTaskRowToActionItem);

  return NextResponse.json({ plan, tasks });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.title !== undefined) update.title = body.title;
  if (body?.description !== undefined) update.description = body.description;
  if (body?.status !== undefined) update.status = body.status;
  if (body?.targetDate !== undefined) update.target_date = body.targetDate;
  if (body?.category !== undefined) update.category = body.category; // 0021_life_layer.sql

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "at least one of title, description, status, targetDate is required" },
      { status: 400 }
    );
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("plans").update(update).eq("id", id).select(SELECT_COLUMNS).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to update plan" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "plan not found" }, { status: 404 });
  }

  const { data: taskRows, error: tasksError } = await supabase
    .from("tasks")
    .select("status")
    .eq("plan_id", id);
  if (tasksError) {
    return NextResponse.json({ error: "failed to read plan tasks" }, { status: 500 });
  }

  const plan = mapPlanRowToPlan(data as unknown as PlanRow, (taskRows ?? []) as { status: string }[]);
  return NextResponse.json({ plan });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  // Deleting a plan must never delete the work underneath it (spec.md AC5) —
  // null out its tasks' plan_id before the plan row itself is removed. There
  // is deliberately no ON DELETE CASCADE on tasks.plan_id to rely on instead.
  const { error: unassignError } = await supabase.from("tasks").update({ plan_id: null }).eq("plan_id", id);
  if (unassignError) {
    return NextResponse.json({ error: "failed to unassign plan's tasks" }, { status: 500 });
  }

  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "failed to delete plan" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
