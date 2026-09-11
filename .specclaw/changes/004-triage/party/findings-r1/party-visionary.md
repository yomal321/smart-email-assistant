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

**Problem:** The proposal positions "Gemini Triage" as the concrete realization of the umbrella rule that all LLM calls route through a single sub-workflow — not as "a" choke point, but as the establishing instance of "the" choke point. But Gemini Triage is built end-to-end around one shape: Database-Webhook-on-INSERT trigger, fixed `{category, summary}` structured-output schema, and a single `UPDATE emails` write-back. Phase 4 (draft reply generation), which this proposal names as future work, is a different trigger, a different output shape (free-form draft text, not a closed enum + one-liner), and a different write target. When Phase 4 arrives, whoever builds it inherits an ambiguous mandate this proposal itself created: either contort draft generation into the "Gemini Triage" workflow to honor "single choke point" literally (semantically wrong — it isn't triage), or stand up a second LLM-calling sub-workflow and quietly abandon the very rule this change claims to be the enforcement of. The proposal doesn't distinguish "the one workflow that happens to be the only LLM caller today" from "the one workflow all LLM calls must always route through," and a contributor generalizing from this change's own words would reasonably assume the latter.

**Fix:** None required now, but the artifact could clarify whether "single choke point" means one specific reusable sub-workflow (in which case Gemini Triage's I/O should be generalized before Phase 4 needs it) or one-LLM-caller-per-purpose (in which case the framing "the introduction" of the rule overstates what this change establishes).

**Status:** upheld
