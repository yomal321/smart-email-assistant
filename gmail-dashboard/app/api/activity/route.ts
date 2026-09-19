// GET /api/activity — backs the Settings page's Activity log table
// (currently `getActivityLog()` fixture data). Populates going forward
// only, per BACKEND-REQUIREMENTS.md §8.2 — an empty table right after this
// migration lands is correct, not a bug.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ActivityLogEntry } from "@/lib/data/types";

const SELECT_COLUMNS = "id, at, action, target, cause, undoable";
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select(SELECT_COLUMNS)
    .order("at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "failed to read activity log" }, { status: 500 });
  }

  const entries = (data ?? []) as unknown as ActivityLogEntry[];
  return NextResponse.json(entries);
}
