// POST /api/messages/restore — mirrors board-provider.tsx's reducer
// "restore" case server-side, {ids[]} -> status='open', handled_at=null,
// handled_action=null, snoozed_until=null (spec.md FR8, design.md
// "API Changes"). Called both by board-provider.tsx's optimistic restore
// action and as the undo target for archive/markDone/snooze (FR10) once
// that rewiring lands.
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

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be a non-empty array of strings" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("emails")
    .update({ status: "open", handled_at: null, handled_action: null, snoozed_until: null })
    .in("id", ids)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to restore messages" }, { status: 500 });
  }

  // Ids that don't match any row (unknown, or belong to a different
  // account) simply affect zero rows — a silent no-op, not a 404, matching
  // the reducer's own tolerant behavior on an unknown id (spec FR8, Edge
  // Cases).
  const updated = await Promise.all(((data ?? []) as unknown as EmailRow[]).map(mapEmailRowToMessage));
  return NextResponse.json({ updated });
}
