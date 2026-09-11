### [BLOCK] party-architect — Introduces a second workflow-invocation mechanism alongside the n8n-to-n8n path the proposal itself calls proven
**Quotes:** > **Trigger mechanism — a Supabase Database Webhook, not a change to Gmail Ingestion / Email Normaliser.**
**Quotes:** > Setup/debugging friction distinct from the n8n-to-n8n patterns `002-ingestion` already proved
**Quotes:** > Supabase Database Webhooks are a new mechanism, unverified in this project
**Problem:** The artifact names an existing, already-proven mechanism for one n8n workflow invoking another, and then adds a second, unverified inbound path for the same job. The stated justification only rules out one option — modifying Gmail Ingestion to make an outbound Gemini call — and never addresses the option that actually parallels the existing pattern: Email Normaliser, which already writes the row, invoking Gemini Triage as a sub-workflow the same way it is itself invoked. The result at merge is two independent ways work enters n8n, two delivery/retry semantics, two trust boundaries (the proposal's own Open Question on webhook auth confirms the second one is unresolved), and two runbook procedures for one system.
**Fix:** Either state in the artifact what the existing n8n-to-n8n invocation cannot do here, or invoke Gemini Triage from the workflow that writes the row and drop the Database Webhook from scope.
**Status:** upheld

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
