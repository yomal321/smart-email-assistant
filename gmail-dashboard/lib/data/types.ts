// The contract between the fixture layer and the views.
// Views import only from lib/data/* — swapping fixtures for a real
// Gmail + LLM backend must not require touching a component.
// See design-spec.md §10.

export type Platform =
  | "needs-reply"
  | "meeting"
  | "invoice"
  | "fyi"
  | "newsletter"
  | "automated"
  | "spam-ish";

export type Priority = "urgent" | "normal" | "low";
export type Tone = "tense" | "neutral" | "warm";

export interface PlatformMeta {
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  platform: Platform;
  code: string;
  label: string;
}

export const PLATFORMS: PlatformMeta[] = [
  { number: 1, platform: "needs-reply", code: "NR", label: "Needs Reply" },
  { number: 2, platform: "meeting", code: "MT", label: "Meeting" },
  { number: 3, platform: "invoice", code: "IV", label: "Invoice" },
  { number: 4, platform: "fyi", code: "FY", label: "FYI" },
  { number: 5, platform: "newsletter", code: "NL", label: "Newsletter" },
  { number: 6, platform: "automated", code: "AU", label: "Automated" },
  { number: 7, platform: "spam-ish", code: "SP", label: "Spam-ish" },
];

export function platformMeta(p: Platform): PlatformMeta {
  const m = PLATFORMS.find((x) => x.platform === p);
  if (!m) throw new Error(`Unknown platform: ${p}`);
  return m;
}

export interface Attachment {
  id: string;
  name: string;
  sizeKb: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  domain: string;
  avatarUrl: string | null; // fall back to initials, never a generic glyph
  isVip: boolean;
  messageCount: number;
  yourAvgReplyHours: number | null;
  lastContactAt: string;
  openThreadIds: string[];
  toneHistory: { month: string; tone: Tone }[];
}

export interface Entities {
  dates: { text: string; iso: string }[];
  amounts: { text: string; value: number; currency: string }[];
  people: { name: string; email: string | null }[];
  links: { url: string; label: string }[];
  addresses: string[];
}

export interface ThreadEntry {
  id: string;
  authorIsYou: boolean;
  authorName: string;
  at: string;
  gist: string;
}

export interface MessageAi {
  summary: string; // one line — replaces the preview snippet
  tldr: string | null; // long threads only
  platform: Platform;
  confidence: number; // 0–100; < 50 routes to the review queue
  priority: Priority;
  priorityScore: number; // 0–100, drives the default sort
  reasons: string[]; // the "why this was prioritised" bullets
  tone: Tone;
  toneEvidence: string | null;
  entities: Entities;
  actionItemIds: string[];
  processedAt: string;
  modelRun: string; // for the activity log
}

export type SlaState = "ontime" | "approaching" | "overdue";

export interface Sla {
  targetHours: number;
  elapsedHours: number;
  state: SlaState;
  overdueBy: number | null; // hours; drives the delay column
}

export type MessageStatus = "open" | "archived" | "snoozed" | "done";

export interface Message {
  id: string;
  threadId: string;
  gmailUrl: string; // deeplink — required on every message
  sender: Contact;
  recipients: Contact[];
  subject: string;
  receivedAt: string; // ISO 8601
  isUnread: boolean;
  isStarred: boolean;
  attachments: Attachment[];
  thread: ThreadEntry[];

  ai: MessageAi | null; // null while queued or on parse failure
  parseFailureReason: string | null;

  sla: Sla;

  status: MessageStatus;
  snoozedUntil: string | null;
  handledAt: string | null; // the row's on-board trace
  handledAction: "archived" | "done" | "snoozed" | null;
}

export interface ActionItem {
  id: string;
  text: string;
  sourceMessageId: string;
  owner: "you" | { name: string; email: string };
  dueDate: string | null;
  priority: Priority;
  status: "todo" | "in-progress" | "done";
  origin: "extracted" | "manual";
  confidence: number | null; // null when manual
}

export interface Draft {
  id: string;
  messageId: string;
  body: string; // current, possibly user-edited
  generatedBody: string; // original, for the commit-view diff
  tone: "formal" | "friendly" | "brief" | "firm";
  length: "brief" | "standard" | "detailed";
  status: "pending" | "approved" | "sent" | "discarded";
  generatedAt: string;
  approvedAt: string | null;
  editDistance: number | null; // feeds the approval-history table
}

export interface Commitment {
  id: string;
  direction: "you-promised" | "promised-to-you";
  text: string; // verbatim quote
  triggerSentence: string; // the sentence detection fired on
  sourceMessageId: string;
  counterpartyId: string;
  dueDate: string | null;
  status: "open" | "met" | "missed";
  confidence: number;
  daysElapsed: number;
}

export type SyncStatus = "synced" | "syncing" | "failed" | "offline";

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  queueDepth: number;
  failedCount: number;
  nextRetryAt: string | null;
  error: { code: string; message: string } | null;
}

export interface Rule {
  id: string;
  enabled: boolean;
  conditionSummary: string;
  actionSummary: string;
  runCount30d: number;
}

export interface ActivityLogEntry {
  id: string;
  at: string;
  action: string;
  target: string;
  cause: string; // rule or model that caused it
  undoable: boolean;
}
