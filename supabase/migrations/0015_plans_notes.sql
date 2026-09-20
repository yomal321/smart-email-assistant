-- Change 013-life-hub (Life Hub, Phase B1)
-- Additive only: two new tables and one nullable column on tasks. No existing
-- column is dropped, no constraint tightened, no existing row rewritten
-- (spec.md NFR8). 0014 is taken by 012-assistant-bot.

create table plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  title text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'done', 'archived')),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column plans.status is
  'Stored, not derived (spec.md FR6). ''paused'' is a statement of intent that cannot be inferred from the state of the tasks underneath the plan, so a derived status could not express it. Progress, by contrast, IS derived at read time and has no column here -- see plan-mapping.ts.';

create table notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  title text,                              -- nullable: quick capture often has no title (spec.md FR2)
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector
    generated always as (
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
    ) stored
);

-- Same `generated always as ... stored` choice 0011_search.sql made for
-- emails.search_vector, and for the same reason: Postgres maintains it on
-- every insert/update with no per-writer wiring to remember.
create index notes_search_vector_idx on notes using gin (search_vector);

-- The entire plan-to-task mechanism (spec.md FR3). Nullable, so every
-- existing row is valid unchanged and every existing writer -- Action
-- Extraction (005-action-items) and POST /api/action-items (010) -- keeps
-- working untouched, writing no plan_id at all.
alter table tasks add column plan_id uuid references plans(id);

comment on column tasks.plan_id is
  'Nullable. Written only by PATCH /api/action-items/:id (013-life-hub). Null means the task belongs to no plan, which is the state of every row that existed before this migration and every row Action Extraction writes. Deliberately NOT ON DELETE CASCADE -- deleting a plan must never delete the work underneath it (spec.md AC5).';

-- Partial: the overwhelming majority of tasks will have no plan, so indexing
-- only the assigned rows keeps it small and still serves the plan-detail read.
create index tasks_plan_id_idx on tasks (plan_id) where plan_id is not null;
