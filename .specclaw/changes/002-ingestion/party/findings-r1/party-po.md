### [BLOCK] party-po — Push/webhook mechanism's cost is not compared to a cheaper polling variant within this proposal's own terms
**Quotes:**
> No mechanism to be notified of new mail — only polling, which is slow, rate-limit-hungry, and explicitly rejected by the umbrella proposal.
> Push-driven, read-only ingestion from both providers into a normalized Supabase table, orchestrated by n8n. No AI, no drafting, no frontend — this change proves the pipe, not the intelligence.
> Subscription renewal as a first-class part of this phase, not a follow-up. A scheduled n8n workflow renews both subscriptions ahead of expiry and re-registers from scratch if a renewal call fails (e.g. after downtime longer than the expiry window). Silent sync death after a week was called out explicitly as a risk to avoid.
**Problem:** The push path buys near-real-time (seconds) delivery at the cost of: a GCP Pub/Sub topic and subscription, a Microsoft Graph webhook subscription, a first-class scheduled renewal workflow with re-registration/failure-recovery logic, and an `accounts` table dedicated to tracking subscription IDs and expiry. This proposal itself states "no AI, no drafting... this change proves the pipe, not the intelligence" — nothing downstream in this phase consumes mail within seconds of arrival, so the latency the push mechanism buys has no consumer yet. A polling variant (e.g. a cron pull every 1–5 minutes) would capture the same "reliably synced inbox" value this phase claims to deliver, without Pub/Sub setup, without webhook subscription lifecycle management, and without the renewal-workflow scope entirely. The rejection of polling is imported wholesale from the umbrella proposal ("explicitly rejected by the umbrella proposal") rather than re-priced against this phase's actual needs, where the latency payoff doesn't yet apply.
**Fix:** Either state, in this proposal's own terms, why seconds-level latency matters before Phase 2 exists (e.g. a downstream consumer this phase doesn't mention), or descope to polling for Phase 1 and move push/webhook complexity to whichever later phase actually needs low-latency delivery.
**Status:** upheld

### [WARN] party-po — Renewal workflow's execution frequency, and thus its recurring cost, is never stated
**Quotes:**
> Scheduled renewal workflow for both subscription types, run ahead of their respective expiries, with re-registration on failed renewal
**Problem:** "Run ahead of their respective expiries" names no cadence. Given the Graph subscription's ~3-day (max ~4230-minute) expiry sets the floor, the renewal job could run anywhere from once a day to once an hour depending on the safety margin chosen — a 10x range in n8n execution count with no number given for either bound.
**Fix:** State the renewal job's run interval (e.g. "every 6 hours") so the recurring execution cost is bounded and reviewable.
**Status:** upheld

### [WARN] party-po — Operator-attention cost for sync-health monitoring is unbounded because there is no alerting and no stated check cadence
**Quotes:**
> Minimal operational visibility: each account's last successful sync time and subscription status readable directly in Supabase (no dashboard UI — Supabase Studio's table editor is sufficient for this phase)
> Sync silently stops; nothing alerts the user
**Problem:** The mitigation for renewal failure is automatic re-registration, but the proposal's own risk table admits that if a subscription lapses "nothing alerts the user." Health is only visible if a human opens Supabase Studio and reads two fields, and no cadence for doing so is specified. This shifts an unstated, recurring human-attention cost onto whoever operates this system indefinitely, with no number attached and no alerting to bound how long a silent failure can persist before being noticed.
**Fix:** State an expected manual-check cadence, or note that alerting is deliberately deferred and name the phase it belongs to.
**Status:** upheld

### [NOTE] party-po — Speculative schema flexibility for undesigned Phase 2 features is scope paid now for uncertain future payoff
**Quotes:**
> Triage category set and full-text search are explicitly deferred, but the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one.
**Problem:** The category set and search requirements don't exist yet, so "leaving room" for them is a bet that a nullable column and a particular body storage form will match whatever Phase 2 eventually decides. If Phase 2's actual shape differs, the migration is paid anyway, and this phase paid an extra design/review cost for a guess with no confirmed payoff.
**Fix:** Either cut this and let Phase 2 add the column when the category set is real, or name this explicitly as a hedge and accept the cost of guessing wrong.
**Status:** upheld
