# Bot Page — What Else It Could Show

A plan for `app/(hub)/bot/page.tsx`. Options and tradeoffs, not a committed build order — pick from it.

**Status:** plan only, nothing built.

---

## 1. What the page is today

One list: the last 20 rows of `bot_notifications`, each showing an icon, a label (the source email's subject or task's text), the type, and a timestamp. That's it. `GET /api/hub/bot-activity` does one query plus two lookups to resolve those labels.

It's honest but thin, and it doesn't tell you the two things you'd actually open it for: **what can this bot do**, and **is it working right now**.

---

## 2. What the bot actually does (ground truth)

From `.specclaw/changes/012-assistant-bot/spec.md` and the four n8n workflows. This matters because the page should describe the real thing, not an idealised one.

**Five slash commands**, all zero-LLM, one fixed SQL query each (FR5):

| Command | Returns |
|---|---|
| `/today` | tasks due today + open commitments |
| `/urgent` | unhandled emails with `priority = 'urgent'` |
| `/deadlines` | open tasks with a deadline, soonest first |
| `/vip` | unhandled emails from `contacts.is_vip = true` |
| `/help` | lists the commands |

**Free-text questions** (FR6/FR8): anything not matching a command goes through one LLM Gateway call against a shortlist built from `emails.search_vector`. Capped at **10 per day**, deliberately — the Gemini free tier caps the whole project at 20 requests/day and triage/extraction already consume it. The bot is not allowed to starve the pipeline.

**Four proactive pushes:**

| Push | Trigger | Leaves a DB row? |
|---|---|---|
| Morning Brief (FR11) | daily, scheduled | **No** (FR15) |
| Urgent/VIP alert (FR12) | polls every 5 min | Yes — `urgent_alert` |
| Deadline nudge (FR13) | daily | Yes — `deadline_nudge` |
| Evening Review (FR14) | daily, scheduled | **No** (FR15) |

**Read-only** (FR17): the only table the bot writes is `bot_notifications`. It cannot create or complete a task from Telegram. Security is a signature check (FR3) plus a chat-ID allowlist (FR4).

---

## 3. The honesty constraints

Three things limit what this page can truthfully claim. Any option below is judged against them.

**Half the bot's activity is invisible.** FR15 means Morning Brief and Evening Review deliberately write no `bot_notifications` row — the daily schedule fires once by construction, so there's nothing to dedup against. So "recent activity" structurally can only ever show 2 of the 4 push types. A page that says "3 pushes this week" while the bot actually sent 17 messages is misleading, and that's the current state.

**The free-text budget isn't in the database.** FR8's daily counter lives in n8n's workflow static data, not a table. The dashboard cannot show "4 of 10 questions used today" without either a new table or the n8n API.

**Supabase cannot tell you the bot is alive.** The current page comment is right about this. A bot that crashed an hour ago and one that simply had nothing urgent to report look identical from the `bot_notifications` table. "Last push 7h ago" is not a health check, and dressing it up as a green dot would be a lie.

---

## 4. Options

### Tier A — free: no schema change, no new dependency

**A1. Command reference.** A static panel listing the five commands and what each returns, plus the free-text behaviour and its daily cap. Right now this is documented only in `spec.md` and inside `/help` on Telegram — nowhere in the UI. Highest value-to-effort ratio on this list, and it's the thing that makes the page useful to open at all.

**A2. What the bot sends you, unprompted.** A panel describing the four pushes and when each fires, reading the times from `settings` (`digest_time`, `timezone`) rather than hardcoding them. This is also the honest place to say "Morning Brief and Evening Review aren't listed in the activity log below, by design" — turning constraint #1 from a silent gap into stated behaviour.

**A3. Real stats from `bot_notifications`.** Total pushes, split by type, over 7/30/all time; busiest day; the most-nudged task. All straight aggregation over a table you already have. Must be labelled "alerts and nudges" rather than "messages," since digests aren't counted.

**A4. Filter and group the existing list.** Filter by type, group by day. Cheap, and makes 20 rows more readable.

**A5. Link each row to its subject.** Each row already resolves an `email_id` or `task_id` — make the label a link into `/mail/inbox?open=<id>` or the task. Currently it's dead text.

### Tier B — needs a small migration

**B1. Log the digests too.** Add `'morning_brief'` and `'evening_review'` to `bot_notifications.notification_type`'s CHECK constraint and have the scheduler write a row for each. Kills constraint #1 at the root: the activity log becomes the whole picture, and A3's stats become true counts. Cost: one additive migration, plus an edit to `assistant-scheduler.json` (hand-authored JSON, can't be tested from here). FR15 said digests *need* no dedup row — it never said a log row is unwanted, so this doesn't contradict the spec, it extends it.

**B2. Persist the free-text counter.** Move FR8's daily cap out of n8n static data into a small table so the page can show remaining budget. Also makes the cap survive an n8n cold start, which the spec itself flags as a known weakness. Bigger change: it touches the Brain's control flow, not just a display.

### Tier C — needs the n8n API

**C1. Real execution health.** `N8N_API_KEY` is already in `.env.local` **and currently used by nothing**. n8n's public API exposes execution history per workflow — last run, success/failure, error message. That would allow a genuine, non-fabricated status for all four bot workflows, including "the urgent poll last ran 4 minutes ago and succeeded" and "the deadline nudge errored last night."

This is the only option that answers "is it actually working." Tradeoff: it adds the dashboard's first outbound dependency on n8n beyond the existing draft webhook, needs a server-side proxy route (never expose that key to the browser), and fails differently — a page that now depends on n8n being reachable to render fully. Worth it only if you actually want a health view; A1/A2 are worth more if you mostly want to remember what the bot can do.

---

## 5. What I'd recommend

**A1 + A2 first.** They make the page answer "what is this and what does it do for me," need no migration and no new dependency, and A2 makes the digest gap explicit rather than hidden. Half a page of static content plus one settings read.

**Then A3 + A5**, which are small once the layout exists.

**Then decide between B1 and C1** based on what you actually want the page to be: B1 makes the *log* complete and truthful; C1 makes it a *monitor*. B1 is cheaper and lower-risk. C1 is the only one that ever tells you the bot is down.

**B2 last** — it changes bot behaviour for a display benefit, which is the worst trade on this list.

---

## 6. Non-goals

- **No fabricated status.** No green dot, no "online," no uptime figure, unless C1 is built and it's reading real execution data.
- **No chatting with the bot from this page.** The bot's interface is Telegram; a second chat UI would be a parallel client to build and keep in sync for no gain.
- **No write actions.** The bot is read-only (FR17), and this page shouldn't be the thing that quietly changes that.
