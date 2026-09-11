# Design: Action Items (Phase 3)

**Change:** 005-action-items
**Created:** 2026-09-10

## Technical Approach

One new n8n workflow, one additive branch on the already-live Email Normaliser, and one migration — structurally identical in shape to `004-triage`'s build, reusing rather than re-deriving every mechanism that phase already proved live:

- **Action Extraction** — a new sub-workflow: `{ email_id, subject, body, received_at }` in, calls the existing **LLM Gateway** (unmodified) requesting `{ has_task, task_text?, deadline? }`, validates the result, and either writes a guarded `tasks` row, writes `emails.action_extraction_error`, or writes nothing at all (the clean "no task" case).
- **Email Normaliser (modified again)** — the `Inserted?` node's true branch, which currently fans out to `Call Triage Pipeline` alone, gains a second parallel connection to a new `Call Action Extraction` node — mirroring exactly how `004-triage`'s T5 added the first branch. No existing node or connection changes.
- **Migration `0003_action_items_schema.sql`** — creates the `tasks` table (sketched in `architect/04-data-model.md` but never built until now) and adds `emails.action_extraction_error`.

Nothing here is a new architectural decision. The trigger mechanism, the shared LLM Gateway, the guarded-idempotent-write convention, and even the testing technique for a forced failure (pin mock data on the LLM Gateway call node) are all reused verbatim from `004-triage`, which is exactly the payoff `architect/03a-component-automation-engine.md` predicted when it named `norm --> action` as a second fan-out branch alongside `norm --> triage` from day one.

## Architecture

```
Email Normaliser (004-triage's build, additive change only)
  ... Normalize → Upsert email → Format output → Inserted?
        │ true
        ├──▶ Call Triage Pipeline (unchanged, 004-triage)
        └──▶ Call Action Extraction (NEW, non-blocking, fire-and-forget)
                    │
                    ▼
Action Extraction (new)
  1. Build extraction prompt: subject + truncated body + received_at (reference date)
     + { has_task, task_text?, deadline? } schema, deadline constrained to YYYY-MM-DD
  2. Call LLM Gateway ──────────────▶ LLM Gateway (unmodified, 004-triage)
                                        → { success, data } or { success: false, error }
  3. Validate result:
     - success: false                          → write action_extraction_error
     - success: true, has_task: false           → write nothing (FR9)
     - success: true, has_task: true, valid      → INSERT tasks (guarded, FR7)
     - success: true, has_task: true, invalid     → write action_extraction_error (FR6/FR8)
       (empty task_text, or deadline not YYYY-MM-DD)
```

`received_at` is passed straight through from Email Normaliser's own `Normalize` node output (already computed there for `002-ingestion`) — no new date logic is added anywhere upstream.

## File Changes Map

| File | Action | Description |
|------|--------|--------------|
| `supabase/migrations/0003_action_items_schema.sql` | Create | Creates `tasks` (id, email_id FK not null + unique, task_text not null, deadline nullable date, status with CHECK, created_at) and adds `emails.action_extraction_error` (nullable text) |
| `n8n/workflows/action-extraction.json` | Create | `{ email_id, subject, body, received_at }` in → builds prompt/schema → calls LLM Gateway → validates (FR6) → guarded `INSERT` (FR7) or `action_extraction_error` write (FR8) or no-op (FR9). Fixture-testable per NFR1 (pin LLM Gateway's mock output — no change to that workflow). |
| `n8n/workflows/email-normaliser.json` | Modify | Add one node (`Call Action Extraction`) and one additional connection from the existing `Inserted?` node's **true** output (which already fans out to `Call Triage Pipeline`) — a second parallel branch, non-blocking, on the same guard. No existing node, connection, or credential changes. |
| `docs/setup/action-items-setup.md` | Create | Runbook mirroring `docs/setup/triage-setup.md`'s structure: apply migration `0003`, import `action-extraction.json`, re-point its "Call LLM Gateway" node, attach the *existing* Supabase Postgres credential (no new credential needed per NFR3), add the new branch to the live Email Normaliser, then the AC1–AC5 verification checklist. |

No new fixture file is needed — testing reuses the pin-mock-data-on-a-node technique directly in the n8n editor (NFR1), the same way `004-triage`'s AC3/AC5 were verified live, rather than a static fixture JSON file.

## Data Model Changes

```sql
-- 0003_action_items_schema.sql
-- Change 005-action-items (Phase 3)
-- Creates the tasks table sketched in architect/04-data-model.md and adds
-- Action Extraction's failure-visibility column on emails.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  task_text text not null,
  deadline date,                          -- nullable; most action items won't state one
  status text not null default 'open'
    check (status in ('open', 'done', 'dismissed')),  -- provisional; only 'open' written in this phase
  created_at timestamptz not null default now(),
  unique (email_id)                        -- at most one task per email (FR10); backs the ON CONFLICT DO NOTHING guard (FR7)
);

comment on column tasks.email_id is
  'Mandatory FK, never optional -- the hallucination mitigation per architect/04-data-model.md: every task is always checkable against its source email.';
comment on column tasks.status is
  'Written only by Action Extraction, always as ''open'' in this phase. ''done''/''dismissed'' are provisional values for Phase 5''s Action Item Sidebar to write later.';

alter table emails add column action_extraction_error text;  -- nullable; set only on a failed/rejected extraction attempt (FR8)

comment on column emails.action_extraction_error is
  'Written only by Action Extraction (005-action-items), set only when an extraction attempt fails or is rejected (FR6/FR8). Null and no tasks row means either a clean "no action item" result (FR9) or not yet attempted -- these are not distinguished in this phase; see spec.md Notes.';
```

`tasks.email_id`'s `UNIQUE` constraint is doing two jobs at once: it's the hallucination-mitigation FK `architect/04-data-model.md` calls out, and it's the mechanism `INSERT ... ON CONFLICT (email_id) DO NOTHING` needs to make the write idempotent (FR7) — the same "guard lives in the database, not workflow timing" convention `002-ingestion`'s dedup constraint and `004-triage`'s `WHERE category IS NULL` guard both already established.

## API Changes

None. Same as `004-triage` — Action Extraction is reached only via n8n's internal Execute Workflow mechanism from Email Normaliser, no new HTTP endpoint.

## Key Decisions

- **Reuse LLM Gateway unmodified rather than building a second gateway or parameterizing it further.** `architect/03a-component-automation-engine.md`'s entire justification for building LLM Gateway generic in `004-triage` was exactly this moment — a second caller with its own schema, zero changes to the gateway itself. Building it any other way here would have made that earlier design decision pointless.
- **Deadline resolution gets a reference date and a pinned wire format, resolving the party review's BLOCK finding.** `received_at` is injected into the prompt so relative-date resolution has an operand, and `response_schema` constrains `deadline` to `YYYY-MM-DD` or absent — the same "constrain via the gateway's schema, not free text" pattern that already worked for `category` in `004-triage`. A `deadline` that fails this shape check is a validation failure (FR6), not silently coerced or nulled.
- **The "no task, no error" ambiguity is an accepted gap, not fixed.** The party review's other BLOCK finding — that `has_task: false` writes no state and is therefore indistinguishable from "never attempted" — is deliberately not resolved in this design (no `action_extraction_at` timestamp column was added). This trade-off is recorded explicitly in `proposal.md` and `spec.md` rather than silently accepted; a real outage still surfaces via a cluster of `action_extraction_error` rows on whatever emails do fail outright, which is judged sufficient observability for v1's risk level.
- **No read-side guard against re-invoking an already-extracted email.** Unlike Triage Pipeline's `WHERE category IS NULL` (a read-time short-circuit), Action Extraction's `ON CONFLICT (email_id) DO NOTHING` only guards the *write*. A manual replay still re-calls LLM Gateway. Accepted per the same reasoning as the point above — this only matters under deliberate re-invocation (testing, a future backfill), not normal operation, since `Inserted?` already prevents any live duplicate delivery from reaching Action Extraction at all.
- **Testing reuses the pin-mock-data-on-a-node technique rather than adding a `force_failure` input.** The party review flagged that AC3 (forced failure) has no named seam given LLM Gateway is frozen. The fix isn't a new design affordance — it's the exact technique already used live to verify `004-triage`'s AC3 and AC5: pin the "Call LLM Gateway" node's output directly in the n8n editor. Zero design changes, zero risk to the frozen gateway.
- **`status`'s `open`/`done`/`dismissed` set ships now, `done`/`dismissed` unused until Phase 5.** Named explicitly as a provisional guess (per `proposal.md`'s Open Questions) rather than deferred to a later migration — the same trade-off `004-triage`'s five-value `category` constraint made, on the judgment that a `CHECK` constraint is cheap to widen later and the small over-commitment is worth having the shape settled now.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Hallucinated task from an email with no real commitment | `tasks.email_id` is a mandatory FK — every task is always checkable against its source email (architect/04-data-model.md's explicit rationale) |
| `has_task: true` with an empty/missing `task_text`, which is schema-shaped but violates `NOT NULL` | FR6 validates this explicitly before the write; treated as a failure (FR8), never a silent empty-string insert |
| Unparseable or malformed `deadline` string aborting the whole INSERT if handed raw to Postgres | FR6/FR4 constrain `deadline` to `YYYY-MM-DD` or absent at the schema level before it ever reaches the INSERT; a non-conforming value is rejected by Action Extraction's own validation first |
| Second parallel branch on the already-live Email Normaliser regresses `002-ingestion`/`004-triage`'s verified behavior | Purely additive — one more node, one more connection off the existing `Inserted?` true output, non-blocking (FR2), same constraint `004-triage`'s T5 already proved safe in production |
| Doubling per-email LLM Gateway calls (Triage + Action Extraction both fire on every new email) | Explicitly accepted in `proposal.md` rather than gated — a pre-filter on triage category was considered and rejected because category doesn't exist yet at fan-out time (both branches fire in parallel); revisit only if real rate-limit pressure is observed, per NFR4's precedent |
| "No task, no error" indistinguishable from "not yet attempted" | Accepted gap, not fixed — see Key Decisions |

## Grounding sources

- `architect/03a-component-automation-engine.md`: `norm --> action` and `action --> llm` (the diagram already draws Action Extraction as a second fan-out branch from Email Normaliser, parallel to Triage, both calling the same LLM Gateway) — the trigger mechanism and gateway reuse in this design come directly from this diagram, unchanged from `004-triage`'s reading of it.
- `architect/04-data-model.md`: `tasks.email_id` is not bookkeeping — it is the hallucination mitigation. Every extracted action item can be shown beside the email it was drawn from" — the source of the mandatory, never-optional FK decision.
- `architect/04-data-model.md`'s ER sketch: `TASKS { uuid id PK, uuid email_id FK, text task_text, date deadline "nullable", text status }` — this design's `tasks` schema matches this sketch's column set exactly, adding only `created_at` and the `UNIQUE`/`CHECK` constraints the sketch didn't specify.
- `n8n/workflows/triage-pipeline.json` and `n8n/workflows/llm-gateway.json`: the exact node patterns (`executeWorkflowTrigger` input declarations, the `executeWorkflow` node's `cachedResultName`-only reference pattern for an unimported sub-workflow, the `{ success, data }` / `{ success: false, error }` contract) this design's Action Extraction workflow follows verbatim.
- `n8n/workflows/email-normaliser.json`: the `Inserted?` node's existing true-branch connection to `Call Triage Pipeline` is what this design adds a second parallel connection alongside, per `004-triage`'s own T5 precedent for additive changes to this file.
- `.specclaw/changes/005-action-items/party-report.md`: the 2 BLOCK / 8 WARN findings this design and the revised `proposal.md` directly address (deadline reference date + format, accepted "no task" gap, testing seam) are cited by name throughout Key Decisions.
