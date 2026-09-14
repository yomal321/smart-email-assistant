# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui. Confirmed by the user. No backend in the prototype phase — all data is served from local fixture modules behind a typed data-access layer so a real Gmail + LLM backend can replace it without touching view code.

## Users

Primary user: a **solo knowledge worker** — an independent consultant, founder, or account manager whose inbox is where their business actually happens. One connected Gmail account, personal (not shared). High message volume where a meaningful fraction of messages carry real consequence: a client question left unanswered, an invoice, a deadline someone else mentioned in passing.

Their situation: they open the inbox many times a day, often between other work, often on a laptop with the window not maximized. They are not doing "inbox zero" as a hobby. They want to know, within about five seconds, which of today's mail can hurt them if ignored — and then dispatch it without leaving the tool.

No second audience is confirmed. The product is explicitly not designed for shared-inbox team workflows (no assignment to other agents, no team SLA dashboards).

## Product Purpose

Gmail shows the user a list of messages. This product shows them a list of *obligations*. It reads the mail, classifies it, extracts what was promised and what was asked, and presents the inbox as a prioritized queue of decisions rather than an undifferentiated reverse-chronological stack.

Success means: the user trusts the priority queue enough to work it top-down instead of scanning everything, and the "waiting on you / waiting on them" split is accurate enough that they stop keeping a separate mental list.

## Positioning

Two mechanisms a generic "AI email summarizer" could not truthfully claim:

1. **Commitment extraction in both directions.** It detects promises the user made in their own sent mail ("I'll send it by Friday") and promises others made to them, and tracks both to a due date. Most tools only summarize inbound mail.
2. **Explainability as a first-class surface.** Every prioritization carries a "why this was prioritised" explanation and a confidence score on its classification. The user can see, and disagree with, the machine's reasoning. Uncertain items go to a visible review queue rather than being silently dropped.

## Operating Context

- Gmail is the system of record. The product never becomes a replacement client — every message carries a deeplink back to Gmail, and the user will bounce between the two.
- Work happens in short, interrupted sessions. The user's place in a queue must survive navigation away and back.
- Keyboard-forward usage is expected for the core triage loop (J/K navigate, E archive, R reply), matching muscle memory from Gmail and Superhuman.
- Mixed message provenance: genuine human correspondence sits next to newsletters, automated notifications, and invoices. Separating these is half the product's value.

## Capabilities and Constraints

Confirmed scope, from `smart-gmail-assistant-dashboard.md` (10 modules): Overview, Smart Inbox, Email Detail, Action Items, Drafts & Replies, Follow-ups & Commitments, Contacts & Relationships, Analytics, Rules & Automation, Settings.

Confirmed build order — sections 1–4 are the product, the rest is depth:
1. Smart Inbox + Detail Panel
2. Action Items
3. Overview
4. Drafts
5. Follow-ups
6. Analytics, Contacts, Rules, Settings

**Data: mock only.** Hardcoded realistic fixtures. There is no live Gmail OAuth and no live LLM call in this prototype. Design must still specify the data shapes precisely so a real backend can slot in, and must still design the loading, empty, error, and sync-failure states — but their triggers are simulated, not real.

Terminology the product owns (must be used consistently in UI copy):
- **Needs Reply / FYI / Meeting / Invoice / Newsletter / Automated / Spam-ish** — the seven categories.
- **Action item** — a task extracted from a message.
- **Commitment** — a promise detected in mail, with a direction (made by user / made to user).
- **Confidence** — the model's certainty about a classification, surfaced numerically.
- **Review queue** — messages the AI could not parse with confidence.

Undecided, and not to be invented: pricing, the actual model vendor and version, data retention durations, and any third-party task-tool integration credentials (Todoist/Notion/Jira appear as UI affordances only).

## Brand Commitments

None pre-existing. No logo, no established palette, no name beyond the working title "Smart Gmail Assistant." The product is not a Google product and must not imitate Gmail's own brand identity or use Google's marks — it reads as an independent tool that connects to Gmail.

## Evidence on Hand

- `smart-gmail-assistant-dashboard.md` — the full feature specification, authored by the user. This is the authoritative scope document.

There are no real users, no testimonials, no usage data, no benchmarks, and no accuracy figures for the AI. Any number shown in the prototype (time saved, classification accuracy, draft acceptance rate) is fixture data and must never be presented in external material as a measured result.

## Product Principles

1. **Show obligations, not messages.** Every surface answers "what does this require of me?" before it answers "what does this say?"
2. **The machine shows its work.** Confidence, reasoning, and a correction path accompany every automated judgment. Low confidence is surfaced, never hidden behind a clean UI.
3. **Never silently drop mail.** Anything the system cannot handle becomes visible work in a review queue. Trust is lost permanently the first time something important vanishes.
4. **Reversible by default.** Every destructive action has undo. The user should be able to move fast because mistakes are cheap, not because they were careful.
5. **Gmail is the escape hatch, always one click away.** The product augments; it does not trap.

## Accessibility & Inclusion

No user-specific requirement was established. Target WCAG 2.2 AA as the floor: full keyboard operability for the entire triage loop (this is a core interaction path, not an accommodation), visible focus, 4.5:1 text contrast in both themes, and no state communicated by color alone — every category, priority, and sentiment signal carries a text or shape cue alongside its color.
