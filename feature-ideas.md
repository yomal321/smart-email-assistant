# Feature Ideas

Four candidate features for after Phase 5. Nothing here is proposed or approved — this is a shortlist written down so it survives the conversation it came from. Each would go through the normal `/specclaw:propose` lifecycle before any code.

All four are read-side features. None sends mail and none needs a Gmail credential, so the structural no-send guarantee stays intact.

## At a glance

| Feature | What the user gets | Schema change | Blocked on |
|---|---|---|---|
| [Deadline view](#1-deadline-view) | Commitments ordered by when they're due | None | — |
| [Daily brief](#2-daily-brief) | One morning screen instead of a scan | None (a `digests` table is optional) | — |
| [Follow-up reminders](#3-follow-up-reminders) | Knowing when a thread went quiet | New columns or table | Sent-mail visibility |
| [Weekly recap](#4-weekly-recap) | A sense of whether it's working | None | Sent-mail visibility (partial) |

**The dependency that matters.** Follow-up reminders, and the "replied to N" line in the weekly recap, both need the system to see mail the *user* sent. Ingestion today is built around incoming mail. `emails.labels` holds provider-native label values, so the first thing to check is whether `SENT` messages already land in `emails` at all. If they don't, that one ingestion change gates two of the four features — worth doing once, for both.

---

## 1. Deadline view

> Tasks sorted by due date. Overdue ones in red.

The `tasks` table already has everything this needs: `deadline date` (nullable), `status` in `open` / `done` / `dismissed`, and a mandatory FK to the source email. Phase 5's sidebar is already the place `done` and `dismissed` get written.

**What the user sees.** Three groups — Overdue, Due soon, No deadline — each task next to its source email subject and sender, one click to the email it came from. Overdue is red; nothing else is.

**Why it's worth building.** Right now a task with a deadline and a task without one look identical. The extraction pipeline already pulls dates out of threads; nothing downstream uses them. This makes work the system is already doing visible.

**What it needs.** A query and a UI. No migration, no n8n change, no model call.

**Worth deciding.** Whether `dismissed` tasks disappear entirely or stay visible behind a filter — dismissing a *wrong* extraction and dismissing a *real but unwanted* commitment are different acts, and only one of them is useful signal later.

---

## 2. Daily brief

> One screen each morning: what needs a reply, what's overdue, what you're waiting on, what's new since yesterday.

**What the user sees.** Four counts and four short lists, on one page, generated for today:

| Section | Source |
|---|---|
| Needs a reply | `emails.category = 'needs_reply'`, still unanswered |
| Overdue | `tasks.status = 'open'` and `deadline < today` |
| Waiting on someone | `emails.category = 'waiting_on_someone_else'` |
| New since yesterday | `emails.received_at` within the last 24h |

**Why it's worth building.** This is the feature that makes the dashboard worth opening *first*, rather than after Gmail. Every other screen answers "what's in here?" — this one answers "what do I do today?", which is the actual job.

**What it needs.** Four queries over existing columns. It can ship as a live page with no migration at all. A `digests` table only becomes necessary if the brief should be *frozen* — so that opening it at 4pm shows the same thing it showed at 9am rather than silently re-computing. That's a real product decision, not a technical one.

**Deliberately not an email.** A page, not a message. The system has no send capability and shouldn't grow one for this.

---

## 3. Follow-up reminders

> "You emailed Sarah 5 days ago. No reply."

The strongest of the four, and the one with a real prerequisite.

**Why it's the strongest.** `waiting_on_someone_else` is the one category with no downstream action anywhere in the system. Triage identifies it, writes it to the row, and then nothing ever looks at it again. The user is told they're waiting and the system forgets. Closing that loop is the single largest gap between what the pipeline already knows and what the user actually gets.

**What the user sees.** A list of threads that have gone quiet, oldest first — recipient, subject, days of silence, and a link to the thread. Optionally a "draft a nudge" button, which is just the existing `POST /webhook/generate-draft` endpoint pointed at the thread.

**What it needs.**
- **Sent-mail visibility.** The system has to know the user sent something and that nothing came back. This is the prerequisite described above.
- **Thread grouping.** `emails.thread_id` already exists and is populated by the normaliser, so "last message in this thread" is answerable today.
- **A scheduled workflow.** A new n8n scheduled sub-workflow that finds threads where the last message is outbound and older than N days. It fits the existing pattern — Gmail Renewal & Recovery is already a scheduled workflow writing a status table.
- **Somewhere to record state**, so a thread the user has explicitly dismissed doesn't resurface every morning.

**Worth deciding.** What N is, and whether it's fixed or per-recipient — five days of silence from a colleague and five days from a vendor are not the same event. Start fixed; per-recipient is a later refinement and edges toward the learned-sender-priority work that's out of v1 scope.

---

## 4. Weekly recap

> "You got 240 emails, replied to 31, 4 commitments still open."

**What the user sees.** A small weekly page: volume by category, tasks opened vs. completed, drafts generated vs. used, oldest still-open commitment, longest-waiting thread.

**Why it's worth building.** It's the only feature here that answers "is this thing actually helping?" The original proposal set real success criteria — inbox triaged in under two minutes, no forgotten commitments, half of routine replies starting from a draft — and nothing in the system currently measures any of them. This is how those stop being aspirations.

**What it needs.** Aggregate queries over `emails`, `tasks`, and `drafts`, all of which carry `created_at`. Most of it works on today's schema. The exception is "replied to 31", which needs the same sent-mail visibility as follow-up reminders.

**One honest limitation.** `drafts.status` can reach `sent`, but nothing can verify a draft was actually sent — the user pastes it into Gmail by hand, outside the system's view. Any "drafts used" number is self-reported. Label it as such, or count "drafts copied" instead, which at least is something the dashboard genuinely observes.

---

## Suggested order

1. **Deadline view** — no schema change, no pipeline change, immediate value. Ships inside Phase 5's existing sidebar work.
2. **Daily brief** — no schema change, and it's what turns the dashboard into a daily habit.
3. **Follow-up reminders** — highest value, but do the sent-mail ingestion work first.
4. **Weekly recap** — best built last, once there's enough history for the numbers to mean anything.

Steps 1 and 2 are effectively free given what Phase 5 is already building. Step 3 is the one worth a proper proposal and panel review, because the ingestion change underneath it touches a live, verified pipeline.
