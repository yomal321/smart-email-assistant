# Tasks: Personal Assistant Bot (Phase A) — Conversational Mobile Client

**Change:** 012-assistant-bot
**Created:** 2026-09-20
**Total Tasks:** 7

## Summary

Three waves. Wave 1 lays the foundation that has no dependency on the others: the dedup schema, the reusable outbound send workflow, and the channel-agnostic brain. Wave 2 wires Telegram to that foundation on both the inbound (adapter) and proactive (scheduler) sides. Wave 3 documents the runbook and updates the two architecture docs that track each phase. No task touches an existing workflow, migration, or dashboard file.

## Tasks

### Wave 1 — Foundation (no dependencies)

- [x] `T1` — Create `bot_notifications` dedup migration
  - Files: `supabase/migrations/0014_bot_notifications.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact SQL specified in `design.md`'s Data Model Changes — nullable `email_id`/`task_id` FKs, two partial unique indexes (not a composite `UNIQUE`, per the NULL-distinctness note in the migration's own comment). Apply against the project's Supabase instance and confirm both indexes exist before Wave 2 tasks that depend on them.

- [x] `T2` — Create `telegram-send.json` reusable sub-workflow
  - Files: `n8n/workflows/telegram-send.json`
  - Estimate: small
  - Kind: impl
  - Notes: Execute Workflow Trigger taking `{ chat_id, text }`, one HTTP Request node calling Telegram's `sendMessage` (bot token from an n8n environment variable, e.g. `TELEGRAM_BOT_TOKEN`, never hardcoded), converging to a single `Return result` no-op leaf per `design.md`'s Grounding sources (L29's terminal-branch-convergence lesson) since this will be called with `waitForSubWorkflow: true` by both future callers.

- [x] `T3` — Create `assistant-brain.json`
  - Files: `n8n/workflows/assistant-brain.json`
  - Estimate: large
  - Kind: impl
  - Notes: Execute Workflow Trigger taking `{ chat_id, text }`. Implements FR5 (slash-command router: `/today`, `/urgent`, `/deadlines`, `/vip`, `/help`, each one fixed parameterized Postgres query, explicit columns, never `SELECT *`) and FR6–FR8 (free-text path: static-data daily counter check, `emails.search_vector` + recent `tasks`/`commitments` shortlist, `<<<EMAIL_START>>>`-style delimited prompt per FR7, one `Call LLM Gateway` execute-workflow call referencing the existing sub-workflow by name — same placeholder-by-`cachedResultName` convention `triage-pipeline.json`'s "Call LLM Gateway" node uses — 30s timeout, counter increment on success). FR10's fallback reply on any failure branch (LLM error, timeout, malformed response, unrecognized empty text) must converge to the same single reply-composition point before the trigger returns, per L29. This is the one task worth the most build-time care in this change — get the branch convergence and the daily-cap check-then-increment ordering right the first time.

### Wave 2 — Channel wiring (depends on Wave 1)

- [x] `T4` — Create `telegram-adapter.json`
  - Files: `n8n/workflows/telegram-adapter.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T2, T3
  - Notes: Telegram Trigger node (webhook mode) → FR3's secret-token verification (Code node, same `crypto.createHash('sha256')` + `timingSafeEqual` pattern as `gmail-renewal-recovery.json`'s "Verify resync secret", reading `TELEGRAM_WEBHOOK_SECRET` via `$env`) → FR4's chat-ID allowlist check against `TELEGRAM_ALLOWED_CHAT_IDS` (comma-separated env var, split and compared as strings) → on any verification failure, respond `200` to Telegram with no further action and no reply sent (FR4) → on pass, blocking call to T3's Assistant Brain, then blocking call to T2's Telegram Send with the brain's `reply_text`, then respond `200` to Telegram. Handle FR-noted edge case: non-text message content (sticker/photo/voice) short-circuits to a fixed "I can only read text right now" reply via T2, without calling the Brain.

- [x] `T5` — Create `assistant-scheduler.json`
  - Files: `n8n/workflows/assistant-scheduler.json`
  - Estimate: large
  - Kind: impl
  - Depends: T1, T2
  - Notes: One workflow, four Schedule Trigger nodes per `design.md`'s Architecture diagram. Morning Brief and Evening Review (FR11/FR14, FR15 — no dedup write) each: one parameterized query, one T2 call per allowlisted chat ID (loop over `TELEGRAM_ALLOWED_CHAT_IDS`), computed against `settings.timezone`. Urgent/VIP Poll (FR12, every 5 minutes) and Deadline Nudge (FR13, daily): query per `design.md`'s Architecture diagram, per-item loop with `onError: continueRegularOutput` on the per-row processing (per `.specclaw/learnings.md` L28 — one bad row must never block the rest of the batch), T2 call, then `INSERT INTO bot_notifications` guarded by `ON CONFLICT DO NOTHING` against the T1 partial unique indexes.

### Wave 3 — Documentation (depends on Wave 2)

- [x] `T6` — Write the setup runbook
  - Files: `docs/setup/assistant-bot-setup.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T4, T5
  - Notes: Same shape as `docs/setup/draft-generation-setup.md` — creating the bot via @BotFather, generating `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`, calling `setWebhook` with `secret_token` pointed at the deployed `telegram-adapter.json` URL, setting `TELEGRAM_ALLOWED_CHAT_IDS`, applying migration `0014`, importing all four workflows and re-pointing each Execute Workflow node's placeholder reference at the real imported workflow (same re-pointing step every prior phase's setup doc includes), and a verification checklist walking AC1–AC10.

- [x] `T7` — Update architecture docs
  - Files: `architect/03a-component-automation-engine.md`, `README.md`
  - Estimate: small
  - Kind: docs
  - Depends: T4, T5
  - Notes: Add the four new workflows to `architect/03a-component-automation-engine.md` at the same level of detail as the existing pipeline components (name, trigger type, what it reads/writes, what it calls). Add one row to `README.md`'s phase status table: `Assistant Bot (Phase A)` / conversational mobile client + proactive pushes / state reflecting actual completion at merge time.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
