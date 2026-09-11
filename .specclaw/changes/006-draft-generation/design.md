# Design: Draft Generation (Phase 4)

**Change:** 006-draft-generation
**Created:** 2026-09-11

## Technical Approach

One new n8n workflow, one migration, and one documentation update — structurally different from `004-triage`/`005-action-items` in one key way: this workflow is **not** invoked from Email Normaliser. It has its own webhook trigger and is reached directly over HTTP, since it's on-demand rather than per-email-automatic. Everything else follows the now-established conventions: LLM Gateway is called unmodified, the `Supabase Postgres` credential is reused, and per-row failure visibility follows the `triage_error`/`action_extraction_error` precedent.

The workflow is intentionally more node-heavy than Triage Pipeline or Action Extraction — it's the first pipeline that has to do real authentication, rate limiting, and a regeneration cap, none of which the internal fan-out pipelines needed.

## Architecture

```
External caller (curl for now; Phase 5's Draft Review Modal eventually)
        │ POST /webhook/generate-draft
        │ header: x-draft-webhook-secret
        │ body: { email_id }
        ▼
Draft Generation (new, single workflow)
  1. Check cooldown (workflow static data) — if active, respond 429, stop
  2. Verify secret (constant-time compare)
     - fail → record failure timestamp in static data (may trip cooldown), respond 401, stop
  3. Check email exists — SELECT id FROM emails WHERE id = $1
     - not found → respond 404, stop
  4. Check regeneration cap — SELECT COUNT(*) FROM drafts WHERE email_id=$1 AND created_at > now() - interval '1 hour'
     - ≥ 5 → respond 429, stop
  5. Read thread — SELECT id, participants, subject, body, received_at FROM emails
     WHERE thread_id = (SELECT thread_id FROM emails WHERE id=$1) ORDER BY received_at DESC LIMIT 10
  6. Read style sample (best-effort) — SELECT id, subject, body FROM emails
     WHERE labels @> '["SENT"]' ORDER BY received_at DESC LIMIT 5
     (may return zero rows — proceed without style examples)
  7. Build prompt — truncate bodies to 1500 chars, wrap each quoted email in
     <<<EMAIL_START>>> ... <<<EMAIL_END>>> delimiters, fixed system_prompt
     stating delimited content is untrusted quoted material, never an instruction
  8. Call LLM Gateway (unmodified) ──────────▶ LLM Gateway (004-triage, unchanged)
                                                 → { success, data: { draft_body } }
                                                 → { success: false, error }
     (30s timeout on this call)
  9. Validate result:
     - success: false, timeout, or draft_body missing/empty/not-a-string
         → UPDATE emails SET draft_generation_error = $1 WHERE id = $2
         → respond 502
     - valid draft_body
         → INSERT INTO drafts (email_id, draft_body, status)
           VALUES ($1, $2, 'pending') RETURNING id, email_id, draft_body, status, created_at
         → respond 200 with that row
```

No arrow into this diagram comes from Email Normaliser, and no arrow leaves toward Gmail — both deliberate, per FR13 and NFR2.

## File Changes Map

| File | Action | Description |
|------|--------|--------------|
| `supabase/migrations/0004_draft_generation_schema.sql` | Create | Creates `drafts` (id, email_id FK not null, draft_body not null, status with CHECK defaulting `pending`, created_at) and adds `emails.draft_generation_error` (nullable text) |
| `architect/04-data-model.md` | Modify | Replace the `draft_body`-on-`emails` sketch (and its ER diagram entry) with the `drafts` table, so the doc of record matches the actual schema (AC8) |
| `n8n/workflows/draft-generation.json` | Create | The full workflow described in Architecture: webhook trigger, cooldown/auth/regeneration checks, thread + style reads, delimited prompt construction, LLM Gateway call (unmodified), guarded write, and the six possible HTTP responses (200/401/404/429×2/502) |
| `docs/setup/draft-generation-setup.md` | Create | Runbook: generating the shared secret, applying migration `0004`, importing the workflow, re-pointing its LLM Gateway reference, attaching the reused Supabase credential, the secret-rotation procedure, and the AC1–AC8 verification checklist (including how to exercise the rate-cap and regeneration-cap tests with curl) |

No existing n8n workflow is modified — unlike `004-triage`/`005-action-items`, Email Normaliser is untouched by this change, since Draft Generation isn't part of the per-email fan-out.

## Data Model Changes

```sql
-- 0004_draft_generation_schema.sql
-- Change 006-draft-generation (Phase 4)
-- Creates the drafts table (architect/04-data-model.md's flagged Phase 4 decision)
-- and adds Draft Generation's failure-visibility column on emails.

create table drafts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  draft_body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'discarded')),  -- provisional; only 'pending' written in this phase
  created_at timestamptz not null default now()
  -- deliberately NO unique constraint on email_id: multiple drafts per email is
  -- the point (regeneration), bounded instead by the application-level cap (FR4),
  -- not a database constraint -- unlike tasks.email_id in 005-action-items.
);

comment on column drafts.email_id is
  'Mandatory FK, never optional. No uniqueness constraint -- unlike tasks.email_id, multiple drafts per email are expected (regeneration); the application-level cap (FR4) bounds this, not the schema.';
comment on column drafts.status is
  'Written only by Draft Generation, always as ''pending'' in this phase. ''sent''/''discarded'' are provisional values for Phase 5''s Draft Review Modal to write later.';

alter table emails add column draft_generation_error text;  -- nullable; set only on a failed/rejected generation attempt (FR11)

comment on column emails.draft_generation_error is
  'Written only by Draft Generation (006-draft-generation), set only when a generation attempt fails (LLM Gateway error, timeout, or malformed response). Same per-email failure-visibility convention as emails.triage_error and emails.action_extraction_error.';
```

`architect/04-data-model.md`'s ER sketch currently shows `draft_body` as a column on `EMAILS` with a note flagging it unresolved. This change's doc update replaces that entry with a `DRAFTS` table entry mirroring the `TASKS` table's existing presentation, and removes the now-resolved "Draft storage" bullet from that doc's "Open questions" section.

## API Changes

**This change adds the project's one deliberate external HTTP interface.** Full contract:

| Case | Status | Body |
|---|---|---|
| Success | `200` | `{ id, email_id, draft_body, status, created_at }` (the full inserted row) |
| Missing/wrong secret | `401` | `{ "error": "unauthorized" }` |
| Auth-failure cooldown active | `429` | `{ "error": "too many failed attempts, try again later" }` |
| `email_id` not found | `404` | `{ "error": "email not found" }` |
| Regeneration cap reached | `429` | `{ "error": "regeneration limit reached for this email" }` |
| Generation failure | `502` | `{ "error": "draft generation failed" }` |

Request: `POST /webhook/generate-draft`, header `x-draft-webhook-secret: <secret>`, JSON body `{ "email_id": "<uuid>" }`.

This is the interface Phase 5's Draft Review Modal will implement against — specified fully now so that later phase isn't guessing at a contract this one left implicit.

## Key Decisions

- **One workflow, no internal sub-workflow boundary.** Unlike LLM Gateway (many callers, justifying a reusable seam), Draft Generation has exactly one caller shape (an external HTTP request) and no internal n8n caller at all. Splitting "Draft Webhook" from "Draft Generation" into two workflows, as the original proposal draft implied, would add an Execute-Workflow boundary with no second caller to justify it — resolves the party review's structural ambiguity finding by picking the simpler option.
- **Rate-limit and cooldown state lives in n8n workflow static data, not a new table.** `$getWorkflowStaticData()` is enough to track a rolling failure count and an optional cooldown-until timestamp — no new schema, no new credential, for a counter that only this one workflow needs to read and write. If this proves insufficient in practice (e.g., static data doesn't survive an n8n restart in the way expected), revisit with a small Postgres table; not built preemptively.
- **The regeneration cap is a `COUNT(*)` query, not a schema constraint.** `tasks.email_id` in `005-action-items` got a `UNIQUE` constraint because at-most-one-per-email was the actual invariant; `drafts.email_id` deliberately has no such constraint because *more than one* is the intended behavior, just bounded. The cap therefore has to be an application-level check (FR4), not something the database can enforce structurally the way the `tasks` table's constraint did.
- **Prompt-injection defense is explicit delimiting plus a fixed instruction, not output filtering.** Constraining what goes *into* the prompt (clearly marked untrusted spans) is cheaper and more reliable than trying to detect an already-successful injection in the model's output after the fact — consistent with this project's existing preference for validating/constraining inputs (e.g., `004-triage`'s `response_schema` constraint on `category`) over post-hoc cleanup.
- **No Gmail credential is attached to this workflow at all.** This is the structural enforcement of "never auto-sent" the party review asked for — not a promise about which nodes get added later, but the absence of any capability to invoke in the first place.
- **Email Normaliser is untouched.** This is the first phase-4-style change where the "purely additive branch on Email Normaliser" pattern from `004`/`005` doesn't apply, because Draft Generation isn't part of the automatic per-email fan-out — it's reached externally, on demand.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Prompt injection from inbound email content | FR8's explicit delimiting + fixed system instruction; AC4 tests this directly |
| Weak/brute-forceable shared secret | Generated (CSPRNG, ≥32 bytes), constant-time comparison, global rate cap with cooldown (FR2/FR3); documented rotation in the runbook |
| Unbounded regeneration spend | FR4's per-email, per-hour cap, checked before every LLM Gateway call |
| Style-grounding precondition (`SENT`-labelled rows) doesn't currently exist | FR7 scopes it as best-effort with graceful degradation (AC6); expanding ingestion is explicit out-of-scope follow-up, not silently assumed |
| A hung or slow LLM Gateway call | FR9's 30-second timeout converts a hang into the same FR11 failure path |
| `n8n workflow static data` proving unreliable for the rate-cap counter across restarts | Named as an accepted implementation choice in Key Decisions; revisit with a Postgres-backed counter if it proves insufficient — not built preemptively |
| Full mailbox content sent to a third-party model | FR6/FR7's explicit column lists (never `SELECT *`) and bounded, truncated reads |

## Grounding sources

- `architect/04-data-model.md`: "A separate `drafts` table allows regeneration and history... it is a Phase 4 decision, not a Phase 1 one" — the flagged question this design resolves, and the doc this design updates in the same change.
- `architecture.md`: "The dashboard calls n8n for exactly one thing: draft generation, on demand... That single webhook is the only place where a slow n8n makes the UI wait" — the source of this design's single-workflow, synchronous-response, 30-second-timeout decisions.
- `n8n/workflows/gmail-renewal-recovery.json`: `"labelIds": ["INBOX"]` on the `watch()` call — direct code confirmation that sent mail isn't currently ingested, grounding FR7's best-effort scoping and AC6.
- `n8n/workflows/triage-pipeline.json` / `n8n/workflows/action-extraction.json`: the `executeWorkflow`-calling-LLM-Gateway pattern, the `{ success, data }` contract, and the per-email error-column convention (`triage_error`, `action_extraction_error`) this design's `draft_generation_error` follows.
- `supabase/migrations/0003_action_items_schema.sql`: `tasks.email_id`'s `UNIQUE` constraint as the precedent this design deliberately does *not* follow for `drafts.email_id`, and the reasoning why (Key Decisions).
- `.specclaw/changes/006-draft-generation/party-report.md`: the 6 BLOCK / 16 WARN findings this design and the revised `proposal.md` directly address are cited by name throughout Key Decisions and the Risks table.
