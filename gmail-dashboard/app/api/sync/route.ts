// GET /api/sync — real (non-fixture) sync status, backing ConcourseBar's
// sync clock and the Settings page. See spec.md FR8 and design.md's
// "API Changes" section for the exact response shape.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SyncState } from "@/lib/data/types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = getSupabaseServerClient();

  // Single-mailbox product (README.md: "not multi-tenant... one mailbox
  // owner"). `limit(1)` is the correct query for that scope, not a stand-in
  // for a future account_id-scoped version — see design.md Key Decision 3.
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (accountError) {
    return NextResponse.json({ error: "failed to read sync state" }, { status: 500 });
  }

  if (!account) {
    // No accounts row = never connected. Never a 500, never a fabricated
    // timestamp (spec.md AC8, Edge Cases).
    const offlineState: SyncState = {
      status: "offline",
      lastSyncAt: null,
      // No backing counter table yet (BACKEND-REQUIREMENTS.md §5.4, a later
      // migration). Returned as honest placeholders, never invented.
      queueDepth: 0,
      failedCount: 0,
      nextRetryAt: null,
      error: null,
    };
    return NextResponse.json(offlineState);
  }

  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [{ count: failedCount, error: failedCountError }, { data: latestOutcome, error: latestOutcomeError }] =
    await Promise.all([
      supabase
        .from("sync_outcomes")
        .select("*", { count: "exact", head: true })
        .eq("account_id", account.id)
        .eq("outcome", "failed")
        .gt("occurred_at", since),
      supabase
        .from("sync_outcomes")
        .select("outcome, occurred_at")
        .eq("account_id", account.id)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (failedCountError || latestOutcomeError) {
    return NextResponse.json({ error: "failed to read sync state" }, { status: 500 });
  }

  // `status` is derived strictly from the accounts row (spec.md FR8) — the
  // schema (0001_ingestion_schema.sql) has no in-progress or per-sync
  // status column, so "syncing" is never derivable at this phase. A present
  // accounts row means connected; that's "synced".
  const syncState: SyncState = {
    status: "synced",
    lastSyncAt: account.last_successful_sync,
    // No backing counter table yet (BACKEND-REQUIREMENTS.md §5.4, a later
    // migration). Returned as an honest placeholder, never invented.
    queueDepth: 0,
    failedCount: failedCount ?? 0,
    nextRetryAt: null,
    error:
      latestOutcome && latestOutcome.outcome === "failed"
        ? {
            code: "RENEWAL_FAILED",
            message: "The most recent Gmail watch renewal failed.",
          }
        : null,
  };

  return NextResponse.json(syncState);
}
