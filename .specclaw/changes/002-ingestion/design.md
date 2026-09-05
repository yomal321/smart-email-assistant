# Design: Gmail Ingestion (Phase 1a)

**Change:** 002-ingestion
**Created:** 2026-09-06

## Technical Approach

Everything in this change is either a **Supabase schema migration** or an **n8n workflow**, plus the manual provider-console configuration neither of those can express as a file. There is no application server and no repo code yet beyond docs — this is the first change to add anything executable, so the layout established here (`supabase/migrations/`, `n8n/workflows/`, `n8n/fixtures/`, `docs/setup/`) is the seed of the project's real structure.

n8n workflows are authored as importable JSON (the standard way to version-control n8n) rather than built live against a running instance, since no n8n instance is provisioned yet. They import cleanly once the user has n8n running and the credentials created; the *logic* (the fetch-via-cursor, the OIDC check, the catch-up path) is fully specified in each workflow's JSON regardless of when it's first imported. The GCP/OAuth console steps that cannot be expressed as a file at all (creating a Pub/Sub topic, configuring an OAuth consent screen) are written as a setup runbook the user follows once, referencing the exact values (topic name, scope, redirect URIs) the workflows expect.

Four pipeline stages from `spec.md` map onto workflow boundaries as follows:

| Spec stage | n8n workflow | Trigger |
|---|---|---|
| Notify (FR1, FR2) | **Gmail Ingestion** | Pub/Sub push webhook |
| Fetch (FR3) | **Gmail Ingestion** (continues after verification) | — |
| Normalize (FR4) | **Email Normaliser** (sub-workflow, invoked by Gmail Ingestion) | Called, and independently invocable with a fixture payload |
| Write (FR5) | **Email Normaliser** (final step) | — |
| Renew/Recover (FR7, FR8, FR9) | **Gmail Renewal & Recovery** | Scheduled, every 6 hours |

This matches the naming already established in `architecture.md` / `architect/03a-component-automation-engine.md` ("Gmail Ingestion", "Email Normaliser" workflows) — this design adds the renewal/recovery workflow those diagrams don't yet break out as its own box, and narrows scope to Gmail only per the revised proposal (Outlook Ingestion in those diagrams is a later change).

## Architecture

```
Google Cloud                          n8n (self-hosted, Oracle Cloud ARM)                Supabase (Postgres)
─────────────                         ────────────────────────────────────                ───────────────────
users.watch()  ──registers──────────▶ [Gmail Ingestion]
Pub/Sub topic  ──push (HTTPS)───────▶   1. Verify OIDC token (drop if invalid)
  (IAM: gmail-api-push only)            2. Read accounts.sync_cursor
                                         3. Gmail history.list (fetch new msgs)
                                         4. For each message ──────────────────▶ [Email Normaliser] (sub-workflow)
                                                                                    - map → emails columns
                                                                                    - INSERT ... ON CONFLICT DO NOTHING
                                                                                    - advance accounts.sync_cursor
                                                                                                                    ──▶ emails, accounts

n8n Schedule Trigger (every 6h) ────▶ [Gmail Renewal & Recovery]
                                         1. Read accounts.subscription_expires_at
                                         2. If due: call users.watch() to renew
                                         3. On success: update subscription_id/expires_at,
                                            write sync_outcomes row ('renewed')
                                         4. On failure: re-register watch() from scratch,
                                            run catch-up fetch (history.list from stored
                                            historyId, or messages.list after:<last_sync>
                                            if history expired), write resync_gap_start/end,
                                            write sync_outcomes row ('re-registered' or 'failed')
```

n8n's native Gmail node credential (OAuth token + refresh) is used by both workflows above but is never read into either workflow's own data — it's referenced by n8n's credential picker, not fetched into a variable. This is what keeps `accounts` free of token material (FR6).

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0001_ingestion_schema.sql` | Create | `accounts`, `emails`, `sync_outcomes` tables, the unique constraint on `emails`, and column comments recording which workflow writes each column (mirrors `architect/04-data-model.md`'s "Who writes what" table) |
| `n8n/workflows/gmail-ingestion.json` | Create | Pub/Sub webhook trigger → OIDC verification → cursor-based fetch → calls Email Normaliser per message |
| `n8n/workflows/email-normaliser.json` | Create | Sub-workflow: raw Gmail payload → normalized `emails` row (participants array, plain-text body, raw_payload, labels array) → upsert → cursor advance. Independently invocable with a fixture payload (NFR3) |
| `n8n/workflows/gmail-renewal-recovery.json` | Create | Scheduled trigger (6h) → renew-or-reregister → catch-up fetch on failure → `sync_outcomes` row |
| `n8n/fixtures/gmail-message-sample.json` | Create | A captured (sanitized) Gmail API `messages.get` response, used to test Email Normaliser without a live delivery |
| `n8n/fixtures/gmail-history-sample.json` | Create | A captured `history.list` response, used to test the Gmail Ingestion fetch step against a known cursor position |
| `docs/setup/gmail-ingestion-setup.md` | Create | Runbook: GCP project + Gmail API enablement, Pub/Sub topic + IAM restriction, OAuth consent screen (scope, test user), n8n Gmail credential creation, applying the Supabase migration, importing the three workflows, registering the initial `watch()` subscription |

No existing files are modified — this is the first change to add anything beyond documentation.

## Data Model Changes

```sql
-- accounts: sync state and a *reference* to n8n's credential, never token material (FR6)
create table accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gmail')),  -- 'outlook' added by the follow-on change, not here
  n8n_credential_id text not null,       -- reference only; the token itself lives in n8n
  sync_cursor text,                       -- Gmail historyId
  subscription_id text,
  subscription_expires_at timestamptz,
  last_successful_sync timestamptz,
  resync_gap_start timestamptz,           -- set only when a re-registration follows a failed renewal
  resync_gap_end timestamptz,
  created_at timestamptz not null default now()
);

-- emails: normalized, provider-agnostic shape (Outlook adds rows here later, not columns)
create table emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  provider text not null,
  provider_message_id text not null,
  thread_id text,
  participants jsonb not null,            -- [{role, name, address}, ...]
  subject text,
  body text,                              -- plain text; sender-controlled, untrusted
  raw_payload jsonb not null,             -- full provider response, for diffing later
  labels jsonb,                           -- provider-native values, no cross-provider reconciliation yet
  category text,                          -- nullable; written only by Phase 2's triage pipeline, never by ingestion
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, provider, provider_message_id)
);

-- sync_outcomes: one row per renewal-job run, independent of last_successful_sync (NFR4)
create table sync_outcomes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  outcome text not null check (outcome in ('renewed', 're-registered', 'failed')),
  occurred_at timestamptz not null default now()
);
```

`body`/`subject`/`raw_payload` are sender-controlled and never merged into `category`, which stays writable only by a later phase's triage pipeline — this boundary is a schema comment, not enforced by a constraint, since Postgres has no clean way to express "only this application role writes this column" without RLS complexity this single-user phase doesn't need yet.

## API Changes

None — this change has no HTTP API of its own beyond the two inbound integration points below, neither of which is a general-purpose API:

- **Pub/Sub push endpoint** (n8n webhook URL, registered with Google Cloud) — accepts only Google's push format, verified per FR2/NFR1.
- **n8n scheduled trigger** (internal to n8n, not network-exposed) — drives the renewal workflow.

The Draft Webhook shown in `architecture.md`'s Level 3a diagram belongs to Phase 4 (draft generation) and is not part of this change.

## Key Decisions

- **n8n's native credential store is the sole owner of the OAuth token; `accounts.n8n_credential_id` is a reference, never a mirror.** Resolves the "Token storage" question `architect/04-data-model.md` had already flagged as open, and closes the party-review BLOCK where two stores of a refreshing token could diverge.
- **A per-account `sync_cursor` (Gmail `historyId`) is the one column three party-review findings converged on** (fetch correctness, outage recovery, future delete-propagation groundwork) — implemented once here, read by the fetch step, advanced by the write, reset (with the prior value logged) by re-registration.
- **Dedup is a database constraint, not workflow logic** — `UNIQUE (account_id, provider, provider_message_id)` with `ON CONFLICT DO NOTHING`, so a concurrent delivery race is resolved by Postgres rather than by hoping the workflow's lookup-then-insert never races.
- **Renewal cadence reads the account's stored expiry, not a hardcoded provider constant** — a future change to Gmail's ~7-day `watch()` window doesn't silently desync the renewal job's schedule from reality.
- **A failed renewal's re-registration is never considered complete without its catch-up fetch** — this is what actually closes the "silent, permanent data loss during an outage" BLOCK; a re-registration without a completed catch-up is logged as `failed`, not `re-registered`.
- **`emails.provider` and field shapes (arrays/JSONB, not scalars) are pinned now with Outlook in mind, but Outlook itself is not built.** Keeps the follow-on change an adapter, without speculatively building Outlook-specific columns (`graph_client_state` etc.) that would sit unused until that change lands.
- **`category` ships as a nullable column now, not deferred to Phase 2's migration.** The enum/label values remain a Phase 2 decision (spec.md Notes), but the column's existence doesn't force a migration when that decision is made.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Workflows are authored as JSON before an n8n instance exists to import them into | Logic is fully specified in the JSON regardless of import timing; `docs/setup/gmail-ingestion-setup.md` sequences exactly when import happens relative to GCP/Supabase setup |
| Gmail API quirks (e.g. `history.list` pagination, `historyId` expiry window) surface only once tested against a live account | `n8n/fixtures/*.json` let the Email Normaliser and cursor-fetch logic be reasoned about and reviewed before a live test, but AC1/AC3/AC4 still require the real account to actually pass |
| OAuth consent screen requires Google's "unverified app" flow for a personal Gmail account | Accepted risk per the umbrella proposal — self as sole test user; documented explicitly in the setup runbook so it isn't a surprise mid-setup |
| GCP Pub/Sub IAM misconfiguration silently allows unauthenticated publish | Setup runbook states the exact IAM binding (`roles/pubsub.publisher` restricted to `gmail-api-push@system.gserviceaccount.com`) as a checklist item, not prose to interpret |

## Grounding sources

- `architecture.md` (Level 3a — Components: Automation Engine): "Gmail Ingestion ... Pub/Sub trigger, fetch message" and "Email Normaliser ... Maps both providers onto one internal email schema" — workflow names and boundaries in this design match these components directly.
- `architect/04-data-model.md`, "Open questions, still unresolved in the proposal": "**Token storage.** `accounts.credentials` overlaps with n8n's own credential store. Mirroring tokens in both places means two things to keep in sync and two places to leak from." — this design's `accounts.n8n_credential_id` (reference-only) is the resolution of that flagged question, applied to this change's schema.
- `architect/04-data-model.md`, "Who writes what": "Ingestion + Normaliser | `emails`: account_id, thread_id, sender, subject, body, received_at" — confirms `category` must stay untouched by this change's write path, consistent with FR4/NFR6 here.
- `.specclaw/changes/002-ingestion/proposal.md` (as revised 2026-09-06) is the primary source for every FR/NFR/decision above; this design does not introduce anything the proposal didn't already resolve.
