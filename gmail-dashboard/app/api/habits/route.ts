// GET/POST /api/habits — the active habit list (with the last 14 days'
// logged day-keys, for the grid + streak calc) and create, backing
// app/(hub)/habits/page.tsx. See PHASE-7-IMPLEMENTATION-PLAN.md Wave 3.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapHabitRowToHabit, type HabitRow } from "@/lib/data/habit-mapping";
import { dayKey, DEFAULT_TIME_ZONE } from "@/lib/day-key";

const SELECT_COLUMNS = "id, name, cadence, archived_at, created_at";
const CADENCES = ["daily", "weekly"];
const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = getSupabaseServerClient();

  const [habitsRes, settingsRow] = await Promise.all([
    supabase.from("habits").select(SELECT_COLUMNS).is("archived_at", null).order("created_at", { ascending: true }),
    (async () => {
      const accountId = await getAccountId(supabase);
      if (!accountId) return null;
      const { data } = await supabase.from("settings").select("timezone").eq("account_id", accountId).maybeSingle();
      return data;
    })(),
  ]);

  if (habitsRes.error) {
    return NextResponse.json({ error: "failed to read habits" }, { status: 500 });
  }

  const timeZone = settingsRow?.timezone ?? DEFAULT_TIME_ZONE;
  const now = new Date();
  // Same "days" window construction hub/summary uses for its fortnight
  // chart, just looking back instead of forward.
  const windowDays = Array.from({ length: WINDOW_DAYS }, (_, i) =>
    dayKey(new Date(now.getTime() - i * DAY_MS).toISOString(), timeZone)
  );

  const habits = (habitsRes.data ?? []) as unknown as HabitRow[];
  const habitIds = habits.map((h) => h.id);

  const logsByHabit = new Map<string, string[]>();
  if (habitIds.length > 0) {
    const { data: logRows, error: logsError } = await supabase
      .from("habit_logs")
      .select("habit_id, day")
      .in("habit_id", habitIds)
      .in("day", windowDays);
    if (logsError) {
      return NextResponse.json({ error: "failed to read habit logs" }, { status: 500 });
    }
    for (const row of (logRows ?? []) as { habit_id: string; day: string }[]) {
      const list = logsByHabit.get(row.habit_id) ?? [];
      list.push(row.day);
      logsByHabit.set(row.habit_id, list);
    }
  }

  const result = habits.map((row) => mapHabitRowToHabit(row, logsByHabit.get(row.id) ?? []));
  return NextResponse.json({ habits: result, windowDays, timeZone });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name: unknown = body?.name;
  const cadence: unknown = body?.cadence ?? "daily";

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }
  if (!CADENCES.includes(cadence as string)) {
    return NextResponse.json({ error: `cadence must be one of ${CADENCES.join(", ")}` }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("habits")
    .insert({ account_id: accountId, name, cadence })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create habit" }, { status: 500 });
  }

  const habit = mapHabitRowToHabit(data as unknown as HabitRow, []);
  return NextResponse.json(habit);
}
