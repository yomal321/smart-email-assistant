# Proposal: Personal Assistant Bot (Phase A) — Conversational Mobile Client

**Created:** 2026-09-20
**Status:** 🟡 Draft

## Problem

The system now holds genuinely useful data — triaged emails, extracted action items,
commitments, contacts, threads — but all of it is locked behind a web dashboard that
requires sitting down at a laptop. The operator is on mobile most of the time and, in their
own words, "cannot all times watch the dashboards." Value that is only visible when you go
looking for it is value mostly not collected.

Two concrete gaps follow from that:

1. **No mobile access.** There is no way to ask "what do I need to do today?" from a phone.
   The dashboard is responsive down to 375px (NFR5), but responsive is not the same as
   reachable — it still requires opening a browser, navigating, and reading a dense UI.
2. **No push.** Nothing in the system reaches out. An urgent email from a VIP contact, a
   task due today, a commitment someone owes you — all of it sits silently in Postgres
   until someone opens a page. The triage pipeline is already deciding what is urgent
   (`0002_triage_schema.sql`); nothing acts on that decision.

The stated end goal is broader than email: a personal assistant. This proposal is the first
phase of that — the interface layer — built against data that already exists.

## Proposed Solution

A **channel-agnostic conversational bot hosted in n8n**, with Telegram as the first channel
and a WhatsApp adapter deliberately deferred.

Three-layer structure, so the channel is swappable:

- **Channel adapter** (`telegram-adapter.json`) — owns everything Telegram-specific:
  receiving updates, verifying the sender, normalising the inbound message to a neutral
  `{ chat_id, text, channel }` shape, and formatting replies back out. A future
  `whatsapp-adapter.json` implements the same contract and nothing else changes.
- **Assistant brain** (`assistant-brain.json`) — channel-agnostic. Takes a neutral question,
  plans a Supabase query against the existing schema, runs it, and composes an answer from
  the rows. Calls the existing `llm-gateway.json` sub-workflow, which already handles
  Gemini with an OpenRouter fallback on quota exhaustion — no new model plumbing.
- **Proactive scheduler** (`assistant-scheduler.json`) — cron-triggered, emits the four
  push messages through the same adapter contract.

**Telegram over WhatsApp, and why it changed.** The September decision was Meta WhatsApp
Cloud API. Proactive push was not in scope then; it is now, and it inverts the comparison.
WhatsApp blocks business-initiated messages outside a 24-hour reply window unless they are
paid template messages, and from 2026-10-01 free service messages are capped at ~1,000 per
number per month. Four scheduled pushes a day plus real-time urgent alerts does not fit
comfortably inside that, and it costs money, which violates the project's hard $0
constraint. Telegram has no reply window, no message cap, is free, and supports inline
buttons — which matter here, because "Done / Snooze / Draft a reply" as tappable buttons is
a materially better mobile interaction than typing commands.

A second, quieter advantage: Telegram supports **long polling** (`getUpdates`), so the
self-hosted n8n instance needs no publicly reachable webhook URL and no tunnel. WhatsApp
requires a public HTTPS callback. That removes an entire class of deployment and exposure
problems from Phase A.

**Read-only, deliberately.** The bot answers questions and sends notifications; it does not
write. This upholds the staged write-scope decision already made: prove the plumbing and
the LLM's query understanding first, add writes once both are trusted. It also sidesteps a
real architectural question (below) that does not need answering yet.

**Auth is an allowlist.** The dashboard's session auth signs only `{ exp }` with no user
identity (`gmail-dashboard/lib/auth/session.ts`) — this is a single-operator system. The
bot therefore needs only an allowlisted Telegram chat ID, checked in the adapter before
anything reaches the brain. Any message from an unknown chat ID is dropped silently.

**Data access goes direct from n8n to Supabase**, not through the dashboard's Next.js API
routes. Those 34 routes (changes 008–011) are code-complete but largely unverified, and
routing the bot through them would put an unproven layer on the bot's critical path for no
benefit while the bot is read-only.

### The four proactive pushes

| Push | Trigger | Content |
|---|---|---|
| Morning brief | Daily, scheduled | Tasks due today, open commitments, overnight email volume, anything triaged urgent |
| Urgent / VIP alert | Near-real-time poll | New email triaged urgent, or from a VIP contact |
| Deadline nudge | Daily, scheduled | Tasks with `deadline = today`, plus awaiting-reply items past their expected date |
| Evening review | Daily, scheduled | Completed today, slipped, carrying to tomorrow |

## Scope

### In Scope

- `n8n/workflows/telegram-adapter.json` — inbound long-polling, chat-ID allowlist, outbound formatting
- `n8n/workflows/assistant-brain.json` — channel-agnostic question → query → answer, via `llm-gateway.json`
- `n8n/workflows/assistant-scheduler.json` — the four scheduled/polled proactive pushes
- Read-only querying of existing tables: `emails`, `tasks`, `commitments`, `contacts`, `thread_entries`
- Natural-language question answering over that data, including free-text matching (e.g. "what invitations do I have?") without schema changes — using the existing `emails.search_vector` full-text index from `0011_search.sql` to shortlist, then LLM to judge
- A small amount of bot state (push deduplication, last-sent watermarks) — likely one new migration
- Prompt-injection defence on email content entering LLM context, reusing the delimiter convention already established in `draft-generation`
- Inline buttons for read-only navigation (e.g. "show me more", "next 5")

### Out of Scope

- **All writes** — no marking tasks done, no sending or drafting emails, no dismissing. Deferred to Phase A2 once read-only is proven.
- **WhatsApp adapter** — the contract is designed for it; the implementation is deferred.
- **The life layer** (calendar, plans/goals, notes, habits) — that is Phase B, and it extends the existing `tasks` table rather than sitting beside it.
- **Multi-user support** — single operator by design.
- **Voice / image input.**
- **Changes to the ingestion, triage, or extraction pipelines** — they are untouched.
- **Verifying changes 008–011** — separate, still-outstanding work; not a blocker for this because the bot bypasses those routes.

## Impact

- **Files affected:** 6–8 (estimated) — 3 new n8n workflows, 1 new Supabase migration, env/config additions, README/architecture updates
- **Complexity:** medium — the LLM-plans-a-query step is the genuinely hard part; the rest is wiring
- **Risk:** medium — introduces a new external trust boundary (inbound messages) and a new egress path (unsolicited outbound messages). Mitigated by read-only scope, a chat-ID allowlist, and no public webhook. The residual risk is a bad LLM query plan producing a confidently wrong answer, and email-borne prompt injection reaching the answer composer.

## Open Questions

- **Query planning strategy.** Does the brain generate SQL, choose from a fixed set of parameterised queries, or use a tool/function-calling loop? Generated SQL is the most flexible and the most dangerous; a fixed query set is safe but brittle against open-ended questions. This is the central design decision and should be settled in `/specclaw:plan`.
- **Write path, when writes arrive.** Direct to Supabase (consistent with Phase A, but duplicates business logic living in the API routes) or through the dashboard's API routes (single write path, but depends on unverified code)? Does not block Phase A, must be answered before Phase A2.
- **Push deduplication and state.** What table or column tracks "already alerted about this email"? A new `bot_notifications` table, or a column on `emails`?
- **Timezone.** Scheduled pushes need one; nothing in the schema currently records the operator's.
- **Urgent-alert latency.** Long polling means the bot polls Telegram, but urgent email alerts need the bot to poll *Supabase*. How often, and is a polling interval acceptable or does this want a Postgres trigger / Supabase realtime subscription?
- **Failure visibility.** If the brain cannot answer, what does the operator see? Silence is the worst outcome for a trust-building Phase A.

---

**To proceed:** Review this proposal and approve to begin planning.
