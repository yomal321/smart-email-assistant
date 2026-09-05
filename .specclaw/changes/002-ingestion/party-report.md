# Party Report: 002-ingestion

**Reviewed:** 2026-09-05
**Tier:** deep (classifier) — Establishes persisted data shape (emails and accounts tables) that downstream phases depend on, handles OAuth credentials and tokens, and leaves unresolved whether token refresh lives in n8n only or is mirrored in the accounts table.
**Panel:** party-po(sonnet), party-architect(opus), party-ba(sonnet), party-security(opus), party-visionary(fable)
**Verdict:** CHANGES_REQUESTED

## Summary

25 findings: 5 BLOCK, 15 WARN, 5 NOTE upheld — 0 withdrawn

## Findings

### [BLOCK] party-architect — Two stores of the same credential/token fact, and the proposal names both
**Quotes:** > n8n's native Gmail node handles OAuth.
**Quotes:** > An `accounts` table holds provider credentials/tokens and per-account sync state (last successful sync, current subscription ID and expiry) so renewal and health checks have something to read.
**Quotes:** > **Where does OAuth token refresh live** — n8n's own credential store alone, or mirrored into the `accounts` table for cross-checking sync health? Affects the `accounts` schema decided in this phase.
**Problem:** The artifact names an existing credential mechanism (n8n's native node credential store, which performs the OAuth grant and holds the refresh token) and then introduces a second holder of the same fact in the `accounts` table, and its own open question concedes the duplication is unresolved. Two stores of a refreshing token diverge on the first refresh that one side performs and the other does not observe; a health check reading the stale copy reports a healthy account whose sync is dead, which is the exact failure this phase exists to prevent. This is not deferrable: the proposal itself states it "Affects the `accounts` schema decided in this phase," and the schema is what every later phase builds on.
**Fix:** Decide in the artifact that n8n's credential store is the single owner of credentials/tokens and that `accounts` holds only a non-authoritative reference plus sync state, or state what n8n's store cannot do that forces a second copy.
**Status:** upheld

### [BLOCK] party-architect — Push notification delivers a change pointer, not an email; the fetch step and its cursor are never named
**Quotes:** > Call `users.watch()` to register push notifications, delivered via a Google Cloud Pub/Sub topic that n8n subscribes to.
**Quotes:** > **Normalization.** Both providers' payloads map to one internal email shape before being written to Supabase
**Quotes:** > `accounts` table: provider, credentials reference, sync state, current subscription ID + expiry
**Problem:** The proposal's pipeline is stated as notification → normalize → write, and the enumerated `accounts` columns are exhaustive: provider, credentials reference, sync state, subscription ID, expiry. Both named notification mechanisms (`users.watch()`/Pub/Sub and a Graph webhook subscription) deliver a change notification, not the message body — a mandatory fetch step sits between delivery and normalization, and for Gmail that fetch is cursor-relative, requiring a per-account history marker to be persisted across notifications and updated transactionally with the write. Neither the fetch step nor the cursor column appears anywhere in Scope or in the `accounts` column list. This is a co-change to the schema and to the workflow topology that must land in the same commit; without the cursor, a missed or out-of-order notification loses mail permanently and the loss is silent. The "Done when" criterion compounds this by treating a fired delivery as equivalent to a normalized row.
**Fix:** Enumerate the fetch step as a distinct stage in the pipeline and add the per-account change cursor to the `accounts` column list in Scope, stating who advances it and when relative to the `emails` write.
**Status:** upheld

### [WARN] party-architect — Dedup is specified as a behaviour but never assigned to a layer, and the two candidate layers differ in correctness
**Quotes:** > Basic dedup on provider message ID (a webhook or renewal race must not create duplicate rows)
**Quotes:** > Dedup on provider message ID at write time
**Problem:** The artifact names the hazard as a race — concurrent webhook deliveries or a renewal re-registration overlapping a live subscription — but assigns dedup only to "write time," which is a moment, not a layer. One implementer reads this as a unique constraint on `(provider, provider_message_id)` plus an upsert, which closes the race in the database. Another reads it as a lookup-then-insert inside the n8n workflow, which does not close it and fails exactly under the concurrency the parenthetical names. Both readings satisfy the sentence as written, and the second produces the duplicate rows the mitigation table claims to have prevented.
**Fix:** State in Scope that the `emails` migration carries a unique constraint on the provider/provider-message-ID pair and that writes are upserts against it, so the guarantee lives in the schema rather than in workflow ordering.
**Status:** upheld

### [WARN] party-architect — The normalized `emails` contract is under-specified where the two provider adapters must agree
**Quotes:** > Normalized `emails` schema in Supabase (provider, provider message ID, thread/conversation ID, from/to/cc, subject, body, received timestamp, folder/label raw value)
**Quotes:** > the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one
**Problem:** This is the one contract two independently built adapters and every later phase all share, and three of its fields are left to the implementer. `from/to/cc` gives no cardinality or shape — a display string, a normalized address, or a JSON array of participant objects are all consistent with the line, and only the last survives a multi-recipient thread. `body` gives no form: the providers hand back different content types and encodings, and the artifact asks only that the stored form be indexable later without saying which form that is, so one adapter can store HTML and the other plain text and both claim compliance. `folder/label raw value` is singular, but one of the two named providers attaches a set of labels to a message while the other attaches a single folder — a scalar column cannot hold the set, so the first Gmail message with two labels forces either lossy truncation or the schema rework the risk table says the Gmail-first ordering exists to avoid.
**Fix:** Pin the column types in Scope: participant fields as a structured array, body with an explicit stored form (and, if both are kept, both columns named), and the folder/label field as a collection rather than a scalar.
**Status:** upheld

### [WARN] party-architect — The renewal mechanism, the highest-rated risk, has no test that terminates in bounded time
**Quotes:** > **Done when:** both inboxes sync new mail into the `emails` table via push notification (verified by watching a webhook/Pub/Sub delivery fire, not by polling for a row to appear), subscriptions renew automatically before expiry, and a manually sent test email to each account appears normalized in Supabase within seconds without any manual intervention.
**Quotes:** > A scheduled n8n workflow renews both subscriptions ahead of expiry and re-registers from scratch if a renewal call fails (e.g. after downtime longer than the expiry window).
**Problem:** Every verification path in the artifact is a live one: a manually sent email, a real third-party delivery, a wall-clock "within seconds," and a renewal observed "before expiry" — which for the shorter window means a three-day wait, and for the re-registration branch means manufacturing a multi-day outage. There is no stub seam anywhere in the design: normalization is described as an inline mapping between provider payload and row rather than as a unit with a recorded-payload input, so the one piece that is pure deterministic logic — and the piece the Gmail-first ordering is meant to validate — cannot be exercised without both providers live. A renewal path that can only be tested by waiting out its own expiry is a path that gets tested once by accident in production.
**Fix:** Name the normalization mapping as a separately invocable sub-workflow taking a provider payload as input, so it can be run against captured Gmail and Graph fixtures, and give the renewal workflow an expiry threshold it reads rather than computes, so a test can set the threshold instead of waiting for the clock.
**Status:** upheld

### [WARN] party-architect — Subscription registration embeds the host URL, so the "parallel" infrastructure track is a merge-time dependency
**Quotes:** > Oracle Cloud VM provisioning steps themselves are tracked as infrastructure setup, not app logic — n8n is assumed reachable once provisioned; provisioning can and should proceed in parallel with this change rather than blocking it
**Quotes:** > Outlook OAuth via n8n's native node; Microsoft Graph webhook subscription for new mail
**Problem:** Both in-scope registration calls take the destination endpoint as an argument — the Graph subscription is created against a notification URL, and the Pub/Sub push subscription against a push endpoint — so the registered subscription contains the host address as data, and the registration workflow cannot be executed, let alone verified, against a host that does not yet exist at a stable public address. Stating that provisioning "can and should proceed in parallel rather than blocking" understates this: it is not merely a prerequisite but a coupling, because any later change to the host address invalidates every already-registered subscription at both providers and requires re-registration through the same path the renewal workflow uses. The artifact's own "Done when" depends on a delivery arriving at that address.
**Fix:** State in Scope that a stable public endpoint address is an input to subscription registration, and that a change to it triggers the re-registration path — the same one the renewal workflow already needs for failed renewals.
**Status:** upheld

### [NOTE] party-architect — Three seats have now prescribed storage for the same per-account cursor fact; it must resolve to one column, not three
**Quotes:** > `accounts` table: provider, credentials reference, sync state, current subscription ID + expiry
**Quotes:** > **Normalization.** Both providers' payloads map to one internal email shape before being written to Supabase — same fields regardless of source, with a `provider` column and provider-native IDs preserved for dedup and future propagation logic (e.g. read/delete state, in a later phase)
**Problem:** My round-1 BLOCK asks for a per-account change cursor so a notification can be turned into a fetch; party-security's re-registration BLOCK asks for a stored `historyId` plus gap markers so an outage hole is auditable; party-visionary's second finding asks for a Gmail `historyId` / Graph delta token so later delete-propagation has a baseline. These are three descriptions of one fact — the per-account position in the provider's change stream — arrived at from three different lenses against the same exhaustive column list. Taken as three separate fixes by a planner, they yield three columns written by three workflows, which is the duplicate-source-of-truth failure my first probe exists to catch, reintroduced by the review itself. The cursor is also the field whose ownership is least obvious: the fetch step reads it, the write advances it, and the re-registration path resets it.
**Fix:** Add exactly one per-account cursor column to the `accounts` list in Scope, and state in the same sentence that the fetch step reads it, the `emails` write advances it, and re-registration resets it with the prior value recorded as the gap boundary — one column, three named writers, no second store.
**Status:** upheld

### [NOTE] party-architect — Rebuttal to party-po's polling descope: it dissolves the endpoint coupling but leaves the fetch, cursor, dedup and schema findings untouched
**Quotes:** > No mechanism to be notified of new mail — only polling, which is slow, rate-limit-hungry, and explicitly rejected by the umbrella proposal.
**Quotes:** > Scheduled renewal workflow for both subscription types, run ahead of their respective expiries, with re-registration on failed renewal
**Problem:** party-po's round-1 BLOCK argues a polling variant "would capture the same 'reliably synced inbox' value... without the renewal-workflow scope entirely." I take no position on whether the latency is worth buying — that is party-po's arrow — but the structural half of that claim needs correcting for the panel's benefit, because it understates what survives the descope. Polling removes the subscription lifecycle, and with it my endpoint-coupling finding and party-security's unauthenticated-notification finding, since a cron pull needs no inbound public address at all. It does not remove the fetch step, the per-account cursor (a poll is cursor-relative too, or it re-reads the whole mailbox every run), the dedup layer question, the `emails` column contract, or the credential/token ownership question — those four are properties of any ingestion topology, push or pull. So the panel should read my BLOCK on the missing fetch/cursor, my dedup WARN, my schema-contract WARN and my credential-ownership BLOCK as unconditional on how party-po's finding resolves, and my endpoint-coupling WARN as conditional on the push path being kept.
**Fix:** Whichever transport is chosen, the fetch stage and its per-account cursor must appear in Scope; only the endpoint-coupling finding is contingent on the outcome of party-po's BLOCK.
**Status:** upheld

### [WARN] party-ba — "Called out explicitly as a risk" is an unsourced claim used to justify making renewal first-class
**Quotes:** > Silent sync death after a week was called out explicitly as a risk to avoid.
**Problem:** This sentence is the entire justification for elevating "Subscription renewal as a first-class part of this phase, not a follow-up" rather than treating it as a fast-follow. But the proposal never says who called it out, where, or in what document. The only citation given anywhere (line 18: "Source document: `../001-smart-email-assistant/proposal.md`, Phase 1 row and Architecture §'Ingestion — n8n'") is a general pointer to the umbrella proposal, not a specific quote or section confirming this particular risk callout. As written, the claim is asserted, not evidenced — the reader cannot check whether "explicitly called out" means a documented risk register entry or the author's own recollection.
**Fix:** Quote or cite the specific line in the umbrella proposal that calls out this risk, or drop the appeal to prior authority and justify the scope decision on its own merits (silent, unattended sync failure is bad regardless of whether it was "called out" before).
**Status:** upheld

### [WARN] party-ba — Renewal acceptance criterion has no verification window, so it cannot fail at ship time
**Quotes:** > subscriptions renew automatically before expiry
**Problem:** Graph subscriptions expire in ~3 days and Gmail's `watch()` in ~7 days (both stated earlier in the Proposed Solution). A criterion of "renew automatically before expiry" can only be genuinely tested by observing at least one real renewal cycle complete successfully — which requires waiting out the 3-to-7-day window, not something achievable in the same sitting as the "manually sent test email... appears normalized within seconds" check listed immediately after it. The proposal bundles a criterion that takes days to honestly verify with criteria that take seconds, under one "Done when" umbrella, without saying how many renewal cycles (one? several, to rule out a fluke?) must be observed before the phase can be marked done. As stated, a reviewer could mark this "done" the moment the renewal workflow is *deployed*, without ever having watched it actually fire and succeed — which is exactly the silent-failure scenario the proposal's own risk table warns about.
**Fix:** Specify the verification method and minimum observation window for this criterion separately from the same-day test-email criterion — e.g., "observed to fire and succeed at least once per provider, confirmed via updated subscription ID/expiry in the `accounts` table."
**Status:** upheld

### [NOTE] party-ba — "Reliably synced" is never defined, and two readings imply different scopes of proof
**Quotes:** > a reliably synced inbox has value on its own, before a single AI call is made.
**Problem:** "Reliable" is the load-bearing adjective that makes Phase 1 "independently useful," per the Problem section's own reasoning. But the "Done when" criteria that follow only demonstrate a single successful sync event per provider plus deployment of a renewal workflow — not sustained reliability over time. Read one way, "reliably synced" means "syncs correctly when tested once." Read the other way, it means "keeps syncing without operator intervention across renewal boundaries" — which is the harder, more expensive claim the Problem section is actually trading on to justify shipping this phase standalone. The proposal never states which reading its acceptance criteria are meant to satisfy.
**Fix:** State explicitly whether "reliable" in the Problem section is satisfied by the one-shot test-email criterion, or requires the multi-day renewal observation flagged in the finding above.
**Status:** upheld

### [BLOCK] party-po — Push/webhook mechanism's cost is not compared to a cheaper polling variant within this proposal's own terms
**Quotes:**
> No mechanism to be notified of new mail — only polling, which is slow, rate-limit-hungry, and explicitly rejected by the umbrella proposal.
> Push-driven, read-only ingestion from both providers into a normalized Supabase table, orchestrated by n8n. No AI, no drafting, no frontend — this change proves the pipe, not the intelligence.
> Subscription renewal as a first-class part of this phase, not a follow-up. A scheduled n8n workflow renews both subscriptions ahead of expiry and re-registers from scratch if a renewal call fails (e.g. after downtime longer than the expiry window). Silent sync death after a week was called out explicitly as a risk to avoid.
**Problem:** The push path buys near-real-time (seconds) delivery at the cost of: a GCP Pub/Sub topic and subscription, a Microsoft Graph webhook subscription, a first-class scheduled renewal workflow with re-registration/failure-recovery logic, and an `accounts` table dedicated to tracking subscription IDs and expiry. This proposal itself states "no AI, no drafting... this change proves the pipe, not the intelligence" — nothing downstream in this phase consumes mail within seconds of arrival, so the latency the push mechanism buys has no consumer yet. Round-1 findings from other seats independently surface costs a polling variant would sidestep entirely: party-architect's finding that push delivers only a change pointer requiring a separately-tracked fetch cursor, and party-security's findings that the push endpoint needs unauthenticated-request defenses (clientState/OIDC verification) and that re-registration after an outage silently and irreversibly loses mail with no replay path. None of these three costs exist under a polling variant, which pulls on a timer and needs no public endpoint, no subscription lifecycle, and no outage-driven data loss. This is not new information I am introducing — it is the same cost gap the proposal itself never priced, now visible in sharper relief from what other seats found while auditing the mechanism this proposal chose instead of comparing it to the cheaper one.
**Fix:** Either state, in this proposal's own terms, why seconds-level latency matters before Phase 2 exists (e.g. a downstream consumer this phase doesn't mention), or descope to polling for Phase 1 and move push/webhook complexity to whichever later phase actually needs low-latency delivery.
**Status:** upheld

### [WARN] party-po — Renewal workflow's execution frequency, and thus its recurring cost, is never stated
**Quotes:** > Scheduled renewal workflow for both subscription types, run ahead of their respective expiries, with re-registration on failed renewal
**Problem:** "Run ahead of their respective expiries" names no cadence. Given the Graph subscription's ~3-day (max ~4230-minute) expiry sets the floor, the renewal job could run anywhere from once a day to once an hour depending on the safety margin chosen — a 10x range in n8n execution count with no number given for either bound.
**Fix:** State the renewal job's run interval (e.g. "every 6 hours") so the recurring execution cost is bounded and reviewable.
**Status:** upheld

### [WARN] party-po — Operator-attention cost for sync-health monitoring is unbounded because there is no alerting and no stated check cadence
**Quotes:**
> Minimal operational visibility: each account's last successful sync time and subscription status readable directly in Supabase (no dashboard UI — Supabase Studio's table editor is sufficient for this phase)
> Sync silently stops; nothing alerts the user
**Problem:** The mitigation for renewal failure is automatic re-registration, but the proposal's own risk table admits that if a subscription lapses "nothing alerts the user." Health is only visible if a human opens Supabase Studio and reads two fields, and no cadence for doing so is specified. This shifts an unstated, recurring human-attention cost onto whoever operates this system indefinitely, with no number attached and no alerting to bound how long a silent failure can persist before being noticed. Party-security's round-1 finding on this same quote (that a stale sync is indistinguishable from a quiet inbox) is a trust/failure-mode angle on the same underlying gap; my objection is the unpriced recurring attention cost of the manual-check habit this design requires forever, which stands independent of whether the signal is ambiguous.
**Fix:** State an expected manual-check cadence, or note that alerting is deliberately deferred and name the phase it belongs to.
**Status:** upheld

### [NOTE] party-po — Speculative schema flexibility for undesigned Phase 2 features is scope paid now for uncertain future payoff
**Quotes:** > Triage category set and full-text search are explicitly deferred, but the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one.
**Problem:** The category set and search requirements don't exist yet, so "leaving room" for them is a bet that a nullable column and a particular body storage form will match whatever Phase 2 eventually decides. If Phase 2's actual shape differs, the migration is paid anyway, and this phase paid an extra design/review cost for a guess with no confirmed payoff. Party-visionary's round-1 finding on the same quote observes this promise isn't even committed in Scope's column list, only in Open Questions — that is a different problem (a promise not backed by the artifact) from mine (the promise itself, even if kept, is an unpriced bet); the two are compatible, not in tension.
**Fix:** Either cut this and let Phase 2 add the column when the category set is real, or name this explicitly as a hedge and accept the cost of guessing wrong.
**Status:** upheld

### [BLOCK] party-security — Push notifications are accepted from the network with no stated authentication, so anyone who learns the endpoint can drive ingestion

**Quotes:**
> Call `users.watch()` to register push notifications, delivered via a Google Cloud Pub/Sub topic that n8n subscribes to.
> **Outlook connection.** n8n's native Microsoft Outlook node handles OAuth. Create a Microsoft Graph webhook subscription for new mail.
> Oracle Cloud VM provisioning steps themselves are tracked as infrastructure setup, not app logic — n8n is assumed reachable once provisioned

**Problem:** Both push paths terminate at a publicly reachable n8n endpoint, and the proposal names no check on what arrives there. A Graph notification is an unauthenticated HTTP POST unless `clientState` is set at subscription time and compared on every delivery; a Pub/Sub push is unauthenticated unless the OIDC token on the request is verified and the topic's publish IAM is restricted to `gmail-api-push@system.gserviceaccount.com`. As written, an untrusted POST body crosses directly into a trusted position: it decides which account is synced, which message IDs are fetched, and what gets written to `emails`. "n8n is assumed reachable once provisioned" places the only thing standing between the internet and the ingestion trigger outside the change's scope, so no seat owns it. Round 1 strengthened this rather than weakening it: `party-architect`'s "Subscription registration embeds the host URL" finding independently establishes that the notification URL is registered data at both providers, i.e. that a stable, internet-reachable address is an in-scope input to this change — which is precisely the surface this finding says is left unguarded. No seat argued that any authentication check exists.

**Fix:** Make three checks in-scope acceptance criteria: (1) set `clientState` on the Graph subscription, store it in `accounts`, and drop any notification whose `clientState` does not match; (2) verify the Pub/Sub push OIDC JWT (audience + `gmail-api-push` issuer) and lock topic publish IAM to Google's push service account only; (3) require the webhook to be HTTPS-only. A notification failing any check is discarded and counted, never processed.

**Status:** upheld

### [BLOCK] party-security — "Re-register from scratch" silently discards every message that arrived during the outage, with no reconciliation path in scope

**Quotes:**
> A scheduled n8n workflow renews both subscriptions ahead of expiry and re-registers from scratch if a renewal call fails (e.g. after downtime longer than the expiry window).
> Scheduled renewal workflow runs well ahead of the shorter (Graph) window; re-registers from scratch on failure rather than assuming renewal always succeeds
> Historical backfill beyond a small validation window — this phase proves live push sync; a backfill policy is a separate decision (also an open question upstream)

**Problem:** Push notifications are not replayable. Once a `watch()` or Graph subscription has lapsed, re-registering only starts the stream from *now* — a fresh Gmail `watch()` returns a new `historyId` and the prior one may already be expired, and a new Graph subscription carries no history at all. So the stated recovery for the stated failure produces a green, healthy-looking system with a silent, permanent hole in `emails` exactly as wide as the outage. Because backfill is explicitly out of scope, the artifact contains no mechanism that could ever close that hole; the loss is irreversible with no operator recovery path. This is the fail-open case that looks identical to success: after re-registration, `last successful sync` is fresh and the subscription is valid. Two seats converged on the missing piece from other lenses — `party-architect` ("the fetch step and its cursor are never named", "without the cursor, a missed or out-of-order notification loses mail permanently and the loss is silent") and `party-visionary` (`accounts` has "no slot for such a cursor"). Their agreement that no cursor column exists is the precondition that makes the catch-up fetch in this fix unimplementable as scoped.

**Fix:** On any re-registration (as opposed to a clean renewal), run a bounded catch-up fetch — Gmail `history.list` from the stored `historyId`, falling back to `messages.list` with `after:<last_successful_sync>`; Graph `messages` filtered on `receivedDateTime gt <last_successful_sync>` — before resuming push. Record a `resync_gap_start`/`resync_gap_end` on the `accounts` row for every re-registration so the hole is visible and auditable even if the catch-up itself fails. Treat "re-registered from scratch without catch-up" as a failed run, not a recovered one.

**Status:** upheld

### [WARN] party-security — Sync death is observable only by a human deciding to open Supabase Studio, and stale sync state is indistinguishable from a quiet inbox

**Quotes:**
> Minimal operational visibility: each account's last successful sync time and subscription status readable directly in Supabase (no dashboard UI — Supabase Studio's table editor is sufficient for this phase)
> Sync silently stops; nothing alerts the user

**Problem:** The risk table names "nothing alerts the user" as the impact, and the mitigation column answers with a renewal job — a mechanism whose own failure is equally silent. The only visibility offered is pull-based and manual. Worse, the chosen signal is ambiguous: a `last successful sync` from 40 hours ago is what a dead subscription looks like *and* what a weekend with no mail looks like, so even an operator who checks cannot distinguish degraded from healthy. A degraded run that leaves no distinguishable artifact will be trusted. `party-po` reached the same line from a cost lens (unbounded operator attention, no stated check cadence); the two findings are not duplicates and the fixes differ — theirs asks for a stated cadence or an explicit deferral, mine asks for a signal that is unambiguous whether or not anyone looks. A stated cadence does not repair an ambiguous signal.

**Fix:** Have the renewal workflow write an outcome row per run per account (`renewed` / `re-registered` / `failed`) with a timestamp, so absence of a recent success row is itself the signal rather than an inference from mail volume. Add `subscription_expires_at` to `accounts` and treat `now() > expires_at` or a failed renewal as an alerting condition on a channel that pushes (n8n error workflow to email/Telegram/webhook) rather than one that waits to be read.

**Status:** upheld

### [WARN] party-security — The `accounts` table is described both as holding tokens and as holding a reference, and the token-at-rest case has no stated protection or revocation path

**Quotes:**
> An `accounts` table holds provider credentials/tokens and per-account sync state (last successful sync, current subscription ID and expiry) so renewal and health checks have something to read.
> `accounts` table: provider, credentials reference, sync state, current subscription ID + expiry
> **Where does OAuth token refresh live** — n8n's own credential store alone, or mirrored into the `accounts` table for cross-checking sync health?

**Problem:** Line 28 says the table holds credentials/tokens; line 40 says it holds a credentials reference; the open question confirms the decision is unmade. Under the first reading, long-lived OAuth refresh tokens granting standing access to two personal mailboxes sit in an ordinary application table with no stated encryption, no stated RLS, and no stated restriction on which n8n workflows can read that column — while the same table is the one an operator is told to browse in Supabase Studio. A leaked refresh token is not undoable by deleting the row; it is undoable only by revoking the grant at Google/Microsoft, which the proposal never mentions. `party-architect` filed the same ambiguity as a BLOCK from a correctness lens (two stores of one refreshing fact diverge, and a health check reads the stale copy). Their fix — n8n's store is sole owner, `accounts` holds a non-authoritative reference — resolves my exposure too, which is the strongest available argument for taking that branch. The residual that remains mine either way: the scope pinning and the revocation runbook, neither of which their fix supplies.

**Fix:** Resolve the open question toward "reference only": `accounts` stores an opaque n8n credential ID plus sync state, never token material. If any token is mirrored, require it encrypted at rest (pgsodium/Vault) with RLS denying the anon and authenticated roles, and readable only by the service role the renewal workflow uses. State the revocation runbook (revoke at the provider console, then rotate the n8n credential) as the recovery path. Separately, pin the requested scopes to read-only (`gmail.readonly`, `Mail.Read`) in this phase — the modify scopes that "future propagation logic (e.g. read/delete state)" would need are explicitly a later change and must not be requested now.

**Status:** upheld

### [WARN] party-security — Dedup keyed on provider message ID alone is a check-then-write race and a cross-account overwrite primitive

**Quotes:**
> Basic dedup on provider message ID (a webhook or renewal race must not create duplicate rows)
> Dedup on provider message ID at write time

**Problem:** "At write time" describes intent, not enforcement. If dedup is a read-then-insert inside a workflow, two concurrent deliveries — precisely the "webhook or renewal race" named — both read empty and both insert; the guard fails open under exactly the condition it was written for. `party-architect` independently showed both readings satisfy the sentence as written and that only the database-constraint reading closes the race, which settles the ambiguity half of this finding in its favour. The half that remains only mine is the key: keying on the provider message ID alone, without the account, means a colliding or attacker-chosen ID upserts over an existing row, destroying stored email content with no version history and no recovery path. That destructive branch survives even if `party-po`'s descope-to-polling BLOCK is accepted and the network entry point disappears, because Gmail message IDs are mailbox-scoped and this design holds two accounts in one table.

**Fix:** Enforce dedup as a database `UNIQUE (account_id, provider, provider_message_id)` constraint and write via `INSERT ... ON CONFLICT DO NOTHING`, so the race is resolved by Postgres rather than by workflow timing. Do not use `DO UPDATE` on the body/subject columns in this phase: a second delivery for a known ID should be a no-op, never an overwrite.

**Status:** upheld

### [NOTE] party-security — Normalized bodies are stored with no provenance marker, and Phase 2 is already designed to feed them to a model

**Quotes:**
> Both providers' payloads map to one internal email shape before being written to Supabase — same fields regardless of source, with a `provider` column and provider-native IDs preserved
> the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one

**Problem:** Every field in this table is attacker-authored: anyone who can send mail to either address controls `subject`, `body`, and display names verbatim. This phase runs no model, so there is no exposure as written — hence NOTE, not BLOCK — but the schema is being deliberately shaped now so Phase 2 can consume it without migration, and Phase 2's triage/extraction/drafting will place this text into prompts. Text that arrives with no marking of its untrusted origin gets treated as ordinary context by whatever reads it next, and a schema decision made here is the cheapest place to prevent that. Round 1 raised the stakes on the same line from two directions: `party-visionary` argues the forward-compatibility promise is not committed in Scope at all, and `party-po` argues it should perhaps be cut. Either resolution is compatible with this finding — if the category column ships, it must be model-written only; if it does not ship, Phase 2 inherits the constraint instead of the column.

**Fix:** While the schema is still being written, keep the raw body in a column that is unambiguously untrusted-by-name and never merge sender-controlled text into any column that later carries system-derived values (keep `category` model-written only, never populated from a header the sender controls). Store the raw provider payload separately from normalized fields so a later phase can diff what was rendered against what arrived. Record this as a constraint Phase 2 inherits rather than re-derives.

**Status:** upheld

### [WARN] party-visionary — The "normalized" schema still stores folder/label as a provider-native raw value, so the next feature to route or filter by folder must re-learn the Gmail/Outlook split the schema was built to hide
**Quotes:** > No common schema — Gmail and Outlook model threads, folders/labels, and participants differently, and nothing downstream (triage, extraction, drafting, frontend) can be built against two incompatible shapes.
> Normalized `emails` schema in Supabase (provider, provider message ID, thread/conversation ID, from/to/cc, subject, body, received timestamp, folder/label raw value)
**Problem:** Every other field in the schema is normalized to "same fields regardless of source," but folder/label is explicitly kept as a provider's raw value — Gmail's multi-label model and Outlook's single-folder hierarchy are not reconciled, just passed through. The first future change that needs folder-aware logic (e.g. "only triage Inbox mail," "skip Sent/Archive") is the one this proposal's own problem statement said shouldn't have to know two shapes exist. That change will have to write a Gmail-label interpreter and an Outlook-folder interpreter against the same column, in whatever file implements triage — the exact two-shapes problem this schema claims to have solved, deferred one column deep.
**Status:** upheld

### [WARN] party-visionary — Provider message IDs are promised as sufficient for future delete/archive propagation, but that propagation typically needs an incremental sync cursor this schema never stores
**Quotes:** > **Normalization.** ... with a `provider` column and provider-native IDs preserved for dedup and future propagation logic (e.g. read/delete state, in a later phase)
> Propagating remote deletes/archives from Gmail/Outlook into the local `emails` row (an open question in the umbrella proposal; out of scope here, revisit once a `tasks` table depending on `emails` rows exists)
**Problem:** The artifact tells the next-phase author that provider-native IDs are already "preserved for" delete/archive propagation — implying no rework is needed to enable it. But detecting a remote delete/archive without polling every message normally requires a per-account incremental cursor (Gmail `historyId`, Graph delta token), not a per-message ID; per-message IDs tell you a message exists, not that one has disappeared. Neither the `emails` nor `accounts` schema ("last successful sync, current subscription ID and expiry") has a slot for such a cursor. The phase that implements deletion propagation will discover the groundwork it was told existed doesn't cover the actual mechanism, and by then may need a fresh baseline sync to start capturing cursors it should have been recording since day one. (I note party-architect's round-1 finding independently arrives at the same missing cursor from the correctness angle — a missed notification loses mail now; mine is that the artifact also misrepresents this gap as already-closed groundwork for a named future phase.)
**Status:** upheld

### [WARN] party-visionary — Renewal cadence is pinned to today's provider expiry constants rather than to the expiry value the schema already stores, so a provider policy change drifts silently
**Quotes:** > Graph subscriptions expire after ~3 days (max ~4230 minutes) and must be renewed before then — the shorter of the two renewal windows, so it sets the floor for how often the renewal job runs.
> An `accounts` table holds provider credentials/tokens and per-account sync state (last successful sync, current subscription ID and expiry) so renewal and health checks have something to read.
**Problem:** The `accounts` table is designed to hold each subscription's actual expiry, but the renewal job's schedule is described as derived from a hardcoded assumption about Graph's window ("~3 days... sets the floor"), not from reading that stored expiry per account. If Microsoft (or Google) later changes the real subscription duration — something both providers have done before — the two facts drift: the true expiry sitting in `accounts.expiry` and the renewal job's cron interval baked in against today's constant. Nothing in the artifact ties the second to the first, and the failure mode is the same silent-death risk the proposal explicitly built this workflow to avoid, just entered through a side door the mitigation table doesn't cover.
**Status:** upheld

### [WARN] party-visionary — The forward-compatible columns this proposal promises to avoid a Phase 2 migration are stated only as intent in Open Questions, not committed in Scope's schema list
**Quotes:** > Triage category set and full-text search are explicitly deferred, but the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one.
> Normalized `emails` schema in Supabase (provider, provider message ID, thread/conversation ID, from/to/cc, subject, body, received timestamp, folder/label raw value)
**Problem:** Scope's actual column list — the part of the artifact that becomes the migration in `/specclaw:plan` — has no category column and no statement about the body's storage form. The forward-compatibility promise lives only in Open Questions, which this proposal itself treats as non-blocking ("this can be decided without blocking the build" is said of the neighboring backfill question). If planning takes Scope's column list as authoritative and treats the Open Questions line as aspirational prose, Phase 2 lands exactly the migration this proposal was written to prevent — and no artifact reader can tell from Scope alone that the promise was ever made.
**Fix:** Move the category column and the body storage-form decision from Open Questions into Scope's column list as committed schema, or drop the forward-compatibility claim.
**Status:** upheld

## Dissent

No withdrawals.
