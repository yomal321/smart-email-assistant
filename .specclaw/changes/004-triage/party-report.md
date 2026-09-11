# Party Report: 004-triage

**Reviewed:** 2026-09-08
**Tier:** deep (classifier) — Adds emails.summary column to existing persisted emails table, a change to persisted data shape that becomes irreversible once the workflow processes real mail.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(fable)
**Verdict:** CHANGES_REQUESTED

## Summary

28 findings: 5 BLOCK, 18 WARN, 4 NOTE upheld — 1 withdrawn

## Findings

### [BLOCK] party-architect — Trigger and DB write are welded into the same workflow that must also run standalone on a fixture
**Quotes:** > One new n8n workflow: **Gemini Triage** — Supabase Database Webhook trigger → Gemini Flash call (structured JSON output: `category`, `summary`) → `UPDATE emails SET category = ..., summary = ... WHERE id = ...`
**Quotes:** > The Gemini Triage sub-workflow can be run standalone against a fixture email body (subject + plain-text body) and produce the same structured output, without a live Supabase insert.
**Problem:** These two lines describe incompatible shapes for one artifact. As scoped, the workflow's only entry point is a webhook trigger and its terminal node is an `UPDATE ... WHERE id = ...`. A fixture invocation has no webhook delivery and no row `id`, so it can neither enter the workflow nor reach the write step without a second trigger and a conditional or parameterised write. The proposal never names that seam — it does not say whether the fixture path skips the UPDATE, writes to a throwaway row, or whether "run standalone" means only the Gemini node is exercised. An implementer will either build the fixture path and silently change what the production path does, or build the production path and mark the standalone criterion untestable.
**Fix:** Split the classifier (subject + body in → `{category, summary}` out, no DB access) from the wrapper that receives the webhook and performs the UPDATE, and state which of the two the fixture test invokes.
**Status:** upheld

### [BLOCK] party-architect — Membership in the closed category set is enforced only by the model; no layer owns validation before the write
**Quotes:** > **Provisional category set** (five values, revisable in `/specclaw:plan` once real mail has been triaged against it): `needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`.
**Quotes:** > a `text` column with no `check` constraint (unlike `accounts.provider`) means relabeling is a data update, not a migration
**Quotes:** > A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values)
**Problem:** The artifact names the codebase's existing mechanism for constraining a closed value set — the `check` constraint on `accounts.provider` — and then deliberately declines to use it, while stating a done-when condition that the value must be one of five. Nothing between the Gemini response and the `UPDATE` is specified as checking that. The decision "is this a valid category" therefore lands in the model, which is the one layer that cannot be relied on to make it, and the same gap leaves done-when criterion 4 (`never a pass-through` of sender text into `category`/`summary`) with no named enforcement point either. A sixth category value silently enters the column and every future consumer must defensively handle unknown labels.
**Fix:** Name the validation step between the model response and the write — a node that rejects out-of-set `category` values (and treats rejection as the documented `null` failure path) — regardless of whether a DB constraint is also added.
**Status:** upheld

### [WARN] party-architect — Data-access contract for reading the email and writing the row is unspecified, and no Supabase credential appears in scope
**Quotes:** > Supabase Database Webhook configuration: fires on `INSERT` to `emails`, calls the Gemini Triage workflow's webhook URL
**Quotes:** > n8n credential for the Gemini API (Google AI Studio API key, free tier per the umbrella proposal's §5)
**Problem:** The workflow must read `subject`/`body` and then write two columns back, but the artifact never says whether it takes the content from the Database Webhook's delivered row payload or re-selects it from `emails` by `id`. These are materially different designs: one needs no read path, the other needs a Supabase read credential and must handle the row having changed. Separately, the in-scope list enumerates exactly one credential — Gemini — while the workflow's terminal step is an `UPDATE` against `emails`, so the Supabase write credential is a required co-change that is never named, and the artifact does not say whether an existing `002-ingestion` credential is reused or a new one created.
**Fix:** State the payload-vs-refetch choice and name the Supabase credential the UPDATE uses, including whether it is the one ingestion already holds.
**Status:** upheld

### [WARN] party-architect — "the same structured output" from a live model is not a deterministic test, and no stub seam is named
**Quotes:** > The Gemini Triage sub-workflow can be run standalone against a fixture email body (subject + plain-text body) and produce the same structured output, without a live Supabase insert.
**Quotes:** > callable independently with a fixture email body (mirroring `002-ingestion`'s NFR3 precedent for Email Normaliser) so prompt changes are testable without a live insert
**Problem:** The fixture seam removes Supabase from the test but leaves Gemini in it. Every run of this test hits the network, consumes free-tier quota, and returns a non-reproducible response, so "the same structured output" cannot mean byte equality and the artifact does not say what it does mean — same `category` only, non-empty `summary`, or something else. The Email Normaliser precedent being mirrored is a pure transform with no external dependency, so the analogy does not carry the part that matters. Without a way to feed a canned model response through the parse/validate/write path, the only repeatable assertions are about the workflow's non-LLM steps, and those are exactly the steps the fixture path is ambiguous about (see the trigger/write seam finding).
**Fix:** Name the injection point for a canned model response, and state the assertion the fixture test makes (which fields must match exactly versus merely be well-formed).
**Status:** upheld

### [WARN] party-architect — Webhook delivery contract undefined: response codes, redelivery, and whether a second delivery re-runs the LLM call
**Quotes:** > Supabase Database Webhook configuration: fires on `INSERT` to `emails`, calls the Gemini Triage workflow's webhook URL
**Quotes:** > If the Gemini call fails or returns unparseable output, `category`/`summary` are left `null` and the failure is logged in n8n's own execution log
**Quotes:** > Retry/backoff logic for failed Gemini calls beyond n8n's default node retry behavior — a dedicated retry queue is deferred with the rest of the fallback-router decision
**Problem:** This is a contract between two components built by different configuration surfaces, and neither side of it is specified. The artifact does not say what HTTP status the n8n endpoint returns on a Gemini failure — return non-2xx and Supabase's own delivery retry re-invokes the workflow (a second paid LLM call and a second UPDATE against a row that may already be triaged); return 2xx and the failure is invisible in the Supabase delivery log the risk table relies on as the observability surface. It also does not say whether the endpoint responds before or after the Gemini call completes. Two implementers will resolve this differently, and the two resolutions produce different rate-limit behaviour under exactly the burst condition the risk table names.
**Fix:** Specify the endpoint's response contract (status on success, on model failure, and whether the response is immediate or awaits the model) and state whether the UPDATE is guarded against a redelivered insert.
**Status:** upheld

### [NOTE] party-architect — The "single LLM choke point" is a property of there being one call, not a mechanism this change builds
**Quotes:** > **The single LLM choke point starts here.** `001-smart-email-assistant`'s one architectural rule ("all LLM calls route through a single n8n sub-workflow") has had nothing to enforce it until now
**Quotes:** > one **Gemini Triage** sub-workflow makes the only LLM call in the system today
**Problem:** Nothing in the in-scope list creates a layer whose responsibility is "make an LLM call"; it creates a workflow whose responsibility is "triage an email", whose interface is triage-shaped (`{category, summary}`, fixture is a subject/body pair). The rule is satisfied at this merge only by there being a single caller. This has no correctness consequence for this commit and is recorded as a placement observation, not an objection to shipping.
**Fix:** If the choke point is meant to be a reusable seam rather than a coincidence, say so in the artifact so the boundary between the gateway and the triage prompt is drawn while there is only one caller.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po: relaxing the latency criterion does not remove a trigger mechanism, it swaps one for a different unbuilt one
**Quotes:** > A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values) and a non-empty `summary` within seconds of its `emails` row appearing — confirmed by observing the Database Webhook fire and the Gemini Triage workflow execute, not by polling `emails`.
**Quotes:** > Supabase Database Webhooks are a new mechanism, unverified in this project
**Problem:** `party-po`'s WARN reads the "within seconds" wording as "the reason a brand-new trigger mechanism is introduced at all," implying a coarser interval would avoid the new mechanism's cost. Structurally it would not. The same quoted line rules out the coarser-interval implementation by name — "not by polling `emails`" — and the alternative it rules out, an n8n schedule trigger sweeping `WHERE category IS NULL`, is itself a mechanism the artifact never claims exists in this project, with its own sweep-window, its own re-pickup semantics against rows already in flight, and its own interaction with the backfill question in Open Questions. The trade on offer is not "new mechanism versus none" but "Database Webhook versus a scheduled sweep," and the second one is not cheaper by inspection. I take no position on which latency the product needs — that is `party-po`'s call — only on the claim that the cheaper-latency variant is the cheaper-structure variant.
**Fix:** If the latency criterion is relaxed, the artifact must name the replacement trigger and its sweep/re-pickup contract; dropping "within seconds" alone leaves the workflow with no specified entry point.
**Status:** upheld

### [WARN] party-ba — Stated problem ("can't tell at a glance") is scoped away from the deliverable that's supposed to fix it
**Quotes:**
> the umbrella proposal (`001-smart-email-assistant`) actually promised: "You can't tell at a glance which emails actually need you."

> Any frontend surface for viewing triage results (`emails.category`/`summary` are queryable directly in Supabase Studio for now, same minimal-visibility precedent `002-ingestion` used for `sync_outcomes`)

**Problem:** The named pain is a human unable to glance at their inbox and know what needs attention. This change writes `category`/`summary` to database columns and explicitly puts any user-facing surface out of scope, deferring visibility to "Supabase Studio" — a database admin tool, not an inbox view. If this proposal ships and works perfectly, the mailbox owner still cannot "tell at a glance which emails need you"; they would have to open Supabase Studio and read a table. The proposal treats "the data exists" as solving "the human can see it," which are different problems — the second is the one actually named in the Problem section.
**Fix:** Either scope this change to include a minimal glance-able surface (even a filtered view/query the user is expected to actually use), or restate the Problem section to claim only "the data needed for triage doesn't exist yet," not the human-facing "can't tell at a glance" framing, so the proposal's justification matches what it delivers.
**Status:** upheld

### [WARN] party-ba — No acceptance criterion verifies the proposal's own stated problem is resolved
**Quotes:**
> `002-ingestion` lands normalized Gmail rows in `emails` within seconds of arrival, but every row sits there inert — nothing reads `subject`/`body` and turns it into a signal the umbrella proposal (`001-smart-email-assistant`) actually promised: "You can't tell at a glance which emails actually need you."

> A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values) and a non-empty `summary` within seconds of its `emails` row appearing — confirmed by observing the Database Webhook fire and the Gemini Triage workflow execute, not by polling `emails`.

**Problem:** All four "Done when" criteria test data mechanics (webhook fires, columns populate, malformed input doesn't crash, no verbatim pass-through). None test whether a human can now tell which emails need them — the claim the Problem section stakes the whole change on. The main claim is structurally unfalsifiable at ship time: every listed AC could pass while the stated disease (inability to glance and know) is untouched, per the finding above.
**Fix:** Either add an AC that ties to actual human-observable triage usefulness (even informally, e.g. "reviewer can distinguish needs_reply from promotional by reading the Supabase Studio table"), or explicitly narrow the Problem section's claim to the schema/data gap that the ACs do verify.
**Status:** upheld

### [WARN] party-ba — "One-line summary" (the promised output) and "non-empty summary" (the acceptance criterion) are not the same requirement
**Quotes:**
> A one-line summary, the other half of Phase 2's stated output ("category + one-line summary"), has no place to land yet.

> A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values) and a non-empty `summary` within seconds of its `emails` row appearing

**Problem:** The Problem section anchors the deliverable to a "one-line summary" (quoting the umbrella proposal's stated output). The only acceptance criterion touching `summary` requires it be merely "non-empty" — with no length or line constraint. A prompt that reliably returns a three-paragraph summary would satisfy the AC as written while breaking the promise the Problem section uses to justify the `summary` column's existence. Whether "one-line" is enforced (in the prompt, in validation, or not at all) changes what gets built and is never resolved.
**Fix:** Either add "one line" as an explicit, testable constraint to the Done-when criteria (e.g., no newline characters, or a length ceiling), or drop "one-line" from the Problem section's framing so the AC and the stated promise match.
**Status:** upheld

### [WARN] party-po — "Within seconds" latency requirement is asserted without value justification, forcing the cost of a new trigger mechanism
**Quotes:** > A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values) and a non-empty `summary` within seconds of its `emails` row appearing — confirmed by observing the Database Webhook fire and the Gemini Triage workflow execute, not by polling `emails`.
**Problem:** The stated value this change chases is "you can tell at a glance which emails actually need you" — a value that does not obviously require sub-minute freshness. The proposal never argues why "within seconds" (rather than "within a few minutes") is necessary to deliver that glance-value, yet this precision requirement is the reason a brand-new trigger mechanism is introduced at all (the proposal's own risk table admits "Supabase Database Webhooks are a new mechanism, unverified in this project," carrying "setup/debugging friction"). A looser freshness requirement is a cheaper variant of the requirement itself and the proposal never considers it.
**Fix:** State why near-real-time triage matters here (e.g., is there a downstream consumer that needs it within seconds?), or relax the Done-when criterion to a coarser interval and let cost follow value.
**Status:** upheld

### [WARN] party-po — Recurring Gemini cost is bounded by a ceiling but no expected usage number is given
**Quotes:** > concentrated in prompt/output quality (a wrong category is embarrassing, not dangerous, since nothing auto-acts on it yet) and in the free-tier Gemini rate limit (15 req/min, 1M tokens/day) being sufficient for single-mailbox volume, which the umbrella proposal already judged likely.
**Problem:** The proposal states the ceiling (15 req/min, 1M tokens/day) but never states the expected number this change will actually consume — no estimate of emails/day, average subject+body token count, or resulting daily token spend. "Sufficient for single-mailbox volume" is asserted by reference to another document's judgment rather than computed here, so the running-cost trade this change adds (one LLM call per inserted row, forever) cannot be checked against the stated ceiling from this artifact alone. Round-1 architect and security findings on unauthenticated redelivery and webhook retries (each potentially triggering a second paid call per row) sharpen this: without a baseline expected-usage number, there is no way to tell how much headroom exists before those failure-mode multipliers exhaust the ceiling.
**Fix:** State the assumed daily email volume and an estimated token cost per triage call, then show the resulting daily/monthly total against the 15 req/min and 1M tokens/day ceilings.
**Status:** upheld

### [WARN] party-po — Scope size is not weighed against the recurring cost of the manual status quo it replaces
**Quotes:** > nothing reads `subject`/`body` and turns it into a signal the umbrella proposal (`001-smart-email-assistant`) actually promised: "You can't tell at a glance which emails actually need you."
**Problem:** The full cost of doing nothing here is "the user keeps scanning their inbox manually," and that cost scales with inbox volume/frequency — a number the proposal never states. This change spends a new n8n workflow, a new trigger mechanism, a new credential, a new migration, and a new LLM dependency to replace that manual scan. Without an inbox-volume figure, there is no way to check whether the recurring inconvenience being removed is large enough to earn a standing pipeline versus, say, a much smaller mechanism (e.g., a single scheduled digest query the user runs on demand).
**Fix:** State the approximate email volume/day this pipeline is sized for, so the cost of the pipeline can be compared to the manual-scan cost it removes.
**Status:** upheld

### [NOTE] party-po — Category and summary are bundled as one shippable unit with no named cut line between them
**Quotes:** > An n8n sub-workflow, triggered per newly-inserted `emails` row, calls Gemini Flash with a structured-output prompt and writes back `category` + a new `summary` column.
**Problem:** The stated problem is "can I tell at a glance which emails need me" — a question `category` alone answers. `summary` is additional model output, an additional Done-when check ("non-empty `summary`"), and an additional schema column, but the proposal never names it as a separable increment that could ship first (or ship the same day but be allowed to lag) while category alone unblocks the primary stated value.
**Fix:** Name the cut line explicitly — either justify why category and summary must land atomically, or note that `summary` could be treated as a smaller follow-on shipped once the category signal alone is validated in practice.
**Status:** upheld

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

### [WARN] party-visionary — The "null is the health signal" pattern is set as precedent here while already conflating three distinct causes, and nothing stops the next phase from copying it into columns where null is a legitimate result rather than a failure

**Quotes:**
> If the Gemini call fails or returns unparseable output, `category`/`summary` are left `null` and the failure is logged in n8n's own execution log — a row with `category is null` past its ingestion time *is* the health signal (same pattern `sync_outcomes` established for sync health in `002-ingestion`'s NFR4), so no new outcomes table is added for this alone.
> A deliberately malformed/empty email body does not crash the workflow — it either produces a best-effort `category`/`summary` or leaves both `null`, but never leaves the workflow in a failed-and-unlogged state.

**Problem:** This proposal already lets `category IS NULL` mean at least three different things — not-yet-triaged (webhook lag), Gemini call failure, and "best-effort left null" for malformed input — and declares all three equivalent to a single bit read off the column. The proposal frames this as reusing the `sync_outcomes` health-visibility pattern, but `sync_outcomes` is a dedicated table that can distinguish outcomes; this is a single nullable column standing in for one. The next change that builds monitoring/alerting on top of this (the natural follow-up once `emails.category`/`summary` move past "queryable directly in Supabase Studio," which this proposal names as the current state) inherits a signal that already can't tell "retry this" from "ignore this" from "debug the prompt," and has no schema-level way to add that distinction without a migration. Worse, if Phase 3 or Phase 4 copy "encode status as null in the output column, skip the outcomes table" for a case where null is a legitimate non-failure result (e.g. "no action item" or "no draft needed" for an `fyi` email), the same convention will misreport correct behavior as failure.

**Fix:** None required now, but the artifact should flag that this convention does not generalize past a single-cause null and should not be copied as-is into a step where null can mean "nothing to do here."

**Status:** upheld

### [WARN] party-visionary — The five-value category taxonomy has no schema-level source of truth, so Phase 3 (named in this proposal's own Out of Scope) will hardcode a second copy of it with no enforced link back

**Quotes:**
> **Provisional category set** (five values, revisable in `/specclaw:plan` once real mail has been triaged against it): `needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`.
> Action item extraction into a `tasks` table — Phase 3, a separate change
> Explicitly flagged as provisional in this proposal; a `text` column with no `check` constraint (unlike `accounts.provider`) means relabeling is a data update, not a migration

**Problem:** The only place the five category values are enforced is inside the Gemini structured-output schema in the n8n workflow — the database column carries no `CHECK` constraint, by design, specifically so the values stay revisable. But Phase 3 (action item extraction), which this same proposal names as the next change against this surface, will almost certainly need to filter or branch on `category` (e.g., only extract action items from `needs_reply` rows) — meaning it must independently know and hardcode the same five literal strings in a second place with no shared reference. The mitigation table's claim that "relabeling is a data update, not a migration" is true only for the schema; it says nothing about the Phase 3 code, prompts, or filters that will have baked in the old literals by then. Renaming or removing a category value after Phase 3 ships becomes a coordinated edit across the n8n Triage prompt schema and Phase 3's consumer logic, with nothing that fails loudly if only one side is updated.

**Fix:** None required now, but the artifact could name the n8n structured-output schema as the taxonomy's single source of truth and note that any consumer (explicitly including the Phase 3 it already anticipates) must read from it rather than re-declaring the list.

**Status:** upheld

### [WARN] party-visionary — This proposal claims to be "the introduction" of the single-LLM-choke-point rule, but builds the choke point in a shape that Phase 4's different LLM call cannot literally reuse

**Quotes:**
> **The single LLM choke point starts here.** `001-smart-email-assistant`'s one architectural rule ("all LLM calls route through a single n8n sub-workflow") has had nothing to enforce it until now... This change is that introduction: one **Gemini Triage** sub-workflow makes the only LLM call in the system today
> Draft reply generation — Phase 4

**Problem:** The proposal positions "Gemini Triage" as the concrete realization of the umbrella rule that all LLM calls route through a single sub-workflow — not as "a" choke point, but as the establishing instance of "the" choke point. But Gemini Triage is built end-to-end around one shape: Database-Webhook-on-INSERT trigger, fixed `{category, summary}` structured-output schema, and a single `UPDATE emails` write-back. Phase 4 (draft reply generation), which this proposal names as future work, is a different trigger, a different output shape (free-form draft text, not a closed enum + one-liner), and a different write target. When Phase 4 arrives, whoever builds it inherits an ambiguous mandate this proposal itself created: either contort draft generation into the "Gemini Triage" workflow to honor "single choke point" literally (semantically wrong — it isn't triage), or stand up a second LLM-calling sub-workflow and quietly abandon the very rule this change claims to be the enforcement of. The proposal doesn't distinguish "the one workflow that happens to be the only LLM caller today" from "the one workflow all LLM calls must always route through," and a contributor generalizing from this change's own words would reasonably assume the latter. (party-architect's round-1 NOTE on this same quote observes the placement fact — no mechanism, just one caller — as a non-blocking merge-time observation; it does not address the forward-looking risk that Phase 4's implementer, reading "the introduction" and "the only LLM call," will treat this as a mandate rather than a coincidence. That divergence is the finding, and it stands independent of whether the placement itself was correct at merge.)

**Fix:** None required now, but the artifact could clarify whether "single choke point" means one specific reusable sub-workflow (in which case Gemini Triage's I/O should be generalized before Phase 4 needs it) or one-LLM-caller-per-purpose (in which case the framing "the introduction" of the rule overstates what this change establishes).

**Status:** upheld

## Dissent

_Withdrawn findings. The severity token is prefixed WITHDRAWN so these do not count as live findings._

### [WITHDRAWN BLOCK] party-architect — Introduces a second workflow-invocation mechanism alongside the n8n-to-n8n path the proposal itself calls proven
**Quotes:** > **Trigger mechanism — a Supabase Database Webhook, not a change to Gmail Ingestion / Email Normaliser.**
**Quotes:** > Setup/debugging friction distinct from the n8n-to-n8n patterns `002-ingestion` already proved
**Quotes:** > Supabase Database Webhooks are a new mechanism, unverified in this project
**Problem:** The artifact names an existing, already-proven mechanism for one n8n workflow invoking another, and then adds a second, unverified inbound path for the same job. The stated justification only rules out one option — modifying Gmail Ingestion to make an outbound Gemini call — and never addresses the option that actually parallels the existing pattern: Email Normaliser, which already writes the row, invoking Gemini Triage as a sub-workflow the same way it is itself invoked. The result at merge is two independent ways work enters n8n, two delivery/retry semantics, two trust boundaries (the proposal's own Open Question on webhook auth confirms the second one is unresolved), and two runbook procedures for one system.
**Fix:** Either state in the artifact what the existing n8n-to-n8n invocation cannot do here, or invoke Gemini Triage from the workflow that writes the row and drop the Database Webhook from scope.
**Status:** withdrawn — my evidentiary claim is contradicted by the quoted line itself. The heading names *both* existing workflows ("not a change to Gmail Ingestion / Email Normaliser") and gives one rationale covering both — "touching them to add an outbound call risks regressing a working pipeline" that AC1–AC5 verified live. That is the artifact stating why the existing invocation path is not used, which is exactly the test probe 1 asks for; I asserted it was unaddressed and it is addressed. The residual structural costs I named survive elsewhere and are not lost by this withdrawal: the undefined delivery/retry contract is my own WARN below, and the second trust boundary is `party-security`'s BLOCK on webhook auth, which is theirs to press, not mine to re-file.
