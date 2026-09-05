### [WARN] party-ba — "Called out explicitly as a risk" is an unsourced claim used to justify making renewal first-class

**Quotes:** > Silent sync death after a week was called out explicitly as a risk to avoid.

**Problem:** This sentence is the entire justification for elevating "Subscription renewal as a first-class part of this phase, not a follow-up" rather than treating it as a fast-follow. But the proposal never says who called it out, where, or in what document. The only citation given anywhere (line 18: "Source document: `../001-smart-email-assistant/proposal.md`, Phase 1 row and Architecture §'Ingestion — n8n'") is a general pointer to the umbrella proposal, not a specific quote or section confirming this particular risk callout. As written, the claim is asserted, not evidenced — the reader cannot check whether "explicitly called out" means a documented risk register entry or the author's own recollection.

**Fix:** Quote or cite the specific line in the umbrella proposal that calls out this risk, or drop the appeal to prior authority and justify the scope decision on its own merits (silent, unattended sync failure is bad regardless of whether it was "called out" before).

**Status:** upheld

### [WARN] party-ba — Renewal acceptance criterion has no verification window, so it cannot fail at ship time

**Quotes:** > subscriptions renew automatically before expiry

**Problem:** Graph subscriptions expire in ~3 days and Gmail's `watch()` in ~7 days (both stated earlier in the Proposed Solution). A criterion of "renew automatically before expiry" can only be genuinely tested by observing at least one real renewal cycle complete successfully — which requires waiting out the 3-to-7-day window, not something achievable in the same sitting as the "manually sent test email... appears normalized within seconds" check listed immediately after it. The proposal bundles a criterion that takes days to honestly verify with criteria that take seconds, under one "Done when" umbrella, without saying how many renewal cycles (one? several, to rule out a fluke?) must be observed before the phase can be marked done. As stated, a reviewer could mark this "done" the moment the renewal workflow is *deployed*, without ever having watched it actually fire and succeed — which is exactly the silent-failure scenario the proposal's own risk table (line 63) warns about.

**Fix:** Specify the verification method and minimum observation window for this criterion separately from the same-day test-email criterion — e.g., "observed to fire and succeed at least once per provider, confirmed via updated subscription ID/expiry in the `accounts` table."

**Status:** upheld

### [NOTE] party-ba — "Reliably synced" is never defined, and two readings imply different scopes of proof

**Quotes:** > a reliably synced inbox has value on its own, before a single AI call is made.

**Problem:** "Reliable" is the load-bearing adjective that makes Phase 1 "independently useful," per the Problem section's own reasoning. But the "Done when" criteria that follow only demonstrate a single successful sync event per provider plus deployment of a renewal workflow — not sustained reliability over time. Read one way, "reliably synced" means "syncs correctly when tested once." Read the other way, it means "keeps syncing without operator intervention across renewal boundaries" — which is the harder, more expensive claim the Problem section is actually trading on to justify shipping this phase standalone. The proposal never states which reading its acceptance criteria are meant to satisfy.

**Fix:** State explicitly whether "reliable" in the Problem section is satisfied by the one-shot test-email criterion, or requires the multi-day renewal observation flagged in the finding above.

**Status:** upheld
