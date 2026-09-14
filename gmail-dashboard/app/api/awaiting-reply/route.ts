// GET /api/awaiting-reply — emails sent by the account owner that haven't
// been replied to yet (spec 011-followups-contacts-api). Distinct from
// `commitments`: this route never reads that table. The "no reply yet"
// determination (group by thread, keep each thread's latest message, keep
// only threads whose latest message is from the account owner) is done in
// application code, mirroring contact-mapping.ts's computeAvgReplyHours
// convention of doing reply-pairing logic in JS rather than a SQL view.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageStatus } from "@/lib/data/types";

interface Participant {
  role: "from" | "to" | "cc";
  name: string | null;
  address: string;
}

// The subset of an `emails` row this route needs — never `select("*")`
// (field-minimization convention).
interface EmailRow {
  id: string;
  thread_id: string | null;
  subject: string | null;
  participants: Participant[];
  received_at: string;
  is_from_user: boolean;
  status: MessageStatus;
}

interface AwaitingReplyItem {
  id: string;
  subject: string;
  counterpartyId: string;
  sentAt: string;
  daysElapsed: number;
}

// Every `emails` row, oldest-received first — every message is needed here
// (no filter) so each thread's latest row can be determined below.
async function fetchAllEmails(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<EmailRow[]> {
  const { data, error } = await supabase
    .from("emails")
    .select("id, thread_id, subject, participants, received_at, is_from_user, status")
    .order("received_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as EmailRow[];
}

// Groups rows by thread_id and keeps only each thread's latest-received row.
// Rows with thread_id === null can't be grouped into a thread, so they're
// skipped rather than treated as their own single-row thread.
function latestRowPerThread(rows: EmailRow[]): EmailRow[] {
  const latestByThread = new Map<string, EmailRow>();

  for (const row of rows) {
    if (row.thread_id === null) continue;
    const current = latestByThread.get(row.thread_id);
    if (!current || new Date(row.received_at).getTime() > new Date(current.received_at).getTime()) {
      latestByThread.set(row.thread_id, row);
    }
  }

  return Array.from(latestByThread.values());
}

// A thread is "awaiting reply" when the last message in it was sent by the
// account owner — `status` doesn't matter here: even an archived thread can
// still be awaiting a reply from the counterparty's side.
function isAwaitingReply(row: EmailRow): boolean {
  return row.is_from_user === true;
}

// The account owner sent this message (is_from_user: true), so the
// counterparty is its recipient: the first `to` participant, falling back to
// the first `cc` participant when there's no `to` entry. Same resolution
// n8n/workflows/commitment-extraction.json's "Resolve counterparty email"
// node uses for its own is_from_user: true case.
function resolveCounterpartyAddress(participants: Participant[]): string | null {
  const firstAddressForRole = (role: Participant["role"]) =>
    participants.find((p) => p.role === role && p.address)?.address ?? null;

  return firstAddressForRole("to") ?? firstAddressForRole("cc");
}

// Looks up a contact id by email address; falls back to "" when there's no
// match (no address to resolve, or no contacts row for it) — same "fall back
// rather than throw" convention as commitment-mapping.ts's
// `counterpartyId: row.counterparty_id ?? ""`.
async function resolveContactId(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  address: string | null,
): Promise<string> {
  if (!address) return "";

  const { data } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("email", address)
    .maybeSingle();

  return data?.id ?? "";
}

function daysElapsedSince(receivedAt: string): number {
  // Against the real clock (Date.now()), same convention as
  // commitment-mapping.ts's daysElapsed.
  return Math.floor((Date.now() - new Date(receivedAt).getTime()) / 86_400_000);
}

async function buildAwaitingReplyItem(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  row: EmailRow,
): Promise<AwaitingReplyItem> {
  const address = resolveCounterpartyAddress(row.participants ?? []);
  const counterpartyId = await resolveContactId(supabase, address);

  return {
    id: row.id,
    subject: row.subject ?? "",
    counterpartyId,
    sentAt: row.received_at,
    daysElapsed: daysElapsedSince(row.received_at),
  };
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  let rows: EmailRow[];
  try {
    rows = await fetchAllEmails(supabase);
  } catch {
    return NextResponse.json({ error: "failed to read awaiting-reply threads" }, { status: 500 });
  }

  const awaitingThreads = latestRowPerThread(rows).filter(isAwaitingReply);
  const items = await Promise.all(awaitingThreads.map((row) => buildAwaitingReplyItem(supabase, row)));

  return NextResponse.json(items);
}
