# Spec: Gmail Ingestion (Phase 1a)

**Change:** 002-ingestion
**Created:** 2026-09-06
**Status:** 🟡 Draft

## Overview

Push-driven, read-only ingestion of new mail from a single Gmail account (`yomaltheekshana66@gmail.com`) into a normalized Supabase table, orchestrated by n8n. This change proves the ingestion pipe — notification, fetch, normalize, write, renew, recover — end-to-end for one provider before Outlook is added in a follow-on change and before any AI pipeline (Phase 2+) is built. No AI, no drafting, no frontend.

This spec formalizes the decisions already made in `proposal.md` (revised 2026-09-06 after party review): n8n's native credential store is the sole owner of the OAuth token; a per-account sync cursor makes notifications resumable rather than trusted at face value; endpoint authentication is a shipped acceptance criterion, not a hardening afterthought; and a failed renewal triggers a bounded catch-up fetch rather than silently losing the outage window. It aligns with the naming in the project's existing C4 architecture (`architecture.md`, `architect/03a-component-automation-engine.md`): the **Gmail Ingestion** workflow and **Email Normaliser** workflow this spec describes are the same components named there.

## Requirements

### Functional Requirements

- **FR1 — Subscribe.** Register a Gmail push subscription (`users.watch()`) for `yomaltheekshana66@gmail.com`, bound to a Google Cloud Pub/Sub topic that n8n subscribes to.
- **FR2 — Verify before processing.** On each incoming Pub/Sub push, verify the request's OIDC token (audience matches this endpoint, issuer is `gmail-api-push@system.gserviceaccount.com`) before any further processing. A request that fails verification is discarded and counted; it is never fetched, normalized, or written.
- **FR3 — Fetch via cursor, not trust.** On a verified notification, fetch new messages using the account's stored sync cursor (`historyId`) via `history.list`, not by assuming the notification payload names the message directly. Advance the stored cursor in the same write as the resulting `emails` insert.
- **FR4 — Normalize.** Map each fetched Gmail message to the internal `emails` schema (participants, subject, body, raw payload, received timestamp, labels, provider, provider message ID, thread ID) via a normalization step invocable independently of a live Pub/Sub delivery (i.e., callable with a recorded payload as input).
- **FR5 — Dedup at the database.** Write normalized emails via `INSERT ... ON CONFLICT DO NOTHING` against a unique constraint on `(account_id, provider, provider_message_id)`. A repeat delivery for a known message is a no-op, never an overwrite.
- **FR6 — Credential ownership.** Store the Gmail OAuth token and its refresh only in n8n's native Gmail node credential store. The `accounts` table stores only a reference to that credential (its n8n credential ID) plus sync state — never token material.
- **FR7 — Scheduled renewal.** Run a renewal workflow every 6 hours that renews the `watch()` subscription ahead of the expiry stored in `accounts.subscription_expires_at` for that account (not a hardcoded constant).
- **FR8 — Recover from a failed renewal.** If a renewal call fails, re-register `watch()` from scratch, then perform a bounded catch-up fetch (`history.list` from the last stored `historyId`; if that history has itself expired, fall back to `messages.list` filtered on `after:<last_successful_sync>`) before push delivery resumes. Record `resync_gap_start`/`resync_gap_end` on the `accounts` row for that re-registration.
- **FR9 — Log every renewal-job outcome.** Each renewal-job run writes one row to `sync_outcomes` (`renewed` / `re-registered` / `failed`, with a timestamp), independent of whether the run succeeded.
- **FR10 — Minimum necessary scope.** Request only `gmail.readonly` from Google OAuth consent for this change.

### Non-Functional Requirements

- **NFR1 — Endpoint trust.** The Pub/Sub push endpoint is HTTPS-only. The Pub/Sub topic's publish IAM is restricted to the `gmail-api-push@system.gserviceaccount.com` service account, in addition to the per-request OIDC check in FR2.
- **NFR2 — No workflow-level dedup.** Duplicate-write prevention (FR5) must be enforced by a database constraint, not by a lookup-then-insert check inside an n8n workflow, since the latter fails open under concurrent deliveries.
- **NFR3 — Fixture-testable normalization.** The FR4 normalization step must be runnable against a captured Gmail API response without a live Pub/Sub delivery, so it can be verified before both providers (eventually) are live.
- **NFR4 — Unambiguous health signal.** Sync health must be determinable from `sync_outcomes` (an outcome row's presence/absence and status) rather than solely from `last_successful_sync`, which cannot distinguish a dead subscription from a quiet mailbox.
- **NFR5 — No AI in this change.** No LLM call, prompt, or model dependency is introduced anywhere in this change.
- **NFR6 — Gmail-only.** No Outlook-specific schema fields, credentials, or workflows are introduced in this change. The schema's `provider` column and general field shapes must not require a migration when an Outlook adapter is added later, but Outlook's own fields (e.g. Graph `clientState`) are out of scope here.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1 (same-day).** A manually sent test email to `yomaltheekshana66@gmail.com` produces a normalized row in `emails` within seconds, confirmed by observing a live Pub/Sub delivery fire and trigger the pipeline — not by polling `emails` for a new row.
- **AC2 (same-day).** A push request with a missing or invalid OIDC token is confirmed discarded before reaching the fetch step (no row written, and the drop is observable — e.g. in n8n's execution log or a counter).
- **AC3 (same-day).** Sending the same test email's notification twice (simulated replay) results in exactly one row in `emails` for that message.
- **AC4 (multi-day).** At least one renewal-job cycle is observed to fire and succeed for this account, confirmed by an updated `subscription_id`/`subscription_expires_at` on `accounts` and a `renewed` row in `sync_outcomes` — not merely a deployed workflow, an actually-observed success.
- **AC5.** A schema review confirms `accounts` contains no column holding OAuth token or refresh-token material — only a credential reference and sync state.

## Edge Cases

- **Concurrent duplicate deliveries.** Two Pub/Sub pushes for the same underlying message arrive near-simultaneously → the unique constraint (FR5) resolves the race; exactly one row results.
- **Watch expires without a successful renewal.** The renewal workflow's failure path (FR8) re-registers and runs the catch-up fetch; the gap window is recorded even if the catch-up itself only partially succeeds.
- **Stored `historyId` has itself expired** (Gmail retains history for a limited window). The catch-up fetch falls back to `messages.list after:<last_successful_sync>` rather than failing outright.
- **Notification for a non-new-mail change** (e.g., a label change on an existing message). The fetch step finds no new message to normalize; no `emails` row is written, but the cursor still advances so the next fetch doesn't re-process the same history range.
- **Malformed, unsigned, or replayed push request.** Dropped at the OIDC verification step (FR2/AC2); never reaches fetch or write.
- **n8n host not yet at a stable public address.** Subscription registration (FR1) cannot be exercised until the endpoint is reachable; schema and workflow-logic work are not blocked by this, only the live registration step is.

## Dependencies

- A Google Cloud project with the Gmail API enabled and a Pub/Sub topic created, with publish IAM restricted to `gmail-api-push@system.gserviceaccount.com`.
- An OAuth consent screen (Google Cloud) configured for the `gmail.readonly` scope, with `yomaltheekshana66@gmail.com` added as a test user (the app is unverified, per the umbrella proposal's accepted risk).
- n8n reachable at a stable public HTTPS address (Oracle Cloud ARM VM, Docker Compose + Caddy) — provisioning can proceed in parallel with schema/workflow design, but FR1's registration step is blocked until this exists.
- A Supabase project (already held by the user) with connection details available to n8n's own credential store — not shared as raw secrets outside n8n/Supabase.
- n8n's native Gmail node credential configured against the Google OAuth client above.

## Notes

- Outlook ingestion, the `sync_outcomes` alerting channel, the triage `category` enum, and the first-connect backfill policy are explicitly out of scope for this change — see `proposal.md` Open Questions for what's deliberately still undecided.
- `architecture.md` and `architect/04-data-model.md` sketch a simpler `accounts.credentials jsonb` column and flag "token storage" as an open question; this spec's FR6 is the resolution of that open question for this change (n8n owns the token; `accounts` holds a reference only) and should be treated as superseding the simplified sketch for the actual schema built here.
