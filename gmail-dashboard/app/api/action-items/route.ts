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
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence";

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

  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  if (dueDate !== null && typeof dueDate !== "string") {
    return NextResponse.json({ error: "dueDate must be a string or null" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      email_id: null,
      task_text: text,
      deadline: dueDate,
      origin: "manual",
      confidence: null,
      status: "todo",
      priority: "normal",
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create action item" }, { status: 500 });
  }

  const item = mapTaskRowToActionItem(data as unknown as TaskRow);
  return NextResponse.json(item);
}
