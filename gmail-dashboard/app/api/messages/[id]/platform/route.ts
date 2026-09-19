// PATCH /api/messages/:id/platform — mirrors board-provider.tsx's reducer
// "reassign" case server-side, {platform} -> platform=$platform,
// confidence=100 (a human reassignment is a certain signal, same as the
// reducer's own `confidence: 100` on reassign — spec.md FR8, design.md
// "API Changes"). Called by board-provider.tsx's optimistic reassign action
// (FR10) once that rewiring lands.
//
// Phase 5 (PHASE-5-IMPLEMENTATION-PLAN.md Wave 4): also logs to
// activity_log when the platform actually changes — this is the
// "reassignment" signal GET /api/analytics/ai-performance's classification
// accuracy figure counts against. A reassignment to the *same* platform
// (the reducer allows re-selecting the current value) isn't a correction,
// so it isn't logged.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapEmailRowToMessage, type EmailRow } from "@/lib/data/message-mapping";
import { PLATFORMS } from "@/lib/data/types";

// Mirrors EmailRow's field list exactly (lib/data/message-mapping.ts) —
// never `select("*")`/`raw_payload` (NFR1's field-minimization convention).
const SELECT_COLUMNS =
  "id, account_id, thread_id, provider_message_id, participants, subject, received_at, created_at, summary, " +
  "triage_error, platform, confidence, priority, priority_score, reasons, tone, tone_evidence, tldr, " +
  "entities, attachments, gmail_url, is_unread, is_starred, status, snoozed_until, handled_at, " +
  "handled_action, sla_target_hours, model_run, processed_at";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const platform: unknown = body?.platform;

  if (typeof platform !== "string" || !PLATFORMS.some((p) => p.platform === platform)) {
    return NextResponse.json(
      { error: `platform must be one of: ${PLATFORMS.map((p) => p.platform).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();

  const { data: before } = await supabase.from("emails").select("account_id, subject, platform").eq("id", id).maybeSingle();

  const { data, error } = await supabase
    .from("emails")
    .update({ platform, confidence: 100 })
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to reassign platform" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as EmailRow[];
  // An id that doesn't match any row (unknown, or belongs to a different
  // account) affects zero rows — a silent no-op, not a 404, matching the
  // reducer's own tolerant behavior on an unknown id (spec FR8, Edge Cases).
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  if (before && before.platform !== platform) {
    await supabase.from("activity_log").insert({
      account_id: before.account_id,
      action: "Reassigned platform",
      target: `"${before.subject}" — ${before.platform ?? "(unclassified)"} → ${platform}`,
      cause: "Manual correction",
      undoable: false,
    });
  }

  const updated = await mapEmailRowToMessage(rows[0]);
  return NextResponse.json({ updated });
}
