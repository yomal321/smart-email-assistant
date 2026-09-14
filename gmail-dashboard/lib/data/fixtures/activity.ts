import type { ActivityLogEntry } from "../types";
import { hoursAgo } from "../now";

export const ACTIVITY_LOG: ActivityLogEntry[] = [
  {
    id: "log-1",
    at: hoursAgo(0.2),
    action: "Archived",
    target: "\"New in Figma: variables API\" from Figma",
    cause: "Rule: Category is Newsletter AND unread for 14+ days",
    undoable: true,
  },
  {
    id: "log-2",
    at: hoursAgo(1.1),
    action: "Marked done",
    target: "\"Issue ATL-441 marked done\" from Linear",
    cause: "Rule: Sender is a known automated notifier",
    undoable: true,
  },
  {
    id: "log-3",
    at: hoursAgo(1.4),
    action: "Reassigned platform",
    target: "\"quick one\" from Devon Clarke — FYI → Needs Reply",
    cause: "Manual correction, yomal@bistecglobal.com",
    undoable: true,
  },
  {
    id: "log-4",
    at: hoursAgo(4.3),
    action: "Classified",
    target: "\"Following up — third time\" from Rahul Mehta",
    cause: "classify-v1 · confidence 79",
    undoable: false,
  },
  {
    id: "log-5",
    at: hoursAgo(6.8),
    action: "Draft generated",
    target: "Reply to Marcus Reed — SOW thread",
    cause: "draft-v1 · tone: friendly",
    undoable: false,
  },
  {
    id: "log-6",
    at: hoursAgo(28),
    action: "Sent",
    target: "Reply to Devon Clarke — scope review",
    cause: "Approved by yomal@bistecglobal.com, 0 edits",
    undoable: false,
  },
  {
    id: "log-7",
    at: hoursAgo(30),
    action: "Escalated priority",
    target: "\"Following up — third time\" from Rahul Mehta — Normal → Urgent",
    cause: "Rule: VIP sender AND no reply sent within 24h",
    undoable: true,
  },
];
