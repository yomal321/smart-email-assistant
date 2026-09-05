-- 0001_ingestion_schema.sql
-- Change 002-ingestion (Gmail Ingestion, Phase 1a)
-- Tables: accounts, emails, sync_outcomes
-- See .specclaw/changes/002-ingestion/design.md, "Data Model Changes"

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

comment on column accounts.n8n_credential_id is
  'Reference only, written by Gmail Ingestion / Gmail Renewal & Recovery. The OAuth token itself lives in n8n''s own credential store; this column is never a mirror of it.';

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

comment on column emails.category is
  'Written only by Phase 2''s triage pipeline (not part of this change). Ingestion + Email Normaliser (this change) never write this column.';

-- sync_outcomes: one row per renewal-job run, independent of last_successful_sync (NFR4)
create table sync_outcomes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  outcome text not null check (outcome in ('renewed', 're-registered', 'failed')),
  occurred_at timestamptz not null default now()
);
