// GET/POST /api/plans — the plan list (with derived progress) and create,
// backing app/plans/page.tsx (spec.md FR1/FR5/FR7, design.md "API Changes").
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapPlanRowToPlan, type PlanRow, type PlanTaskRow } from "@/lib/data/plan-mapping";

// Mirrors PlanRow's field list exactly (lib/data/plan-mapping.ts) — never
// `select("*")` (field-minimization convention, NFR6).
const SELECT_COLUMNS = "id, title, description, status, target_date, created_at, updated_at";

export async function GET() {
  const supabase = getSupabaseServerClient();

  const [plansRes, tasksRes] = await Promise.all([
    supabase.from("plans").select(SELECT_COLUMNS),
    // Progress is derived, never stored (FR5) — read the assigned tasks'
    // status straight from `tasks`, not a counter column.
    supabase.from("tasks").select("plan_id, status").not("plan_id", "is", null),
  ]);

  if (plansRes.error || tasksRes.error) {
    return NextResponse.json({ error: "failed to read plans" }, { status: 500 });
  }

  const tasksByPlan = new Map<string, PlanTaskRow[]>();
  for (const row of (tasksRes.data ?? []) as { plan_id: string; status: string }[]) {
    const list = tasksByPlan.get(row.plan_id) ?? [];
    list.push({ status: row.status });
    tasksByPlan.set(row.plan_id, list);
  }

  const plans = ((plansRes.data ?? []) as unknown as PlanRow[]).map((row) =>
    mapPlanRowToPlan(row, tasksByPlan.get(row.id) ?? [])
  );

  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title: unknown = body?.title;
  const description: unknown = body?.description ?? null;
  const targetDate: unknown = body?.targetDate ?? null;

  if (typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  if (description !== null && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string or null" }, { status: 400 });
  }
  if (targetDate !== null && typeof targetDate !== "string") {
    return NextResponse.json({ error: "targetDate must be a string or null" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("plans")
    .insert({
      account_id: accountId,
      title,
      description,
      target_date: targetDate,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create plan" }, { status: 500 });
  }

  const plan = mapPlanRowToPlan(data as unknown as PlanRow, []);
  return NextResponse.json(plan);
}
