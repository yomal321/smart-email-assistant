// Shared DB-row -> Contact mapper (spec 011-followups-contacts-api, design.md
// "Data Model Changes" — contacts / contact_aggregates / contact_tone_history).
// Mirrors message-mapping.ts's `buildAi` pattern: an async mapper that does
// its own Supabase reads for related data, rather than requiring the caller
// to pre-fetch everything.
import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { computeReplyGapsHours } from "@/lib/data/reply-gaps";
import type { Contact, MessageStatus, Tone } from "@/lib/data/types";

// The subset of a `contacts` row this mapper needs (migration 0006). No
// `select *` — explicit column lists only (message-mapping.ts's own
// field-minimization convention, NFR1).
export interface ContactRow {
  id: string;
  account_id: string;
  name: string | null;
  email: string;
  domain: string | null;
  avatar_url: string | null;
  is_vip: boolean;
}

// One row this mapper reads from `emails` to compute reply-pairing and open
// threads — never more columns than these two computations need.
interface ContactEmailRow {
  id: string;
  thread_id: string | null;
  is_from_user: boolean;
  received_at: string | null;
  status: MessageStatus;
}

// `contact_aggregates` (migration 0006) is a `left join` from `contacts` to
// `emails`, grouped by `contacts.id` — every contact therefore always
// produces exactly one aggregate row (message_count: 0, last_contact_at:
// null when no email matches), never zero rows. The `.maybeSingle()` +
// fallback below is defensive only (e.g. a contact row read in the same
// request as its aggregate view row, under a hypothetical replication lag);
// in practice it always finds a row.
//
// The view's join condition matches participants by the `address` key
// (`e.participants @> jsonb_build_array(jsonb_build_object('address',
// c.email))`) — fixed in migration 0006 to match the real shape
// message-mapping.ts's `Participant` interface writes/reads (`{ role, name,
// address }`); an earlier draft of that migration used `email` instead,
// which would have made this view's aggregates always 0/null.
async function fetchContactAggregate(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  contactId: string,
): Promise<{ messageCount: number; lastContactAt: string }> {
  const { data } = await supabase
    .from("contact_aggregates")
    .select("message_count, last_contact_at")
    .eq("contact_id", contactId)
    .maybeSingle();

  return {
    messageCount: data?.message_count ?? 0,
    lastContactAt: data?.last_contact_at ?? "",
  };
}

// `contact_tone_history` (migration 0006) — one row per contact per month.
async function fetchToneHistory(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  contactId: string,
): Promise<{ month: string; tone: Tone }[]> {
  const { data } = await supabase
    .from("contact_tone_history")
    .select("month, tone")
    .eq("contact_id", contactId)
    .order("month", { ascending: true });

  return (data ?? []).map((row) => ({ month: row.month as string, tone: row.tone as Tone }));
}

// Every `emails` row this contact's address appears on as any participant
// (from/to/cc) — the raw material for both `openThreadIds` and
// `yourAvgReplyHours` below. `.contains()` compiles to jsonb `@>`, which
// matches an array element by partial-object containment, so `{ address:
// row.email }` matches regardless of that participant's `role` or `name` —
// using `address` (not `email`) because that's the real key
// message-mapping.ts's `Participant` interface writes/reads.
async function fetchContactEmails(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  email: string,
): Promise<ContactEmailRow[]> {
  const { data } = await supabase
    .from("emails")
    .select("id, thread_id, is_from_user, received_at, status")
    .contains("participants", [{ address: email }]);

  return data ?? [];
}

// "Open" here means "still active" — anything not archived/done. Snoozed
// counts as still open (it will resurface), archived/done do not. This is a
// judgment call (not given by an existing spec), scoped to this mapper.
function computeOpenThreadIds(rows: ContactEmailRow[]): string[] {
  const ids = rows
    .filter((r) => r.status === "open" || r.status === "snoozed")
    .map((r) => r.thread_id)
    .filter((id): id is string => id !== null);

  return Array.from(new Set(ids));
}

// Averages this contact's reply-gap samples (lib/data/reply-gaps.ts's shared
// thread-pairing walk — also used account-wide by
// GET /api/analytics/response-times, Phase 5). `null` (never `0`) when there
// are none, so "no reply pairs yet" is never confused with "replies
// instantly".
export function computeAvgReplyHours(
  rows: { thread_id: string | null; is_from_user: boolean; received_at: string | null }[],
): number | null {
  const gapHours = computeReplyGapsHours(rows);
  if (gapHours.length === 0) return null;
  return gapHours.reduce((sum, hours) => sum + hours, 0) / gapHours.length;
}

// Maps one `contacts` row (migration 0006) to the dashboard's `Contact`
// interface (lib/data/types.ts). Always maps whatever `ContactRow` it's
// given — deciding which contacts count as "the account owner" (and
// excluding them) is a route-level concern for a later task, not this
// mapper's; no such filtering helper is added here.
export async function mapContactRowToContact(row: ContactRow): Promise<Contact> {
  const supabase = getSupabaseServerClient();

  const [aggregate, toneHistory, emailRows] = await Promise.all([
    fetchContactAggregate(supabase, row.id),
    fetchToneHistory(supabase, row.id),
    fetchContactEmails(supabase, row.email),
  ]);

  return {
    id: row.id,
    name: row.name ?? row.email,
    email: row.email,
    domain: row.domain ?? "",
    avatarUrl: row.avatar_url,
    isVip: row.is_vip,
    messageCount: aggregate.messageCount,
    yourAvgReplyHours: computeAvgReplyHours(emailRows),
    lastContactAt: aggregate.lastContactAt,
    openThreadIds: computeOpenThreadIds(emailRows),
    toneHistory,
  };
}
