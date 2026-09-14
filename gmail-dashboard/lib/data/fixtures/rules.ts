import type { Rule } from "../types";

export const RULES: Rule[] = [
  {
    id: "r-1",
    enabled: true,
    conditionSummary: "Sender domain is northgate.co AND category is Needs Reply",
    actionSummary: "Set priority to Urgent",
    runCount30d: 14,
  },
  {
    id: "r-2",
    enabled: true,
    conditionSummary: "Category is Newsletter AND unread for 14+ days",
    actionSummary: "Auto-archive",
    runCount30d: 61,
  },
  {
    id: "r-3",
    enabled: true,
    conditionSummary: "Subject contains \"invoice\" AND amount is detected",
    actionSummary: "Set category to Invoice",
    runCount30d: 23,
  },
  {
    id: "r-4",
    enabled: false,
    conditionSummary: "Sender is a known automated notifier AND confidence ≥ 90",
    actionSummary: "Auto-reply with acknowledgement, cap 5/day",
    runCount30d: 0,
  },
  {
    id: "r-5",
    enabled: true,
    conditionSummary: "VIP sender AND no reply sent within 24h",
    actionSummary: "Escalate priority, notify in digest",
    runCount30d: 8,
  },
];
