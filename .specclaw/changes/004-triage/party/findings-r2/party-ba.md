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
