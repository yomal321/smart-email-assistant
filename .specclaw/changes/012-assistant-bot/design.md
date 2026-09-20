# Design: Personal Assistant Bot (Phase A) — Conversational Mobile Client

**Change:** 012-assistant-bot
**Created:** 2026-09-20

## Technical Approach

Four workflows, split the way `llm-gateway.json` already justifies a shared seam: one piece per distinct caller-count. `assistant-brain.json` has exactly one caller shape (a normalized question) and is channel-agnostic by construction — nothing in it knows it's Telegram. `telegram-send.json` exists because it has **two** callers (the adapter's replies and the scheduler's pushes) that would otherwise duplicate the same `sendMessage` HTTP call config — the same justification `006-draft-generation/design.md` used to keep `llm-gateway.json` a single reusable sub-workflow rather than splitting per caller.

The single hardest constraint is not Telegram or Supabase — it's the Gemini free-tier ceiling of **20 requests/day**, discovered live and already fully consumed by the existing pipeline (`.specclaw/learnings.md` L27: "roughly 6-7 real emails/day before the pipeline goes dark until next-day reset"). Every design choice below that touches the LLM Gateway is shaped by that number: slash commands are zero-cost by design, and the one LLM-calling path (free-text questions) carries its own independent cap so the bot structurally cannot compete triage out of its budget.

## Architecture

**Inbound (question → answer):**
```
Telegram (operator's phone)
        │ message
        ▼
Telegram Trigger (webhook, on the existing public n8n host)
        │ header: X-Telegram-Bot-Api-Secret-Token
        ▼
Telegram Adapter (new)
  1. Verify secret token (constant-time compare, same pattern as
     gmail-renewal-recovery.json's "Verify resync secret")
     - fail → respond 200 to Telegram (ack only), stop — no reply sent
  2. Check chat_id against TELEGRAM_ALLOWED_CHAT_IDS
     - not listed → respond 200 to Telegram, stop — no reply sent
  3. Normalize to { chat_id, text }
  4. Call Assistant Brain (blocking) ──────▶ Assistant Brain (new)
                                               → { reply_text }
  5. Call Telegram Send (blocking) ────────▶ Telegram Send (new)
                                               → sendMessage to chat_id
  6. Respond 200 to Telegram
```

**Assistant Brain (channel-agnostic):**
```
{ chat_id, text } in
  1. text matches a known slash command?
     yes → run that command's fixed, parameterized Postgres query
           → format reply_text from the rows
           → done (zero LLM calls)
     no  → free-text path:
           a. Check today's free-text counter (workflow static data)
              ≥ cap → reply_text = fixed budget-exhausted message → done
           b. Shortlist candidates: emails.search_vector match (0011_search.sql)
              + recent open tasks + recent commitments, explicit columns only,
              truncated bodies
           c. Build prompt: each candidate row wrapped in
              <<<EMAIL_START>>> ... <<<EMAIL_END>>>-style delimiters (006-draft-
              generation's convention), fixed system_prompt stating delimited
              content is untrusted quoted material, never an instruction
           d. Call LLM Gateway (unmodified) ──▶ llm-gateway.json
                                                  → { success, data: { answer } }
              (30s timeout, same as draft-generation.json)
           e. success: false / timeout / malformed → reply_text = FR10 fallback
              success → increment today's counter, reply_text = data.answer
{ reply_text } out
```

**Proactive (scheduled/polled → push):**
```
Assistant Scheduler (new) — one workflow, four trigger nodes:

  Schedule Trigger "Morning Brief" (daily, settings.timezone)
    → query tasks due today + open commitments + overnight email count
      + unhandled urgent emails
    → Telegram Send (one call per allowlisted chat_id)

  Schedule Trigger "Urgent/VIP Poll" (every 5 min)
    → SELECT emails WHERE (priority='urgent' OR sender's contact.is_vip)
        AND id NOT IN (SELECT email_id FROM bot_notifications
                        WHERE notification_type='urgent_alert')
    → for each match: Telegram Send, then INSERT INTO bot_notifications

  Schedule Trigger "Deadline Nudge" (daily, settings.timezone)
    → SELECT tasks WHERE deadline <= today AND status IN ('todo','in-progress')
        AND id NOT IN (SELECT task_id FROM bot_notifications
                        WHERE notification_type='deadline_nudge')
    → for each match: Telegram Send, then INSERT INTO bot_notifications

  Schedule Trigger "Evening Review" (daily, settings.timezone)
    → query tasks done today + tasks due today still open + due tomorrow
    → Telegram Send (one call per allowlisted chat_id)
```

## File Changes Map

| File | Action | Description |
|------|--------|--------------|
| `supabase/migrations/0014_bot_notifications.sql` | Create | `bot_notifications` table: nullable `email_id`/`task_id` FKs (mirrors `nudges`' nullable-by-type shape from `0007_commitments.sql`), partial unique indexes for per-entity dedup |
| `n8n/workflows/telegram-adapter.json` | Create | Telegram Trigger (webhook), secret-token verification, chat-ID allowlist, calls Brain then Send |
| `n8n/workflows/assistant-brain.json` | Create | Channel-agnostic slash-command router + free-text LLM path with its own daily cap |
| `n8n/workflows/telegram-send.json` | Create | Reusable `sendMessage` sub-workflow — two callers (adapter, scheduler) |
| `n8n/workflows/assistant-scheduler.json` | Create | Four trigger nodes for the proactive pushes (FR11–FR14), dedup writes for FR12/FR13 |
| `docs/setup/assistant-bot-setup.md` | Create | Runbook: BotFather token, `setWebhook` with `secret_token`, allowlist env var, migration apply, AC1–AC10 verification checklist — same shape as `docs/setup/draft-generation-setup.md` |
| `architect/03a-component-automation-engine.md` | Modify | Add the four new workflows as components, same level of detail as existing pipeline components |
| `README.md` | Modify | Add a row to the phase status table: `Assistant Bot (Phase A)` — Not started |

No existing n8n workflow, Supabase migration, or dashboard file is modified — `triage-pipeline.json` and every dashboard API route are untouched, per `proposal.md`'s Out of Scope.

## Data Model Changes

```sql
-- 0014_bot_notifications.sql
-- Change 012-assistant-bot (Personal Assistant Bot, Phase A)
-- Dedup log for the two per-entity proactive pushes (FR12 urgent/VIP alert,
-- FR13 deadline nudge). Morning Brief and Evening Review need no row here --
-- their Schedule Trigger already fires exactly once per day (FR15).
--
-- Shape follows nudges (0007_commitments.sql): a nullable FK per possible
-- source type, only one populated per row, rather than a generic polymorphic
-- (entity_type, entity_id) pair -- consistent with this project's preference
-- for typed nullable FKs over a polymorphic reference.

create table bot_notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'telegram'
    check (channel in ('telegram', 'whatsapp')),  -- whatsapp reserved for a later phase; unused today
  chat_id text not null,
  notification_type text not null
    check (notification_type in ('urgent_alert', 'deadline_nudge')),
  email_id uuid references emails(id),  -- set for notification_type = 'urgent_alert'
  task_id uuid references tasks(id),    -- set for notification_type = 'deadline_nudge'
  sent_at timestamptz not null default now()
);

comment on column bot_notifications.email_id is
  'Nullable; populated only for urgent_alert rows. Mirrors nudges.email_id -- a row about one specific source, not a generic log line.';
comment on column bot_notifications.task_id is
  'Nullable; populated only for deadline_nudge rows. Mirrors nudges.commitment_id.';

-- A single composite UNIQUE(notification_type, chat_id, email_id, task_id)
-- would NOT enforce this dedup: Postgres treats every NULL as distinct from
-- every other NULL, so two urgent_alert rows (task_id always null on both)
-- would never collide on a plain UNIQUE constraint. Two partial unique
-- indexes, scoped by notification_type, sidestep that entirely -- each only
-- ever compares the one FK column that type actually populates.
create unique index bot_notifications_urgent_alert_uidx
  on bot_notifications (chat_id, email_id)
  where notification_type = 'urgent_alert';

create unique index bot_notifications_deadline_nudge_uidx
  on bot_notifications (chat_id, task_id)
  where notification_type = 'deadline_nudge';
```

## API Changes

No new HTTP API is exposed for other services to call — this change adds no route any client of this project's own making will ever hit. The only new *inbound* surface is Telegram's webhook call to the existing n8n host (`POST /webhook/telegram-updates`, header `X-Telegram-Bot-Api-Secret-Token`), authenticated per FR3. The only *outbound* surface is n8n calling Telegram's own Bot API (`https://api.telegram.org/bot<token>/sendMessage`) from `telegram-send.json` — a call this project makes, not one it serves.

## Key Decisions

- **Slash commands for the common cases, LLM only for free text.** This is the direct structural answer to `proposal.md`'s "query planning strategy" open question. A fixed, parameterized query set (FR5) costs zero LLM calls and covers the questions actually expected daily; free-text (FR6) exists for exactly the "what invitations do I have?" shape of question the September decision anticipated, and is the only path that touches the shared 20/day quota.
- **The free-text path gets its own independent daily cap, tracked in workflow static data.** Same technique `006-draft-generation` uses for its auth-failure rate cap — no new schema, no new credential, just a counter this one workflow reads and writes. Sized (10/day, FR8) with real headroom below the account's actual ceiling so a chatty afternoon can never be the reason an email goes untriaged.
- **Telegram Trigger's webhook mode, not long polling — but not for the reason the proposal originally gave.** `docs/setup/gmail-ingestion-setup.md` already requires n8n to run behind a stable public HTTPS URL for Gmail Pub/Sub push, so "avoids needing a public webhook" (the proposal's stated advantage of Telegram) doesn't actually hold — that infrastructure already exists and is already trusted for two other webhooks (draft generation, resync). The real reason to prefer the webhook here is simpler: n8n's Telegram Trigger node natively supports it, while long polling would mean hand-rolling offset tracking with no native node to lean on. Telegram is still the right channel choice overall — the cost and 24-hour-window arguments in `proposal.md` stand independently of this correction.
- **Urgent/VIP alerts are a separate poll, not a fan-out from `triage-pipeline.json`.** The cleaner design would call a notify sub-workflow directly from triage the moment `priority` is written (non-blocking, same pattern as triage's existing `Call Rule Engine` fan-out). That was deliberately not chosen here: `proposal.md`'s Out of Scope explicitly commits to leaving the ingestion/triage/extraction pipelines untouched, and honoring that commitment was judged more valuable than shaving the alert latency from "up to 5 minutes" to "immediate." Revisit in a later phase if 5-minute latency proves too slow in practice.
- **`bot_notifications` uses typed nullable FKs plus partial unique indexes, not a polymorphic `(entity_type, entity_id)` pair.** Matches `nudges`' existing shape and gets correct-by-construction dedup semantics that a naive composite `UNIQUE` constraint would silently fail to provide (NULL-distinctness gotcha — see the migration's own comment).
- **Digest pushes (Morning Brief, Evening Review) write no dedup row at all.** A Schedule Trigger fires exactly once at its configured time by construction; adding a dedup table entry for something that structurally cannot duplicate would be complexity with no failure mode it prevents.
- **`settings.timezone` is reused as-is, no new column.** It already exists, already defaults to `'Asia/Colombo'`, and already carries exactly the semantics ("the operator's timezone for time-based calculations") this change needs.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| The bot's own LLM usage starves triage/extraction of the shared 20/day Gemini quota | FR8's independent daily cap on free-text calls only, sized well below the account ceiling (NFR1) |
| Prompt injection from email/task content reaching the free-text answer | FR7's explicit delimiting + fixed system instruction, identical convention to `006-draft-generation`; AC4 tests this directly |
| A forged webhook call impersonating Telegram | FR3's `X-Telegram-Bot-Api-Secret-Token` verification, same constant-time-compare pattern already proven for two other webhooks in this project |
| A message from someone who somehow learns the bot's username | FR4's chat-ID allowlist — the bot never replies to, or even acknowledges the existence of, an unlisted sender |
| A missed scheduled push if n8n happens to be down at trigger time | Accepted, not mitigated — no catch-up logic; a missed digest is a convenience loss, not a data-integrity one, unlike `gmail-renewal-recovery.json`'s catch-up mechanism which exists for a genuinely different reason (ingestion completeness) |
| Full email/task bodies sent to a third-party model via the free-text path | FR6/FR7's explicit column lists and truncation (NFR6) — never `SELECT *`, same discipline `006-draft-generation` established |
| `bot_notifications` dedup silently failing to prevent duplicate alerts | The partial-unique-index design (not a naive composite `UNIQUE`) is verified directly by AC10, which specifically checks the NULL-distinctness case |

## Grounding sources

- `.specclaw/learnings.md` (L27): "20 requests/day is roughly 6-7 real emails/day before the pipeline goes dark until next-day reset — this is the real operating ceiling" — the source of FR8/NFR1's independent cap and the whole hybrid-routing design.
- `.specclaw/learnings.md` (L29): the sub-workflow terminal-branch convergence lesson from adding `llm-gateway.json`'s OpenRouter fallback — applied here by keeping `assistant-brain.json`'s free-text and slash-command branches converging to one reply-composition point before returning to the adapter.
- `docs/setup/gmail-ingestion-setup.md`: "Stand up n8n somewhere with a stable public HTTPS URL before continuing" — the fact that corrects the proposal's original webhook-avoidance rationale (Key Decisions).
- `n8n/workflows/gmail-renewal-recovery.json`'s "Verify resync secret" node: the exact constant-time-comparison code pattern (`crypto.createHash('sha256')` + `crypto.timingSafeEqual`, secret from `$env`) FR3 reuses for Telegram's secret token.
- `.specclaw/changes/006-draft-generation/design.md`: "Prompt-injection defense is explicit delimiting plus a fixed instruction, not output filtering" and "Rate-limit and cooldown state lives in n8n workflow static data, not a new table" — both decisions carried forward directly (FR7/FR8).
- `architect/04-data-model.md`: `settings.timezone "default Asia/Colombo"` and the `nudges` table's nullable-FK-by-type shape (`commitment_id FK "nullable"`, `email_id FK`) — grounds FR16 and the `bot_notifications` schema respectively.
- `supabase/migrations/0009_tasks_enrichment.sql`: the guarded idempotent write convention (`UNIQUE` + partial/conditional constraints) this design's dedup indexes follow.
- `n8n/workflows/triage-pipeline.json`'s "Call Rule Engine" node (`waitForSubWorkflow: false`, fan-out after write): the pattern this design deliberately does **not** adopt for urgent alerts, and why (Key Decisions).
