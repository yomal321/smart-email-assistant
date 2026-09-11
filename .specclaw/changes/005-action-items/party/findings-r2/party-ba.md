### [WARN] party-ba — "Forgotten" is the stated disease, but nothing in scope or acceptance criteria tests whether a human ever sees the extracted task
**Quotes:**
> the umbrella proposal's second stated pain — "commitments buried in email threads get forgotten because nothing extracts them into a task list" — is still completely unaddressed
> Any UI for viewing, completing, or dismissing tasks (`status` is written once at creation as `open`; nothing in this phase ever transitions it) — that's Phase 5's Action Item Sidebar.
> A test email containing a clear, concrete ask (e.g., "please send the Q3 report by Friday") produces a `tasks` row with a non-empty `task_text` and, if a date was stated, a parsed `deadline` — confirmed by reading the row back from Supabase, joined to its source `emails` row via `email_id`.
> A test email with no actionable content (e.g., a newsletter) produces **no** `tasks` row and **no** `action_extraction_error` — confirmed this is the common, successful "nothing to extract" path, not silently indistinguishable from a failure.
> A fixture-forced extraction failure (mirroring `004-triage`'s AC5 pattern) results in `emails.action_extraction_error` populated and still no `tasks` row.
> Replaying an already-processed email does not produce a duplicate `tasks` row — confirmed via the `ON CONFLICT (email_id) DO NOTHING` constraint holding under a second invocation.

**Problem:** The named pain is that commitments "get forgotten" — a memory/visibility failure experienced by a person. The proposal treats "nothing extracts them into a task list" as equivalent to that pain and claims this change addresses it ("is still completely unaddressed... This change creates it"). But the disease is forgetting, and the only mechanism that could stop forgetting — a human actually seeing the task — is explicitly deferred ("that's Phase 5's Action Item Sidebar"). If this proposal ships and works perfectly, a row lands silently in a table no one is shown; the email is still buried, the user still has to remember to check a database. None of the four "Done when" criteria verify anything a person would notice — all four are database-read assertions. The proposal is solving "nothing extracts commitments into structured data" (a proxy/precondition), not "commitments get forgotten" (the stated disease), and nothing in the acceptance criteria would fail if forgetting continued unabated after ship.
**Status:** upheld

### [NOTE] party-ba — "email threads" in the problem statement vs. per-email processing in the solution is an unexamined scope gap
**Quotes:**
> commitments buried in email threads get forgotten because nothing extracts them into a task list
> New n8n workflow **Action Extraction**: `{ email_id, subject, body }` in (same shape Triage Pipeline already takes), calls LLM Gateway requesting `{ has_task, task_text?, deadline? }`

**Problem:** The pain is framed at the level of "email threads" (multi-message conversations), but the extraction pipeline fires per individual email, with no thread-level context aggregation — a commitment made in message 1 and merely referenced or confirmed in message 2 would only ever be visible to an extractor that saw message 1 alone. The proposal never states whether "thread" in the problem statement was meant loosely (any single email) or literally (a conversation spanning multiple emails); the two readings produce different extraction scope. Given this project's established per-email processing convention from prior phases, the loose reading is plausible and low-risk, but it is never made explicit here.
**Status:** upheld

### [NOTE] party-ba — Distributional claims about email content are asserted without a cited source
**Quotes:**
> most emails have no action item at all — this is the common case, not an error
> decomposing one email into multiple discrete commitments is a materially harder extraction problem than this phase takes on — v1 targets the common case (an email carries zero or one actionable ask)

**Problem:** Both claims about how real email traffic is distributed ("most emails have no action item," "an email carries zero or one actionable ask") are stated as established fact with no source — no sample, no prior measurement, no citation to the umbrella proposal or any corpus. They function as supporting rationale rather than the sole justification for the single-task-per-email scope (the architecture's singular output contract is cited as the primary reason), so the risk of the scope decision resting on an unverified premise is low, but the claims themselves remain unsourced assertions rather than evidence.
**Status:** upheld
