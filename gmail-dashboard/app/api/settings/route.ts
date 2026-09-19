// GET/PATCH /api/settings — backs every field on app/settings/page.tsx
// except theme/density (those stay in localStorage via
// preferences-provider.tsx, unaffected — PHASE-4-IMPLEMENTATION-PLAN.md §1).
// One row per account (`settings.account_id` is the PK); GET upserts a
// default row on first read so the route never 404s for a fresh account.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapSettingsRowToSettings, mapSettingsToUpdate, type SettingsRow } from "@/lib/data/settings-mapping";

const SELECT_COLUMNS =
  "account_id, signature, style_samples, summary_length, digest_enabled, digest_time, exclusion_rules, retention_days, timezone, work_hours_start, work_hours_end, priority_weights";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data: existing, error: readError } = await supabase
    .from("settings")
    .select(SELECT_COLUMNS)
    .eq("account_id", accountId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "failed to read settings" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(mapSettingsRowToSettings(existing as unknown as SettingsRow));
  }

  // No row yet for this account — insert the schema's own column defaults
  // (0010_rules_settings_activity.sql) explicitly, then return that row.
  const { data: created, error: insertError } = await supabase
    .from("settings")
    .insert({ account_id: accountId })
    .select(SELECT_COLUMNS)
    .single();

  if (insertError) {
    return NextResponse.json({ error: "failed to initialize settings" }, { status: 500 });
  }

  return NextResponse.json(mapSettingsRowToSettings(created as unknown as SettingsRow));
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const update = mapSettingsToUpdate(body);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no recognized fields in request body" }, { status: 400 });
  }

  // Ensure a row exists (same upsert-on-first-write as GET) before applying
  // the partial update — two statements, since an unconditional insert would
  // duplicate-key on every PATCH after the first, and a single upsert call
  // would require every NOT NULL column present in `update` even when only
  // one field changed.
  const { data: existing } = await supabase
    .from("settings")
    .select("account_id")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!existing) {
    await supabase.from("settings").insert({ account_id: accountId });
  }

  const { data, error } = await supabase
    .from("settings")
    .update(update)
    .eq("account_id", accountId)
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to update settings" }, { status: 500 });
  }

  return NextResponse.json(mapSettingsRowToSettings(data as unknown as SettingsRow));
}
