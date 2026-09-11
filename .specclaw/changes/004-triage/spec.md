# Spec: Triage (Phase 2)

**Change:** 004-triage
**Created:** 2026-09-08
**Status:** 🟡 Draft

## Overview

Every email `002-ingestion`'s Email Normaliser writes to `emails` gets a `category` and a one-line `summary` from Gemini Flash, written back to the same row. This closes the gap `emails.category` was reserved for since `0001_ingestion_schema.sql` and adds the `summary` column Phase 2's stated output ("category + one-line summary") needs.

This spec resolves the proposal's party review (`party-report.md`, verdict `CHANGES_REQUESTED`, 5 BLOCK findings) by choosing a different trigger mechanism than the proposal's draft: **Email Normaliser invokes the Triage Pipeline directly**, as `architect/03a-component-automation-engine.md` already draws (`norm --> triage`), instead of a new Supabase Database Webhook. This eliminates the unauthenticated-public-endpoint and untrusted-payload BLOCK findings by construction — there is no new externally-reachable surface — rather than by adding auth to one. It also builds the **LLM Gateway** as its own sub-workflow, matching that same diagram's separately-named component ("Every model call routes here. Swapping models is one node."), so Phase 3/4 reuse it instead of each pipeline re-implementing a Gemini caller.

## Requirements

### Functional Requirements

- **FR1 — Trigger.** Email Normaliser invokes the **Triage Pipeline** sub-workflow immediately after a successful (non-duplicate) insert into `emails`, passing `email_id`, `subject`, and `body`. A duplicate delivery — where `ON CONFLICT DO NOTHING` skipped the insert (`Format output`'s `inserted: false`) — never triggers a Triage Pipeline call.
- **FR2 — Non-blocking invocation.** Email Normaliser's call to Triage Pipeline does not wait for it to complete. `002-ingestion`'s already-verified AC1–AC5 (in particular, ingestion latency and the dedup path) must never depend on Gemini's response time or availability.
- **FR3 — LLM Gateway.** A single n8n sub-workflow, **LLM Gateway**, is the sole caller of the Gemini API anywhere in the system. It accepts a prompt/instructions payload and a structured-output schema, and returns either the parsed structured response or a typed failure — its interface carries no triage-specific shape, so a later phase (action extraction, draft generation) can call it with its own schema.
- **FR4 — Structured triage output.** Triage Pipeline calls LLM Gateway requesting a `{category, summary}` JSON object, where `category` must be one of five fixed values (`needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`) and `summary` is a single line, no more than 160 characters.
- **FR5 — Category validation before write.** Before writing, Triage Pipeline checks the returned `category` against the fixed allow-list (which mirrors the database `CHECK` constraint added by FR8). A value outside that set is treated as a failure and follows FR7's path — it is never written.
- **FR6 — Guarded write.** `UPDATE emails SET category = $1, summary = $2 WHERE id = $3 AND category IS NULL`. The `category IS NULL` guard makes every write idempotent: a re-run (manual retry, a future backfill, an accidental duplicate invocation) never overwrites a value already set, including one corrected by hand.
- **FR7 — Failure handling.** On any failure — the Gemini call erroring, unparseable output, an out-of-set `category`, or a `summary` failing FR9's shape check — `category`/`summary` are left `null` and a short message is written to the new `emails.triage_error` column for that row. No fallback model and no retry queue are built (unchanged from the umbrella proposal's §5 deferral).
- **FR8 — Category schema constraint.** `emails.category` carries a `CHECK` constraint restricting it to the five FR4 values (or `NULL`). This constraint, not the LLM's structured-output schema, is the taxonomy's canonical source — any future consumer of `category` reads against this constraint's value list, not against the prompt.
- **FR9 — Summary shape guard.** Before the write, `summary` is checked to contain no newline characters, no raw URLs, and no control characters, and to be at or under 160 characters. A response failing this check follows FR7's failure path rather than being written truncated or as-is.
- **FR10 — Field minimization.** Only `subject` and a truncated plain-text `body` (first ~2000 characters) are sent to Gemini — never `raw_payload`, headers, or any other row data.

### Non-Functional Requirements

- **NFR1 — Fixture-testable, DB-independent.** LLM Gateway (prompt + schema in, parsed JSON or typed failure out) is invocable standalone with no Supabase credential and no `emails` row, so prompt/schema changes are testable against a fixture without touching the database — this is the seam the proposal's draft lacked.
- **NFR2 — No new externally-reachable surface.** This change introduces no HTTP webhook endpoint and no new trust boundary reachable from outside n8n. Triage Pipeline is only invoked via n8n's internal sub-workflow call mechanism, the same one Gmail Ingestion already uses to call Email Normaliser.
- **NFR3 — Least-privilege credential reuse.** Triage Pipeline's write uses the same `Supabase Postgres` credential Email Normaliser already holds — no new or broader database grant is introduced for this change.
- **NFR4 — No local/fallback model.** Per the umbrella proposal's §5, a fallback router stays deferred until 429s actually appear in practice.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1 (same-day).** A manually sent test email produces an `emails` row with a non-null `category` (one of the five FR4 values) and a `summary` at or under 160 characters with no newline — confirmed by reading that specific row back from Supabase after the pipeline runs, not merely by observing n8n's execution log.
- **AC2 (same-day).** A test email with an empty or malformed body does not crash Email Normaliser or Triage Pipeline. The row ends up either with a valid best-effort `category`/`summary`, or with `category IS NULL` and a non-null `triage_error` — never a crashed, unlogged execution.
- **AC3 (same-day).** LLM Gateway can be invoked standalone against a fixture prompt/schema (no live `emails` row, no Supabase credential configured for the invocation) and returns a parsed structured response.
- **AC4 (same-day).** Replaying the same notification for an already-ingested test email (the `002-ingestion` AC3 dedup case) does not produce a second Triage Pipeline execution — confirmed in n8n's execution log, since the conflicting insert never reaches `Format output`'s `inserted: true` branch.
- **AC5 (same-day).** A fixture-forced invalid `category` (LLM Gateway returns a value outside the five-value set) results in the row being left `category IS NULL` with `triage_error` populated — never a write of the invalid value. Confirmed by reading the row back, not by log inspection alone.
- **AC6.** A schema review of `emails` confirms `category` carries a `CHECK` constraint limited to the five values (or `NULL`), and `summary`/`triage_error` are nullable, model-written-only columns, consistent with `0001_ingestion_schema.sql`'s existing "never written by ingestion" convention for `category`.

## Edge Cases

- **Duplicate delivery.** No second Triage Pipeline call fires — FR1 gates on `Format output`'s `inserted: true`, which a conflicting insert never produces. (AC4)
- **Empty/malformed email body or subject.** Triage Pipeline still runs; a best-effort result is written or the row falls to the FR7 failure path. Never an unhandled crash. (AC2)
- **Gemini returns syntactically valid JSON with an out-of-set `category`.** Rejected by FR5's validation, follows FR7. (AC5)
- **Gemini call errors, times out, or returns unparseable output.** Follows FR7's failure path — `null` + `triage_error`.
- **`summary` is well-formed JSON but exceeds 160 characters, contains a newline, or contains a URL.** Rejected by FR9, follows FR7 — never written truncated.
- **Manually re-invoking Triage Pipeline against an already-triaged row** (e.g. testing, or a future backfill). No-op: FR6's `WHERE category IS NULL` guard prevents any overwrite of the existing value.
- **Backfill of rows ingested before this change ships.** Explicitly out of scope (per proposal.md) — those rows stay `category IS NULL` / `triage_error IS NULL` indefinitely until a separate backfill change is decided.

## Dependencies

- A Google AI Studio API key with access to a Gemini Flash model supporting structured output / JSON mode.
- An n8n credential for that key (new; distinct from the `Supabase Postgres` credential this change reuses).
- `002-ingestion`'s Email Normaliser workflow and its `Supabase Postgres` credential (modified, not duplicated).
- Migration `0002_triage_schema.sql` applied before Email Normaliser's new branch is enabled, so the `UPDATE` in FR6 has columns to write to.

## Notes

- This spec supersedes the proposal's draft trigger mechanism (Supabase Database Webhook) with n8n-to-n8n invocation from Email Normaliser, per `architect/03a-component-automation-engine.md`'s `norm --> triage` edge — see `design.md`'s Key Decisions for the full rationale and which party review findings this resolves.
- Backfill policy, category taxonomy revision process, and per-row triage cost tracking remain open questions carried from `proposal.md` — none block this change's build.
- Choosing to enforce the category taxonomy via a database `CHECK` constraint (FR8) trades away the "no-constraint, revise freely" convenience the proposal's draft cited — revising the five values now requires a small migration, the same trade-off `accounts.provider` already made in `002-ingestion` for the same reason (a real boundary is worth a migration).
