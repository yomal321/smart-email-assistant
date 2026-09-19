// GET /api/analytics/response-times — replaces
// components/charts/response-time-histogram.tsx's hardcoded 7-bucket array.
// Buckets every inbound->outbound reply gap (lib/data/reply-gaps.ts's shared
// thread-pairing walk, also used per-contact by contact-mapping.ts) across
// every thread account-wide, instead of per-contact.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { computeReplyGapsHours } from "@/lib/data/reply-gaps";

// Mirrors the histogram component's existing bucket boundaries exactly, so
// the component's rendering logic doesn't need to change shape, only its
// data source.
const BUCKETS = [
  { label: "0-2h", maxHours: 2 },
  { label: "2-6h", maxHours: 6 },
  { label: "6-12h", maxHours: 12 },
  { label: "12-24h", maxHours: 24 },
  { label: "1-2d", maxHours: 48 },
  { label: "2-4d", maxHours: 96 },
  { label: "4d+", maxHours: Infinity },
];

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("emails").select("thread_id, is_from_user, received_at");

  if (error) {
    return NextResponse.json({ error: "failed to read response times" }, { status: 500 });
  }

  const gapHours = computeReplyGapsHours(data ?? []);

  const buckets = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const hours of gapHours) {
    const bucketIndex = BUCKETS.findIndex((b) => hours <= b.maxHours);
    buckets[bucketIndex === -1 ? BUCKETS.length - 1 : bucketIndex].count += 1;
  }

  const averageHours =
    gapHours.length === 0 ? null : gapHours.reduce((sum, h) => sum + h, 0) / gapHours.length;

  return NextResponse.json({ buckets, averageHours, sampleCount: gapHours.length });
}
