// GET /api/hub/weekly-review — spec.md §30's Weekly Review: what got done,
// what got missed, what's coming, and cross-module progress. Read-only, no
// schema. A separate small route rather than extending
// app/api/hub/summary/route.ts further — that route answers "what's ranked
// right now"; this one answers "what happened / what's coming" over a
// week, a different question with its own two queries.
// See PHASE-7-IMPLEMENTATION-PLAN.md Wave 5.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";
import { mapPlanRowToPlan, type PlanRow, type PlanTaskRow } from "@/lib/data/plan-mapping";
import { byPriority } from "@/lib/priority";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/day-key";

const OPEN_STATUSES = ["todo", "in-progress"];
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

const TASK_SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence, plan_id, type, source_id, course_id, due_at, starts_at, duration_minutes, effort_minutes, weight";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - WEEK_DAYS * DAY_MS).toISOString();

  const [
    { data: doneRows, error: doneError },
    { data: openRows, error: openError },
    { data: planRows, error: plansError },
    { data: planTaskRows, error: planTasksError },
    { data: settingsRow },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_SELECT_COLUMNS)
      .eq("status", "done")
      .gt("completed_at", sevenDaysAgo),
    supabase.from("tasks").select(TASK_SELECT_COLUMNS).in("status", OPEN_STATUSES),
    supabase.from("plans").select("id, title, description, status, target_date, category, created_at, updated_at"),
    supabase.from("tasks").select("plan_id, status").not("plan_id", "is", null),
    (async () => {
      const accountId = await getAccountId(supabase);
      if (!accountId) return { data: null };
      return supabase.from("settings").select("timezone").eq("account_id", accountId).maybeSingle();
    })(),
  ]);

  if (doneError || openError || plansError || planTasksError) {
    return NextResponse.json({ error: "failed to read weekly review" }, { status: 500 });
  }

  const timeZone = settingsRow?.timezone ?? DEFAULT_TIME_ZONE;

  const completedThisWeek = ((doneRows ?? []) as unknown as TaskRow[]).map(mapTaskRowToActionItem);

  const openItems = ((openRows ?? []) as unknown as TaskRow[]).map(mapTaskRowToActionItem);
  const missed = openItems
    .filter((i) => i.dueAt !== null && new Date(i.dueAt) < now)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));

  const weekCutoff = new Date(now.getTime() + WEEK_DAYS * DAY_MS);
  const upcomingNextWeek = byPriority(
    openItems.filter((i) => i.dueAt !== null && new Date(i.dueAt) >= now && new Date(i.dueAt) <= weekCutoff),
    now
  );

  // Same derived-progress shape GET /api/plans returns — duplicated rather
  // than imported, cheaper than reusing a route handler as a function.
  const planTasksByPlan = new Map<string, PlanTaskRow[]>();
  for (const row of (planTaskRows ?? []) as { plan_id: string; status: string }[]) {
    const list = planTasksByPlan.get(row.plan_id) ?? [];
    list.push({ status: row.status });
    planTasksByPlan.set(row.plan_id, list);
  }
  const plansProgress = ((planRows ?? []) as unknown as PlanRow[])
    .filter((row) => row.status === "active")
    .map((row) => mapPlanRowToPlan(row, planTasksByPlan.get(row.id) ?? []));

  // Habit week — best-effort: an account with no habits (or before Wave 3
  // ships) just returns an empty array, so this wave never blocks on that one.
  const sevenDayKeys = Array.from({ length: WEEK_DAYS }, (_, i) =>
    dayKey(new Date(now.getTime() - i * DAY_MS).toISOString(), timeZone)
  );
  const { data: habitRows } = await supabase.from("habits").select("id, name").is("archived_at", null);
  const habits = (habitRows ?? []) as { id: string; name: string }[];
  let habitsWeek: { habitId: string; name: string; loggedCount: number }[] = [];
  if (habits.length > 0) {
    const { data: logRows } = await supabase
      .from("habit_logs")
      .select("habit_id, day")
      .in(
        "habit_id",
        habits.map((h) => h.id)
      )
      .in("day", sevenDayKeys);
    const countByHabit = new Map<string, number>();
    for (const row of (logRows ?? []) as { habit_id: string; day: string }[]) {
      countByHabit.set(row.habit_id, (countByHabit.get(row.habit_id) ?? 0) + 1);
    }
    habitsWeek = habits.map((h) => ({ habitId: h.id, name: h.name, loggedCount: countByHabit.get(h.id) ?? 0 }));
  }

  return NextResponse.json({
    completedThisWeek,
    missed,
    upcomingNextWeek,
    plansProgress,
    habitsWeek,
  });
}
