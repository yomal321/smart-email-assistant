# Spec: Action Items (Phase 3)

**Change:** 005-action-items
**Created:** 2026-09-10
**Status:** 🟡 Draft

## Overview

Every new email gets a chance at producing an extracted action item: a `tasks` row (`task_text`, optional `deadline`) foreign-keyed to its source `emails` row, written by a new **Action Extraction** n8n workflow that fans out from Email Normaliser exactly the way `004-triage`'s Triage Pipeline already does — same trigger mechanism, same shared **LLM Gateway**, same guarded-write idempotency convention. This is deliberately the second instance of a now-proven pattern, not a new architectural decision.

This spec creates the underlying data only — it does not make a task visible to a human. That's Phase 5's Action Item Sidebar. Read `proposal.md`'s Problem section for why that distinction matters: the umbrella proposal's "commitments get forgotten" pain isn't solved by this change alone, only its precondition (structured task data existing) is.

Two design points carried in directly from `proposal.md`'s party review resolution:
- **Deadline resolution supplies a reference date and pins the wire format.** The model is given the email's `received_at` timestamp so a relative date ("by Friday") has an operand to resolve against, and `deadline` is constrained to `YYYY-MM-DD` or absent via the LLM Gateway's `response_schema` — never free text handed raw to a `date` column.
- **One accepted, undeferred gap:** a clean "no action item found" result (`has_task: false`) writes nothing — no `tasks` row, no `action_extraction_error`. This is deliberately the same persisted state as "never attempted." Unlike `004-triage`'s `triage_error`, this spec does not add an attempted-marker column to close that gap — accepted as low risk per `proposal.md`'s Proposed Solution (a real outage still surfaces via `action_extraction_error` on whatever emails do fail outright).

## Requirements

### Functional Requirements

- **FR1 — Trigger.** Email Normaliser's existing `Inserted?` node gains a second, non-blocking branch — **Call Action Extraction** — firing in parallel with the existing `Call Triage Pipeline`, gated by the same condition (a genuinely new, non-duplicate insert). No change to `Inserted?` itself or anything upstream of it.
- **FR2 — Non-blocking invocation.** Email Normaliser's call to Action Extraction does not wait for it to complete, for the same reason `004-triage`'s FR2 exists: `002-ingestion`'s and `004-triage`'s already-verified behavior must never depend on this new call's latency or availability.
- **FR3 — LLM Gateway reused unmodified.** Action Extraction calls the existing generic `{ system_prompt, user_content, response_schema }` LLM Gateway sub-workflow exactly as `004-triage` left it — no changes to `n8n/workflows/llm-gateway.json` in this change.
- **FR4 — Structured extraction output.** Action Extraction requests `{ has_task: boolean, task_text?: string, deadline?: string }` from LLM Gateway, with `deadline` constrained by the `response_schema` to match `YYYY-MM-DD` or be absent — never free text.
- **FR5 — Reference date for deadline resolution.** The email's `received_at` timestamp is included in the prompt's `user_content` alongside subject/body, so the model has an actual operand to resolve a relative date against.
- **FR6 — Response validation before any write.** Action Extraction validates the LLM Gateway result: `has_task: true` must carry a non-empty `task_text`; a present `deadline` must match `YYYY-MM-DD` exactly. Either violation is treated as a failure (FR8), never silently dropped or coerced.
- **FR7 — Guarded, idempotent write.** `INSERT INTO tasks (email_id, task_text, deadline, status) VALUES ($1, $2, $3, 'open') ON CONFLICT (email_id) DO NOTHING`, backed by a `UNIQUE (email_id)` constraint — a duplicate invocation for an already-extracted email never produces a second row.
- **FR8 — Failure handling.** On an LLM Gateway failure, an unparseable response, or an FR6 validation failure, no `tasks` row is written; `emails.action_extraction_error` is set to a short message for that row.
- **FR9 — No write on a clean "no task" result.** When `has_task: false` and the response otherwise passes validation, neither a `tasks` row nor `action_extraction_error` is written. This is the common, successful case, not an error — see Overview's "accepted gap" note for what this means for observability.
- **FR10 — At most one task per email.** This phase extracts zero or one task per email; decomposing one email into multiple discrete commitments is out of scope.

### Non-Functional Requirements

- **NFR1 — Fixture-testable failure path with no LLM Gateway changes.** The AC3 (forced-failure) and AC4 (replay) tests use the same testing method `004-triage`'s AC5 and AC4 already proved live: pinning mock output directly on Action Extraction's "Call LLM Gateway" node for AC3, and manually re-running Email Normaliser against the same pinned fixture data twice for AC4. Neither requires any change to `llm-gateway.json` or a new "force failure" input — this is a testing technique already validated in production, not a new design affordance.
- **NFR2 — No new externally-reachable surface.** Same as `004-triage`'s NFR2 — Action Extraction is invoked only via n8n's internal sub-workflow call mechanism from Email Normaliser.
- **NFR3 — No new credential required.** Unlike `004-triage` (which added the Gemini API credential), this change introduces no new credential at all — it reuses the existing `Gemini API` credential (via LLM Gateway, untouched) and the existing `Supabase Postgres` credential for the `tasks` write.
- **NFR4 — No local/fallback model, no retry queue.** Same deferral `004-triage`'s NFR4 already established.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1.** A test email containing a clear, concrete ask with a stated near-term day (e.g., "please send the Q3 report by Friday") produces a `tasks` row with a non-empty `task_text` and a `deadline` matching `YYYY-MM-DD` — confirmed by reading the row back from Supabase, joined to its source `emails` row via `email_id`.
- **AC2.** A test email with no actionable content (e.g., a newsletter) produces **no** `tasks` row and **no** `action_extraction_error` — confirmed this is the common, successful "nothing to extract" path.
- **AC3.** A fixture-forced failure — pinned as "Call LLM Gateway"'s mock output on Action Extraction, per NFR1 — results in `emails.action_extraction_error` populated and **no** `tasks` row. Cover at least one FR6 violation case (e.g. `has_task: true` with empty `task_text`, or a `deadline` in a non-`YYYY-MM-DD` shape).
- **AC4.** Running Email Normaliser twice against the same pinned fixture data (per NFR1's replay method) results in exactly one `tasks` row for that `email_id` — the second run's `Inserted?` evaluates false and `Call Action Extraction` does not fire a second time.
- **AC5.** A schema review of `tasks` and `emails` confirms: `tasks.email_id` is a non-nullable FK to `emails.id` with a `UNIQUE` constraint; `tasks.task_text` is non-nullable; `tasks.status` carries a `CHECK` constraint limited to `open`/`done`/`dismissed`, defaulting to `open`; `emails.action_extraction_error` is a nullable, model-written-only text column.

## Edge Cases

- **A stated deadline in an ambiguous or unparseable shape** (e.g., "end of quarter"). The model is instructed to return `deadline` only when it can confidently produce `YYYY-MM-DD`; anything else it cannot resolve should be omitted (treated as no deadline stated), not guessed. A `deadline` that is present but fails the `YYYY-MM-DD` check is an FR6 validation failure (AC3), not silently nulled.
- **`has_task: true` with an empty or missing `task_text`.** Rejected by FR6, follows FR8 — never written as an empty-string task.
- **Multiple asks in one email.** Out of scope per FR10 — the model extracts at most one; which one it picks is not specified or tested.
- **Manually re-invoking Action Extraction against an already-extracted email.** The write is a no-op per FR7's guard, but — accepted trade-off, not a defect — the LLM Gateway call itself still re-fires, since there is no read-side guard analogous to `WHERE category IS NULL` (this is the accepted gap from Overview/FR9).
- **Backfill of rows ingested before this change ships.** Explicitly out of scope, same precedent as `004-triage`.
- **A genuine LLM Gateway outage affecting every email.** Surfaces as a cluster of `action_extraction_error` rows for the emails that arrive during the outage — the accepted FR9 gap does not hide a total outage, only individual "correctly found nothing" results.

## Dependencies

- `004-triage`'s **LLM Gateway** workflow and its `Gemini API` credential (reused unmodified — no new credential).
- `004-triage`'s **Email Normaliser** workflow and its `Supabase Postgres` credential (modified additively, not duplicated).
- Migration adding the `tasks` table and `emails.action_extraction_error`, applied before Email Normaliser's new branch is enabled.

## Notes

- This spec deliberately does not attempt to solve "commitments get forgotten" (per `proposal.md`'s reworded Problem section) — it creates the data layer Phase 5 will read from.
- The FR9 gap (no attempted-marker distinguishing "checked, nothing found" from "never checked") was flagged by `005-action-items`' party review and accepted as a deliberate trade-off, not fixed here — see `proposal.md`'s Proposed Solution for the accepted-risk reasoning.
- `status`'s `done`/`dismissed` values are provisional (only `open` is ever written in this phase) — carried as an open question from `proposal.md`, not blocking this build.
