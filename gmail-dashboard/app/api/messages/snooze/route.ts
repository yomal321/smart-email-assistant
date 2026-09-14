// POST /api/messages/snooze — mirrors board-provider.tsx's reducer "snooze"
// case server-side, {ids[], until} -> status='snoozed', snoozed_until,
// handled_at, handled_action (spec.md FR8, design.md "API Changes"). Called
// by board-provider.tsx's optimistic snooze action (FR10) once that
// rewiring lands.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapEmailRowToMessage, type EmailRow } from "@/lib/data/message-mapping";

// Mirrors EmailRow's field list exactly (lib/data/message-mapping.ts) —
// never `select("*")`/`raw_payload` (NFR1's field-minimization convention).
const SELECT_COLUMNS =
  "id, thread_id, provider_message_id, participants, subject, received_at, created_at, summary, " +
  "triage_error, platform, confidence, priority, priority_score, reasons, tone, tone_evidence, tldr, " +
  "entities, attachments, gmail_url, is_unread, is_starred, status, snoozed_until, handled_at, " +
  "handled_action, sla_target_hours, model_run, processed_at";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const ids: unknown = body?.ids;
  const until: unknown = body?.until;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
  }
  if (typeof until !== "string" || Number.isNaN(new Date(until).getTime())) {
    return NextResponse.json({ error: "until must be a valid ISO 8601 timestamp" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("emails")
    .update({
      status: "snoozed",
      snoozed_until: until,
      handled_at: new Date().toISOString(),
      handled_action: "snoozed",
    })
    .in("id", ids)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to snooze messages" }, { status: 500 });
  }

  // Ids that don't match any row (unknown, or belong to a different
  // account) simply affect zero rows — a silent no-op, not a 404, matching
  // the reducer's own tolerant behavior on an unknown id (spec FR8, Edge
  // Cases).
  const updated = await Promise.all(((data ?? []) as unknown as EmailRow[]).map(mapEmailRowToMessage));
  return NextResponse.json({ updated });
}
