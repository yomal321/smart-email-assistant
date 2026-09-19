-- Phase 4 of 6 (BACKEND-REQUIREMENTS.md §6) — Rules storage, Settings,
-- Activity log, Saved views, Categories. Additive only; no existing table
-- is altered. See PHASE-4-IMPLEMENTATION-PLAN.md Wave 1.

create table rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  enabled boolean not null default true,
  conditions jsonb not null,               -- [{field, operator, value}]
  actions jsonb not null,                  -- [{type, params}]
  condition_summary text not null,
  action_summary text not null,
  daily_cap int,
  confidence_floor int,                    -- required for auto-reply rules; enforced in the API, not a CHECK (conditional on `actions` content)
  created_at timestamptz not null default now()
);

create table rule_runs (                   -- backs "N runs / 30d"; populated once the Rule Engine (Phase 5) runs
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references rules(id),
  email_id uuid references emails(id),
  ran_at timestamptz not null default now()
);

create table settings (                    -- one row per account
  account_id uuid primary key references accounts(id),
  signature text,
  style_samples text,
  summary_length text not null default 'one-line' check (summary_length in ('one-line', 'short')),
  digest_enabled boolean not null default false,
  digest_time text,
  exclusion_rules jsonb not null default '[]'::jsonb,
  retention_days int,                      -- null = "Not set" (BACKEND-REQUIREMENTS.md §8.3) — a real, permanent option, not a missing value
  timezone text not null default 'Asia/Colombo',
  work_hours_start time not null default '09:00',
  work_hours_end time not null default '18:00',
  priority_weights jsonb not null default '{"vip":80,"deadline":65,"direct_question":70,"age":40}'::jsonb
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  at timestamptz not null default now(),
  action text not null,
  target text not null,
  cause text not null,
  undoable boolean not null default false,
  undo_payload jsonb                       -- {table, id, column, previousValue}; null when undoable=false
);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  slug text not null,
  label text not null,
  filters jsonb not null,
  unique (account_id, slug)
);

create table categories (                  -- rename / merge / custom categories; a missing row for a built-in key means "use its default label"
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  key text not null,
  label text not null,
  number int not null,
  merged_into uuid references categories(id),
  unique (account_id, key)
);
