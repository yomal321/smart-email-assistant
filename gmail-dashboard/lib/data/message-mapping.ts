// Shared DB-row -> Message mapper (spec FR6, design.md "API Changes" /
// Key Decision 3). One place all the placeholder logic lives — reused by
// GET /api/messages and every mutation route's "return the updated row"
// response, instead of being reimplemented per-route.
//
// Real per-contact aggregation (VIP, message counts, reply times, tone
// history) needs the `contacts` table, which does not exist yet
// (BACKEND-REQUIREMENTS.md §4: "Contacts | `participants` jsonb only |
// Missing — no contacts table, no aggregates"). Until then, sender/recipient
// Contact objects here are a minimal, honestly-placeholder synthesis from
// `emails.participants` — never real per-contact data (design.md Risk 3).
import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Attachment,
  Contact,
  Entities,
  Message,
  MessageAi,
  MessageStatus,
  Platform,
  Priority,
  Sla,
  Tone,
} from "@/lib/data/types";

// One entry of `emails.participants` (written by n8n/workflows/email-normaliser.json's
// "Normalize" node — role is 'from' | 'to' | 'cc', name is null when the header
// had no display name).
interface Participant {
  role: "from" | "to" | "cc";
  name: string | null;
  address: string;
}

// The subset of an `emails` row this mapper needs. Deliberately narrower than
// `select *` — omits `account_id`, `provider`, `body`, `raw_payload`, `labels`,
// `category`, and `is_from_user`, none of which the `Message` contract needs
// (NFR1's field-minimization convention: never select more than the shape
// requires, and never `raw_payload` in particular).
export interface EmailRow {
  id: string;
  thread_id: string | null;
  provider_message_id: string;
  participants: Participant[];
  subject: string | null;
  received_at: string | null;
  created_at: string;
  summary: string | null;
  triage_error: string | null;
  platform: Platform | null;
  confidence: number | null;
  priority: Priority | null;
  priority_score: number | null;
  reasons: string[] | null;
  tone: Tone | null;
  tone_evidence: string | null;
  tldr: string | null;
  entities: Partial<Entities> | null;
  attachments: Attachment[] | null;
  gmail_url: string | null;
  is_unread: boolean;
  is_starred: boolean;
  status: MessageStatus;
  snoozed_until: string | null;
  handled_at: string | null;
  handled_action: "archived" | "done" | "snoozed" | null;
  sla_target_hours: number | null;
  model_run: string | null;
  processed_at: string | null;
}

// Minimal Contact synthesis from one participant — id/name/email/domain are
// real, everything else is a fixed honest placeholder until the `contacts`
// table (Phase 3) exists (design.md Key Decision 3, Risk 3).
function buildContact(participant: Participant, lastContactAt: string): Contact {
  const address = participant.address;
  const domain = address.includes("@") ? address.slice(address.indexOf("@") + 1) : "";

  return {
    id: address,
    name: participant.name ?? address,
    email: address,
    domain,
    avatarUrl: null,
    // Placeholder only — no `contacts` table to read real values from yet.
    isVip: false,
    messageCount: 0,
    yourAvgReplyHours: null,
    lastContactAt,
    openThreadIds: [],
    toneHistory: [],
  };
}

// `entities` sub-arrays the model omits entirely default to `[]`, not a
// validation failure (spec FR4 / Edge Cases) — mirrored here on the read
// side so a genuinely-empty category never reaches the UI as `undefined`.
function mapEntities(raw: Partial<Entities> | null): Entities {
  const e = raw ?? {};
  return {
    dates: e.dates ?? [],
    amounts: e.amounts ?? [],
    people: e.people ?? [],
    links: e.links ?? [],
    addresses: e.addresses ?? [],
  };
}

// Same overdue ( elapsed >= target ) / approaching ( elapsed >= 75% of target )
// thresholds as the fixture layer's lib/data/fixtures/sla.ts#buildSla, but
// against the real clock (Date.now()) instead of the fixture's frozen NOW —
// spec.md's Notes explicitly call for the real clock throughout this backend.
function buildSla(receivedAt: string, targetHours: number | null): Sla {
  const elapsedHours = (Date.now() - new Date(receivedAt).getTime()) / 3_600_000;

  // Honest placeholder (spec FR2 / FR6, migration 0005): `sla_target_hours`
  // is null for every row this phase writes, so `state` always reads
  // "ontime" and `overdueBy` stays null rather than a fabricated figure.
  if (targetHours === null) {
    return { targetHours: 0, elapsedHours, state: "ontime", overdueBy: null };
  }

  if (elapsedHours >= targetHours) {
    return { targetHours, elapsedHours, state: "overdue", overdueBy: elapsedHours - targetHours };
  }
  if (elapsedHours >= targetHours * 0.75) {
    return { targetHours, elapsedHours, state: "approaching", overdueBy: null };
  }
  return { targetHours, elapsedHours, state: "ontime", overdueBy: null };
}

// Only called once `row.platform` is confirmed non-null (i.e. triage
// succeeded for this row) — every AI field it reads was written together by
// Triage Pipeline's "Write triage success" node (spec FR5).
async function buildAi(row: EmailRow): Promise<MessageAi> {
  // tasks.email_id is still UNIQUE (0003, untouched by this change) — 0 or 1
  // row, per spec FR6.
  const supabase = getSupabaseServerClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("email_id", row.id)
    .maybeSingle();

  return {
    summary: row.summary ?? "",
    tldr: row.tldr,
    platform: row.platform as Platform,
    confidence: row.confidence ?? 0,
    priority: (row.priority ?? "normal") as Priority,
    priorityScore: row.priority_score ?? 0,
    reasons: row.reasons ?? [],
    tone: (row.tone ?? "neutral") as Tone,
    toneEvidence: row.tone_evidence,
    entities: mapEntities(row.entities),
    actionItemIds: task ? [task.id as string] : [],
    processedAt: row.processed_at ?? "",
    modelRun: row.model_run ?? "",
  };
}

// Maps one `emails` row (post-migration-0005 shape) to the dashboard's
// `Message` interface (lib/data/types.ts), per spec FR6.
export async function mapEmailRowToMessage(row: EmailRow): Promise<Message> {
  const participants = row.participants ?? [];
  // A row without a 'from' participant would be malformed ingestion data —
  // not expected (email-normaliser.json always emits one), but mapping
  // falls back rather than throwing so one bad row can't break a list read.
  const fromParticipant: Participant =
    participants.find((p) => p.role === "from") ?? { role: "from", name: null, address: "unknown" };
  const recipientParticipants = participants.filter((p) => p.role === "to" || p.role === "cc");

  const receivedAt = row.received_at ?? row.created_at;

  // Not yet triaged (queued) or `triage_error` set both map `ai` to null —
  // same condition `needsReview()` already treats identically (spec AC5).
  const ai = row.platform === null ? null : await buildAi(row);

  return {
    id: row.id,
    threadId: row.thread_id ?? row.id,
    // `gmail_url` is a reserved-but-unwritten column this phase (migration
    // 0005's comment: "not written by this change"). `Message.gmailUrl` is
    // required on every message, so fall back to Gmail's own permalink
    // scheme built from the real provider_message_id until a later phase
    // starts writing this column at ingestion time.
    gmailUrl: row.gmail_url ?? `https://mail.google.com/mail/u/0/#all/${row.provider_message_id}`,
    sender: buildContact(fromParticipant, receivedAt),
    recipients: recipientParticipants.map((p) => buildContact(p, receivedAt)),
    subject: row.subject ?? "",
    receivedAt,
    isUnread: row.is_unread,
    isStarred: row.is_starred,
    // Honest placeholder (spec FR2) — nothing writes a non-null value this
    // phase (that's Gmail MIME data, not something Triage infers).
    attachments: row.attachments ?? [],
    // Needs thread_entries (Phase 3) — design.md "Data Model Changes".
    thread: [],
    ai,
    parseFailureReason: row.triage_error ?? null,
    sla: buildSla(receivedAt, row.sla_target_hours),
    status: row.status,
    snoozedUntil: row.snoozed_until,
    handledAt: row.handled_at,
    handledAction: row.handled_action,
  };
}
