-- 0016_life_load.sql
-- Turns `tasks` into the one commitment table the hub ranks from: work
-- meetings, client calls, university assignments/quizzes/CAs/exams and plain
-- tasks, all in one row shape distinguished by `type`. They differ in label,
-- not in shape -- each is "a thing with a deadline, belonging to a source,
-- with an effort cost and a weight".
--
-- Additive only. Every existing row stays valid: the new columns are either
-- nullable or carry a default that matches what an email-extracted task
-- already is (type='task', weight=3, effort=30m).

-- Must run before the due_at/source_id backfills below. 0009 added
-- tasks_status_check as NOT VALID specifically to grandfather in rows still
-- carrying 0003's original 'open' status (task-mapping.ts's mapStatus()
-- already treats 'open' as 'todo' on every read) -- but NOT VALID only skips
-- validation for rows that are never written again. Any UPDATE to any
-- column on one of those rows makes Postgres re-check the whole row against
-- the constraint, and 'open' fails it. Without this line, the due_at
-- backfill below throws exactly that error the first time it touches one of
-- those rows -- caught live running this migration on 2026-09-20.
update tasks set status = 'todo' where status = 'open';

create table sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null,                      -- "Work", and one row per university
  kind text not null check (kind in ('work', 'academic')),
  color text not null,                     -- hex; one accent per source, per the quiet-visual rule
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id),
  code text not null,                      -- e.g. 'HICT 2103'
  name text not null,
  semester text,                           -- e.g. '2026-S1'
  is_active boolean not null default true, -- false at semester end; filters finished courses out of pickers
  created_at timestamptz not null default now()
);

create index courses_source_id_idx on courses (source_id) where is_active;

alter table tasks
  add column source_id uuid references sources(id),
  add column course_id uuid references courses(id),
  add column type text not null default 'task'
    check (type in ('task', 'meeting', 'call', 'assignment', 'quiz', 'ca', 'exam', 'admin')),
  -- `deadline` is a DATE and cannot express "exam at 14:00 Friday". Rather
  -- than retype that column -- n8n's action-extraction writes it and the mail
  -- module renders it as a bare date -- `due_at` is the new canonical
  -- to-the-minute due time. Readers coalesce(due_at, deadline::timestamptz);
  -- the tasks API writes both so the mail module keeps working unchanged.
  add column due_at timestamptz,
  -- Scheduled things (meetings, calls, exams) occupy a slot rather than just
  -- being owed by a time. Null for everything that is only due.
  add column starts_at timestamptz,
  add column duration_minutes int,
  add column effort_minutes int not null default 30,
  add column weight int not null default 3 check (weight between 1 and 5),
  add column completed_at timestamptz,
  -- Reserved for recurring lectures/standups (RRULE). Nothing reads or writes
  -- it yet; it exists so adding recurrence later is not a migration on a big
  -- table.
  add column recurrence_rule text;

comment on column tasks.type is
  'One table, one discriminator -- a university exam and a standup are the same row shape with different labels. Defaults to ''task'', which is what every pre-0016 row (email-extracted or manually added) already was.';
comment on column tasks.due_at is
  'Canonical due time, to the minute. `deadline` (date) is kept because n8n''s Action Extraction writes it and the mail module reads it; readers should coalesce(due_at, deadline::timestamptz).';
comment on column tasks.weight is
  '1-5, how much this matters -- a final exam is 5, a standup is 1. Distinct from `priority` (urgent/normal/low), which Action Extraction and the mail UI write; weight is the user''s own judgement and is what the hub''s priority score multiplies by.';
comment on column tasks.effort_minutes is
  'The user''s estimate of work required. Feeds both the priority score and the hub''s daily load line (planned vs capacity).';
comment on column tasks.recurrence_rule is
  'RRULE string. Reserved -- unwritten and unread as of 0016.';

-- Backfill the new due_at from the date-only deadline so existing rows rank
-- correctly from day one. A bare date becomes end-of-day local rather than
-- midnight: a task "due the 25th" is not overdue at 00:01 on the 25th.
update tasks
  set due_at = (deadline + interval '1 day' - interval '1 minute') at time zone 'Asia/Colombo'
  where deadline is not null;

-- Spec's indexes: the hub reads "what is open and due soon", the per-source
-- views read "what is open and due soon *here*".
create index tasks_status_due_at_idx on tasks (status, due_at);
create index tasks_source_due_at_idx on tasks (source_id, due_at);
create index tasks_starts_at_idx on tasks (starts_at) where starts_at is not null;

-- The hub's load line compares today's planned effort against a capacity.
alter table settings
  add column daily_capacity_minutes int not null default 300;

comment on column settings.daily_capacity_minutes is
  'Minutes of real work available on an ordinary day; the denominator of the hub''s "4h30m planned / capacity 5h" line. Default 5h.';

-- Seed the three contexts. Single-operator product, so this is scoped to the
-- one accounts row the rest of the schema already assumes (lib/supabase/
-- account.ts getAccountId). Names are placeholders -- rename in place.
insert into sources (account_id, name, kind, color)
select a.id, v.name, v.kind, v.color
from accounts a
cross join (values
  ('Work',         'work',     '#4f46e5'),
  ('University A', 'academic', '#0891b2'),
  ('University B', 'academic', '#c026d3')
) as v(name, kind, color)
where a.id = (select id from accounts order by id limit 1);

-- Every pre-0016 task came from work email or was typed while working, so
-- Work is the honest default. Left nullable rather than NOT NULL: a fresh
-- database with no accounts row seeds no sources, and a not-null FK would
-- make this migration order-dependent on ingestion having run.
update tasks
  set source_id = (select id from sources where kind = 'work' order by created_at limit 1)
  where source_id is null;
