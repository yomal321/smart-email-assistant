### [BLOCK] party-ba — Sole evidence for the problem is an unsourced quote from a document not in scope of this artifact
**Quotes:** > The umbrella proposal's third stated pain is still untouched: "writing routine replies takes disproportionate time relative to their value."
**Problem:** This sentence is the entire justification for building a new table, a new externally-reachable authenticated endpoint, and a new n8n workflow. It is presented as an already-established fact by quoting an external document, but nothing in `proposal.md` itself supplies a frequency, a time estimate, an example email, or any other corroborating data for the claim that reply-writing consumes disproportionate time. No count of "routine replies per week," no estimate of minutes spent, no cited user complaint — just a borrowed sentence. A reader of this document alone cannot verify the pain is real; they can only verify that a different, unseen document asserts it.
**Fix:** Either restate the specific, checkable observation behind the pain (e.g., "N of the last M triaged emails were replied to with boilerplate text taking X minutes each") or scope the proposal's claim down to "this document assumes, per the umbrella proposal, that this pain exists" rather than treating it as settled.
**Status:** upheld

### [WARN] party-ba — Acceptance criteria verify plumbing, not the stated problem
**Quotes:** > **Done when:**
> - A manual authenticated request for a real email produces a new `drafts` row with a non-empty `draft_body`, `status: 'pending'`, correctly linked via `email_id` — and the webhook's synchronous response contains that same draft body.
> - A request with a missing or wrong shared secret is dropped before the LLM call — confirmed no `drafts` row is written and no LLM Gateway call is made for that request.
> - Two successive requests for the same `email_id` produce two separate `drafts` rows (proving regeneration doesn't overwrite/lose the prior attempt).
> - A schema review confirms `drafts.email_id` is a non-nullable FK to `emails.id` with no uniqueness constraint, `draft_body` is non-nullable, and `status` carries the `open`-style provisional `CHECK` constraint.
**Problem:** All four criteria test authentication, row persistence, and schema shape. None of them touch the actual named problem ("writing routine replies takes disproportionate time"). Since this proposal explicitly defers the only human-facing consumer to Phase 5 ("A real caller doesn't exist yet"), there is no criterion in this document, at ship time, that could fail if the drafting pipeline did nothing to reduce anyone's time spent writing replies — the main claim of the proposal is structurally unverifiable within its own acceptance criteria.
**Fix:** Either add a criterion that ties back to the stated pain even indirectly (e.g., a human read-through confirming the draft is usable as a starting point), or explicitly scope the "Done when" section as validating infrastructure only, with the problem-level claim marked unverified until Phase 5.
**Status:** upheld

### [WARN] party-ba — "Routine" is the load-bearing term naming the problem but is undefined and ungated in the build
**Quotes:** > writing routine replies takes disproportionate time relative to their value.
> On a verified request (`email_id`): read the source email and its thread ... Build a prompt from both, call the existing **LLM Gateway** unmodified
**Problem:** The named pain is specifically about *routine* replies, implying some emails warrant drafting help and others don't. But the "In Scope" and workflow description show the Draft Generation pipeline firing for any `email_id` a caller supplies, with no reference to the category or summary already computed by Phase 2/3 triage to determine whether a given email is in fact "routine." Under one reading, "routine" is just flavor text describing the general backlog and any email is a valid candidate (what's built). Under another reading, "routine" is a filtering criterion the system should apply (using existing triage output) before generating a draft — a materially different build (gated vs. ungated invocation). The proposal never resolves which reading is intended.
**Fix:** State explicitly whether draft generation is meant to apply uniformly to any requested email or whether it should be restricted to emails already categorized as routine by Phase 2/3, and if the latter, add that gating to scope.
**Status:** upheld

### [NOTE] party-ba — Multiple-draft-per-email design rests on an assumed, unestablished user behavior
**Quotes:** > A column on `emails` assumes one draft per email; a person iterating on a reply ("regenerate this, it's too formal") needs more than one attempt without destroying the last one.
**Problem:** The schema decision (no uniqueness constraint on `email_id`, a full row per generation) is justified by a hypothesized behavior — that the single user of this project will frequently regenerate drafts because early attempts are unsatisfactory — but the proposal cites no observed instance of this happening (there's no prior drafting feature to observe it from, since this is Phase 4). This is a plausible assumption for a single-user personal tool, and the cost of being wrong is low, but it is asserted as a settled requirement rather than a guess.
**Fix:** Frame it explicitly as an assumption to revisit rather than an established need, or note it as an open question alongside the other open questions already in the document.
**Status:** upheld
