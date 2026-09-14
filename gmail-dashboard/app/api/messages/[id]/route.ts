// GET /api/messages/:id — single-row read, reusing 009's mapEmailRowToMessage
// unchanged (spec FR14). 009 dropped this route for having no caller; it is
// reintroduced this phase because app/drafts/page.tsx's getMessageById()
// fixture calls would otherwise silently drop every pending draft once
// drafts-provider.tsx is wired to live data (design.md Key Decision 4).
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

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.from("emails").select(SELECT_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to read message" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }

  const message = await mapEmailRowToMessage(data as unknown as EmailRow);
  return NextResponse.json(message);
}
