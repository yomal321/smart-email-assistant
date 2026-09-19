// GET /api/analytics/ai-performance — replaces app/analytics/page.tsx's four
// hardcoded percentages ("Prototype figures from fixture data, not measured
// results"). Real numbers for three of the four; `timeSaved` stays a
// documented heuristic (PHASE-5-IMPLEMENTATION-PLAN.md §7 judgment call #3)
// since no human-only baseline exists to measure it against, and the
// response says so via `timeSavedIsEstimate` rather than presenting it with
// the same confidence as the three measured figures.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [
    { count: triagedCount, error: triagedError },
    { count: reassignedCount, error: reassignedError },
    { count: draftCount, error: draftError },
    { count: acceptedDraftCount, error: acceptedError },
    { count: editedAcceptedDraftCount, error: editedError },
    { count: inboxCount, error: inboxError },
    { count: processedCount, error: processedError },
  ] = await Promise.all([
    supabase.from("emails").select("*", { count: "exact", head: true }).not("processed_at", "is", null).gt("processed_at", since),
    supabase
      .from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("action", "Reassigned platform")
      .gt("at", since),
    supabase.from("drafts").select("*", { count: "exact", head: true }).gt("created_at", since),
    supabase.from("drafts").select("*", { count: "exact", head: true }).in("status", ["approved", "sent"]).gt("created_at", since),
    supabase
      .from("drafts")
      .select("*", { count: "exact", head: true })
      .in("status", ["approved", "sent"])
      .gt("edit_distance", 0)
      .gt("created_at", since),
    supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("emails").select("*", { count: "exact", head: true }).in("status", ["archived", "done"]).gt("handled_at", since),
  ]);

  const anyError = [triagedError, reassignedError, draftError, acceptedError, editedError, inboxError, processedError].find(Boolean);
  if (anyError) {
    return NextResponse.json({ error: "failed to read AI performance" }, { status: 500 });
  }

  const triaged = triagedCount ?? 0;
  const reassigned = reassignedCount ?? 0;
  const drafts = draftCount ?? 0;
  const acceptedDrafts = acceptedDraftCount ?? 0;
  const editedAcceptedDrafts = editedAcceptedDraftCount ?? 0;

  return NextResponse.json({
    // null (not 0 or 1) when there's nothing to measure yet, so "perfect
    // accuracy" is never confused with "no triaged mail in the window".
    classificationAccuracy: triaged === 0 ? null : 1 - reassigned / triaged,
    draftAcceptanceRate: drafts === 0 ? null : acceptedDrafts / drafts,
    draftsEditedBeforeSendRate: acceptedDrafts === 0 ? null : editedAcceptedDrafts / acceptedDrafts,
    timeSavedMinutes: (processedCount ?? 0) * 4 + (inboxCount ?? 0) * 1.5,
    timeSavedIsEstimate: true,
    windowDays: 30,
  });
}
