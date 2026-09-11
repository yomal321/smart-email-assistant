# Design: Triage (Phase 2)

**Change:** 004-triage
**Created:** 2026-09-08

## Technical Approach

Two new n8n sub-workflows and one additive branch on an already-shipped, verified workflow, plus a migration:

- **LLM Gateway** — a generic sub-workflow: prompt/instructions + a structured-output schema in, parsed JSON or a typed failure out. No triage-specific logic lives here. This is the choke point `architect/03a-component-automation-engine.md` already names and draws separately from any one pipeline.
- **Triage Pipeline** — orchestrates: build the triage prompt/schema, call LLM Gateway, validate the result (FR5/FR9), write it (FR6) or record a failure (FR7).
- **Email Normaliser (modified)** — after its existing `Format output` node, a new branch calls Triage Pipeline non-blockingly when `inserted: true`. No existing node is changed; this is a pure addition.
- **Migration `0002_triage_schema.sql`** — adds `emails.summary`, `emails.triage_error`, and a `CHECK` constraint on `emails.category`.

The proposal's draft trigger mechanism was a new Supabase Database Webhook calling a public n8n endpoint. The party review's two strongest BLOCK findings (`party-security`: unauthenticated write endpoint; `party-architect`: a second, unverified invocation mechanism alongside the proven n8n-to-n8n path) both target that choice specifically. `architect/03a-component-automation-engine.md`'s component diagram already draws the answer:

> `norm -->|"Writes email row"| db` ... `norm --> triage` ... `norm --> action`

Email Normaliser calling Triage Pipeline directly is not a new pattern invented for this change — it is the pattern the C4 diagram already specifies, and it removes the externally-reachable surface those two BLOCK findings depend on existing at all.

## Architecture

```
Gmail Ingestion (002, unmodified)
        │
        ▼
Email Normaliser (002, additive change only)
  1. Normalize
  2. Upsert email (ON CONFLICT DO NOTHING)
  3. Format output → { email_id, inserted }
  4. NEW: if inserted → call Triage Pipeline (non-blocking, fire-and-forget)
        │
        ▼
Triage Pipeline (new)
  1. Build triage prompt + { category, summary } schema
  2. Call LLM Gateway ──────────────▶ LLM Gateway (new)
                                        1. Send prompt+schema to Gemini Flash
                                        2. Parse structured response
                                        3. Return { success, data } or { success: false, error }
  3. On success: validate category ∈ {five values}, validate summary shape (FR9)
     - valid  → UPDATE emails SET category=$1, summary=$2 WHERE id=$3 AND category IS NULL
     - invalid → UPDATE emails SET triage_error=$1 WHERE id=$2 AND category IS NULL
  4. On LLM Gateway failure → same triage_error path
```

`LLM Gateway` has no knowledge of `emails`, `category`, or any triage-specific concept — Triage Pipeline is its first caller, not its only intended one. A future Action Extraction or Draft Generation workflow calls the same sub-workflow with its own prompt and schema.

## File Changes Map

| File | Action | Description |
|------|--------|--------------|
| `supabase/migrations/0002_triage_schema.sql` | Create | Adds `emails.summary` (text, nullable), `emails.triage_error` (text, nullable), and a `CHECK` constraint on `emails.category` limiting it to the five FR4 values or `NULL` |
| `n8n/workflows/llm-gateway.json` | Create | Generic sub-workflow: `{ system_prompt, user_content, response_schema }` in → Gemini Flash structured-output call → `{ success, data }` or `{ success: false, error }` out. No DB access. |
| `n8n/workflows/triage-pipeline.json` | Create | `{ email_id, subject, body }` in → builds the triage prompt/schema → calls LLM Gateway → validates → guarded `UPDATE` (FR6) or `triage_error` write (FR7). Independently invocable with a fixture `{ email_id, subject, body }` (NFR1) — the LLM Gateway call inside it is fixture-testable on its own per NFR1; the final `UPDATE` still requires a real `email_id`, so AC3's fully DB-independent test targets LLM Gateway directly, not Triage Pipeline's write step |
| `n8n/workflows/email-normaliser.json` | Modify | Add one node + one connection after the existing `Format output` node: when `inserted` is `true`, call Triage Pipeline via n8n's Execute Workflow node configured to not wait for completion. No existing node, connection, or `pinData` is changed. |
| `n8n/fixtures/triage-fixture-email.json` | Create | A sample `{ subject, body }` pair (and a second, deliberately malformed one) for standalone LLM Gateway testing per NFR1/AC3, and for the AC5 invalid-category test |
| `docs/setup/triage-setup.md` | Create | Runbook: Gemini API key creation, applying migration `0002`, importing `llm-gateway.json` and `triage-pipeline.json`, re-pointing Triage Pipeline's "Call LLM Gateway" node at the imported workflow, attaching the reused `Supabase Postgres` credential and the new Gemini credential, updating the live Email Normaliser with its new branch, and the AC1–AC6 verification checklist |

No existing file's logic is changed beyond the one additive branch in `email-normaliser.json`.

## Data Model Changes

```sql
-- 0002_triage_schema.sql
-- Change 004-triage (Phase 2)
-- Adds Triage Pipeline's output columns and makes the category taxonomy a database-enforced constraint.

alter table emails add column summary text;         -- nullable; model-written only, never by ingestion
alter table emails add column triage_error text;     -- nullable; set only on a failed/rejected triage attempt

comment on column emails.summary is
  'Written only by Triage Pipeline (004-triage). Ingestion + Email Normaliser never write this column.';
comment on column emails.triage_error is
  'Set only when Triage Pipeline''s attempt fails or is rejected (FR7). Null means either not yet attempted or succeeded — check category to distinguish those two.';

alter table emails add constraint emails_category_check
  check (category is null or category in ('needs_reply', 'fyi', 'waiting_on_someone_else', 'promotional', 'low_priority'));
```

`category`'s constraint is the taxonomy's canonical source (FR8) — Triage Pipeline's workflow-level validation (FR5) is defense in depth against the model's own request-shaped-but-untrusted output, not the source of truth itself. A future revision to the five values is a migration (`ALTER ... DROP CONSTRAINT` / `ADD CONSTRAINT`), the same trade-off `accounts.provider`'s constraint already made in `002-ingestion`.

## API Changes

None. Unlike the proposal's draft, this design introduces no new HTTP endpoint — no Supabase Database Webhook, no public n8n webhook URL. Triage Pipeline and LLM Gateway are reached only via n8n's internal Execute Workflow mechanism, the same one `002-ingestion` already uses for Gmail Ingestion → Email Normaliser.

## Key Decisions

- **Trigger via Email Normaliser invocation, not a Database Webhook.** Resolves `party-security`'s BLOCK on an unauthenticated write endpoint and `party-architect`'s BLOCK on a second, unverified invocation mechanism — by removing the externally-reachable surface both findings depend on, rather than adding auth to it. Directly grounded in `architect/03a-component-automation-engine.md`'s `norm --> triage` edge, which predates this change.
- **Non-blocking invocation from Email Normaliser.** `002-ingestion`'s AC1–AC5 are already verified live in production; Triage Pipeline's latency or failure must never be able to regress them. The Execute Workflow node calling Triage Pipeline does not wait for its result.
- **LLM Gateway built now as a generic, schema-agnostic sub-workflow.** `architect/03a-component-automation-engine.md`: "Model differences die at the LLM Gateway. Triage, extraction and drafting never call Gemini. They call the gateway." Building Triage Pipeline's Gemini call inside a triage-specific workflow would have made this claim false on day one; this design keeps LLM Gateway's interface (prompt + schema in, parsed result out) free of triage concepts so Phase 3/4 reuse it as drawn.
- **The database `CHECK` constraint, not the LLM's structured-output schema, is the category taxonomy's source of truth.** Resolves the round-2 disagreement between `party-visionary` (wanted a named source of truth so Phase 3 doesn't re-declare the list) and `party-security` (objected that the model's own schema is a self-declaration by the untrusted party, not an enforcement point). The constraint is enforced where the sender cannot reach it; Phase 3 should read the constraint, not the prompt.
- **`triage_error` as a plain column, not a `sync_outcomes`-style table.** `sync_outcomes` logs one row per scheduled renewal *run*; triage failure is per-*email*, and the email row itself is the natural place to record why it wasn't triaged. A second table would duplicate `emails.id` as its only useful key for no benefit at this volume.
- **The write is guarded by `WHERE category IS NULL` (FR6).** Makes every write idempotent for free — a re-run, a future backfill, or an accidental duplicate invocation can never overwrite an existing value, including one corrected by hand. Resolves `party-security`'s "unconditional UPDATE" WARN at negligible cost.
- **`summary`'s shape (length, no newline, no URL) is validated in Triage Pipeline before the write (FR9), not left to the "never verbatim" test alone.** `party-security` and `party-ba` converged on the same gap from different angles (an injection risk vs. a spec-conformance gap); one shape check satisfies both.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini free-tier rate limit (15 req/min, 1M tokens/day) hit during a burst of incoming mail | Single-mailbox volume is well within this per the umbrella proposal; a rate-limited call follows FR7's failure path (`triage_error` set) rather than blocking or crashing |
| Structured-output parsing fails or returns an out-of-set category | FR5/FR7 — never written; `triage_error` records it |
| Category taxonomy turns out wrong once real mail is triaged against it | A migration (`ALTER CONSTRAINT`) is now required to revise it — an explicit, accepted trade-off for making the taxonomy enforced rather than convention-only |
| Full mailbox body content sent to a third-party free tier | FR10 field minimization (subject + truncated body only, never `raw_payload`/headers); the runbook records which retention tier the API key is provisioned under |
| Email Normaliser (already live in production) is modified | Change is strictly additive — one new node, one new connection, after the existing terminal node; no existing node, query, or `pinData` fixture changes, so `002-ingestion`'s AC1–AC5 are not exercised by this design's changes |
| `emails.category`/`summary`/`triage_error` reused inconsistently by a later phase | FR8 names the `CHECK` constraint as canonical; `design.md` states this explicitly so Phase 3/4 don't independently re-derive the taxonomy from the prompt |

## Grounding sources

- `architect/03a-component-automation-engine.md`: `norm --> triage` (Email Normaliser invokes Triage Pipeline directly in the diagram) and "**LLM Gateway** ... Every model call routes here. Swapping models is one node." — the trigger mechanism and the LLM Gateway split in this design both come directly from this diagram, predating and superseding the proposal's Database Webhook draft.
- `architect/03a-component-automation-engine.md`, "Failure modes this diagram makes visible": "Ingestion succeeds, AI fails — the email row exists with a null category. The inbox should render that state, not hide the email." — confirms `category IS NULL` as the intended pending/failed signal; `triage_error` is this design's addition to distinguish which.
- `architect/04-data-model.md`, "Open questions ... Category values": "A fixed enum keeps the inbox scannable and filterable ... The column is `text` either way, but the constraint belongs in the schema if the enum wins." — this design resolves that named-but-undecided question by adding the constraint (FR8).
- `supabase/migrations/0001_ingestion_schema.sql`: `check (provider in ('gmail'))` on `accounts.provider` — the precedent this design's `emails.category` constraint follows, and the source of the "revision now costs a migration" trade-off named above.
- `n8n/workflows/email-normaliser.json`: the existing `Format output` node's `{ email_id, inserted }` output shape is what this design's new branch conditions on (`inserted === true`), and the existing `Upsert email` node's `Supabase Postgres` credential is what Triage Pipeline's write reuses (NFR3).
- `.specclaw/changes/004-triage/party-report.md`: the 5 BLOCK / 18 WARN findings this design directly addresses are cited by name throughout this document's Key Decisions.
