-- 0021_life_layer.sql
-- Phase 7: habits, certifications, a capture-inbox task type, and a
-- category tag on plans (goals). Additive only -- no existing column
-- retyped, no existing row touched except where a default backfills it.
-- See PHASE-7-IMPLEMENTATION-PLAN.md.

-- Quick capture: an "undecided" task type. Rows land here with no due date,
-- no weight/effort judgement made yet, and are excluded from the hub's
-- priority queue and workload chart until converted (GET /api/hub/summary,
-- components/hub/quick-capture.tsx) -- same pattern 0016 used for every
-- other type value, just one more.
alter table tasks drop constraint tasks_type_check;
alter table tasks add constraint tasks_type_check
  check (type in ('task', 'meeting', 'call', 'assignment', 'quiz', 'ca', 'exam', 'admin', 'capture'));

-- Goals category (spec.md Goal categories) -- nullable, existing plans stay
-- uncategorized until the user tags them.
alter table plans add column category text
  check (category in ('education', 'career', 'financial', 'personal', 'technical', 'fitness', 'projects'));

comment on column plans.category is
  'Optional cross-cutting tag. Null means uncategorized -- every pre-Phase-7 plan. Plans already are goal-tracking (title/target_date/status/derived progress); this is the one field the spec''s Goal shape had that plans did not.';

-- Habits. Deliberately thin: name + cadence + a log table, no streak
-- column (computed at read time -- lib/streak.ts -- same "derived not
-- stored" convention as plan progress) and no per-habit reminder wiring --
-- spec.md's own §20 warns against overbuilding this.
create table habits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null,
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  -- YYYY-MM-DD, the same user-tz day-key string every reader in this repo
  -- already produces via lib/day-key.ts -- not a `date` column, so no
  -- server-tz reparsing anywhere a habit day is compared.
  day text not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

create index habit_logs_habit_id_idx on habit_logs (habit_id);

comment on table habit_logs is
  'One row = one completed day. Toggling off deletes the row rather than storing a boolean -- absence IS the "not done" state, so a streak is just "how many of the last N day-keys have a row," no done/not-done column to keep in sync.';

-- Certifications. Cert-specific facts only (provider/cost/dates/result) --
-- the *prep work* is a Plan (category='career'), reusing the milestone/task
-- machinery already built instead of inventing a second one. plan_id is
-- nullable and optional, same non-cascading convention as tasks.plan_id.
create table certifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  plan_id uuid references plans(id),
  name text not null,
  provider text,
  status text not null default 'planned'
    check (status in ('planned', 'studying', 'scheduled', 'passed', 'failed', 'expired')),
  exam_date date,
  expiry_date date,
  cost numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column certifications.plan_id is
  'Optional link to the study plan backing this cert. Not ON DELETE CASCADE -- deleting the plan must not delete the certification record, same reasoning as tasks.plan_id (0015).';
