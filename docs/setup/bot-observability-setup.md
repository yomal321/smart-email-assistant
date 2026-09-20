# Bot Observability Setup Runbook

Change: `BOT-PAGE-PLAN.md`, options B1 (log the two daily digests) and B2
(persist the free-text daily cap). Covers everything needed to go from
`012-assistant-bot` (already live) to the `/bot` page's full build. Follow
the steps in order — later steps depend on earlier ones.

**One migration, no new credentials** — the two edited workflows reuse the
existing **Supabase Postgres** credential every other Postgres node in these
workflows already has.

---

## 1. Apply the migration

- [ ] Apply `supabase/migrations/0018_bot_observability.sql` — widens `bot_notifications.notification_type`'s CHECK constraint to accept `morning_brief`/`evening_review`, and adds the `bot_free_text_usage` table.
- [ ] `npx supabase migration list` shows `0018` with a matching `remote` column.

## 2. Re-import the edited workflows

- [ ] Re-import `n8n/workflows/assistant-scheduler.json` — adds **MB: Insert notification** (after **MB: Call Telegram Send**, before the loop closes) and **ER: Insert notification** (same position in the Evening Review branch). Re-attach the **Supabase Postgres** credential to both.
- [ ] Re-import `n8n/workflows/assistant-brain.json` — adds **Compute free-text usage date** → **Read today's usage** (spliced between `/help?`'s free-text branch and the existing **Check free-text cap**), and **Upsert free-text usage** (spliced between **Free-text success?**'s true branch and the existing **Increment counter and reply**). Re-attach **Supabase Postgres** to **Read today's usage** and **Upsert free-text usage**.
- [ ] Neither workflow's trigger or public-facing shape changed — no publish-order dependency on `telegram-adapter.json` or `telegram-send.json`.

## 3. Verify the digest logging (B1)

- [ ] Trigger **Morning Brief** manually in n8n (or wait for its schedule). Confirm the execution reaches **MB: Insert notification** and succeeds.
- [ ] Query `select * from bot_notifications where notification_type = 'morning_brief' order by sent_at desc limit 1;` — confirm a fresh row with `chat_id` set and `email_id`/`task_id` both null.
- [ ] Repeat for **Evening Review** / `evening_review`.
- [ ] Confirm **Urgent/VIP alert** and **Deadline nudge** still dedup correctly (unchanged — this phase only widened the CHECK constraint, the two `_uidx` partial unique indexes from `0014` are untouched).

## 4. Verify the persisted free-text cap (B2)

- [ ] Send the bot a free-text question (anything that isn't a recognized slash command) from an allow-listed chat.
- [ ] Query `select * from bot_free_text_usage where usage_date = current_date;` — confirm a row exists with `count = 1` (or incremented, if you'd already asked one today before this change shipped — the counter carries over cleanly since it's keyed by date, not by "since deploy").
- [ ] Ask 9 more questions today (or lower `CAP` temporarily in **Check free-text cap** to test faster) and confirm the 11th gets the fixed "I've used today's question budget…" reply with no LLM Gateway execution in the log (FR8/AC5, unchanged).
- [ ] Restart the n8n instance (or just trust this conceptually — the whole point of B2 is that a restart no longer resets the count, unlike the old `$getWorkflowStaticData` version). Confirm the cap is still respected afterward.
- [ ] The next day (past UTC midnight), confirm a fresh question succeeds and a new `bot_free_text_usage` row is created for the new date — the old row is left as history, not deleted or reset in place.

## 5. Final verification

- [ ] `tsc --noEmit`, `eslint`, `node scripts/ci/check-n8n-workflows.mjs`, `node scripts/ci/check-migrations.mjs` all pass.
- [ ] Open `/bot` in the dashboard — confirm the activity log now includes digest rows, the stats panel's counts match what steps 3–4 just produced, and the command reference and push-schedule panels render (these don't depend on live n8n at all — see `app/(hub)/bot/page.tsx`).
