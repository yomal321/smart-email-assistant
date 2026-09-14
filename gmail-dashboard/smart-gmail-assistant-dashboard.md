# Smart Gmail Assistant — Dashboard Specification

A complete feature breakdown of what a professional smart Gmail assistant dashboard should contain.

---

## 1. Overview / Home

The landing screen. Answers "what do I need to know right now?" in five seconds.

- **KPI tiles** — unread, needs reply, overdue replies, open action items, emails processed today, time saved (estimated)
- **Today's priority queue** — top 5–10 emails the AI thinks matter most, with reasons ("VIP sender", "question awaiting answer", "deadline mentioned")
- **Waiting on you vs waiting on them** — two counts side by side. This split alone makes a dashboard feel intelligent.
- **Volume trend** — emails received vs handled, last 14 days
- **Quick actions** — "Triage new mail", "Review drafts", "Clear low-priority"

---

## 2. Smart Inbox (the core workspace)

Three-pane layout: filters on the left, list in the middle, detail on the right.

### List rows show

- Sender with avatar, and a VIP/known-contact indicator
- Subject
- AI one-line summary (this replaces the preview snippet)
- Category badge — Needs Reply / FYI / Meeting / Invoice / Newsletter / Automated / Spam-ish
- Priority indicator (urgent / normal / low)
- Sentiment or tone flag — useful for spotting an angry client early
- Action-item count, attachment count
- Age, and an SLA warning if it's been sitting too long
- Confidence score on the AI classification

### Filters and views

- By category, priority, sender, date range, has-action-items, unanswered
- Saved views — "Client emails needing reply", "This week's invoices"
- Bulk select with bulk actions

### Row actions

Archive, snooze, mark done, reassign category, star, open in Gmail.

---

## 3. Email Detail Panel

- Full AI summary, plus TL;DR for long threads
- **Thread timeline** — who said what, condensed, so you don't read 14 messages
- Extracted entities: dates, amounts, names, links, attachments, addresses
- Action items pulled from this email, each with an owner and due date
- **Suggested reply** — editable, with tone selector (formal / friendly / brief / firm) and a regenerate button
- **"Why this was prioritised"** — a short explanation. Explainability is what separates a professional tool from a black box.
- Sender context — past interaction history, average response time, relationship summary
- Open-in-Gmail deeplink

---

## 4. Action Items / Task Board

Everything the AI extracted across all mail, in one place.

- List and Kanban views (To do / In progress / Done)
- Each item: text, source email link, owner, due date, priority, status
- Overdue highlighting, due-this-week grouping
- Manual add, edit, complete
- Export or push to an external task tool (Todoist, Notion, Jira)

---

## 5. Drafts & Replies

- Queue of AI-generated drafts awaiting review
- Side-by-side: original email vs draft
- Approve / edit / regenerate / discard
- Tone and length controls
- Reusable snippets and templates
- Approval history — what was edited, which feeds prompt tuning over time

---

## 6. Follow-ups & Commitments

Often the most valuable module, and the one most people skip.

- **Awaiting reply** — emails you sent with no response, with days elapsed
- **Promises you made** — "I'll send it by Friday" detected in your own sent mail
- **Promises made to you** — commitments others made, with due dates
- Automated nudge reminders

---

## 7. Contacts & Relationships

- People you email most, ranked
- VIP list — senders whose mail always gets top priority
- Per-contact: message count, your average response time, last contact, open threads, tone history
- Company grouping by email domain

---

## 8. Analytics

- Volume by day, hour, category, sender
- Response time distribution, and your average vs target
- Busiest hours heatmap
- Category breakdown over time
- AI performance: classification accuracy, draft acceptance rate, how often drafts get edited
- Estimated time saved

---

## 9. Rules & Automation

- Rule builder: if sender/subject/keyword/category matches → auto-label, auto-archive, auto-prioritise, auto-draft
- Category management — rename, merge, create custom ones
- Priority weighting controls
- Auto-reply rules with safety limits

---

## 10. Settings

- Connected accounts, sync status, last sync time, manual resync
- AI config: model, temperature, summary length, signature, writing style samples
- Notification preferences and digest schedule
- Privacy controls — which emails never go to the LLM, data retention period, purge
- Working hours and timezone

---

## Cross-cutting things that make it feel professional

These are what actually separate a real product from a student project.

- **Command palette** (Cmd+K) and keyboard shortcuts — J/K to move, E to archive, R to reply
- **Global search** across summaries, action items, and contacts
- **Sync status indicator** — last synced, processing queue depth, failed items
- **Error and review queue** — emails the AI couldn't parse, surfaced rather than silently dropped
- **Skeleton loaders and empty states** — real empty states with guidance, not blank boxes
- **Undo** on every destructive action
- **Dark mode, responsive layout, accessible contrast**
- **Audit log** — what the AI did automatically and when

---

## Build order

1. **Smart Inbox + Detail Panel**
2. **Action Items**
3. **Overview**
4. **Drafts**
5. **Follow-ups**
6. **Analytics, Contacts, Rules, Settings**

Sections 1–4 are the product. The rest is depth added once the core proves useful.
