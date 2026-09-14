// The typed data-access layer. Views import only from here (or from
// ./types directly) — never from ./fixtures/* — so a real Gmail + LLM
// backend can replace the implementation of these functions without
// touching a single component. See design-spec.md §10 and §11.2.

import { MESSAGES } from "./fixtures/messages";
import { CONTACTS, contactById } from "./fixtures/contacts";
import { ACTION_ITEMS } from "./fixtures/action-items";
import { DRAFTS } from "./fixtures/drafts";
import { COMMITMENTS, AWAITING_REPLY } from "./fixtures/commitments";
import { SYNC_STATE } from "./fixtures/sync";
import { RULES } from "./fixtures/rules";
import { ACTIVITY_LOG } from "./fixtures/activity";
import { PLATFORMS, platformMeta } from "./types";
import type { Message, Platform, Contact } from "./types";

export * from "./types";
export { contactById };

// ---- Raw collections ------------------------------------------------

export function getMessages(): Message[] {
  return MESSAGES;
}

export function getMessageById(id: string): Message | undefined {
  return MESSAGES.find((m) => m.id === id);
}

export function getContacts(): Contact[] {
  return CONTACTS.filter((c) => c.id !== "c-you");
}

export function getActionItems() {
  return ACTION_ITEMS;
}

export function getDrafts() {
  return DRAFTS;
}

export function getCommitments() {
  return COMMITMENTS;
}

export function getAwaitingReply() {
  return AWAITING_REPLY;
}

export function getSyncState() {
  return SYNC_STATE;
}

export function getRules() {
  return RULES;
}

export function getActivityLog() {
  return ACTIVITY_LOG;
}

// ---- Derived selectors ------------------------------------------------

/** Open board rows: not yet archived/done, and not routed to the review queue. */
export function getBoardMessages(): Message[] {
  return MESSAGES.filter((m) => needsReview(m) === false);
}

/** Messages the classifier could not handle confidently, or at all. Never dropped — routed here instead. */
export function needsReview(m: Message): boolean {
  if (m.ai === null) return true;
  if (m.ai.confidence < 50) return true;
  return false;
}

export function getReviewQueue(): Message[] {
  return MESSAGES.filter(needsReview);
}

export function getInboxMessages(): Message[] {
  return getBoardMessages().filter((m) => m.status === "open" || m.status === "snoozed");
}

export function getHandledMessages(): Message[] {
  return getBoardMessages().filter((m) => m.status === "archived" || m.status === "done");
}

export function getMessagesByPlatform(platform: Platform): Message[] {
  return getInboxMessages().filter((m) => m.ai?.platform === platform);
}

export function getPlatformCounts(): { platform: Platform; count: number }[] {
  return PLATFORMS.map((p) => ({
    platform: p.platform,
    count: getMessagesByPlatform(p.platform).length,
  }));
}

/** Sorted by the AI's priority score — the default sort, because the whole thesis is that the tool ranks for you. */
export function getSortedByPriority(messages: Message[] = getInboxMessages()): Message[] {
  return [...messages].sort((a, b) => (b.ai?.priorityScore ?? 0) - (a.ai?.priorityScore ?? 0));
}

export function getPriorityQueue(limit = 8): Message[] {
  return getSortedByPriority().slice(0, limit);
}

/** The balance band: waiting on you vs waiting on them. */
export function getBalance() {
  const inbox = getInboxMessages();
  const waitingOnYou = inbox.filter((m) => m.ai?.platform === "needs-reply");
  const overdueOnYou = waitingOnYou.filter((m) => m.sla.state === "overdue");
  const withinSlaOnYou = waitingOnYou.filter((m) => m.sla.state !== "overdue");

  const waitingOnThem = getAwaitingReply();
  const overAWeek = waitingOnThem.filter((w) => w.daysElapsed > 7);
  const recent = waitingOnThem.filter((w) => w.daysElapsed <= 7);

  return {
    you: {
      count: waitingOnYou.length,
      overdue: overdueOnYou.length,
      withinSla: withinSlaOnYou.length,
    },
    them: {
      count: waitingOnThem.length,
      overAWeek: overAWeek.length,
      recent: recent.length,
    },
  };
}

export function getKpis() {
  const inbox = getInboxMessages();
  const unread = inbox.filter((m) => m.isUnread).length;
  const needsReplyCount = inbox.filter((m) => m.ai?.platform === "needs-reply").length;
  const overdueReplies = inbox.filter(
    (m) => m.ai?.platform === "needs-reply" && m.sla.state === "overdue"
  ).length;
  const openActionItems = ACTION_ITEMS.filter((a) => a.status !== "done").length;
  const processedToday = getHandledMessages().length;
  const timeSavedMinutes = processedToday * 4 + inbox.length * 1.5;

  return {
    unread,
    needsReplyCount,
    overdueReplies,
    openActionItems,
    processedToday,
    timeSavedMinutes: Math.round(timeSavedMinutes),
  };
}

/** 14 days of received vs handled — Overview's volume trend. Deterministic, fixture-authored. */
export function getVolumeTrend(): { day: string; received: number; handled: number }[] {
  const received = [22, 19, 27, 31, 18, 12, 9, 24, 29, 33, 21, 17, 14, 26];
  const handled = [18, 19, 22, 24, 20, 10, 8, 20, 25, 27, 22, 16, 12, 19];
  const days = ["Aug 31", "Sep 1", "Sep 2", "Sep 3", "Sep 4", "Sep 5", "Sep 6", "Sep 7", "Sep 8", "Sep 9", "Sep 10", "Sep 11", "Sep 12", "Sep 13"];
  return days.map((day, i) => ({ day, received: received[i], handled: handled[i] }));
}

export { platformMeta, PLATFORMS };
