# Proposal: Gmail Ingestion (Phase 1a)

**Created:** 2026-09-05
**Revised:** 2026-09-06 — addresses party review findings (see party-report.md); narrowed to Gmail-only, Outlook deferred to a follow-on change
**Status:** 🟡 Draft

## Problem

The Smart Email Assistant (umbrella proposal `001-smart-email-assistant`) cannot triage, extract tasks from, or draft replies to email that isn't in the system yet. Before any AI pipeline can run, mail needs to land in a normalized store, kept current without polling.

This is being split out of `001-smart-email-assistant` into its own change per that proposal's own open question ("should this ship as one change or five?"). It is further narrowed here to **Gmail only** — Outlook is deferred to a follow-on change (`003-outlook-ingestion` or similar) once the Gmail path is proven end-to-end. This isn't a step backward from the umbrella proposal's two-provider goal; it's sequencing the riskiest, least-reversible mechanics (push subscriptions, renewal, credential ownership) against one provider first, so the second provider is added against a validated pattern instead of two unknowns at once.

Concretely, three things don't exist yet:

1. No OAuth-connected read access to Gmail.
2. No mechanism to be notified of new mail — only polling, which is slow, rate-limit-hungry, and explicitly rejected by the umbrella proposal.
3. No normalized schema for storing email — the shape needs to be provider-agnostic enough that adding Outlook later is a new adapter, not a rewrite, without over-building for a provider that isn't wired in yet.

Source document: `../001-smart-email-assistant/proposal.md`, Phase 1 row and Architecture §"Ingestion — n8n".

## Proposed Solution

Push-driven, read-only ingestion from Gmail into a normalized Supabase table, orchestrated by n8n. No AI, no drafting, no frontend, no Outlook yet — this change proves the pipe, not the intelligence, and proves it against one provider before a second is added.

**Why push, not polling:** push is being validated now because the renewal/subscription-lifecycle mechanics are the riskiest, least-reversible part of the whole system — cheaper to get right against a simple pipe with no AI in the loop than to retrofit under Phase 2's time pressure. Phase 2's triage step also wants near-real-time delivery for the "scan the inbox in seconds" goal. Polling remains a fallback if push proves unworkable in practice (see Risks).

**Pipeline stages (explicit, four steps):**

1. **Notify.** `users.watch()` registers push via a Google Cloud Pub/Sub topic n8n subscribes to. This delivers a *change notification*, not the message itself.
2. **Fetch.** On notification, fetch the actual message(s) using a per-account sync cursor (`historyId`) stored in `accounts`. The cursor is read by the fetch step and advanced by the same transaction that writes to `emails` — a missed or out-of-order notification cannot silently drop mail, because the next fetch resumes from the last-advanced cursor rather than trusting the notification alone.
3. **Normalize.** The Gmail payload maps to an internal email shape shaped to be provider-agnostic (so an Outlook adapter can target the same table later), implemented as a separately invocable n8n sub-workflow taking a provider payload as input — not inlined into the notification handler — so it can be run against captured fixtures without waiting on a live delivery.
4. **Write.** Upsert into `emails` on a unique constraint (see Scope), so concurrent or duplicate deliveries are resolved by Postgres, not by workflow-level ordering.

**Endpoint trust.** The push endpoint is public by necessity (Google needs a stable URL to call). Two checks are in-scope acceptance criteria, not optional hardening:
- The push request's OIDC token is verified (audience + `gmail-api-push@system.gserviceaccount.com` issuer), and the Pub/Sub topic's publish IAM is restricted to that same service account.
- HTTPS-only on the receiving endpoint.

**Credential ownership.** n8n's native Gmail node credential store is the single owner of the OAuth token and its refresh — it already does the grant and the refresh. The `accounts` table holds **only** a non-authoritative reference (the n8n credential ID) plus sync state; it never duplicates token material. This closes the two-stores-diverge failure mode where a health check could read a stale copy and report a healthy account whose sync is actually dead. Requested scope is pinned to read-only (`gmail.readonly`) for this phase — modify scopes that later read/delete-state propagation would need are a later change's decision, not this one's.

**Subscription renewal and outage recovery — first-class, not a follow-up.** A scheduled n8n workflow renews the `watch()` subscription ahead of its *stored* expiry (`accounts.subscription_expires_at`), rather than assuming today's ~7-day Gmail window holds forever — so a future Google policy change doesn't drift silently out of sync with the job's schedule. Runs every 6 hours, comfortably inside that window. On a **failed** renewal (as opposed to a clean one), the workflow re-registers `watch()` from scratch — but re-registration alone would silently and permanently lose every message from the outage window, since a fresh `watch()` returns a new `historyId` uncorrelated with the old one and push notifications aren't replayable. So re-registration is followed by a **bounded catch-up fetch** using the stored cursor (`history.list` from the last known `historyId`, falling back to `messages.list after:<last_successful_sync>` if the history has expired) before push resumes. The gap window (`resync_gap_start` / `resync_gap_end`) is recorded on the `accounts` row for every re-registration, so the hole is auditable even if the catch-up itself partially fails. A re-registration without a completed catch-up counts as a failed run, not a recovered one.

**Health visibility.** Every renewal-job run writes an outcome row (`renewed` / `re-registered` / `failed`, with a timestamp), so a dead subscription is visible as an *absence of a recent success row* rather than inferred from `last_successful_sync` alone — which is ambiguous with a mailbox that's simply quiet. Push-based alerting (email/Telegram/webhook via an n8n error workflow) is **explicitly deferred**, not silently missing — it's out of scope for this phase; until it exists, checking the outcome log is a manual, pull-based habit.

**Normalization.** The Gmail payload maps to one internal email shape, with field shapes pinned rather than left to the implementer, and kept general enough for an Outlook adapter to target later without a schema rewrite:
- Participants (`from`/`to`/`cc`) stored as a structured array of `{role, name, address}` objects — a scalar string cannot survive a multi-recipient thread.
- `body` stored as plain text, in a column indexable by `tsvector` later; the raw Gmail payload is stored separately (`raw_payload jsonb`) so a later phase can diff rendered-vs-arrived content, and because every field here is sender-controlled and untrusted, `body`/`subject` are never merged into any column that later carries system-derived values (e.g. `category` stays model-written only).
- `labels` stored as a JSONB array, not a scalar — Gmail's multi-label model needs a collection; semantic reconciliation (e.g. a shared "Inbox" concept across a future Outlook adapter) is deliberately not attempted in this phase, only lossless storage.
- Gmail's message ID and the per-account cursor (above) are preserved — the cursor, not the message ID alone, is what a later delete/archive-propagation phase would actually need.

**Endpoint stability.** The registered `watch()` subscription embeds the n8n host's public address as data (via the Pub/Sub topic it's tied to). Provisioning the Oracle Cloud host can proceed in parallel with workflow/schema design, but subscription registration itself cannot be exercised until that address is stable — and any later change to the address invalidates the registered subscription and must go through the same re-registration path the renewal workflow already uses.

**Done when** — split into what can be verified same-day and what requires a real observation window:
- *Same-day:* a manually sent test email to `yomaltheekshana66@gmail.com` appears normalized in `emails` within seconds via the notify→fetch→normalize→write pipeline (verified by watching a Pub/Sub delivery fire, not by polling for a row to appear), and a deliberately malformed/unsigned notification is confirmed dropped by the endpoint-trust checks above.
- *Multi-day:* at least one renewal cycle is observed to fire and succeed (confirmed via an updated subscription ID/expiry and a `renewed` outcome row in `accounts`) — not merely deployed, actually witnessed succeeding — before this phase is considered "reliably synced" rather than "synced once."

## Scope

### In Scope
- Gmail OAuth via n8n's native node (credential store is sole owner of the token/refresh); `users.watch()` + Google Cloud Pub/Sub push subscription, with OIDC-verified pushes and IAM-restricted topic publish
- HTTPS-only requirement on the receiving endpoint
- Explicit fetch stage per notification, using a per-account sync cursor (`historyId`)
- Normalization implemented as a separately invocable sub-workflow (testable against fixtures, not only live payloads), targeting a schema general enough for a future Outlook adapter
- Scheduled renewal workflow (every 6 hours) reading the account's *stored* expiry, not a hardcoded provider constant; re-registration on failed renewal followed by a bounded catch-up fetch from the stored cursor, with the resulting gap window recorded
- Normalized `emails` schema in Supabase:
  - `provider` (value `'gmail'` for this change; column exists so Outlook is an added value, not a migration), `provider_message_id` (unique with account — see below), `thread_id`
  - `participants` — structured array of `{role, name, address}` (role: from/to/cc)
  - `subject`, `body` (plain text, untrusted/sender-controlled), `raw_payload` (jsonb, full Gmail API response)
  - `received_at`
  - `labels` (jsonb array, Gmail-native label values)
  - `category` (nullable, model-written only in later phases — committed as schema now, not left to Open Questions)
  - Unique constraint on `(account_id, provider, provider_message_id)`; writes are `INSERT ... ON CONFLICT DO NOTHING` — a repeat delivery is a no-op, never an overwrite
- `accounts` table: `provider`, `n8n_credential_id` (reference only, no token material), `sync_cursor` (Gmail `historyId`), `subscription_id`, `subscription_expires_at`, `last_successful_sync`, `resync_gap_start`/`resync_gap_end` (nullable, set on re-registration)
- `sync_outcomes` log: one row per renewal-job run (`renewed` / `re-registered` / `failed`, timestamp) — the basis for health visibility without requiring push-based alerting
- Minimal operational visibility: `sync_outcomes` and `accounts` readable directly in Supabase Studio (no dashboard UI needed for this phase)
- Target account for this change: `yomaltheekshana66@gmail.com`

### Out of Scope
- **Microsoft Outlook ingestion entirely** — OAuth, Graph webhook subscription, `clientState` verification, Outlook-specific `accounts` fields. Deferred to a follow-on change once this Gmail path is proven end-to-end; the schema's `provider` column and general shape are designed so that change adds an adapter, not a migration
- Any AI/LLM processing — triage, summarization, action-item extraction, draft generation (all of Phase 2+, a later change against `001-smart-email-assistant`)
- Next.js frontend or any dashboard UI
- The single n8n LLM sub-workflow choke point (irrelevant until Phase 2 introduces LLM calls)
- Full-text search (`tsvector` indexing itself) — the `body` column is stored in an indexable form, but building the index/search query is deferred to whichever phase first needs to query email content
- Push-based alerting (email/Telegram/webhook on sync failure) — `sync_outcomes` ships now as the data source; wiring an actual alert channel is a later, small addition once a channel is chosen
- Propagating remote deletes/archives from Gmail into the local `emails` row — the sync cursor this phase adds is what that would need, but the propagation logic itself is out of scope, revisit once a `tasks` table depending on `emails` rows exists
- Historical backfill beyond the bounded catch-up fetch (which only covers a renewal-outage gap, not first-connect history) — a full backfill policy on first connect is a separate, still-open decision
- Oracle Cloud VM provisioning steps themselves are tracked as infrastructure setup, not app logic — provisioning proceeds in parallel with this change, but subscription registration (which embeds the host's address) cannot complete until the host has a stable public address

## Impact

- **Files affected:** ~10–14 (estimated) — n8n workflow JSON exports (Gmail watch setup, renewal + catch-up workflow, normalization sub-workflow, endpoint-auth checks), Supabase migration SQL for `accounts`, `emails`, and `sync_outcomes`, minimal docs/config (Docker Compose service definitions if not already provisioned). Smaller than the two-provider version of this change since Outlook's OAuth/webhook/adapter work is deferred.
- **Complexity:** medium — one OAuth/push integration plus a renewal scheduler with outage recovery, no AI logic, no frontend, and only one provider's quirks to handle.
- **Risk:** medium — concentrated in third-party mechanics rather than code: Gmail OAuth verification for sensitive scopes, Google Cloud Pub/Sub setup, and Oracle Cloud ARM capacity for the host n8n runs on.

Principal risks and mitigations:

| Risk | Impact | Mitigation |
|---|---|---|
| Gmail `watch()` expires (~7 days) without renewal | Sync silently stops | Renewal workflow runs every 6 hours against the account's *stored* expiry; failed renewal triggers re-registration **plus** a bounded catch-up fetch from the stored cursor, so the outage window is recovered rather than silently lost |
| Unauthenticated push endpoint | Attacker-controlled notification drives what gets written to `emails` | OIDC + IAM verification, HTTPS-only; failing checks are dropped and counted, never processed |
| Push mechanism's latency payoff has no consumer in this phase alone | Complexity paid without an immediate return | Justified explicitly above: validates the highest-risk mechanism early, and Phase 2's triage step is the actual consumer this groundwork serves |
| Gmail OAuth verification required for sensitive scopes | Cannot be used beyond a test user | Acceptable for a personal project — self as sole test user |
| Duplicate or colliding provider message IDs across a race | Data loss (overwrite) or duplicate rows | `UNIQUE (account_id, provider, provider_message_id)` constraint with `ON CONFLICT DO NOTHING` — enforced in Postgres, not workflow timing |
| Sync health silently indistinguishable from a quiet inbox | Operator trusts a dead sync | `sync_outcomes` log makes absence of a recent success row the signal, independent of mail volume |
| Oracle Cloud ARM capacity errors blocking n8n host provisioning | This change has nowhere to run, and subscription registration can't complete without a stable address | Provision in parallel, starting now; retry across availability domains |
| Schema turns out too Gmail-shaped once Outlook is added later | Rework of schema when the follow-on change lands | Field shapes (arrays/JSONB, not scalars; a `provider` column already present) are pinned with a second provider in mind, even though only Gmail populates them now |

## Open Questions

- **Backfill policy on first connect** — recent mail only, or full history? Distinct from the in-scope catch-up fetch (which only covers a renewal-outage gap). Doesn't block this phase's build.
- **Alerting channel** — once `sync_outcomes` exists, which channel (email/Telegram/n8n error workflow to a webhook) wires up to it, and is a manual Supabase Studio check acceptable in the meantime, or does even a lightweight alert need to ship alongside the log?
- **Triage category set** — the `category` column is committed to the schema now (nullable), but the enum/label values themselves are a Phase 2 decision.
- **When to start the Outlook follow-on change** — immediately after this one verifies, or after Phase 2 (triage) is also proven against Gmail alone?

---

**To proceed:** Review this proposal and approve to begin planning.
