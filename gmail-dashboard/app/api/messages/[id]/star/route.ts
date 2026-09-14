// PATCH /api/messages/:id/star — mirrors board-provider.tsx's reducer
// "star" case server-side, {value} -> is_starred=$value (spec.md FR8,
// design.md "API Changes"). Called by board-provider.tsx's optimistic
// toggleStar action (FR10) once that rewiring lands.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapEmailRowToMessage, type EmailRow } from "@/lib/data/message-mapping";

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
  const value: unknown = body?.value;

  if (typeof value !== "boolean") {
    return NextResponse.json({ error: "value must be a boolean" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("emails")
    .update({ is_starred: value })
    .eq("id", id)
    .select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to update star" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as EmailRow[];
  // An id that doesn't match any row (unknown, or belongs to a different
  // account) affects zero rows — a silent no-op, not a 404, matching the
  // reducer's own tolerant behavior on an unknown id (spec FR8, Edge Cases).
  if (rows.length === 0) {
    return NextResponse.json({ updated: {} });
  }

  const updated = await mapEmailRowToMessage(rows[0]);
  return NextResponse.json({ updated });
}
