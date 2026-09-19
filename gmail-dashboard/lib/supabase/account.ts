// Single-account lookup, extracted from the pattern app/api/sync/route.ts
// already inlined (see design.md Key Decision 3 — "one mailbox owner",
// `limit(1)` is the correct query for this scope, not a stand-in for a
// future account_id-scoped version). Phase 4 (rules/settings/activity_log/
// saved_views/categories) is the first point where four different routes
// each need this same lookup to satisfy a NOT NULL account_id FK on write,
// so it's a shared helper now instead of a fourth copy-paste.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAccountId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("accounts").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}
