### [WARN] party-visionary — The status state-machine lives in two places (schema comment vs. dashboard UI) with nothing to keep them aligned when a status is added later
**Quotes:**
> Lets the user mark a task `done` or `dismissed` — the schema already reserves those values in `tasks.status` for "Phase 5 to write later" (`0003_action_items_schema.sql`).
> Lets the user mark a draft `discarded`, or `sent` after they've manually copied it into Gmail themselves — again, values the schema already reserves for this phase (`0004_draft_generation_schema.sql`).
> Action item sidebar reading `tasks` joined to `emails`; writes `tasks.status` (`open`→`done`/`dismissed`)

**Problem:** The valid values for `tasks.status`/`drafts.status` are declared in migration files (0003/0004), but the *transitions* a user can actually perform — which values are reachable from which, and via which UI control — are proposed to be encoded only in the dashboard's component logic. The next plausible change to this surface is adding a third outcome (e.g. `snoozed` for tasks, or `edited` for drafts): that change has to update the migration's reserved-value comment/constraint *and* the dashboard's transition logic, in two different subsystems (SQL migration vs. Next.js app), with nothing that fails if only one is touched. A migration can ship with a new status value that no UI path ever writes, or a UI button can appear for a transition the constraint doesn't allow, and both look fine until someone exercises that exact path.
**Status:** upheld

### [WARN] party-visionary — Shipping self-reported "sent" as in-scope, while the proposal itself flags it may need to be dropped, forecloses ever validating the project's own success metric against real data
**Quotes:**
> Marking a draft `sent` only reflects what the user says happened after they've pasted it elsewhere — the dashboard has no way to verify it. Is that acceptable for v1, or should `sent` be dropped in favor of just `pending`/`discarded` until there's a real signal?
> Draft review modal: triggers `POST /webhook/generate-draft` with the shared secret, displays the returned draft, writes `drafts.status` (`pending`→`sent`/`discarded`)
> at least half of routine replies start from a generated draft

**Problem:** The Scope section commits to writing `sent` as a real status now, while the Open Questions section admits it might not belong. If this ships as scoped, every `sent` row from here forward is a self-report with no distinguishing marker for "verified" vs. "claimed" — because the schema and the dashboard treat it as one flat value. The project's own headline success criterion ("at least half of routine replies start from a generated draft") can only ever be measured against this column. A future change that wants to validate that metric with a real signal (e.g. polling Gmail for a matching sent message) will find the historical `sent` rows indistinguishable from honestly-self-reported ones and will have to either discard all prior data as unverifiable or build a parallel verified-status column and reconcile two truths for the same field, forever. The tension between "ship it" (Scope) and "should we drop it?" (Open Questions) is resolved by omission, not decision.
**Status:** upheld

### [WARN] party-visionary — "Direct status-column write, no n8n round-trip" is stated as the dashboard's whole write model, and the next dashboard feature that needs a side effect will copy it into a case where it's wrong
**Quotes:**
> Per the architecture's stated boundary: the dashboard's only outbound write to n8n is the draft-generation POST. Everything else is either a read from Supabase or a narrow status-column write (`tasks.status`, `drafts.status`) directly against tables this container already owns display of.

**Problem:** This sentence doesn't say "for these two status columns" — it states the boundary as a general rule for the container: reads and narrow status writes go straight to Supabase, only draft-generation goes through n8n. A contributor extending the dashboard later (e.g. "re-run categorization on a task the user marked wrong," "notify me when a draft sits unreviewed for a day," "resend a draft for regeneration") will find this sentence as the documented precedent for how the dashboard writes state, and the natural generalization is "direct Postgres write is the pattern here." But those hypothetical actions have side effects that live in n8n, not in a status column — the precedent as stated doesn't distinguish "pure status toggle" (safe to write directly) from "action that should trigger a workflow" (needs the n8n round-trip this proposal reserves only for draft-generation). The rule as written generalizes past the two cases it was written for.
**Status:** upheld

### [NOTE] party-visionary — This is the first reader for tables that have had none since Phase 1–4, and every future feature that needs to expose `emails`/`tasks`/`drafts` data gets that reader for free instead of building its own
**Quotes:**
> `emails.category`/`summary`, `tasks`, and `drafts` all exist as tables today with no reader.

**Problem:** Nothing to fix — this is the compounding case. Before this change, any feature that wanted to show a human what the pipeline produced had to either query Supabase directly or build a one-off consumer. Once the Next.js/Supabase app and its read path exist, the next feature that needs to surface pipeline data (a new view, a report, a filter) is an incremental addition to an existing container rather than a new deployable, provided it follows the read path this change establishes. The proposal takes this leverage rather than stopping short of it — flagged here only because probe 5 requires the compounding case to be named when found, not only the tax.
**Status:** upheld
