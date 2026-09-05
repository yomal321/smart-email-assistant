### [BLOCK] party-security — Push notifications are accepted from the network with no stated authentication, so anyone who learns the endpoint can drive ingestion

**Quotes:**
> Call `users.watch()` to register push notifications, delivered via a Google Cloud Pub/Sub topic that n8n subscribes to.
> **Outlook connection.** n8n's native Microsoft Outlook node handles OAuth. Create a Microsoft Graph webhook subscription for new mail.
> Oracle Cloud VM provisioning steps themselves are tracked as infrastructure setup, not app logic — n8n is assumed reachable once provisioned

**Problem:** Both push paths terminate at a publicly reachable n8n endpoint, and the proposal names no check on what arrives there. A Graph notification is an unauthenticated HTTP POST unless `clientState` is set at subscription time and compared on every delivery; a Pub/Sub push is unauthenticated unless the OIDC token on the request is verified and the topic's publish IAM is restricted to `gmail-api-push@system.gserviceaccount.com`. As written, an untrusted POST body crosses directly into a trusted position: it decides which account is synced, which message IDs are fetched, and what gets written to `emails`. "n8n is assumed reachable once provisioned" places the only thing standing between the internet and the ingestion trigger outside the change's scope, so no seat owns it.

**Fix:** Make three checks in-scope acceptance criteria: (1) set `clientState` on the Graph subscription, store it in `accounts`, and drop any notification whose `clientState` does not match; (2) verify the Pub/Sub push OIDC JWT (audience + `gmail-api-push` issuer) and lock topic publish IAM to Google's push service account only; (3) require the webhook to be HTTPS-only. A notification failing any check is discarded and counted, never processed.

**Status:** upheld

### [BLOCK] party-security — "Re-register from scratch" silently discards every message that arrived during the outage, with no reconciliation path in scope

**Quotes:**
> A scheduled n8n workflow renews both subscriptions ahead of expiry and re-registers from scratch if a renewal call fails (e.g. after downtime longer than the expiry window).
> Scheduled renewal workflow runs well ahead of the shorter (Graph) window; re-registers from scratch on failure rather than assuming renewal always succeeds
> Historical backfill beyond a small validation window — this phase proves live push sync; a backfill policy is a separate decision (also an open question upstream)

**Problem:** Push notifications are not replayable. Once a `watch()` or Graph subscription has lapsed, re-registering only starts the stream from *now* — a fresh Gmail `watch()` returns a new `historyId` and the prior one may already be expired, and a new Graph subscription carries no history at all. So the stated recovery for the stated failure produces a green, healthy-looking system with a silent, permanent hole in `emails` exactly as wide as the outage. Because backfill is explicitly out of scope, the artifact contains no mechanism that could ever close that hole; the loss is irreversible with no operator recovery path. This is the fail-open case that looks identical to success: after re-registration, `last successful sync` is fresh and the subscription is valid.

**Fix:** On any re-registration (as opposed to a clean renewal), run a bounded catch-up fetch — Gmail `history.list` from the stored `historyId`, falling back to `messages.list` with `after:<last_successful_sync>`; Graph `messages` filtered on `receivedDateTime gt <last_successful_sync>` — before resuming push. Record a `resync_gap_start`/`resync_gap_end` on the `accounts` row for every re-registration so the hole is visible and auditable even if the catch-up itself fails. Treat "re-registered from scratch without catch-up" as a failed run, not a recovered one.

**Status:** upheld

### [WARN] party-security — Sync death is observable only by a human deciding to open Supabase Studio, and stale sync state is indistinguishable from a quiet inbox

**Quotes:**
> Minimal operational visibility: each account's last successful sync time and subscription status readable directly in Supabase (no dashboard UI — Supabase Studio's table editor is sufficient for this phase)
> Sync silently stops; nothing alerts the user

**Problem:** The risk table names "nothing alerts the user" as the impact, and the mitigation column answers with a renewal job — a mechanism whose own failure is equally silent. The only visibility offered is pull-based and manual. Worse, the chosen signal is ambiguous: a `last successful sync` from 40 hours ago is what a dead subscription looks like *and* what a weekend with no mail looks like, so even an operator who checks cannot distinguish degraded from healthy. A degraded run that leaves no distinguishable artifact will be trusted.

**Fix:** Have the renewal workflow write an outcome row per run per account (`renewed` / `re-registered` / `failed`) with a timestamp, so absence of a recent success row is itself the signal rather than an inference from mail volume. Add `subscription_expires_at` to `accounts` and treat `now() > expires_at` or a failed renewal as an alerting condition on a channel that pushes (n8n error workflow to email/Telegram/webhook) rather than one that waits to be read.

**Status:** upheld

### [WARN] party-security — The `accounts` table is described both as holding tokens and as holding a reference, and the token-at-rest case has no stated protection or revocation path

**Quotes:**
> An `accounts` table holds provider credentials/tokens and per-account sync state (last successful sync, current subscription ID and expiry) so renewal and health checks have something to read.
> `accounts` table: provider, credentials reference, sync state, current subscription ID + expiry
> **Where does OAuth token refresh live** — n8n's own credential store alone, or mirrored into the `accounts` table for cross-checking sync health?

**Problem:** Line 28 says the table holds credentials/tokens; line 40 says it holds a credentials reference; the open question confirms the decision is unmade. Under the first reading, long-lived OAuth refresh tokens granting standing access to two personal mailboxes sit in an ordinary application table with no stated encryption, no stated RLS, and no stated restriction on which n8n workflows can read that column — while the same table is the one an operator is told to browse in Supabase Studio. A leaked refresh token is not undoable by deleting the row; it is undoable only by revoking the grant at Google/Microsoft, which the proposal never mentions.

**Fix:** Resolve the open question toward "reference only": `accounts` stores an opaque n8n credential ID plus sync state, never token material. If any token is mirrored, require it encrypted at rest (pgsodium/Vault) with RLS denying the anon and authenticated roles, and readable only by the service role the renewal workflow uses. State the revocation runbook (revoke at the provider console, then rotate the n8n credential) as the recovery path. Separately, pin the requested scopes to read-only (`gmail.readonly`, `Mail.Read`) in this phase — the modify scopes that "future propagation logic (e.g. read/delete state)" would need are explicitly a later change and must not be requested now.

**Status:** upheld

### [WARN] party-security — Dedup keyed on provider message ID alone is a check-then-write race and a cross-account overwrite primitive

**Quotes:**
> Basic dedup on provider message ID (a webhook or renewal race must not create duplicate rows)
> Dedup on provider message ID at write time

**Problem:** "At write time" describes intent, not enforcement. If dedup is a read-then-insert inside a workflow, two concurrent deliveries — precisely the "webhook or renewal race" named — both read empty and both insert; the guard fails open under exactly the condition it was written for. And keying on the provider message ID alone, without the account and provider, means a colliding or attacker-chosen ID (reachable through the unauthenticated endpoint in the first finding) upserts over an existing row, destroying stored email content with no version history and no recovery path.

**Fix:** Enforce dedup as a database `UNIQUE (account_id, provider, provider_message_id)` constraint and write via `INSERT ... ON CONFLICT DO NOTHING`, so the race is resolved by Postgres rather than by workflow timing. Do not use `DO UPDATE` on the body/subject columns in this phase: a second delivery for a known ID should be a no-op, never an overwrite.

**Status:** upheld

### [NOTE] party-security — Normalized bodies are stored with no provenance marker, and Phase 2 is already designed to feed them to a model

**Quotes:**
> Both providers' payloads map to one internal email shape before being written to Supabase — same fields regardless of source, with a `provider` column and provider-native IDs preserved
> the `emails` schema should leave room for both (a nullable category-ish column, body stored in a form `tsvector` can later index) so Phase 2 doesn't require a migration on day one

**Problem:** Every field in this table is attacker-authored: anyone who can send mail to either address controls `subject`, `body`, and display names verbatim. This phase runs no model, so there is no exposure as written — but the schema is being deliberately shaped now so Phase 2 can consume it without migration, and Phase 2's triage/extraction/drafting will place this text into prompts. Text that arrives with no marking of its untrusted origin gets treated as ordinary context by whatever reads it next, and a schema decision made here is the cheapest place to prevent that.

**Fix:** While the schema is still being written, keep the raw body in a column that is unambiguously untrusted-by-name and never merge sender-controlled text into any column that later carries system-derived values (keep `category` model-written only, never populated from a header the sender controls). Store the raw provider payload separately from normalized fields so a later phase can diff what was rendered against what arrived. Record this as a constraint Phase 2 inherits rather than re-derives.

**Status:** upheld
