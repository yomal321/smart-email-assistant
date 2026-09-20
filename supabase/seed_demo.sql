-- Phase B2 demo seed — Life Load Board.
--
-- Throwaway content in the real Supabase project, not a mock-data code path.
-- Every row carries a deterministic UUID under the reserved 'dddddddd-…'
-- prefix so it is recognisable on sight and removable exactly by
-- unseed_demo.sql. This is NOT a migration: it belongs outside
-- supabase/migrations/ (schema-only) and is not tracked by
-- scripts/ci/check-migrations.mjs.
--
-- Requires 0001-0017 already applied — in particular 0015_plans_notes.sql,
-- which README.md records as "not yet applied live" as of 2026-09-20.
--
-- Idempotent for same-day re-runs (`on conflict (id) do nothing`). Scheduled
-- times are computed relative to `now()` in Asia/Colombo so "today" and "this
-- week" always mean the day this script actually runs — re-running it on a
-- LATER day will not move already-inserted rows forward; run
-- unseed_demo.sql first if you want the demo re-anchored to a new today.
--
-- Run:   psql "$SUPABASE_DB_URL" -f supabase/seed_demo.sql
-- Undo:  psql "$SUPABASE_DB_URL" -f supabase/unseed_demo.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Sources — rename the 0016 placeholders in place, off the colour that
--    collided with --departure (#4f46e5). Matched by the exact seed names so
--    this is a no-op if the user has already renamed them by hand.
-- ---------------------------------------------------------------------------

update sources set name = 'Work', color = '#0f766e', code = 'WK'
  where name = 'Work';
update sources set name = 'MSc — Data Science', color = '#b45309', code = 'DS'
  where name = 'University A';
update sources set name = 'BSc — Software Engineering', color = '#7c3aed', code = 'SE'
  where name = 'University B';

-- ---------------------------------------------------------------------------
-- 2. Courses — six, three per academic source, in the user's own code format.
-- ---------------------------------------------------------------------------

insert into courses (id, source_id, code, name, semester, is_active)
select v.id::uuid, s.id, v.code, v.name, '2026-S1', true
from (values
  ('dddddddd-0000-4000-8000-c00000000001', 'DS', 'HICT 2103', 'Machine Learning'),
  ('dddddddd-0000-4000-8000-c00000000002', 'DS', 'HICT 2110', 'Big Data Systems'),
  ('dddddddd-0000-4000-8000-c00000000003', 'DS', 'HICT 2205', 'Applied Statistics'),
  ('dddddddd-0000-4000-8000-c00000000004', 'SE', 'SENG 3104', 'Distributed Systems'),
  ('dddddddd-0000-4000-8000-c00000000005', 'SE', 'SENG 3110', 'Software Architecture'),
  ('dddddddd-0000-4000-8000-c00000000006', 'SE', 'SENG 3199', 'Capstone Project')
) as v(id, source_code, code, name)
join sources s on s.code = v.source_code
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Commitments — spread across three weeks to exercise every section:
--    overdue, no-deadline, scheduled-today, ranked-today, and a collision
--    week where an MSc exam, a BSc CA and a work deliverable land together.
--
--    `midnight` below is Colombo local midnight *as a UTC instant* — every
--    row is then `midnight + interval`, never `date + time`, because a plain
--    `date + time` produces a naive timestamp that Postgres would silently
--    reinterpret in the session's timezone on insert (the exact bug Wave 1's
--    lib/day-key.ts exists to avoid — no reason for the seed data to
--    reintroduce it one layer down).
-- ---------------------------------------------------------------------------

with today as (
  select
    (((now() at time zone 'Asia/Colombo')::date)::timestamp at time zone 'Asia/Colombo') as midnight
),
src as (
  select
    (select id from sources where code = 'WK') as work,
    (select id from sources where code = 'DS') as ds,
    (select id from sources where code = 'SE') as se
),
crs as (
  select
    'dddddddd-0000-4000-8000-c00000000001'::uuid as ml,        -- DS: Machine Learning
    'dddddddd-0000-4000-8000-c00000000003'::uuid as stats,     -- DS: Applied Statistics
    'dddddddd-0000-4000-8000-c00000000004'::uuid as distsys,   -- SE: Distributed Systems
    'dddddddd-0000-4000-8000-c00000000006'::uuid as capstone   -- SE: Capstone Project
)
insert into tasks (
  id, email_id, task_text, status, origin, priority, confidence,
  type, source_id, course_id, due_at, starts_at, duration_minutes,
  effort_minutes, weight
)
select v.id::uuid, null, v.text, v.status, 'manual', 'normal', null,
       v.type, v.source_id, v.course_id, v.due_at, v.starts_at, v.duration_minutes,
       v.effort_minutes, v.weight
from (
  select
    'dddddddd-0000-4000-8000-000000000001' as id, 'Send the Q3 report' as text, 'todo' as status,
    'task' as type, (select work from src) as source_id, null::uuid as course_id,
    (select midnight from today) - interval '9 days' as due_at, null::timestamptz as starts_at,
    null::int as duration_minutes, 45 as effort_minutes, 4 as weight
  union all
  select
    'dddddddd-0000-4000-8000-000000000002', 'Reconcile last month''s expense report', 'todo',
    'admin', (select work from src), null,
    (select midnight from today) - interval '3 days', null,
    null, 20, 2
  union all
  select
    'dddddddd-0000-4000-8000-000000000003', 'Return the signed vendor NDA', 'todo',
    'admin', (select work from src), null,
    (select midnight from today) - interval '1 days', null,
    null, 10, 2

  -- No deadline at all — the urgency-floor branch (score.ts: null -> 3).
  union all
  select
    'dddddddd-0000-4000-8000-000000000004', 'Refactor the ingestion retry helper', 'todo',
    'task', (select work from src), null,
    null, null,
    null, 90, 2
  union all
  select
    'dddddddd-0000-4000-8000-000000000005', 'Read up on the new Postgres release notes', 'todo',
    'task', (select work from src), null,
    null, null,
    null, 30, 1
  union all
  select
    'dddddddd-0000-4000-8000-000000000006', 'Tidy the capstone repo README', 'todo',
    'task', (select se from src), (select capstone from crs),
    null, null,
    null, 20, 1
  union all
  select
    'dddddddd-0000-4000-8000-000000000007', 'Pick a topic for the stats mini-project', 'todo',
    'task', (select ds from src), (select stats from crs),
    null, null,
    null, 15, 2

  -- Scheduled today — occupies a slot rather than just being owed.
  -- The 18:30 lecture is the fixture that proves the timezone fix: under the
  -- old server-local `toDateString()` bucketing this fell on "tomorrow" from
  -- 18:30 Colombo time onward.
  union all
  select
    'dddddddd-0000-4000-8000-000000000008', 'Standup', 'todo',
    'meeting', (select work from src), null,
    (select midnight from today) + interval '9 hours 15 minutes', (select midnight from today) + interval '9 hours 15 minutes',
    15, 15, 1
  union all
  select
    'dddddddd-0000-4000-8000-000000000009', 'Client call — Acme renewal', 'todo',
    'call', (select work from src), null,
    (select midnight from today) + interval '15 hours', (select midnight from today) + interval '15 hours',
    45, 45, 3
  union all
  select
    'dddddddd-0000-4000-8000-00000000000a', 'HICT 2103 — Lecture 9', 'todo',
    'meeting', (select ds from src), (select ml from crs),
    (select midnight from today) + interval '18 hours 30 minutes', (select midnight from today) + interval '18 hours 30 minutes',
    120, 120, 1

  -- Ranked today — realistic effort spread (30m default was the whole
  -- problem: the load line meant nothing when every row carried it).
  union all
  select
    'dddddddd-0000-4000-8000-00000000000b', 'ML assignment 2 — feature engineering', 'todo',
    'assignment', (select ds from src), (select ml from crs),
    (select midnight from today) + interval '23 hours 59 minutes', null,
    null, 360, 5
  union all
  select
    'dddddddd-0000-4000-8000-00000000000c', 'Confirm the office lease renewal terms', 'todo',
    'admin', (select work from src), null,
    (select midnight from today) + interval '1 days', null,
    null, 30, 3
  union all
  select
    'dddddddd-0000-4000-8000-00000000000d', 'Stats quiz 3 — chapters 5-6', 'todo',
    'quiz', (select ds from src), (select stats from crs),
    (select midnight from today) + interval '2 days', null,
    null, 60, 3

  -- The collision week, ~12 days out: an MSc exam and a BSc CA within two
  -- days of each other, landing the same week as a work deliverable. This is
  -- the case the week strip exists to make visible as a shape.
  union all
  select
    'dddddddd-0000-4000-8000-00000000000e', 'HICT 2103 — Midterm exam', 'todo',
    'exam', (select ds from src), (select ml from crs),
    (select midnight from today) + interval '12 days 10 hours', (select midnight from today) + interval '12 days 10 hours',
    120, 240, 5
  union all
  select
    'dddddddd-0000-4000-8000-00000000000f', 'SENG 3104 — Continuous assessment 2', 'todo',
    'ca', (select se from src), (select distsys from crs),
    (select midnight from today) + interval '13 days', null,
    null, 240, 5
  union all
  select
    'dddddddd-0000-4000-8000-000000000010', 'Deliver the Q4 architecture proposal', 'todo',
    'task', (select work from src), null,
    (select midnight from today) + interval '14 days', null,
    null, 180, 4
  union all
  select
    'dddddddd-0000-4000-8000-000000000011', 'Capstone — sprint 4 demo prep', 'todo',
    'assignment', (select se from src), (select capstone from crs),
    (select midnight from today) + interval '14 days', null,
    null, 120, 3

  -- The rest of this week and next, filling out "This week" and giving the
  -- strip more than one interesting column.
  union all
  select
    'dddddddd-0000-4000-8000-000000000012', 'SENG 3104 — Reading: consensus protocols', 'todo',
    'task', (select se from src), (select distsys from crs),
    (select midnight from today) + interval '3 days', null,
    null, 60, 2
  union all
  select
    'dddddddd-0000-4000-8000-000000000013', 'Renew the team''s design-tool licences', 'todo',
    'admin', (select work from src), null,
    (select midnight from today) + interval '4 days', null,
    null, 15, 2
  union all
  select
    'dddddddd-0000-4000-8000-000000000014', 'Sprint planning', 'todo',
    'meeting', (select work from src), null,
    (select midnight from today) + interval '5 days 11 hours', (select midnight from today) + interval '5 days 11 hours',
    60, 60, 2
  union all
  select
    'dddddddd-0000-4000-8000-000000000015', 'ML assignment 2 — write-up', 'todo',
    'assignment', (select ds from src), (select ml from crs),
    (select midnight from today) + interval '6 days', null,
    null, 180, 4
) as v(id, text, status, type, source_id, course_id, due_at, starts_at, duration_minutes, effort_minutes, weight)
on conflict (id) do nothing;

commit;
