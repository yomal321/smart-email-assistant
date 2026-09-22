# Bot Natural-Language Setup Runbook

Change: teach the bot to answer plain English on the existing command
branches (no LLM, no free-text budget spent), remember the last few free-text
turns, and understand "mark X done" / "snooze X to tomorrow" as writes.
Covers everything needed to go from `012-assistant-bot` + `BOT-PAGE-PLAN.md`
(both already live) to this change. Follow the steps in order.

**One migration, no new credentials or env vars** — `Match task (done)` /
`Match task (snooze)` reuse the existing **Supabase Postgres** credential,
and `Login (done)` / `Login (snooze)` reuse `DASHBOARD_BASE_URL` /
`DASHBOARD_LOGIN_SECRET` (same as `Login (add)`).

---

## 1. Apply the migration

- [ ] Apply `supabase/migrations/0022_bot_messages.sql` — adds `bot_messages` (free-text chat transcript, newest-first index on `(chat_id, created_at)`).
- [ ] `npx supabase migration list` shows `0022` with a matching `remote` column.

## 2. Re-import the edited workflow

- [ ] Re-import `n8n/workflows/assistant-brain.json` (65 nodes, up from 47). This one file carries all three pieces:
  - **Intent routing** — `Detect slash command` now maps plain English onto the nine command branches (`/today`…`/week` unchanged, plus new `/done`, `/snooze`) before anything reaches the free-text path.
  - **Conversation memory** — `Read recent turns` (spliced before `Build free-text prompt`) and `Log turns` (spliced after `Upsert free-text usage`, before `Increment counter and reply`). Re-attach **Supabase Postgres** to both.
  - **`/done` and `/snooze` branches** — two new IF-gated chains spliced between `/add?`'s false output and the free-text entry point (`Compute free-text usage date`). Re-attach **Supabase Postgres** to `Match task (done)` and `Match task (snooze)`.
- [ ] Trigger workflow, downstream `telegram-adapter.json`/`telegram-send.json` — unchanged, no re-import needed.

## 3. Verify intent routing (no LLM spent)

- [ ] From an allowlisted chat, send `what's on today?`. Confirm the same reply `/today` would give, and **no** `Call LLM Gateway` execution in n8n's log.
- [ ] Send `anything urgent?`, `what's due`, `any vip mail`, `how did I do this week` — confirm each reaches its matching branch, same test (no LLM Gateway execution).
- [ ] Send `remind me to call the bank tomorrow` — confirm it's added as a task due tomorrow (same reply shape as `/add call the bank tomorrow`), via `check-bot-intents.mjs`'s covered phrasings.
- [ ] Send a genuine question the intent map can't route (e.g. `what did Nuwan say about the invoice`) — confirm it still reaches the free-text path and counts against the daily cap, unchanged from before this change.

## 4. Verify conversation memory

- [ ] Ask a free-text question with at least one real fixture match (e.g. "what invitations do I have?"). Confirm a normal grounded reply.
- [ ] Immediately ask a follow-up that only makes sense with context (e.g. "when's the second one due?"). Confirm the reply correctly resolves the reference — check `bot_messages` for the two rows the first turn wrote (`role='user'`, `role='assistant'`).
- [ ] Query `select * from bot_messages where chat_id = '<your chat id>' order by created_at desc limit 6;` — confirm only successful free-text turns are logged, not slash-command replies.

## 5. Verify `/done` and `/snooze`

- [ ] Pin (or insert) a fixture task with distinctive text, e.g. "renew the domain".
- [ ] Send `mark renew the domain as done`. Confirm the reply is `Done: renew the domain`, and the task's `status` is now `done` with `completed_at` set (via `PATCH /api/action-items/:id`, same endpoint the dashboard's own UI uses).
- [ ] Insert two open fixture tasks that share a word (e.g. "email the report" and "finish the report draft"). Send `mark report done`. Confirm the bot replies listing both and asks to narrow down, and neither task is written to — this is the ambiguous-match path, not a guess.
- [ ] Send `mark nonexistent xyz done`. Confirm a "couldn't find an open task matching…" reply, no write attempted.
- [ ] Pin a fixture task with a deadline. Send `snooze <task text> to tomorrow`. Confirm the reply is `Snoozed "<text>" to <tomorrow's date>`, and the task's `deadline` is updated.
- [ ] Send `snooze <task text>` (no day word). Confirm the bot asks "Snooze to when?" and does not write anything — the missing-date guard runs before the match lookup.

## 6. Final verification

- [ ] `tsc --noEmit`, `eslint`, `node scripts/ci/check-n8n-workflows.mjs`, `node scripts/ci/check-bot-intents.mjs`, `node scripts/ci/check-bot-actions.mjs`, `node scripts/ci/check-migrations.mjs` all pass.
- [ ] Send `/help`. Confirm the reply lists `/done` and `/snooze` alongside the existing six commands.
