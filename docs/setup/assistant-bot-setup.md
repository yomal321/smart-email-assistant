# Assistant Bot Setup Runbook

Change: `012-assistant-bot`. Covers everything needed to go from the live pipeline
(Gmail ingestion through draft generation, all live) to a working Telegram bot that
answers questions and sends proactive pushes. Follow the steps in order — later
steps depend on the migration, the tokens/secrets, and the import order from
earlier ones.

Four new n8n workflows (`telegram-send.json`, `assistant-brain.json`,
`telegram-adapter.json`, `assistant-scheduler.json`) and one migration
(`0014_bot_notifications.sql`). No existing workflow, table, or dashboard API
route is touched.

---

## 1. Apply the Supabase migration

- [ ] Open Supabase Studio → SQL Editor.
- [ ] Paste the full contents of `supabase/migrations/0014_bot_notifications.sql` and run it. This creates the `bot_notifications` table and its two partial unique indexes (`bot_notifications_urgent_alert_uidx`, `bot_notifications_deadline_nudge_uidx`).
- [ ] Confirm both indexes exist (`\d bot_notifications` in Supabase Studio, or the Table Editor's Indexes tab) before importing `assistant-scheduler.json` — its Urgent/VIP Poll and Deadline Nudge branches read and write this table immediately once active.

## 2. Create the bot and generate credentials

- [ ] Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, and follow the prompts. This gives you a bot token shaped like `123456789:AAA...`.
- [ ] Generate a webhook secret the same way as every other shared secret in this project: `openssl rand -base64 32` (or equivalent), at least 32 bytes.
- [ ] Find your own Telegram chat ID — message your new bot once (it won't reply yet), then call `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id` from the response. If you'll message the bot from more than one device/account, repeat for each and comma-separate them.

## 3. Set n8n environment variables

Following the same custody convention as `DRAFT_WEBHOOK_SECRET`/`RESYNC_WEBHOOK_SECRET` — environment variables, never n8n credentials, since the Code nodes that read them can't read n8n's credential store directly:

```
- TELEGRAM_BOT_TOKEN=<the @BotFather token>
- TELEGRAM_WEBHOOK_SECRET=<the generated secret from step 2>
- TELEGRAM_ALLOWED_CHAT_IDS=<comma-separated chat IDs, e.g. 123456789 or 123456789,987654321>
```

- [ ] Add all three to the `n8n` service's `environment:` block (e.g. `docker-compose.yml`), alongside the existing `DRAFT_WEBHOOK_SECRET`/`RESYNC_WEBHOOK_SECRET`/`NODE_FUNCTION_ALLOW_BUILTIN`/`N8N_BLOCK_ENV_ACCESS_IN_NODE` entries.
- [ ] Confirm `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` are already set (required by `draft-generation.json`'s `Verify secret` node) — `telegram-adapter.json`'s `Verify Telegram secret` node needs exactly the same two settings, and without them every webhook call is rejected `200`-with-no-reply regardless of whether the secret is correct.
- [ ] `docker compose up -d` (not `restart` — see `docs/setup/draft-generation-setup.md` §2 for why) and confirm all three new variables: `docker compose exec n8n env | grep -E 'TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|TELEGRAM_ALLOWED_CHAT_IDS'`.

## 4. Import the workflows, in order

Sub-workflows must be published before their callers — n8n resolves references by internal id at publish time, not by name, even though every reference in this change's files is written by `cachedResultName` as a placeholder.

**Already done for this instance** (2026-09-20, via the n8n public API, `.env.n8n.local`): all four workflows — **Telegram Send** (`GvEE6yOIUknQijJO`), **Assistant Brain** (`ZspQipmQbwvQ6WF7`), **Telegram Adapter** (`Cgea74BAp55aYDeJ`), **Assistant Scheduler** (`4I0OI9C7Jyw3yWvd`) — were created directly via `POST /api/v1/workflows`, in that dependency order, with every `"Call ..."` sub-workflow reference already re-pointed at the real id (no manual resource-picker step needed) and the existing **Supabase Postgres** credential (`5JIQ0EMwvsNWFJ0h`) already attached to every Postgres node in **Assistant Brain** and **Assistant Scheduler**. `Call LLM Gateway` already points at the live **LLM Gateway** workflow (`gcGAXgjk0Qbi2HKs`). All four were created **inactive**. If importing into a *different* n8n instance, repeat this by hand instead:

- [ ] Import `n8n/workflows/telegram-send.json` (name: **Telegram Send**). Publish it.
- [ ] Import `n8n/workflows/assistant-brain.json` (name: **Assistant Brain**).
  - Attach the existing **Supabase Postgres** credential to every Postgres node in this workflow (do not create a new credential — same reuse convention every prior phase follows).
  - Re-point **"Call LLM Gateway"** at the real **LLM Gateway** workflow via n8n's resource picker.
  - Publish it.
- [ ] Import `n8n/workflows/telegram-adapter.json` (name: **Telegram Adapter**).
  - Re-point **"Call Assistant Brain"** at the real **Assistant Brain** workflow.
  - Re-point both **"Call Telegram Send"** nodes (text path and non-text path) at the real **Telegram Send** workflow.
  - Publish it.
- [ ] Import `n8n/workflows/assistant-scheduler.json` (name: **Assistant Scheduler**).
  - Attach the existing **Supabase Postgres** credential to every Postgres node.
  - Re-point every **"Call Telegram Send"** node (there are four: Morning Brief, Urgent/VIP Poll, Deadline Nudge, Evening Review) at the real **Telegram Send** workflow.
  - Publish it.

Whichever path you took, these steps still require the n8n editor (the public API has no endpoint for node credentials beyond what's already wired, or for activation-time webhook registration):

- [ ] **Attach a Telegram API credential to the Telegram Trigger node in "Telegram Adapter."** n8n's Telegram Trigger manages its own webhook registration on activate/deactivate, and that mechanism needs its own credential (bot token) independent of the `TELEGRAM_BOT_TOKEN` env var `telegram-send.json`'s HTTP node reads — the two are separate, both required. In n8n: **Credentials → Create → Telegram API**, paste the same @BotFather token from step 2 below. This wasn't creatable via the API in this session since it requires the token, which per this project's secret-custody convention (step 3) isn't written to any repo file — only you can enter it directly into n8n's credential UI.
- [ ] Open the **Telegram Trigger** node once to let n8n assign its real `webhookId`, then note the full webhook URL it shows (`https://<your-n8n-host>/webhook/<id>`).
- [ ] **Activate "Telegram Adapter"** (Telegram Trigger only receives updates while active — this is also when n8n calls `setWebhook` using the credential above).
- [ ] **Activate "Assistant Scheduler"** (all four Schedule Triggers only fire while active).
  - **Timezone check:** the three daily triggers (Morning Brief 7am, Deadline Nudge 8am, Evening Review 7pm) fire against the n8n *instance's* configured timezone, not `settings.timezone` directly — n8n's Schedule Trigger has no per-workflow timezone field. If the n8n host's timezone doesn't match `settings.timezone` (default `Asia/Colombo`), either change the host's timezone or edit each Schedule Trigger's `triggerAtHour` to compensate. The "today"/"overnight" *date math inside* each branch is correct regardless (it uses `AT TIME ZONE` against `settings.timezone`) — only the wall-clock firing hour is affected.

## 5. Register the webhook with Telegram

**BEST-EFFORT, not live-tested:** activating "Telegram Adapter" likely makes n8n call `setWebhook` itself using the Telegram API credential from step 4, possibly without `secret_token` (there's no confirmed "Additional Fields → Secret Token" option checked on the Telegram Trigger node in this file). If so, the call below overrides that with the secret token our own `Verify Telegram secret` node checks for. If you ever deactivate/reactivate the workflow, re-run this call afterward to confirm the secret token wasn't silently cleared by n8n's own re-registration — check with `getWebhookInfo` (below) if in doubt.

- [ ] Call `setWebhook` with the secret token, pointing at the URL noted in step 4:
  ```bash
  curl -s -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
    -H "Content-Type: application/json" \
    -d '{"url": "https://<your-n8n-host>/webhook/<telegram-adapter-webhook-id>", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}'
  ```
  Confirm the response is `{"ok":true,"result":true,"description":"Webhook was set"}`.
- [ ] Sanity-check with `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` — confirm `url` matches and `last_error_message` is empty.

## 6. Final verification (AC1–AC10)

- [ ] **AC1** — From an allowlisted chat, send `/today`. Confirm a correctly formatted reply arrives, and no **Assistant Brain → Call LLM Gateway** execution appears in n8n's log for that request (only the slash-command branch ran).
- [ ] **AC2** — From a chat ID *not* in `TELEGRAM_ALLOWED_CHAT_IDS` (or a second Telegram account), send any message. Confirm no reply arrives, while `getWebhookInfo` / n8n's execution log shows the webhook call was received and returned `200`.
- [ ] **AC3** — Ask a free-text question matching a real fixture email/task/commitment (e.g. "what invitations do I have?" against a fixture invitation email). Confirm a correct, source-grounded reply, and exactly one **Call LLM Gateway** execution in the log.
- [ ] **AC4** — Insert (or pin) a fixture email whose body contains an injected instruction (same style as `006-draft-generation`'s AC4 test), ask a free-text question that shortlists it, and confirm the reply does not follow the injected instruction.
- [ ] **AC5** — In the n8n editor, pre-set **Assistant Brain**'s workflow static data (`freeTextCount` to `10`, `freeTextDate` to today's UTC date) via a temporary pinned/manual execution, then ask a free-text question. Confirm the fixed budget-exhausted reply arrives and no LLM Gateway execution occurs.
- [ ] **AC6** — Set a fixture email's `priority` to `urgent` (and `status` to `open`). Confirm exactly one Telegram message arrives within one 5-minute Urgent/VIP Poll cycle, and that a `bot_notifications` row now exists for `(chat_id, email_id, notification_type='urgent_alert')`. Wait for the next poll cycle and confirm no duplicate message arrives.
- [ ] **AC7** — Set a fixture task's `deadline` to today (status `todo`). Confirm exactly one deadline-nudge message the next time **Deadline Nudge** runs, and a `bot_notifications` row for `(chat_id, task_id, notification_type='deadline_nudge')`. Run the workflow again (or wait a day) with the task still open — confirm no resend.
- [ ] **AC8** — Confirm **Morning Brief** and **Evening Review** each fire once at their configured hour and contain the categories of information in FR11/FR14 (tasks due today, open commitments, overnight count, unhandled urgent / done today, still-open, due tomorrow respectively).
- [ ] **AC9** — On **Assistant Brain**'s **"Call LLM Gateway"** node, pin a forced-failure mock output (`{ "success": false, "error": "simulated failure" }`), ask a free-text question. Confirm the fixed fallback reply ("Sorry, I couldn't answer that just now...") is still sent — never silence. Unpin afterward.
- [ ] **AC10** — Run a schema review of `bot_notifications` (`\d bot_notifications` in Supabase Studio, or re-read `0014_bot_notifications.sql`). Confirm nullable `email_id`/`task_id` FKs, and that the two partial unique indexes are present. Then insert two rows by hand with the same `(chat_id, email_id)` and `notification_type = 'urgent_alert'` — confirm the second insert is rejected (or `ON CONFLICT DO NOTHING` silently skips it, per how you test it), demonstrating the dedup a plain composite `UNIQUE` constraint would not provide (Postgres treats `NULL` as distinct from `NULL`, so two `urgent_alert` rows sharing `task_id = NULL` would never collide there).

## Rotation procedure

If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_WEBHOOK_SECRET` ever leak: regenerate via @BotFather (`/revoke` then `/token`) or `openssl rand -base64 32` respectively, update the n8n environment variable, `docker compose up -d`, and re-run `setWebhook` (step 5) with the new secret if it changed. `TELEGRAM_ALLOWED_CHAT_IDS` has no rotation concept — edit it directly to add/remove chat IDs.
