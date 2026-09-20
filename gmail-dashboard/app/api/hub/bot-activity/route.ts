// GET /api/hub/bot-activity — recent pushes the assistant bot sent
// (bot_notifications, 012-assistant-bot), backing app/(hub)/bot/page.tsx.
// The bot itself lives in n8n and talks to Telegram directly — this table is
// the only trace of its activity visible from Supabase, so "is the bot
// running" here means "has it pushed recently," not a live health check
// (that's GET /api/hub/bot-health instead, which is a real one).
//
// As of 0018_bot_observability.sql (BOT-PAGE-PLAN.md option B1), the two
// daily digests (morning_brief/evening_review) are logged here too — they
// carry neither email_id nor task_id, since a digest isn't about one thing.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const LIMIT = 50;
const NOTIFICATION_TYPES = ["urgent_alert", "deadline_nudge", "morning_brief", "evening_review"] as const;
type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Repeatable ?type=urgent_alert&type=deadline_nudge, or omitted for all
  // four (BOT-PAGE-PLAN.md option A4). Unknown values are dropped rather
  // than erroring — a stale bookmark from a future type list should degrade
  // to "show everything recognized," not break the page.
  const requestedTypes = searchParams
    .getAll("type")
    .filter((t): t is NotificationType => (NOTIFICATION_TYPES as readonly string[]).includes(t));

  const supabase = getSupabaseServerClient();

  let query = supabase
    .from("bot_notifications")
    .select("id, notification_type, sent_at, email_id, task_id")
    .order("sent_at", { ascending: false })
    .limit(LIMIT);

  if (requestedTypes.length > 0) {
    query = query.in("notification_type", requestedTypes);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read bot activity" }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    notification_type: NotificationType;
    sent_at: string;
    email_id: string | null;
    task_id: string | null;
  }[];

  const emailIds = rows.map((r) => r.email_id).filter((id): id is string => id !== null);
  const taskIds = rows.map((r) => r.task_id).filter((id): id is string => id !== null);

  const [emailsRes, tasksRes] = await Promise.all([
    emailIds.length > 0
      ? supabase.from("emails").select("id, subject").in("id", emailIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length > 0
      ? supabase.from("tasks").select("id, task_text").in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const subjectById = new Map((emailsRes.data ?? []).map((e: { id: string; subject: string }) => [e.id, e.subject]));
  const taskTextById = new Map((tasksRes.data ?? []).map((t: { id: string; task_text: string }) => [t.id, t.task_text]));

  const activity = rows.map((r) => ({
    id: r.id,
    type: r.notification_type,
    sentAt: r.sent_at,
    label:
      r.email_id !== null
        ? (subjectById.get(r.email_id) ?? "(email)")
        : r.task_id !== null
          ? (taskTextById.get(r.task_id) ?? "(task)")
          : null, // digests: nothing to name, the page renders a fixed label instead
    // BOT-PAGE-PLAN.md option A5. /mail/inbox already supports ?open=<id>
    // (command-palette.tsx uses the same deep link); /tasks has no
    // per-item anchor to link to, so a deadline_nudge opens the whole list
    // rather than a specific row — honest about what exists, not a broken
    // link to a feature that isn't built.
    href: r.email_id !== null ? `/mail/inbox?open=${r.email_id}` : r.task_id !== null ? "/tasks" : null,
  }));

  return NextResponse.json(activity);
}
