// GET /api/analytics/volume — 14-day received-vs-handled counts, backing the
// Overview page's VolumeTrend chart. See spec.md FR9/AC8 and design.md's
// "API Changes" section for the exact response shape.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Fixed 14-day window (spec NFR2) — a documented default, not a silent
// limit. Real date-range params are later-phase work, not invented here.
const WINDOW_DAYS = 14;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Truncates an ISO timestamp to its UTC calendar day (YYYY-MM-DD), matching
// the grouping `date_trunc('day', ...)` performs in the raw SQL spec FR9
// describes.
function toDayKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();

  // FR9 specifies two independent grouped-count queries — received_at and
  // handled_at each counted by day over the same window. PostgREST/the
  // Supabase client has no GROUP BY, so each query instead fetches just the
  // one timestamp column for in-window rows, and the grouping happens below
  // — equivalent to the raw `date_trunc('day', ...) ... group by 1` SQL,
  // without a database function outside this route's file scope.
  const [{ data: receivedRows, error: receivedError }, { data: handledRows, error: handledError }] =
    await Promise.all([
      supabase.from("emails").select("received_at").gt("received_at", sinceIso),
      supabase.from("emails").select("handled_at").gt("handled_at", sinceIso),
    ]);

  if (receivedError || handledError) {
    return NextResponse.json({ error: "failed to read volume data" }, { status: 500 });
  }

  const receivedCounts = new Map<string, number>();
  for (const row of receivedRows ?? []) {
    if (!row.received_at) continue;
    const day = toDayKey(row.received_at);
    receivedCounts.set(day, (receivedCounts.get(day) ?? 0) + 1);
  }

  const handledCounts = new Map<string, number>();
  for (const row of handledRows ?? []) {
    if (!row.handled_at) continue;
    const day = toDayKey(row.handled_at);
    handledCounts.set(day, (handledCounts.get(day) ?? 0) + 1);
  }

  // 14 entries, oldest to newest, zero-filling any day with no rows on
  // either side — never an empty array, even with zero seeded rows
  // (spec AC8, Edge Cases).
  const volume = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const offsetMs = (WINDOW_DAYS - 1 - i) * 24 * 60 * 60 * 1000;
    const day = toDayKey(new Date(Date.now() - offsetMs).toISOString());
    return {
      day,
      received: receivedCounts.get(day) ?? 0,
      handled: handledCounts.get(day) ?? 0,
    };
  });

  return NextResponse.json(volume);
}
