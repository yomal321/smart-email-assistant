# Tasks: Gmail Ingestion (Phase 1a)

**Change:** 002-ingestion
**Created:** 2026-09-06
**Total Tasks:** 6

## Summary

Six tasks across three waves: schema + test fixtures (parallel, no dependencies), the three n8n workflows (each a distinct component from `architecture.md`'s Automation Engine diagram), and the setup runbook last, once there's something concrete to point it at. No task is speculative — every file here is named and justified in `design.md`'s File Changes Map.

## Tasks

### Wave 1 — Schema and fixtures

- [x] `T1` — Write the Supabase migration for `accounts`, `emails`, `sync_outcomes`
  - Files: `supabase/migrations/0001_ingestion_schema.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact DDL is in `design.md` § Data Model Changes — use it verbatim (column names, types, the `unique (account_id, provider, provider_message_id)` constraint, and the `check (provider in ('gmail'))` constraint). Include column comments noting which workflow writes each column, per `architect/04-data-model.md`'s "Who writes what" convention.

- [x] `T2` — Capture Gmail API fixture payloads for normalizer and fetch testing
  - Files: `n8n/fixtures/gmail-message-sample.json`, `n8n/fixtures/gmail-history-sample.json`
  - Estimate: small
  - Kind: test
  - Notes: A sanitized `messages.get` response (multi-recipient `to`, at least one label, HTML+plaintext body) and a sanitized `history.list` response with at least one `messagesAdded` entry. These exist so T3 and T4 can be built and reasoned about without a live Gmail account.

### Wave 2 — n8n workflows

- [x] `T3` — Author the Email Normaliser sub-workflow
  - Files: `n8n/workflows/email-normaliser.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T2
  - Notes: Maps a raw Gmail message to the `emails` row shape (FR4): participants as `{role, name, address}` array, plain-text `body`, full `raw_payload`, `labels` as array. Writes via `INSERT ... ON CONFLICT DO NOTHING` (FR5, NFR2) and advances `accounts.sync_cursor` in the same step. Must be invocable standalone with `gmail-message-sample.json` as input (NFR3) — this is what makes it testable before Wave 3's live setup exists.

- [x] `T4` — Author the Gmail Ingestion workflow
  - Files: `n8n/workflows/gmail-ingestion.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T3
  - Notes: Pub/Sub push webhook trigger → OIDC token verification (audience + `gmail-api-push@system.gserviceaccount.com` issuer; drop and count on failure, per FR2/NFR1/AC2) → `history.list` fetch using `accounts.sync_cursor` (FR3) → invoke Email Normaliser per resulting message. A notification with no new mail (e.g. a label-only change) must still advance the cursor without writing an `emails` row (spec.md Edge Cases).

- [x] `T5` — Author the Gmail Renewal & Recovery workflow
  - Files: `n8n/workflows/gmail-renewal-recovery.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: Scheduled every 6 hours (FR7), reading `accounts.subscription_expires_at` per account rather than a hardcoded window. On success: update `subscription_id`/`subscription_expires_at`, write a `renewed` row to `sync_outcomes`. On failure: re-register `watch()`, then run the catch-up fetch (`history.list` from the stored `historyId`, falling back to `messages.list after:<last_successful_sync>` if that history has expired), record `resync_gap_start`/`resync_gap_end`, and write `re-registered` (catch-up completed) or `failed` (it didn't) to `sync_outcomes` (FR8, FR9) — a re-registration without a completed catch-up must log as `failed`, never `re-registered`.

### Wave 3 — Setup runbook

- [x] `T6` — Write the Gmail ingestion setup runbook
  - Files: `docs/setup/gmail-ingestion-setup.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T1, T3, T4, T5
  - Notes: Ordered, checklist-style steps for the parts no file can express: GCP project + Gmail API enablement, Pub/Sub topic creation with publish IAM restricted to `gmail-api-push@system.gserviceaccount.com`, OAuth consent screen scoped to `gmail.readonly` with `yomaltheekshana66@gmail.com` as a test user, creating the n8n Gmail credential, applying the T1 migration, importing the three workflow JSON files, and registering the initial `users.watch()` subscription. This is also where AC1–AC5 get executed once the setup is followed — list them as the runbook's final verification checklist rather than duplicating spec.md's wording.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
