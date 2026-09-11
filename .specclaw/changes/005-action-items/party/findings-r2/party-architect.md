### [BLOCK] party-architect — The failure/success/not-attempted distinction the proposal claims to fix is only two-state; there is no "attempted" marker and therefore no replay guard equivalent to the `WHERE category IS NULL` precedent it cites
**Quotes:**
> `category IS NULL` alone couldn't distinguish "not yet attempted" from "failed," and the equivalent ambiguity here ("no task row" meaning "correctly found nothing" vs. "crashed before trying") gets the same fix.

**Quotes:**
> A test email with no actionable content (e.g., a newsletter) produces **no** `tasks` row and **no** `action_extraction_error` — confirmed this is the common, successful "nothing to extract" path, not silently indistinguishable from a failure.

**Quotes:**
> the same "duplicate/re-run is a no-op, never an overwrite" property `004-triage`'s `WHERE category IS NULL` guard and `002-ingestion`'s `ON CONFLICT DO NOTHING` both already established

**Problem:** The cited precedent works because triage writes *two* pieces of state: `category` (set on success) and `triage_error` (set on failure), so `category IS NOT NULL OR triage_error IS NOT NULL` means "attempted." This design writes state only on the two *uncommon* outcomes — a `tasks` row on `has_task: true`, `action_extraction_error` on crash — and by the proposal's own words leaves the **common** case (`has_task: false`) writing nothing at all. So "no row and no error" is exactly the same persisted state as "never ran," which is the precise ambiguity the quoted paragraph claims to be fixing. Two structural consequences at merge: (a) the second acceptance criterion asserts a post-state byte-identical to the pre-state; (b) unlike Triage Pipeline, Action Extraction has **no** guard that short-circuits an already-processed email — `ON CONFLICT (email_id) DO NOTHING` is a guard at the *write*, which means every replay re-invokes the LLM Gateway for every already-extracted and every already-declined email. The `WHERE category IS NULL` convention the proposal invokes is a *read* guard; this change adopts the name of the convention without the mechanism. No round-1 finding from any seat addressed the missing attempted-marker or the absent read-side guard; `party-po`'s cost findings assume the call fires once per new email and do not reach the replay path.

**Fix:** Add a per-email "extraction attempted" marker (e.g. `emails.action_extraction_at` timestamptz, or a three-state `action_extraction_status`) written on **all** terminal outcomes including `has_task: false`, and state the read-side guard on the Action Extraction entry path that mirrors `WHERE category IS NULL`. Alternatively, state explicitly in the artifact that re-invocation on every replay is intended and that "no task, no error" is deliberately indistinguishable from "not attempted" — but then drop the claim that this "gets the same fix" as `triage_error`.

**Status:** upheld

### [BLOCK] party-architect — Relative-date resolution is placed in the model with no reference date supplied, and the `string` → `date` coercion layer between the LLM contract and the column type is never assigned to a component
**Quotes:**
> Concretely: `{ has_task: boolean, task_text?: string, deadline?: string }`

**Quotes:**
> `deadline` (date, nullable), `status` (text, `CHECK` constraint limited to `open` / `done` / `dismissed`, default `open`), `created_at`.

**Quotes:**
> Deadline reasoning beyond parsing an explicitly stated date/relative date in the email text (e.g., no calendar-aware inference, no timezone negotiation)

**Quotes:**
> should ambiguous relative dates ("by Friday" with no stated year assumed as this coming Friday, "end of quarter" left unparsed as null) have an explicit, testable rule

**Problem:** Two seam errors compound. First, resolving "by Friday" to a calendar date is arithmetic over a reference point, and the proposal hands it to the Gemini call — the layer that cannot do it, because nothing in the described payload (`{ system_prompt, user_content, response_schema }` carrying `{ email_id, subject, body }`) contains the email's received date or today's date. The model is asked to compute a date from inputs that do not include the operand. Second, the LLM contract says `deadline?: string` while the column says `date`; no component is named as owner of the parse/normalise step between them, and no format is pinned. An implementer has three defensible choices — coerce in the n8n workflow, let Postgres coerce on INSERT, or constrain the model via `response_schema` — and only the third is testable. The Postgres path is the worst: an unparseable `deadline` string aborts the whole INSERT, so a *successful* extraction with a fuzzy date lands as neither a task row nor a recorded failure. The third Open Question concedes the rule is unwritten, carrying a contract gap into implementation.

**Fix:** Pin the wire format (`deadline` is `YYYY-MM-DD` or absent — never free text), name which component enforces it, and state where the reference date enters (e.g. the email's received timestamp injected into `user_content`). Specify the behaviour when the model returns a `deadline` that does not match the format: null it, or treat it as an extraction failure — pick one in the artifact.

**Status:** upheld

### [WARN] party-architect — Response validation is assigned to Action Extraction while LLM Gateway already takes a `response_schema`, and the behaviour on a well-formed-but-incomplete response is unspecified against a `NOT NULL` column
**Quotes:**
> Action Extraction calls the same generic `{ system_prompt, user_content, response_schema }` sub-workflow Triage Pipeline already calls

**Quotes:**
> calls LLM Gateway requesting `{ has_task, task_text?, deadline? }`, validates the response, writes a `tasks` row (guarded, idempotent) or `action_extraction_error` on failure

**Quotes:**
> `task_text` (text, not null)

**Problem:** The gateway is described as accepting a `response_schema`, which implies it owns schema conformance; the new workflow is then also described as validating the response. The artifact never says which of the two rejects a malformed payload, so this ships either a second validator of the same contract (divergence on the first schema change) or a gap where each assumes the other did it — and since "any change to Triage Pipeline or LLM Gateway's existing behavior" is out of scope, an implementer cannot resolve it by strengthening the gateway. Concretely undecided: a response of `{ has_task: true }` with `task_text` absent or empty is schema-shaped (both fields are optional in the stated contract) but violates the `NOT NULL` column. Is that a failure setting `action_extraction_error`, or is it treated as `has_task: false`? Two implementers will answer differently, and the third Open Question shows `task_text` shape rules are still open.

**Fix:** State which layer enforces the schema (gateway via `response_schema`, or a validate node in Action Extraction) and make the internal-consistency rule explicit: `has_task: true` with a missing or empty `task_text` is a failure, not a silent no-op.

**Status:** upheld

### [WARN] party-architect — The forced-failure acceptance criterion has no named stub seam, and the only component that produces the failure is declared unmodifiable
**Quotes:**
> A fixture-forced extraction failure (mirroring `004-triage`'s AC5 pattern) results in `emails.action_extraction_error` populated and still no `tasks` row.

**Quotes:**
> Any change to Triage Pipeline or LLM Gateway's existing behavior — both are reused exactly as `004-triage` left them.

**Quotes:**
> **LLM Gateway is reused unmodified.**

**Problem:** The failure modes the design names — "a Gemini call error or unparseable response" — both originate inside LLM Gateway, which this proposal freezes. The artifact points at `004-triage`'s AC5 as the pattern but never says what the injection point is *here*: a fixture flag on the Action Extraction input, a manually pinned bad model id, a disconnected credential, or a stubbed gateway. Each choice implies a different structural affordance in the new workflow, and only some are available without touching the frozen gateway. Without the seam named in the artifact, the likely outcome is a test executed once by hand against a deliberately broken credential and never again — the fourth criterion (replay produces no duplicate row) has the same problem, since it needs a way to re-invoke Action Extraction for an already-processed `email_id` and the only described trigger is the `Inserted?` node, which by definition does not fire for an existing row. `party-ba`'s finding that the criteria are all database-read assertions is a different objection (they test the wrong subject); this one is that two of them have no repeatable way to reach the state they assert.

**Fix:** Name the deterministic injection seam for both criteria in the artifact — e.g. an optional `force_failure` / manual-execution input on Action Extraction that bypasses the gateway, and a documented manual-invocation path with a fixed `email_id` for the replay test — and confirm it requires no change to LLM Gateway.

**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's volume-gating finding: the parallel fan-out the proposal specifies means the triage category does not exist when Action Extraction fires, so the suggested pre-filter is a re-wiring, not a filter
**Quotes:**
> Both fire in parallel off the same guard, matching the diagram's `norm --> triage` / `norm --> action` fan-out

**Quotes:**
> Additive branch on Email Normaliser: a second non-blocking `Call Action Extraction` alongside the existing `Call Triage Pipeline`, both gated by the existing `Inserted?` node — no change to `Inserted?` itself or anything upstream of it.

**Problem:** `party-po`'s third finding proposes gating the extraction call on "categories a prior triage pass already marked as unlikely to contain an ask." Under the topology this proposal actually specifies, there is no prior triage pass: both branches fire simultaneously off `Inserted?`, so at the moment Action Extraction is invoked the row's `category` is by construction still unwritten. Adopting the suggested pre-filter is therefore not a cheap addition to this design — it converts the fan-out into a chain (triage must complete and commit before extraction starts), which changes the Email Normaliser branch from "additive, non-blocking" to a sequencing dependency, forfeits the "purely additive" risk mitigation the proposal leans on, and introduces a read-after-write ordering question the artifact never poses. I take no position on whether the cost saving is worth it — that is `party-po`'s call — but the panel should record that their stated fix carries a structural co-change to the trigger wiring, not just a conditional node.

**Fix:** If volume-gating is adopted, the artifact must respecify the Email Normaliser branch as sequential (triage → action) and state the ordering guarantee; if it is rejected, say so on the grounds that the category is not yet available at fan-out time.

**Status:** upheld
