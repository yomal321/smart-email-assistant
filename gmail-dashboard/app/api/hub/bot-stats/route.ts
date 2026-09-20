// GET /api/hub/bot-stats — aggregate counts over bot_notifications plus
// today's free-text usage, backing app/(hub)/bot/page.tsx's stats panel
// (BOT-PAGE-PLAN.md option A3) and the persisted-cap display (option B2,
// 0018_bot_observability.sql).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { dayKey } from "@/lib/day-key";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_TYPES = ["urgent_alert", "deadline_nudge", "morning_brief", "evening_review"] as const;
const BUSIEST_DAY_WINDOW_DAYS = 30;

// Mirrors assistant-brain.json's own `Check free-text cap` node
// (012-assistant-bot FR8) exactly. There is nowhere else to read this
// from — it is a constant inside hand-authored n8n JSON, not a settings
// row — so it is duplicated here deliberately rather than invented as a
// new shared-config table this phase doesn't otherwise need. If you change
// CAP in the workflow, change it here too.
const FREE_TEXT_DAILY_CAP = 10;

export async function GET() {
  const supabase = getSupabaseServerClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const busiestWindowStart = new Date(now.getTime() - BUSIEST_DAY_WINDOW_DAYS * DAY_MS).toISOString();

  const [
    { count: totalAllTime, error: totalError },
    { count: total7d, error: total7dError },
    { count: total30d, error: total30dError },
    byTypeResults,
    { data: recentSentAt, error: recentError },
    usageResult,
  ] = await Promise.all([
    supabase.from("bot_notifications").select("*", { count: "exact", head: true }),
    supabase.from("bot_notifications").select("*", { count: "exact", head: true }).gt("sent_at", sevenDaysAgo),
    supabase.from("bot_notifications").select("*", { count: "exact", head: true }).gt("sent_at", thirtyDaysAgo),
    Promise.all(
      NOTIFICATION_TYPES.map((type) =>
        supabase
          .from("bot_notifications")
          .select("*", { count: "exact", head: true })
          .eq("notification_type", type)
          .then(({ count, error }) => ({ type, count: count ?? 0, error }))
      )
    ),
    // Only the timestamp — bucketing into days happens here, not in SQL,
    // since PostgREST has no GROUP BY. A single-user bot's 30-day volume is
    // small enough that this is a non-issue; revisit if that ever changes.
    supabase.from("bot_notifications").select("sent_at").gt("sent_at", busiestWindowStart),
    (async () => {
      const accountId = await getAccountId(supabase);
      const timezone = accountId
        ? (await supabase.from("settings").select("timezone").eq("account_id", accountId).maybeSingle()).data?.timezone
        : null;
      // bot_free_text_usage is bucketed by UTC calendar day (see
      // 0018_bot_observability.sql's own comment) — matching
      // assistant-brain.json's `new Date().toISOString().slice(0, 10)`
      // exactly, NOT settings.timezone like the rest of the hub. A row here
      // keyed by the user's local day would silently disagree with what the
      // bot itself is actually enforcing.
      const utcToday = now.toISOString().slice(0, 10);
      const result = await supabase.from("bot_free_text_usage").select("count").eq("usage_date", utcToday).maybeSingle();
      return { ...result, timezone };
    })(),
  ]);

  const byTypeError = byTypeResults.find((r) => r.error)?.error;

  if (totalError || total7dError || total30dError || byTypeError || recentError || usageResult.error) {
    return NextResponse.json({ error: "failed to read bot stats" }, { status: 500 });
  }

  const byType = Object.fromEntries(byTypeResults.map((r) => [r.type, r.count])) as Record<
    (typeof NOTIFICATION_TYPES)[number],
    number
  >;

  // Busiest day in the window, by the same day-key convention as the rest
  // of the hub (usageResult.timezone if a settings row exists, else the
  // day-key module's own default) — this one IS a user-facing "which day
  // was loud," unlike the free-text bucket above.
  const timeZone = usageResult.timezone ?? undefined;
  const countsByDay = new Map<string, number>();
  for (const row of (recentSentAt ?? []) as { sent_at: string }[]) {
    const key = dayKey(row.sent_at, timeZone);
    countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
  }
  let busiestDay: { day: string; count: number } | null = null;
  for (const [day, count] of countsByDay) {
    if (!busiestDay || count > busiestDay.count) busiestDay = { day, count };
  }

  return NextResponse.json({
    totalAllTime: totalAllTime ?? 0,
    total7d: total7d ?? 0,
    total30d: total30d ?? 0,
    byType,
    busiestDay,
    freeText: {
      usedToday: usageResult.data?.count ?? 0,
      cap: FREE_TEXT_DAILY_CAP,
    },
  });
}
