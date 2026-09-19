// GET /api/messages — the one bounded list read that backs board-provider.tsx
// (spec.md FR6/FR7, design.md "API Changes"). Every row maps through T3's
// shared mapper (lib/data/message-mapping.ts) so the placeholder logic
// (minimal Contact synthesis, empty thread, SLA defaults) lives in exactly
// one place.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself
// (spec NFR4).
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapEmailRowsToMessages, type EmailRow } from "@/lib/data/message-mapping";

// 500-row bound (spec NFR2) — a documented default, not a silent limit.
// A mailbox with more than this many rows loses older mail from the board
// until real pagination ships; that's a known, accepted limitation, not a
// bug (spec.md Edge Cases: "The 500-row bound hides older mail from the
// board... real pagination is out of this phase's scope.").
const MESSAGE_LIMIT = 500;

// Exactly the columns lib/data/message-mapping.ts's EmailRow needs — never
// `select("*")`, and never `raw_payload` in particular (spec NFR1, matching
// the field-minimization convention 006-draft-generation established).
const MESSAGE_COLUMNS = [
  "id",
  "account_id",
  "thread_id",
  "provider_message_id",
  "participants",
  "subject",
  "received_at",
  "created_at",
  "summary",
  "triage_error",
  "platform",
  "confidence",
  "priority",
  "priority_score",
  "reasons",
  "tone",
  "tone_evidence",
  "tldr",
  "entities",
  "attachments",
  "gmail_url",
  "is_unread",
  "is_starred",
  "status",
  "snoozed_until",
  "handled_at",
  "handled_action",
  "sla_target_hours",
  "model_run",
  "processed_at",
].join(",");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const platforms = searchParams.getAll("platform");
  const unanswered = searchParams.get("unanswered") === "true";

  const supabase = getSupabaseServerClient();

  let query = supabase.from("emails").select(MESSAGE_COLUMNS);

  if (status) {
    query = query.eq("status", status);
  }
  if (platforms.length > 0) {
    query = query.in("platform", platforms);
  }
  if (unanswered) {
    // `unanswered` (spec FR7, BACKEND-REQUIREMENTS.md §5.3): the intended
    // signal is "the last thread activity wasn't from the user" — exactly
    // what the client's own `unanswered` filter checks via `thread`
    // (app/inbox/page.tsx). `thread_entries` doesn't exist until Phase 3
    // (design.md "Data Model Changes"), so `is_from_user` — migration
    // 0005's honest placeholder, always `false` for every row this phase
    // touches (spec FR2) — is the nearest real column standing in for it.
    // Implemented to satisfy the documented contract (FR7), not because it
    // meaningfully narrows results yet.
    query = query.eq("is_from_user", false);
  }

  const { data, error } = await query.order("received_at", { ascending: false }).limit(MESSAGE_LIMIT);

  if (error) {
    return NextResponse.json({ error: "failed to read messages" }, { status: 500 });
  }

  const messages = await mapEmailRowsToMessages((data ?? []) as unknown as EmailRow[]);

  return NextResponse.json(messages);
}
