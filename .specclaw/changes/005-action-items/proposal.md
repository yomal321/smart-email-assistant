# Proposal: Action Items (Phase 3)

**Created:** 2026-09-10
**Status:** 🟡 Draft

## Problem

`004-triage` closed Phase 2: every new email now gets a category and a one-line summary. But the umbrella proposal's second stated pain — "commitments buried in email threads get forgotten because nothing extracts them into a task list" — is still completely unaddressed at the data layer: nothing in the system yet reads an email and decides "this requires an action," and there is no `tasks` table for such a decision to land in.

**This phase is a precondition, not the fix.** Actually stopping commitments from being forgotten requires a human to see the extracted task somewhere — that's Phase 5's Action Item Sidebar, not this change. This proposal's job is narrower and honestly scoped: create the `tasks` table and the extraction pipeline that populates it, so Phase 5 has real data to render. Nothing here should be read as claiming the "forgotten" problem is solved once this ships.

`architect/04-data-model.md` already sketches this table and the FK that matters:

> `tasks.email_id` is not bookkeeping — it is the hallucination mitigation. Every extracted action item can be shown beside the email it was drawn from, so a wrong task is visibly wrong rather than quietly authoritative.

That table doesn't exist in the schema yet (`0001_ingestion_schema.sql` and `0002_triage_schema.sql` only ever touched `accounts`/`emails`/`sync_outcomes`). This change creates it and the extraction pipeline that writes to it.

## Proposed Solution

This is deliberately the *second* instance of a pattern `004-triage` just proved live: fan out from Email Normaliser, call the shared **LLM Gateway**, validate before writing. `architect/03a-component-automation-engine.md`'s diagram already draws the shape:

> `norm --> triage` ... `norm --> action` ... `action --> llm`

Concretely:

- **Trigger:** Email Normaliser's existing `Inserted?` node (already built in `004-triage`, gating on a genuinely new — not duplicate — row) grows a **second** non-blocking branch alongside `Call Triage Pipeline`: `Call Action Extraction`. Both fire in parallel off the same guard, matching the diagram's `norm --> triage` / `norm --> action` fan-out and NFR2's precedent (no new externally-reachable surface, no new trigger mechanism).
- **LLM Gateway is reused unmodified.** Action Extraction calls the same generic `{ system_prompt, user_content, response_schema }` sub-workflow Triage Pipeline already calls — this is the exact payoff `architect/03a-component-automation-engine.md` promised when LLM Gateway was built generic on day one ("Swapping the model... is a change inside one box"). Concretely, it also means Action Extraction gets Triage's live-deployment fix (the corrected `gemini-3.6-flash` model id) for free, with zero risk of re-hardcoding a stale model id in a second place.
- **Output contract, and the "no task" case.** Per `architect/03a-component-automation-engine.md`'s pipeline table (`{ task_text, deadline? }` or none), most emails have no action item at all — this is the common case, not an error. The requested structured-output schema must distinguish "no action item" from "extraction failed," since only the second is a failure. Concretely: `{ has_task: boolean, task_text?: string, deadline?: string }` — `has_task: false` is a normal, frequent, successful result; a Gemini call error or unparseable response is the actual failure path.
- **Deadline resolution: a reference date in the prompt, a pinned wire format, one owner for the coercion.** The email's `received_at` timestamp is injected into `user_content` alongside the subject/body, so the model has an actual operand to resolve a relative date ("by Friday") against — it is never asked to compute a date from inputs that don't include today's date. `deadline` in the structured-output schema is constrained to `YYYY-MM-DD` or absent — never free text — enforced via the `response_schema` passed to LLM Gateway, the same mechanism that already constrains `category` to a closed set in `004-triage`. Action Extraction is the sole owner of turning that string into the `date` column value; a `deadline` that somehow fails to match the pinned format is treated as an extraction failure (`action_extraction_error`), never silently nulled and never handed raw to Postgres to coerce.
- **At most one task per email in this phase.** The architecture's output contract is singular (`{ task_text, deadline? }`, not an array), and decomposing one email into multiple discrete commitments is a materially harder extraction problem than this phase takes on — v1 targets the common case (an email carries zero or one actionable ask), consistent with the umbrella proposal's "acceptable accuracy... no obvious hallucinations" bar rather than completeness.
- **Idempotent write.** `INSERT INTO tasks (email_id, task_text, deadline, status) VALUES (...) ON CONFLICT (email_id) DO NOTHING`, requiring a unique constraint on `tasks.email_id` — the same "duplicate/re-run is a no-op, never an overwrite" property `004-triage`'s `WHERE category IS NULL` guard and `002-ingestion`'s `ON CONFLICT DO NOTHING` both already established as this project's standing convention for exactly this failure mode.
- **Failure visibility, partially mirroring `004-triage`'s `triage_error` precedent.** A genuine failure (Gemini error, unparseable output) is distinguishable from "no action item found": `emails` gains an `action_extraction_error` column (nullable text), set only on a real failure — never on a clean `has_task: false`. **Accepted gap, not fixed here:** unlike `triage_error`, this does not fully replicate the "not yet attempted vs. attempted-and-clean" distinction — a `has_task: false` result leaves no trace at all, so it is indistinguishable from an email that was never processed (e.g., during a Gemini outage with no visible error either). Flagged explicitly by party review; accepted as low risk for v1 rather than adding an `action_extraction_at` attempted-marker column, since a total outage would still surface as a cluster of `action_extraction_error` rows from whatever emails *do* fail outright.

**Done when:**
- A test email containing a clear, concrete ask (e.g., "please send the Q3 report by Friday") produces a `tasks` row with a non-empty `task_text` and, if a date was stated, a parsed `deadline` — confirmed by reading the row back from Supabase, joined to its source `emails` row via `email_id`.
- A test email with no actionable content (e.g., a newsletter) produces **no** `tasks` row and **no** `action_extraction_error` — confirmed this is the common, successful "nothing to extract" path, not silently indistinguishable from a failure.
- A fixture-forced extraction failure (mirroring `004-triage`'s AC5 pattern) results in `emails.action_extraction_error` populated and still no `tasks` row.
- Replaying an already-processed email does not produce a duplicate `tasks` row — confirmed via the `ON CONFLICT (email_id) DO NOTHING` constraint holding under a second invocation.

## Scope

### In Scope
- New `tasks` table: `id` (uuid PK), `email_id` (uuid, FK to `emails.id`, **not** nullable — the hallucination-mitigation link is never optional), `task_text` (text, not null), `deadline` (date, nullable), `status` (text, `CHECK` constraint limited to `open` / `done` / `dismissed`, default `open`), `created_at`. Unique constraint on `email_id` (at-most-one-task-per-email, per Proposed Solution).
- Migration adding `emails.action_extraction_error` (nullable text, same "distinguish failure from a legitimate non-result" role `triage_error` already plays).
- New n8n workflow **Action Extraction**: `{ email_id, subject, body, received_at }` in (Triage Pipeline's existing shape plus `received_at`, needed as the reference date for deadline resolution), calls LLM Gateway requesting `{ has_task, task_text?, deadline? }` with `deadline` constrained to `YYYY-MM-DD` or absent via `response_schema`, validates the response (including that `deadline` matches the pinned format and that `has_task: true` always carries a non-empty `task_text`), writes a `tasks` row (guarded, idempotent) or `action_extraction_error` on failure — no write at all on a clean `has_task: false`.
- Additive branch on Email Normaliser: a second non-blocking `Call Action Extraction` alongside the existing `Call Triage Pipeline`, both gated by the existing `Inserted?` node — no change to `Inserted?` itself or anything upstream of it.
- Setup runbook addition mirroring `docs/setup/triage-setup.md`'s structure (no new credentials needed — reuses the existing Gemini and Supabase Postgres credentials).

### Out of Scope
- Multiple tasks extracted from a single email — v1 targets zero-or-one per email, per Proposed Solution.
- Any UI for viewing, completing, or dismissing tasks (`status` is written once at creation as `open`; nothing in this phase ever transitions it) — that's Phase 5's Action Item Sidebar.
- Deadline reasoning beyond parsing an explicitly stated date/relative date in the email text (e.g., no calendar-aware inference, no timezone negotiation) — `deadline` is nullable specifically because most action items won't state one.
- Any change to Triage Pipeline or LLM Gateway's existing behavior — both are reused exactly as `004-triage` left them.
- Retry/fallback logic for failed extractions — same NFR4-equivalent deferral `004-triage` already established (build a retry mechanism only once rate limits or failures are actually observed as a real problem).

## Impact

- **Files affected:** ~4 (estimated) — one migration (`tasks` table + `emails.action_extraction_error`), one new n8n workflow (`action-extraction.json`), one additive branch on `email-normaliser.json` (mirroring `004-triage`'s T5 pattern exactly), one runbook doc. Notably smaller than `004-triage` since LLM Gateway is reused rather than rebuilt, and the credentials already exist.
- **Complexity:** small — this is the second instance of an already-proven pattern (fan-out from Email Normaliser, call the shared gateway, guarded idempotent write), not a new architectural decision.
- **Risk:** low — the highest-risk pieces (a new externally-reachable surface, an unenforced taxonomy, an ambiguous null-as-failure signal) were exactly what `004-triage`'s party review caught and this proposal avoids by construction, reusing the now-live-verified fixes rather than re-deriving them.

Principal risks and mitigations:

| Risk | Impact | Mitigation |
|---|---|---|
| Hallucinated task extracted from an email with no real commitment | A false action item erodes trust in the task list (umbrella proposal's named risk) | `tasks.email_id` is a mandatory FK (never optional), per `architect/04-data-model.md`'s explicit hallucination-mitigation rationale — every task is always checkable against its source email |
| "No action item" (the common case) silently conflated with "extraction failed" | Operator can't tell whether the pipeline is broken or just correctly found nothing | `has_task: false` is a distinct, successful outcome from an API/parse error; only the latter sets `emails.action_extraction_error`, mirroring `004-triage`'s `triage_error` precedent |
| A second fan-out branch on the already-live Email Normaliser regresses `002-ingestion`/`004-triage`'s verified behavior | Ingestion or triage breaks for an unrelated reason | Purely additive (one more node + one more non-blocking connection off the existing `Inserted?` node) — the same constraint `004-triage`'s T5 already proved safe in production |
| Duplicate `tasks` rows from a re-run or accidental double-invocation | Data integrity / confusing duplicate action items | `UNIQUE (email_id)` + `ON CONFLICT DO NOTHING`, the same idempotency convention every write path in this project already follows |
| One-task-per-email is too coarse for emails with multiple asks | Some real commitments never get extracted | Accepted scope limit for v1, named explicitly rather than silently — revisit only if it proves to matter in practice against real mail |

## Open Questions

- **`status` value set** — `open` / `done` / `dismissed` is a provisional guess (nothing in this phase sets anything but `open`); worth a second look once Phase 5's sidebar actually needs to transition it, the same way `004-triage`'s category set was flagged provisional and later just worked as specified.
- **Task text length/shape guard** — `004-triage`'s `summary` got an explicit shape guard (FR9: length, no URL, no newline) after party review flagged the gap; does `task_text` need an equivalent guard, or is it lower-risk since tasks are always shown beside their source email (harder to weaponize than a bare summary)?

**Party review (CHANGES_REQUESTED — 2 BLOCK, 8 WARN, 3 NOTE, 0 withdrawn; full detail in `party-report.md`):**
- (party-architect) The "no task, no error" success case is byte-identical to "never attempted" — unlike `triage_error`, there's no per-email marker distinguishing a completed-but-empty extraction from one that never ran, so the replay/idempotency story this proposal claims to inherit from `004-triage` isn't actually built.
- (party-architect) Relative-date resolution ("by Friday") is handed to the model with no reference date in the payload, and no component owns the `string` → `date` coercion between the LLM contract and the column type — an unparseable date could silently abort the whole INSERT.
- (party-architect) Unclear whether LLM Gateway's `response_schema` or Action Extraction's own validation is responsible for rejecting a malformed response — and undefined what happens when `has_task: true` arrives with an empty `task_text` (schema-valid, but violates the `NOT NULL` column).
- (party-architect) The two acceptance criteria needing a forced failure and a replay both lack a named test seam, given LLM Gateway is frozen/unmodifiable and `Inserted?` by definition doesn't fire for an existing row.
- (party-architect, NOTE) party-po's suggested "gate on triage category" cost-saving fix isn't a cheap filter under the proposed parallel-fan-out topology — category doesn't exist yet when Action Extraction fires, so adopting it would turn the additive branch into a sequencing dependency.
- (party-ba) The stated disease is commitments being "forgotten," but nothing in scope or the acceptance criteria verifies a human ever sees the extracted task — all four ACs are database-read assertions, and visibility is deferred to Phase 5.
- (party-ba) "Email threads" in the problem statement vs. strictly per-email extraction in the solution is an unexamined scope gap — a commitment split across two messages in a thread would never be seen by an extractor reading one email at a time.
- (party-ba) Distributional claims ("most emails have no action item," "zero or one ask per email") are stated as fact with no cited source, though they're secondary rationale rather than the sole basis for the single-task-per-email scope.
- (party-po) The cost of doing nothing (commitments lost) is never priced — no frequency or proxy rate is given to weigh against the cost of the new pipeline.
- (party-po) This doubles the per-email LLM Gateway call volume with no stated token/cost estimate.
- (party-po) No cheaper pre-filter (e.g., skip extraction for categories unlikely to contain an ask) is considered before paying for a call on every single email, most of which will return nothing.
- (party-po, NOTE) The `status` column's `done`/`dismissed` values have no consumer until Phase 5 — a cut-line worth naming explicitly (ship narrower now, or note that widening the constraint later is cheap) rather than leaving as an incidental provisional guess.

---

**To proceed:** Review this proposal and approve to begin planning.
