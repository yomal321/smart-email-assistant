import type { Draft } from "../types";
import { hoursAgo } from "../now";

export const DRAFTS: Draft[] = [
  {
    id: "d-sow",
    messageId: "m-sow",
    generatedBody:
      "Hi Marcus,\n\nApologies for the delay — please find the revised SOW attached, with the £4,200 line split across the Q3 and Q4 invoices as discussed.\n\nSee you Thursday at 10.\n\nBest,\nYou",
    body:
      "Hi Marcus,\n\nSorry for the delay — the revised SOW is attached, with the £4,200 line split across the Q3 and Q4 invoices as we discussed with Ana.\n\nLooking forward to Thursday at 10.\n\nBest,\nYou",
    tone: "friendly",
    length: "standard",
    status: "pending",
    generatedAt: hoursAgo(0.2),
    approvedAt: null,
    editDistance: 18,
  },
  {
    id: "d-brand-refresh",
    messageId: "m-brand-refresh",
    generatedBody:
      "Hi Priya,\n\nGlad it landed well! Happy to warm up the secondary palette a touch before we lock it — I'll send an updated pass today.\n\nBest,\nYou",
    body:
      "Hi Priya,\n\nGlad it landed well! Happy to warm up the secondary palette a touch before we lock it — I'll send an updated pass today.\n\nBest,\nYou",
    tone: "friendly",
    length: "brief",
    status: "pending",
    generatedAt: hoursAgo(2.2),
    approvedAt: null,
    editDistance: 0,
  },
  {
    id: "d-retainer",
    messageId: "m-retainer",
    generatedBody:
      "Hi Yuki,\n\nWould love to. I have 20 minutes free Wednesday at 2pm, Thursday at 11am, or Friday at 3pm — let me know what works.\n\nBest,\nYou",
    body:
      "Hi Yuki,\n\nWould love to. I have 20 minutes free Wednesday at 2pm, Thursday at 11am, or Friday at 3pm — whichever suits you.\n\nBest,\nYou",
    tone: "friendly",
    length: "brief",
    status: "pending",
    generatedAt: hoursAgo(20),
    approvedAt: null,
    editDistance: 3,
  },
  {
    id: "d-brightline",
    messageId: "m-brightline",
    generatedBody:
      "Rahul,\n\nApologies for the delay on this. The engagement letter is signed and attached. Let me know if compliance needs anything further.\n\nBest,\nYou",
    body:
      "Rahul,\n\nApologies for the delay on this — the engagement letter is signed and attached. Let me know if compliance needs anything further from me.\n\nBest,\nYou",
    tone: "formal",
    length: "brief",
    status: "approved",
    generatedAt: hoursAgo(30),
    approvedAt: hoursAgo(28),
    editDistance: 6,
  },
  {
    id: "d-devon-scope",
    messageId: "m-devon-meeting",
    generatedBody: "Confirmed — Tuesday 3pm works well. See you then.",
    body: "Confirmed — Tuesday 3pm works well. See you then.",
    tone: "brief",
    length: "brief",
    status: "sent",
    generatedAt: hoursAgo(46),
    approvedAt: hoursAgo(46),
    editDistance: 0,
  },
];
