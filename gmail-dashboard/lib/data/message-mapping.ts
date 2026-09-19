// Shared DB-row -> Message mapper (spec FR6, design.md "API Changes" /
// Key Decision 3). One place all the placeholder logic lives — reused by
// GET /api/messages and every mutation route's "return the updated row"
// response, instead of being reimplemented per-route.
//
// Real per-contact aggregation (VIP, message counts, reply times, tone
// history) now reads from the `contacts` table (migration 0006,
// contact-mapping.ts's `mapContactRowToContact`). Sender/recipient Contact
// objects here fall back to a minimal, honestly-placeholder synthesis from
// `emails.participants` only when no matching `contacts` row exists yet
// (design.md Risk 3).
//
// `mapEmailRowsToMessages` maps a whole list with a fixed, small number of
// bulk queries instead of the per-row queries the shape of the problem would
// naturally suggest — GET /api/messages was measured at 65.7s for 119 rows
// (~5 Supabase round-trips per row: one `tasks` lookup, one `contacts`
// lookup per participant, two for thread siblings/entries) before this
// rewrite. `mapEmailRowToMessage` (singular) is now a one-row call into the
// same bulk path, kept only because the mutation routes below still call it
// as a bare `.map()` callback and three `[id]` routes call it directly on a
// single row.
import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapContactRowToContact, type ContactRow } from "@/lib/data/contact-mapping";
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
  ThreadEntry,
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
// `select *` — omits `provider`, `body`, `raw_payload`, `labels`, `category`,
// and `is_from_user`, none of which the `Message` contract needs (NFR1's
// field-minimization convention: never select more than the shape requires,
// and never `raw_payload` in particular). `account_id` is kept — buildContact
// needs it to scope the `contacts` lookup to this row's account.
export interface EmailRow {
  id: string;
  account_id: string;
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

// Supabase sends `.in()` filters as a query string — 500 UUIDs is ~19KB of
// URL, which risks a 414 against the proxy in front of PostgREST. Chunking
// at 100 keeps every request comfortably small; at the route's 500-row cap
// that's ~5 requests per lookup instead of 1 giant (and fragile) one.
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Minimal Contact synthesis from one participant — id/name/email/domain are
// real, everything else is a fixed honest placeholder. Used only when no
// matching `contacts` row exists (design.md Key Decision 3, Risk 3). Pure
// and synchronous — no dedup needed even across many rows sharing an
// address, since `lastContactAt` is that specific row's own `receivedAt`
// and legitimately differs message to message.
function buildPlaceholderContact(participant: Participant, lastContactAt: string): Contact {
  const address = participant.address;
  const domain = address.includes("@") ? address.slice(address.indexOf("@") + 1) : "";

  return {
    id: address,
    name: participant.name ?? address,
    email: address,
    domain,
    avatarUrl: null,
    // Placeholder only — no matching `contacts` row to read real values from.
    isVip: false,
    messageCount: 0,
    yourAvgReplyHours: null,
    lastContactAt,
    openThreadIds: [],
    toneHistory: [],
  };
}

// One bulk fetch of every `contacts` row any participant across the whole
// batch might match, grouped by account first (a `contacts` row is scoped to
// one account — the original per-row lookup filtered on `.eq("account_id",
// accountId)`) since that lets each group run as a plain `.in("email", …)`
// rather than needing a composite-tuple filter Supabase doesn't offer.
// Keyed by `${account_id}|${email}` — the same composite the `unique
// (account_id, email)` constraint (migration 0006) guarantees is 0-or-1 row.
async function fetchContactRowsByAccountAndEmail(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  emailsByAccount: Map<string, Set<string>>,
): Promise<Map<string, ContactRow>> {
  const byKey = new Map<string, ContactRow>();

  const batchesByAccount = Array.from(emailsByAccount, ([accountId, emails]) => ({
    accountId,
    batches: chunk(Array.from(emails), CHUNK_SIZE),
  }));

  const results = await Promise.all(
    batchesByAccount.flatMap(({ accountId, batches }) =>
      batches.map((batch) =>
        supabase
          .from("contacts")
          .select("id, account_id, name, email, domain, avatar_url, is_vip")
          .eq("account_id", accountId)
          .in("email", batch),
      ),
    ),
  );
  for (const { data } of results) {
    for (const row of (data ?? []) as unknown as ContactRow[]) {
      byKey.set(`${row.account_id}|${row.email}`, row);
    }
  }
  return byKey;
}

// One bulk fetch replacing the per-row `tasks.email_id` lookup. `email_id`
// stays `UNIQUE` (migration 0003, untouched by this change), so at most one
// row per key — same cardinality `.maybeSingle()` enforced per-row before.
async function fetchTaskIdsByEmailId(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  emailIds: string[],
): Promise<Map<string, string>> {
  const byEmailId = new Map<string, string>();
  if (emailIds.length === 0) return byEmailId;

  const results = await Promise.all(
    chunk(emailIds, CHUNK_SIZE).map((batch) => supabase.from("tasks").select("id, email_id").in("email_id", batch)),
  );
  for (const { data } of results) {
    for (const row of data ?? []) byEmailId.set(row.email_id as string, row.id as string);
  }
  return byEmailId;
}

// One bulk fetch of every `emails` row sharing any of the batch's thread ids
// — the sibling lookup `buildThread` used to run once per row. Grouped by
// `thread_id` (not yet including each row's own id — the caller folds that
// in, since a standalone email's own id must count as its own sole thread
// member exactly as the original per-row `Array.from(new Set([...siblings,
// ownEmailId]))` did).
async function fetchThreadSiblingIds(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  threadIds: string[],
): Promise<Map<string, Set<string>>> {
  const siblingsByThreadId = new Map<string, Set<string>>();
  if (threadIds.length === 0) return siblingsByThreadId;

  const results = await Promise.all(
    chunk(threadIds, CHUNK_SIZE).map((batch) => supabase.from("emails").select("id, thread_id").in("thread_id", batch)),
  );
  for (const { data } of results) {
    for (const row of data ?? []) {
      const threadId = row.thread_id as string;
      if (!siblingsByThreadId.has(threadId)) siblingsByThreadId.set(threadId, new Set());
      siblingsByThreadId.get(threadId)!.add(row.id as string);
    }
  }
  return siblingsByThreadId;
}

// One bulk fetch of every `thread_entries` row for every email id any thread
// in the batch touches. Unlike the original per-thread query, a single
// request can't rely on PostgREST's `order("at")` to keep each thread's
// entries chronological once results from several chunks are merged — so
// this sorts the merged set once, up front, and every per-thread bucket
// built from it downstream inherits that order as a stable subsequence.
async function fetchThreadEntriesByEmailIds(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  emailIds: string[],
): Promise<{ id: string; author_is_you: boolean; author_name: string; at: string; gist: string; email_id: string }[]> {
  if (emailIds.length === 0) return [];

  const results = await Promise.all(
    chunk(emailIds, CHUNK_SIZE).map((batch) =>
      supabase.from("thread_entries").select("id, author_is_you, author_name, at, gist, email_id").in("email_id", batch),
    ),
  );
  const entries = results.flatMap(({ data }) => data ?? []) as {
    id: string;
    author_is_you: boolean;
    author_name: string;
    at: string;
    gist: string;
    email_id: string;
  }[];
  entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return entries;
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

// Pure, synchronous — the `tasks` lookup that used to live here now runs
// once for the whole batch (`fetchTaskIdsByEmailId`); this just assembles
// the same `MessageAi` shape from a precomputed `taskId`. Only called once
// `row.platform` is confirmed non-null (i.e. triage succeeded for this row)
// — every AI field it reads was written together by Triage Pipeline's
// "Write triage success" node (spec FR5).
function buildAiFromRow(row: EmailRow, taskId: string | null): MessageAi {
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
    actionItemIds: taskId ? [taskId] : [],
    processedAt: row.processed_at ?? "",
    modelRun: row.model_run ?? "",
  };
}

function effectiveThreadId(row: EmailRow): string {
  return row.thread_id ?? row.id;
}

// Maps a whole page of `emails` rows (post-migration-0005 shape) to the
// dashboard's `Message` interface (lib/data/types.ts) in a fixed, small
// number of bulk queries, per spec FR6. The four independent lookups below
// run in parallel; only the final `thread_entries` fetch depends on the
// sibling-id lookup's result.
export async function mapEmailRowsToMessages(rows: EmailRow[]): Promise<Message[]> {
  if (rows.length === 0) return [];
  const supabase = getSupabaseServerClient();

  const rowIds = rows.map((r) => r.id);
  const uniqueThreadIds = Array.from(new Set(rows.map(effectiveThreadId)));

  // Every participant is looked up scoped to *this row's* account_id — both
  // sender and recipients use `row.account_id` (the mailbox owner's own
  // known contacts), never a participant's own account.
  const emailsByAccount = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!emailsByAccount.has(row.account_id)) emailsByAccount.set(row.account_id, new Set());
    const set = emailsByAccount.get(row.account_id)!;
    for (const p of row.participants ?? []) set.add(p.address);
  }

  const [taskIdByEmailId, contactRowByKey, siblingIdsByThreadId] = await Promise.all([
    fetchTaskIdsByEmailId(supabase, rowIds),
    fetchContactRowsByAccountAndEmail(supabase, emailsByAccount),
    fetchThreadSiblingIds(supabase, uniqueThreadIds),
  ]);

  // Fold each row's own id into its own thread's sibling set — a standalone
  // email (thread_id null, effectiveThreadId falls back to its own id) would
  // otherwise never match its own thread (mirrors the original per-row
  // buildThread's `Array.from(new Set([...siblings, ownEmailId]))`).
  for (const row of rows) {
    const threadId = effectiveThreadId(row);
    if (!siblingIdsByThreadId.has(threadId)) siblingIdsByThreadId.set(threadId, new Set());
    siblingIdsByThreadId.get(threadId)!.add(row.id);
  }

  const allThreadEmailIds = Array.from(new Set(Array.from(siblingIdsByThreadId.values()).flatMap((s) => Array.from(s))));
  const threadEntryRows = await fetchThreadEntriesByEmailIds(supabase, allThreadEmailIds);

  const threadIdByEmailId = new Map<string, string>();
  for (const [threadId, emailIds] of siblingIdsByThreadId) {
    for (const emailId of emailIds) threadIdByEmailId.set(emailId, threadId);
  }

  // Bucket the one globally-sorted entries fetch back into per-thread lists.
  // Since `threadIdByEmailId` is a partition (every email id belongs to
  // exactly one thread bucket), pushing in the already-sorted fetch order
  // preserves per-thread chronological order as a stable subsequence —
  // reproducing the original per-thread `order("at", ascending: true)`.
  const entriesByThreadId = new Map<string, ThreadEntry[]>();
  for (const row of threadEntryRows) {
    const threadId = threadIdByEmailId.get(row.email_id);
    if (!threadId) continue;
    if (!entriesByThreadId.has(threadId)) entriesByThreadId.set(threadId, []);
    entriesByThreadId.get(threadId)!.push({
      id: row.id,
      authorIsYou: row.author_is_you,
      authorName: row.author_name,
      at: row.at,
      gist: row.gist,
    });
  }

  // Real `contacts` rows resolve through the same enrichment
  // (contact-mapping.ts's `mapContactRowToContact`, left untouched) as
  // every other caller — but only once per unique contact id. Its own
  // per-contact queries (aggregate, tone history, reply gaps) are a
  // property of the contact, not of any one message, so messages sharing a
  // sender/recipient would otherwise repeat that work once per message.
  const uniqueContactRows = new Map<string, ContactRow>();
  for (const row of contactRowByKey.values()) uniqueContactRows.set(row.id, row);
  const resolvedContactEntries = await Promise.all(
    Array.from(uniqueContactRows.values()).map(
      async (row) => [row.id, await mapContactRowToContact(row)] as const,
    ),
  );
  const resolvedContactById = new Map(resolvedContactEntries);

  function resolveContact(participant: Participant, accountId: string, lastContactAt: string): Contact {
    const contactRow = contactRowByKey.get(`${accountId}|${participant.address}`);
    if (contactRow) return resolvedContactById.get(contactRow.id)!;
    return buildPlaceholderContact(participant, lastContactAt);
  }

  return rows.map((row) => {
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
    const ai = row.platform === null ? null : buildAiFromRow(row, taskIdByEmailId.get(row.id) ?? null);

    return {
      id: row.id,
      threadId: row.thread_id ?? row.id,
      // `gmail_url` is a reserved-but-unwritten column this phase (migration
      // 0005's comment: "not written by this change"). `Message.gmailUrl` is
      // required on every message, so fall back to Gmail's own permalink
      // scheme built from the real provider_message_id until a later phase
      // starts writing this column at ingestion time.
      gmailUrl: row.gmail_url ?? `https://mail.google.com/mail/u/0/#all/${row.provider_message_id}`,
      sender: resolveContact(fromParticipant, row.account_id, receivedAt),
      recipients: recipientParticipants.map((p) => resolveContact(p, row.account_id, receivedAt)),
      subject: row.subject ?? "",
      receivedAt,
      isUnread: row.is_unread,
      isStarred: row.is_starred,
      // Honest placeholder (spec FR2) — nothing writes a non-null value this
      // phase (that's Gmail MIME data, not something Triage infers).
      attachments: row.attachments ?? [],
      thread: entriesByThreadId.get(effectiveThreadId(row)) ?? [],
      ai,
      parseFailureReason: row.triage_error ?? null,
      sla: buildSla(receivedAt, row.sla_target_hours),
      status: row.status,
      snoozedUntil: row.snoozed_until,
      handledAt: row.handled_at,
      handledAction: row.handled_action,
    };
  });
}

// Single-row convenience wrapper over the bulk path above, for the three
// `[id]` routes that only ever have one row. Not used by the four bulk
// mutation routes (archive/done/restore/snooze) — those call
// `mapEmailRowsToMessages` directly, since they already pass the mapper as a
// bare `.map()` callback and a second parameter there would silently bind to
// `.map`'s own index argument.
export async function mapEmailRowToMessage(row: EmailRow): Promise<Message> {
  const [message] = await mapEmailRowsToMessages([row]);
  return message;
}
