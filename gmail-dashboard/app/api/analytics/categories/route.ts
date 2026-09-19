// GET /api/analytics/categories?weeks=6 — replaces
// components/charts/category-breakdown.tsx's hardcoded 6-week x 7-platform
// `DATA` map. Rolling 7-day buckets counted back from now (same convention
// GET /api/analytics/volume already uses for its 14 rolling days), not
// calendar weeks — simpler, and this chart has no notion of "the week of
// Jan 1" to align to.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PLATFORMS, type Platform } from "@/lib/data/types";

const DEFAULT_WEEKS = 6;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weeksParam = Number(searchParams.get("weeks"));
  const weeks = Number.isFinite(weeksParam) && weeksParam > 0 ? Math.min(weeksParam, 52) : DEFAULT_WEEKS;

  const supabase = getSupabaseServerClient();
  const sinceIso = new Date(Date.now() - weeks * WEEK_MS).toISOString();

  const { data, error } = await supabase
    .from("emails")
    .select("platform, received_at")
    .gt("received_at", sinceIso);

  if (error) {
    return NextResponse.json({ error: "failed to read category breakdown" }, { status: 500 });
  }

  const series = Object.fromEntries(PLATFORMS.map((p) => [p.platform, new Array(weeks).fill(0)])) as Record<
    Platform,
    number[]
  >;

  const now = Date.now();
  for (const row of data ?? []) {
    if (!row.platform || !row.received_at) continue;
    if (!(row.platform in series)) continue; // a custom/unknown platform value — ignore rather than crash
    const ageMs = now - new Date(row.received_at).getTime();
    const weekIndexFromNow = Math.floor(ageMs / WEEK_MS); // 0 = this week, 1 = last week, ...
    const bucket = weeks - 1 - weekIndexFromNow; // oldest-to-newest, matching the component's W1..Wn order
    if (bucket >= 0 && bucket < weeks) {
      series[row.platform as Platform][bucket] += 1;
    }
  }

  const weekLabels = Array.from({ length: weeks }, (_, i) => `W${i + 1}`);

  return NextResponse.json({ weeks: weekLabels, series });
}
