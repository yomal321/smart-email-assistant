// GET /api/hub/summary — the one call the hub landing page makes. Builds the
// full command-center payload (status stats, priority queue, schedule,
// source breakdown, 14-day workload, upcoming assessments, cross-module
// overview) by running lib/priority.ts's byPriority over every open task,
// across all three life sources in one ranked list — the actual point of
// 0016_life_load.sql.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";
import { mapSourceRowToSource, type SourceRow } from "@/lib/data/source-mapping";
import { byPriority } from "@/lib/priority";
import { dayKey, formatDayLabel, DEFAULT_TIME_ZONE } from "@/lib/day-key";
import type { ActionItem } from "@/lib/data/types";

const OPEN_STATUSES = ["todo", "in-progress"];
const DO_TODAY_LIMIT = 7;
const THIS_WEEK_DAYS = 7;
const FORTNIGHT_DAYS = 14;
const COLLISION_WINDOW_DAYS = 7;
const ASSESSMENT_TYPES = ["exam", "ca", "quiz"] as const;
const ASSESSMENT_MIN_WEIGHT = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const TASK_SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence, plan_id, type, source_id, course_id, due_at, starts_at, duration_minutes, effort_minutes, weight";

function isAssessment(item: ActionItem): boolean {
  return (ASSESSMENT_TYPES as readonly string[]).includes(item.type) && item.weight >= ASSESSMENT_MIN_WEIGHT;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const [
    { data: account },
    { data: taskRows, error: tasksError },
    { data: sourceRows, error: sourcesError },
    { count: needsReplyCount, error: needsReplyError },
    { count: waitingOnOthersCount, error: waitingError },
    { data: latestNotification, error: notificationError },
    { count: notifications7dCount, error: notifications7dError },
    { count: plansActiveCount, error: plansError },
    { data: allPlanRows, error: allPlansError },
    { data: planTaskRows, error: planTasksError },
    { count: notesCount, error: notesError },
    { data: latestNote, error: latestNoteError },
    { count: doneThisWeekCount, error: doneThisWeekError },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from("accounts").select("last_successful_sync").limit(1).maybeSingle(),
    supabase.from("tasks").select(TASK_SELECT_COLUMNS).in("status", OPEN_STATUSES),
    supabase.from("sources").select("id, name, kind, color, code").order("created_at", { ascending: true }),
    supabase.from("emails").select("*", { count: "exact", head: true }).eq("category", "needs_reply").eq("status", "open"),
    supabase
      .from("emails")
      .select("*", { count: "exact", head: true })
      .eq("category", "waiting_on_someone_else")
      .eq("status", "open"),
    supabase.from("bot_notifications").select("sent_at").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("bot_notifications")
      .select("*", { count: "exact", head: true })
      .gt("sent_at", sevenDaysAgo),
    supabase.from("plans").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("plans").select("id, status"),
    // Progress is derived, never stored — read the assigned tasks' status
    // straight from `tasks`, same convention as GET /api/plans.
    supabase.from("tasks").select("plan_id, status").not("plan_id", "is", null),
    supabase.from("notes").select("*", { count: "exact", head: true }),
    supabase.from("notes").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "done").gt("completed_at", sevenDaysAgo),
    (async () => {
      const accountId = await getAccountId(supabase);
      if (!accountId) return { data: null };
      return supabase
        .from("settings")
        .select("daily_capacity_minutes, timezone")
        .eq("account_id", accountId)
        .maybeSingle();
    })(),
  ]);

  if (
    tasksError ||
    sourcesError ||
    needsReplyError ||
    waitingError ||
    notificationError ||
    notifications7dError ||
    plansError ||
    allPlansError ||
    planTasksError ||
    notesError ||
    latestNoteError ||
    doneThisWeekError
  ) {
    return NextResponse.json({ error: "failed to read hub summary" }, { status: 500 });
  }

  // The user's zone, not the server's — see lib/day-key.ts. Read from the
  // settings row above rather than hardcoded, so changing it in Settings
  // moves the day boundary everywhere at once.
  const timeZone = settingsRow?.timezone ?? DEFAULT_TIME_ZONE;
  const today = dayKey(now.toISOString(), timeZone);
  const dailyCapacityMinutes = settingsRow?.daily_capacity_minutes ?? 300;

  const items = ((taskRows ?? []) as unknown as TaskRow[]).map(mapTaskRowToActionItem);

  const scheduledToday = items
    .filter((i) => i.startsAt !== null && dayKey(i.startsAt, timeZone) === today)
    .sort((a, b) => (a.startsAt! < b.startsAt! ? -1 : 1));

  const scheduledTodayIds = new Set(scheduledToday.map((i) => i.id));
  const unscheduled = items.filter((i) => !scheduledTodayIds.has(i.id));

  const ranked = byPriority(unscheduled, now);

  const doToday = ranked.slice(0, DO_TODAY_LIMIT);
  const doTodayIds = new Set(doToday.map((i) => i.id));

  const weekCutoff = new Date(now.getTime() + THIS_WEEK_DAYS * DAY_MS);
  const thisWeekItems = ranked.filter(
    (i) => !doTodayIds.has(i.id) && i.dueAt !== null && new Date(i.dueAt) <= weekCutoff
  );

  const thisWeekByDay = new Map<string, ActionItem[]>();
  for (const item of thisWeekItems) {
    const key = dayKey(item.dueAt!, timeZone);
    const list = thisWeekByDay.get(key) ?? [];
    list.push(item);
    thisWeekByDay.set(key, list);
  }
  // dayKey is YYYY-MM-DD, so a lexicographic sort is chronological — no
  // re-parsing back into a Date to order the groups.
  const thisWeek = [...thisWeekByDay.entries()]
    .sort(([dayA], [dayB]) => (dayA < dayB ? -1 : 1))
    .map(([day, dayItems]) => ({ day, label: formatDayLabel(day, timeZone), items: dayItems }));

  const plannedTodayMinutes = [...scheduledToday, ...doToday].reduce(
    (sum, i) => sum + (i.durationMinutes ?? i.effortMinutes),
    0
  );

  // Fortnight workload — every open item across every source, anchored by
  // startsAt ?? dueAt, bucketed into the next FORTNIGHT_DAYS calendar days.
  // Supersedes the old 7-day WeekStrip: same computation, wider window.
  const fortnightDays = Array.from({ length: FORTNIGHT_DAYS }, (_, i) =>
    dayKey(new Date(now.getTime() + i * DAY_MS).toISOString(), timeZone)
  );
  const fortnightDaySet = new Set(fortnightDays);

  const loadByDayAndSource = new Map<string, Map<string, number>>();
  const itemsByDay = new Map<string, ActionItem[]>();
  for (const item of items) {
    const anchor = item.startsAt ?? item.dueAt;
    if (!anchor) continue;
    const key = dayKey(anchor, timeZone);
    if (!fortnightDaySet.has(key)) continue;

    const dayItems = itemsByDay.get(key) ?? [];
    dayItems.push(item);
    itemsByDay.set(key, dayItems);

    if (!item.sourceId) continue;
    const minutes = item.durationMinutes ?? item.effortMinutes;
    const bySource = loadByDayAndSource.get(key) ?? new Map<string, number>();
    bySource.set(item.sourceId, (bySource.get(item.sourceId) ?? 0) + minutes);
    loadByDayAndSource.set(key, bySource);
  }

  const fortnightLoad = fortnightDays.map((day) => ({
    day,
    label: formatDayLabel(day, timeZone),
    bySource: [...(loadByDayAndSource.get(day)?.entries() ?? [])].map(([sourceId, minutes]) => ({ sourceId, minutes })),
  }));

  // Collision detection — slide a COLLISION_WINDOW_DAYS window across the
  // fortnight and surface the busiest one, but only when it's actually
  // alarming (over capacity for the whole window, or 3+ high-weight
  // exams/CAs/quizzes land in it). Null renders nothing — no "all clear"
  // noise on a screen checked ten times a day.
  let collision: {
    startDay: string;
    label: string;
    totalMinutes: number;
    capacityMinutes: number;
    deadlineCount: number;
    topItems: string[];
  } | null = null;
  let bestCollisionMinutes = -1;
  for (let start = 0; start + COLLISION_WINDOW_DAYS <= FORTNIGHT_DAYS; start++) {
    const windowDays = fortnightDays.slice(start, start + COLLISION_WINDOW_DAYS);
    const windowDaySet = new Set(windowDays);
    const totalMinutes = fortnightLoad
      .filter((d) => windowDaySet.has(d.day))
      .reduce((sum, d) => sum + d.bySource.reduce((s, x) => s + x.minutes, 0), 0);
    const windowItems = windowDays.flatMap((day) => itemsByDay.get(day) ?? []);
    const deadlineCount = windowItems.filter(isAssessment).length;
    const windowCapacity = dailyCapacityMinutes * COLLISION_WINDOW_DAYS;
    const qualifies = totalMinutes > windowCapacity || deadlineCount >= 3;

    if (qualifies && totalMinutes > bestCollisionMinutes) {
      bestCollisionMinutes = totalMinutes;
      const topItems = [...windowItems]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map((i) => i.text);
      collision = {
        startDay: windowDays[0],
        label: formatDayLabel(windowDays[0], timeZone),
        totalMinutes,
        capacityMinutes: windowCapacity,
        deadlineCount,
        topItems,
      };
    }
  }

  // Status-bar stats — computed over every open item, not just the
  // truncated doToday/thisWeek slices, so "3 overdue" always means all 3.
  const overdueCount = items.filter((i) => i.dueAt !== null && new Date(i.dueAt) < now).length;
  const dueIn48hCutoff = new Date(now.getTime() + 48 * HOUR_MS);
  const dueIn48hCount = items.filter(
    (i) => i.dueAt !== null && new Date(i.dueAt) >= now && new Date(i.dueAt) <= dueIn48hCutoff
  ).length;
  const upcomingByDueDate = items
    .filter((i) => i.dueAt !== null && new Date(i.dueAt) >= now)
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));
  const nextDeadline =
    upcomingByDueDate.length > 0
      ? {
          itemId: upcomingByDueDate[0].id,
          text: upcomingByDueDate[0].text,
          dueAt: upcomingByDueDate[0].dueAt,
          sourceId: upcomingByDueDate[0].sourceId,
        }
      : null;

  // Source breakdown — all-time outstanding load (open items across every
  // status/day), distinct from plannedBySource which is today-only.
  const effortBySource = new Map<string, { openCount: number; totalEffortMinutes: number }>();
  for (const item of items) {
    if (!item.sourceId) continue;
    const entry = effortBySource.get(item.sourceId) ?? { openCount: 0, totalEffortMinutes: 0 };
    entry.openCount += 1;
    entry.totalEffortMinutes += item.durationMinutes ?? item.effortMinutes;
    effortBySource.set(item.sourceId, entry);
  }
  const sourceBreakdown = [...effortBySource.entries()]
    .map(([sourceId, v]) => ({ sourceId, ...v }))
    .sort((a, b) => b.totalEffortMinutes - a.totalEffortMinutes);

  // Separate from the priority queue on purpose (spec: exams are planned for
  // over weeks, not worked on today — mixing them into the daily list buries
  // them).
  const upcomingAssessments = items
    .filter((i) => i.dueAt !== null && isAssessment(i))
    .sort((a, b) => (a.dueAt! < b.dueAt! ? -1 : 1));

  const sources = ((sourceRows ?? []) as unknown as SourceRow[]).map(mapSourceRowToSource);

  // Cross-module overview strip.
  const planTasksByPlan = new Map<string, { status: string }[]>();
  for (const row of (planTaskRows ?? []) as { plan_id: string; status: string }[]) {
    const list = planTasksByPlan.get(row.plan_id) ?? [];
    list.push({ status: row.status });
    planTasksByPlan.set(row.plan_id, list);
  }
  const plans = (allPlanRows ?? []) as { id: string; status: string }[];
  const planProgressPcts = plans.map((plan) => {
    const planTasks = planTasksByPlan.get(plan.id) ?? [];
    if (planTasks.length === 0) return 0;
    const done = planTasks.filter((t) => t.status === "done").length;
    return (done / planTasks.length) * 100;
  });
  const avgProgressPct =
    planProgressPcts.length > 0 ? Math.round(planProgressPcts.reduce((a, b) => a + b, 0) / planProgressPcts.length) : 0;

  return NextResponse.json({
    timeZone,
    scheduledToday,
    doToday,
    thisWeek,
    stats: {
      plannedMinutes: plannedTodayMinutes,
      capacityMinutes: dailyCapacityMinutes,
      overdueCount,
      dueIn48hCount,
      nextDeadline,
    },
    collision,
    sourceBreakdown,
    fortnightLoad,
    upcomingAssessments,
    sources,
    overview: {
      tasks: {
        openCount: items.length,
        overdueCount,
        doneThisWeekCount: doneThisWeekCount ?? 0,
      },
      plans: {
        activeCount: plansActiveCount ?? 0,
        totalCount: plans.length,
        avgProgressPct,
      },
      notes: {
        count: notesCount ?? 0,
        lastCapturedAt: latestNote?.created_at ?? null,
      },
      mail: {
        needsReplyCount: needsReplyCount ?? 0,
        waitingOnOthersCount: waitingOnOthersCount ?? 0,
        connected: !!account,
        lastSyncAt: account?.last_successful_sync ?? null,
      },
      bot: {
        notifications7d: notifications7dCount ?? 0,
        lastNotificationAt: latestNotification?.sent_at ?? null,
      },
    },
  });
}
