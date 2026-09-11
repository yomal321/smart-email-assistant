### [WARN] party-po — Do-nothing cost is asserted, never priced
**Quotes:**
> the umbrella proposal's second stated pain — "commitments buried in email threads get forgotten because nothing extracts them into a task list" — is still completely unaddressed.

**Problem:** This is the entire justification for a new table, a new migration, a new n8n workflow, an additive branch, and a runbook. Nowhere in the document is there a number for how often this happens — how many commitments per week are actually lost, or what it costs when one is. Without that, there's no way to check the proposed spend (four new artifacts, a second LLM call per inserted email) against the value it recovers. "Still completely unaddressed" describes an absence, not a rate.
**Fix:** State even a rough frequency or a proxy (e.g., "X% of emails in the pilot corpus contained an explicit ask") so the scope can be checked against the problem size.
**Status:** upheld

### [WARN] party-po — Second LLM call per inserted email; the added running cost is never stated
**Quotes:**
> Action Extraction calls the same generic `{ system_prompt, user_content, response_schema }` sub-workflow Triage Pipeline already calls
> Both fire in parallel off the same guard, matching the diagram's `norm --> triage` / `norm --> action` fan-out

**Problem:** Before this change, `004-triage` made one Gemini call per new email. This proposal adds a second, parallel Gemini call for every new email, unconditionally. That's a doubling of LLM Gateway invocations (and associated tokens, wall-clock, and API spend) at the same trigger rate as ingestion. The proposal states this cost qualitatively ("reused unmodified") but never gives a number — no per-email token estimate, no expected monthly call volume, nothing that lets a reader judge whether doubling the LLM bill is worth the task-extraction value.
**Fix:** State the expected added Gemini calls/tokens per email and per month at current ingestion volume.
**Status:** upheld

### [WARN] party-po — Every email pays for an extraction call even though most will return nothing, and no cheaper-gated variant is considered
**Quotes:**
> Per `architect/03a-component-automation-engine.md`'s pipeline table (`{ task_text, deadline? }` or none), most emails have no action item at all — this is the common case, not an error.
> Both fire in parallel off the same guard

**Problem:** The proposal itself states most emails have no action item, yet Action Extraction is fired on every inserted email with no cheaper pre-filter — e.g., skipping the call for categories a prior triage pass already marked as unlikely to contain an ask (newsletters, promotions, notifications). A cheaper variant — call Action Extraction only for categories where "has_task" is plausible — would cut LLM spend roughly in proportion to how skewed the category distribution is toward non-actionable mail, capturing most of the value (real commitments still get caught) at a fraction of the running cost. The proposal never names or rejects this option; it only explains why the *call itself* fires in parallel for architectural reasons, not why volume-gating wasn't considered.
**Fix:** Either state why volume-gating was rejected (e.g., latency/complexity trade already judged not worth it) or adopt a cheap pre-filter before the paid call.
**Status:** upheld

### [NOTE] party-po — Schema commits to two status values with no consumer in this phase or the next
**Quotes:**
> `status` (text, `CHECK` constraint limited to `open` / `done` / `dismissed`, default `open`)
> `status` is written once at creation as `open`; nothing in this phase ever transitions it
> `status` value set** — `open` / `done` / `dismissed` is a provisional guess (nothing in this phase sets anything but `open`); worth a second look once Phase 5's sidebar actually needs to transition it

**Problem:** The proposal's own Open Questions section flags `done`/`dismissed` as a provisional guess with no consumer until Phase 5. The smallest schema that captures this phase's value is a `status` column that only ever needs to hold `open` — the two extra CHECK values are paid for now (locked into a migration, reviewed, shipped) for a phase that doesn't exist yet and may want a different set. This is a cut line the proposal names as uncertain but doesn't act on by deferring it.
**Fix:** Ship `status` with just the value(s) this phase writes, or explicitly note that widening a CHECK constraint later is a cheap follow-up migration so paying for it now is a deliberate, not incidental, choice.
**Status:** upheld
