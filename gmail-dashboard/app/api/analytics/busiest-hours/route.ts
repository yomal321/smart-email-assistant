// GET /api/analytics/busiest-hours — replaces
// components/charts/busiest-hours-heatmap.tsx's synthetic cellValue()
// formula with a real count of `emails.received_at` grouped by
// (day-of-week, hour). No GROUP BY through PostgREST, so — same convention
// GET /api/analytics/volume already uses — this fetches the raw timestamps
// for all-time received mail and groups them in code.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Monday-first, matching components/charts/busiest-hours-heatmap.tsx's
// existing `DAYS` array — reindexed from JS Date's Sunday-first `getDay()`
// (0=Sun..6=Sat) so the frontend needs no reordering of its own.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toMondayFirstIndex(jsGetDay: number): number {
  return (jsGetDay + 6) % 7;
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("emails").select("received_at");

  if (error) {
    return NextResponse.json({ error: "failed to read busiest hours" }, { status: 500 });
  }

  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const row of data ?? []) {
    if (!row.received_at) continue;
    const d = new Date(row.received_at);
    grid[toMondayFirstIndex(d.getDay())][d.getHours()] += 1;
  }

  const max = Math.max(1, ...grid.flat());

  return NextResponse.json({ days: DAYS, grid, max });
}
