// GET/POST /api/action-items — the bounded list read and manual-add write
// backing action-items-provider.tsx (spec.md FR3/FR9, design.md "API
// Changes"). Every row maps through T5's shared mapper
// (lib/data/task-mapping.ts) so the status-cast/owner-synthesis logic lives
// in exactly one place.
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

const TASK_TYPES = ["task", "meeting", "call", "assignment", "quiz", "ca", "exam", "admin", "capture"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const supabase = getSupabaseServerClient();
  let query = supabase.from("tasks").select(SELECT_COLUMNS);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read action items" }, { status: 500 });
  }

  const items = ((data ?? []) as unknown as TaskRow[]).map(mapTaskRowToActionItem);
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text: unknown = body?.text;
  const dueDate: unknown = body?.dueDate;
  // 0016_life_load.sql fields — all optional, all defaulted by the schema
  // itself when omitted (type='task', weight=3, effort_minutes=30), so a
  // plain email-derived-style POST from before this migration still works
  // unchanged.
  const type: unknown = body?.type;
  const sourceId: unknown = body?.sourceId;
  const courseId: unknown = body?.courseId;
  const dueAt: unknown = body?.dueAt;
  const startsAt: unknown = body?.startsAt;
  const durationMinutes: unknown = body?.durationMinutes;
  const effortMinutes: unknown = body?.effortMinutes;
  const weight: unknown = body?.weight;

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (dueDate !== undefined && dueDate !== null && typeof dueDate !== "string") {
    return NextResponse.json({ error: "dueDate must be a string or null" }, { status: 400 });
  }
  if (type !== undefined && !TASK_TYPES.includes(type as string)) {
    return NextResponse.json({ error: `type must be one of ${TASK_TYPES.join(", ")}` }, { status: 400 });
  }
  if (weight !== undefined && (typeof weight !== "number" || weight < 1 || weight > 5)) {
    return NextResponse.json({ error: "weight must be a number between 1 and 5" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    email_id: null,
    task_text: text,
    deadline: dueDate ?? null,
    origin: "manual",
    confidence: null,
    status: "todo",
    priority: "normal",
  };
  if (type !== undefined) insert.type = type;
  if (sourceId !== undefined) insert.source_id = sourceId;
  if (courseId !== undefined) insert.course_id = courseId;
  if (dueAt !== undefined) insert.due_at = dueAt;
  else if (dueDate) insert.due_at = `${dueDate}T23:59:00`;
  if (startsAt !== undefined) insert.starts_at = startsAt;
  if (durationMinutes !== undefined) insert.duration_minutes = durationMinutes;
  if (effortMinutes !== undefined) insert.effort_minutes = effortMinutes;
  if (weight !== undefined) insert.weight = weight;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("tasks").insert(insert).select(SELECT_COLUMNS).single();

  if (error) {
    return NextResponse.json({ error: "failed to create action item" }, { status: 500 });
  }

  const item = mapTaskRowToActionItem(data as unknown as TaskRow);
  await pushToCalendar(item);
  return NextResponse.json(item);
}

// Push to push-to-calendar.json (0020_calendar_push.sql) — mirrors POST
// /api/drafts's proxy-to-n8n shape, but best-effort: a manually added task
// must save even if the calendar push fails or n8n is down, so failures are
// swallowed rather than surfaced to the caller. Awaited (not truly
// fire-and-forget) because an un-awaited fetch can be killed when a Vercel
// serverless function terminates right after the response is sent. Only
// fires when there's a time to put on a calendar (n8n also checks this
// defensively, since its webhook URL is public).
async function pushToCalendar(item: { id: string; text: string; dueAt: string | null; startsAt: string | null; durationMinutes: number | null }) {
  const webhookUrl = process.env.N8N_CALENDAR_PUSH_WEBHOOK_URL;
  const secret = process.env.CALENDAR_PUSH_WEBHOOK_SECRET;
  if (!webhookUrl || !secret || (!item.dueAt && !item.startsAt)) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-calendar-push-webhook-secret": secret },
      body: JSON.stringify({
        task_id: item.id,
        text: item.text,
        due_at: item.dueAt,
        starts_at: item.startsAt,
        duration_minutes: item.durationMinutes,
      }),
    });
  } catch {
    // best-effort — the task itself is already saved
  }
}
