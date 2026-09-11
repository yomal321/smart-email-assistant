### [BLOCK] party-security — The trigger endpoint's authentication is left as an open question, so the design as written accepts unauthenticated writes to `emails`

**Quotes:**
> Supabase Database Webhook configuration: fires on `INSERT` to `emails`, calls the Gemini Triage workflow's webhook URL
> **Database Webhook auth** — Supabase Database Webhooks can sign requests (a shared secret header); should the Gemini Triage endpoint verify this the same way Gmail Ingestion verifies its OIDC token, given `002-ingestion`'s precedent that public n8n webhook endpoints are treated as a trust boundary from day one?

**Problem:** The proposal decides the endpoint exists and decides it writes to `emails`, but defers whether it authenticates. An undecided auth check is an absent auth check: as specified, any party who learns or guesses the n8n webhook URL can POST a synthetic payload and drive a Gemini call plus an `UPDATE` on a row of their choosing. The proposal itself names the precedent it is failing to follow ("public n8n webhook endpoints are treated as a trust boundary from day one") and then leaves the decision open. This is also the unmetered path to the daily token budget in the same document — an unauthenticated caller can exhaust the free-tier quota named in §5, which denies triage to every genuinely ingested email until reset. Round 2 strengthens rather than weakens this: `party-architect`'s first BLOCK independently identifies the same endpoint as a second, unverified inbound path and cites this very Open Question as evidence the new trust boundary is unresolved.

**Fix:** Resolve this in the proposal, not in plan: the endpoint verifies the Supabase webhook signature/shared-secret header before any other node runs, and rejects with a non-2xx and a logged event otherwise. Add a per-minute invocation cap on the endpoint so a caller (or a mail burst) cannot consume the whole daily token budget in one window. If `party-architect`'s fix is adopted and the Database Webhook is dropped in favour of n8n-to-n8n invocation, this finding is satisfied by that change — the public endpoint ceases to exist.

**Status:** upheld

### [BLOCK] party-security — The webhook payload is both the untrusted content and the write target; nothing re-reads the row from the trusted store

**Quotes:**
> One new n8n workflow: **Gemini Triage** — Supabase Database Webhook trigger → Gemini Flash call (structured JSON output: `category`, `summary`) → `UPDATE emails SET category = ..., summary = ... WHERE id = ...`

**Problem:** The chain shown has no step that reads `emails` — the row id used in `WHERE id = ...`, and the subject/body fed to the model, both arrive from the request body. `party-architect`'s WARN on the data-access contract establishes that the payload-versus-refetch choice is genuinely unnamed rather than decided, and I concede that narrows the first half of this finding: once auth is resolved, the payload's `id` is Supabase-authentic and the "caller names a foreign row" scenario collapses into the auth finding above. What does not collapse is the residual, which is squarely fail-silent: an `UPDATE` keyed on an unvalidated payload `id` that matches no row is a zero-row write, and a zero-row write in this design is indistinguishable from a successful one — no assertion, no error, and an acceptance criterion (below) that deliberately does not read the row back. The write target is never validated against the store it mutates.

**Fix:** Take only `id` from the payload, then `SELECT subject, body FROM emails WHERE id = :id` and prompt from that result; abort with a logged error if the select returns zero rows. Assert the `UPDATE` affected exactly one row and fail the execution loudly if it did not.

**Status:** upheld

### [BLOCK] party-security — Nothing enforces that `category` is one of the five values; the stated mitigation is contradicted two rows above it

**Quotes:**
> Structured-output schema constrains the response shape; category values are a closed provisional set the model selects from, not free text it can smuggle instructions into — full injection-hardening of the prompt itself is a `/specclaw:plan`-level detail, not resolved here
> a `text` column with no `check` constraint (unlike `accounts.provider`) means relabeling is a data update, not a migration

**Problem:** The injection mitigation rests on `category` being a closed set, and the taxonomy row states the column deliberately has no `check` constraint. So the "closed set" exists only as a request to the model, made in a prompt whose other half is sender-controlled text. There is no validation node between the model response and the `UPDATE`, and no database constraint behind it — the guard named in the risk table has no implementation anywhere in the In Scope list. `category` is the field the proposal expects downstream phases and the operator to make decisions from; a sender who moves the model off-schema writes an arbitrary string into it. Deferring "full injection-hardening" to plan is defensible; deferring the enum check that the mitigation column already claims as present is not. `party-architect` reaches the same gap from the layering side and states it as no layer owning validation; the two findings converge on one required node.

**Fix:** Validate the model's `category` against the five-value allow-list in the workflow before the write, and leave `category`/`summary` `null` with a logged rejection on any other value. Add a `check` constraint (or an enum) in the same migration that adds `summary`; the taxonomy-revision concern is satisfied by shipping a new constraint with the revision, which is what `accounts.provider` already does.

**Status:** upheld

### [WARN] party-security — The `UPDATE` is unconditional, so a redelivery or manual re-run silently destroys a corrected value with no prior copy retained

**Quotes:**
> `UPDATE emails SET category = ..., summary = ... WHERE id = ...`
> Explicitly flagged as provisional in this proposal; a `text` column with no `check` constraint (unlike `accounts.provider`) means relabeling is a data update, not a migration

**Problem:** The proposal expects operators to relabel rows by hand ("relabeling is a data update"), and the write path overwrites `category`/`summary` for any invocation naming that `id`. Webhook delivery is at-least-once in general, and the fixture/standalone invocation path is explicitly a supported entry point. A second fire over a hand-corrected row replaces the human's value with model output, and the old value is nowhere — no history column, no prior-value capture, no re-derivation path. The operator's recovery is to remember what they had typed. `party-architect`'s webhook-delivery-contract WARN supplies the concrete trigger I only asserted generically: a non-2xx returned on a Gemini failure causes Supabase's own retry to re-invoke the workflow and re-run the write.

**Fix:** Scope the write to the untriaged state: `... WHERE id = :id AND category IS NULL`. Any deliberate re-triage then goes through an explicit, separately authorized path, and the backfill follow-up named in Open Questions can use the same predicate safely.

**Status:** upheld

### [WARN] party-security — The only stated content guard is "never verbatim," which no injected content needs to violate

**Quotes:**
> No email's `body`/`subject`/`raw_payload` content is ever written into `category` or `summary` verbatim — both must be Gemini's own structured output, never a pass-through, since sender-controlled text is untrusted per `002-ingestion`'s FR4 boundary.

**Problem:** `summary` is unconstrained free text authored by a model whose prompt contains sender-controlled body content, and the stated check tests only for verbatim equality with the source. A sender who gets the model to emit a lightly reworded instruction, a URL, or a fabricated urgency claim passes this criterion cleanly, because the output is indeed "Gemini's own structured output." The proposal then reads that stored text back to a human in Supabase Studio, and later phases named here (drafting) will read it as model input — model-authored text derived from untrusted content, used to steer a model, with the trust boundary declared satisfied by a string-inequality test. `party-ba`'s finding that "non-empty" does not implement "one-line" is the same missing constraint seen from the requirements side; a length/shape ceiling satisfies both seats.

**Fix:** Replace the verbatim test with a shape constraint the sender cannot satisfy: cap `summary` length, reject responses containing URLs or control characters, and require the model to summarize in a fixed third-person form. State that `summary` is untrusted-derived data and must be escaped, never executed or re-prompted as instruction, by anything that consumes it.

**Status:** upheld

### [WARN] party-security — `category IS NULL` cannot distinguish a failed triage from one that never ran, so the sole health signal is unreadable

**Quotes:**
> `category`/`summary` are left `null` and the failure is logged in n8n's own execution log — a row with `category is null` past its ingestion time *is* the health signal
> Re-triaging existing untriaged rows (every `emails` row ingested before this change ships stays `category IS NULL` until a backfill is separately decided)

**Problem:** The same document that designates `category IS NULL` as the failure signal also creates a permanent population of `category IS NULL` rows that were never attempted, plus a third class — rows whose webhook never fired, the failure mode the risk table itself anticipates. Three distinct states share one representation, and the row carries no attempt timestamp, no attempt count, and no error field. Diagnosis therefore depends entirely on n8n's execution log, which is retention-bounded and is not queryable alongside the row. A triage pipeline that stops firing entirely produces exactly the signal the design says is normal for pre-existing mail. `party-visionary` reaches the same overloading from the precedent side; that seat owns whether the convention should propagate to Phase 3/4, this one owns that the current run's failure is undiagnosable today.

**Fix:** Record the attempt on the row — a `triage_attempted_at` timestamp and a short `triage_error` written on every failure path, including the parse-rejection path. Then "never attempted" (`triage_attempted_at IS NULL`), "attempted and failed" (`triage_error IS NOT NULL`), and "succeeded" are distinguishable in a single query without the execution log.

**Status:** upheld

### [WARN] party-security — Success is verified by watching the workflow run rather than by reading the row it was supposed to write

**Quotes:**
> confirmed by observing the Database Webhook fire and the Gemini Triage workflow execute, not by polling `emails`.

**Problem:** The acceptance check deliberately observes the acting components and deliberately excludes the effect. Every failure downstream of the model call — a zero-row `UPDATE` from a wrong `id`, an insufficiently privileged write credential, a rolled-back transaction — produces a webhook that fired and a workflow that executed, which is precisely the evidence the criterion accepts. The mechanism reports on itself and the artifact it exists to produce is excluded from the verdict by name. This is not the falsifiability objection `party-ba` owns and did not file: the criterion is falsifiable, it simply falsifies the wrong proposition, and the failures it cannot see are the same silent ones named in my second and eighth findings.

**Fix:** Keep the execution observation as the latency evidence, and add the effect check: after the run, read that specific row back and assert `category` is one of the five values and `summary` is non-empty. Observing the actor and reading the result are not substitutes.

**Status:** upheld

### [WARN] party-security — The Gemini credential's custody is named; the database write credential's scope is not named at all

**Quotes:**
> n8n credential for the Gemini API (Google AI Studio API key, free tier per the umbrella proposal's §5)
> Migration: add `emails.summary` (text, nullable, model-written only — same "never written by ingestion" boundary `category` already has)

**Problem:** The In Scope list enumerates one credential — the outbound LLM key — and enumerates none for the inbound write, even though this workflow's entire purpose is to mutate a table. The "model-written only" boundary on `summary` and `category` is asserted as a convention with no grant behind it. A workflow reachable from a public webhook endpoint should hold the narrowest possible database authority, and the proposal does not say what authority it holds, so nothing prevents it from being wired with a key that can read `raw_payload` across the table or write `accounts`. `party-architect` names the same missing credential as an unnamed co-change; that is the contract half. This is the grant half: whichever credential is chosen, the proposal must state its ceiling, and `party-architect`'s suggestion that an existing `002-ingestion` credential might simply be reused is the specific outcome least-privilege forbids here.

**Fix:** Name the write credential in scope and constrain it: a dedicated role with `UPDATE` on `emails.category` and `emails.summary` and `SELECT` on `emails.id, subject, body` only — no other table, no `raw_payload`, no `DELETE`. That grant is sufficient for everything this workflow does.

**Status:** upheld

### [NOTE] party-security — Full mailbox bodies leave the system to a third-party free tier, and that transmission is the one effect that cannot be undone

**Quotes:**
> An n8n sub-workflow, triggered per newly-inserted `emails` row, calls Gemini Flash with a structured-output prompt and writes back `category` + a new `summary` column.
> n8n credential for the Gemini API (Google AI Studio API key, free tier per the umbrella proposal's §5)

**Problem:** Every failure in this proposal is recoverable except this one: once a real inbox's subject and body are sent to an external endpoint, no operator action retrieves them, and the proposal states no position on what the free tier retains or how much of the row is transmitted. The Impact section rates risk as "low-to-medium — concentrated in prompt/output quality," which accounts for wrong answers but not for the content that had to leave the process to obtain them. There is no exposure here beyond what the design necessarily requires, which is why this is a NOTE rather than a block — but it is unstated. `party-architect`'s observation that the fixture test still hits the live model adds one detail: the test path also transmits, so the field-minimization decision governs test runs too.

**Fix:** State the field minimization explicitly in scope: send `subject` plus a truncated plain-text `body`, never `raw_payload`, never headers. Record in the runbook which retention tier the key is provisioned under, so the decision is a deliberate one rather than a default.

**Status:** upheld

### [WARN] party-security — Rebuttal to party-visionary: the Gemini structured-output schema is not a source of truth for the taxonomy, because the party it constrains is the one being distrusted

**Quotes:**
> **Provisional category set** (five values, revisable in `/specclaw:plan` once real mail has been triaged against it): `needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`.
> Structured-output schema constrains the response shape; category values are a closed provisional set the model selects from, not free text it can smuggle instructions into

**Problem:** `party-visionary`'s second finding states that "the only place the five category values are enforced is inside the Gemini structured-output schema in the n8n workflow," and its fix proposes naming that schema as the taxonomy's single source of truth for Phase 3 to read from. The long-horizon concern about a duplicated literal list is sound and I do not contest it; the premise that the model's own output schema constitutes *enforcement* is the fail-open reading, and adopting it as the canonical reference would harden that mistake into the next phase. A structured-output request is a constraint the model is asked to honour while processing sender-controlled text in the same prompt — it is the untrusted party's self-declaration, not a check performed by a trusted layer. It has no behaviour on the failure path: when the model returns an off-schema value, nothing in the design as written rejects it before the `UPDATE`. A source of truth Phase 3 must trust has to be enforced somewhere the sender cannot influence — the validation node and the `check` constraint from my third finding — and *those* are what Phase 3 should read from, not the prompt schema.

**Fix:** Keep `party-visionary`'s duplication concern; relocate the source of truth. Make the DB `check` constraint (or enum) the canonical list, have the workflow's validation node and the prompt schema both derive from it, and have Phase 3 read the constraint rather than the prompt.

**Status:** upheld
