import type { Commitment } from "../types";
import { daysFromNow, daysAgo } from "../now";

export const COMMITMENTS: Commitment[] = [
  {
    id: "cm-1",
    direction: "you-promised",
    text: "I'll send the revised SOW by Thursday's call.",
    triggerSentence: "\"I'll get the revised SOW to you before we speak Thursday.\"",
    sourceMessageId: "m-sow",
    counterpartyId: "c-marcus-reed",
    dueDate: daysFromNow(-1),
    status: "open",
    confidence: 92,
    daysElapsed: 3,
  },
  {
    id: "cm-2",
    direction: "you-promised",
    text: "I'll send an updated palette pass today.",
    triggerSentence: "\"I'll send an updated pass today.\"",
    sourceMessageId: "m-brand-refresh",
    counterpartyId: "c-priya-nair",
    dueDate: daysAgo(0),
    status: "open",
    confidence: 88,
    daysElapsed: 0,
  },
  {
    id: "cm-3",
    direction: "you-promised",
    text: "I'll review the scope doc by end of week.",
    triggerSentence: "\"I'll take a look by end of week.\"",
    sourceMessageId: "m-haldane",
    counterpartyId: "c-tobias-lindqvist-wexford",
    dueDate: daysFromNow(2),
    status: "open",
    confidence: 74,
    daysElapsed: 3,
  },
  {
    id: "cm-4",
    direction: "promised-to-you",
    text: "Ana will confirm the invoice split works on their end.",
    triggerSentence: "\"I'll confirm the split works on our end by tomorrow.\"",
    sourceMessageId: "m-sow",
    counterpartyId: "c-ana-silva",
    dueDate: daysAgo(6),
    status: "met",
    confidence: 90,
    daysElapsed: 6,
  },
  {
    id: "cm-5",
    direction: "promised-to-you",
    text: "Rahul will send the final compliance sign-off checklist.",
    triggerSentence: "\"I'll get you the final checklist by end of day Monday.\"",
    sourceMessageId: "m-brightline",
    counterpartyId: "c-rahul-mehta",
    dueDate: daysAgo(2),
    status: "missed",
    confidence: 81,
    daysElapsed: 2,
  },
  {
    id: "cm-6",
    direction: "promised-to-you",
    text: "Yuki will share the Q4 budget range before the call.",
    triggerSentence: "\"I'll share our Q4 range before we talk.\"",
    sourceMessageId: "m-retainer",
    counterpartyId: "c-yuki-tanaka",
    dueDate: daysFromNow(1),
    status: "open",
    confidence: 69,
    daysElapsed: 1,
  },
];

// "Awaiting reply" — sent with no response, tracked separately from
// detected commitments since these are simply unanswered outbound mail.
export interface AwaitingReply {
  id: string;
  subject: string;
  counterpartyId: string;
  sentAt: string;
  daysElapsed: number;
}

export const AWAITING_REPLY: AwaitingReply[] = [
  {
    id: "wr-1",
    subject: "Draft press release — thoughts?",
    counterpartyId: "c-devon-clarke",
    sentAt: daysAgo(5),
    daysElapsed: 5,
  },
  {
    id: "wr-2",
    subject: "Proposed dates for the Q4 workshop",
    counterpartyId: "c-yuki-tanaka",
    sentAt: daysAgo(2),
    daysElapsed: 2,
  },
  {
    id: "wr-3",
    subject: "Following up on the intro call",
    counterpartyId: "c-sam-okafor",
    sentAt: daysAgo(9),
    daysElapsed: 9,
  },
];
