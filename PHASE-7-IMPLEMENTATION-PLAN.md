# Phase 7 Implementation Plan — Life Layer (Habits, Certifications, Weekly Review, Quick Capture)

**Scope:** the five gaps from `Personal_Life_OS_Feature_Specification.md` the user chose to build, minus the two dropped as not worth it and the three already covered:
1. Weekly review screen
2. Goals — **not a new feature, see §0**
3. Habits / routines
4. Career / certifications
5. Quick-capture inbox (undecided-type items)

**Depends on:** 0016/0017 (`sources`, `courses`, `tasks` ranking columns), 0015 (`plans`), `lib/priority.ts`, `lib/day-key.ts` — all reused, none touched structurally.
**Unblocks:** nothing downstream; this is the last of the gaps identified against the spec doc.

Authored directly (no specclaw lifecycle), same as Phases 3–6.

**Build status:** planned, not started.

---

## 0. Why "Goals" costs nothing to build

`plans` (0015_plans_notes.sql) already **is** goal-tracking: `title`, `description`, `target_date`, a stored `status` (active/paused/done/archived), and progress derived at read time from every `tasks` row with that `plan_id` — exactly the spec's Goal shape (Target, Deadline, Milestones-as-tasks, Progress). Building a parallel `goals` table would duplicate it for no reason (ponytail rung 2: reuse what's already here).

The one real gap against the spec's Goal categories (education/career/financial/personal/technical/fitness/projects) is that `plans` has no category — you can't filter "just my career goals" from "just my degree goals." That's a one-column addition, folded into Wave 1 below, plus a dropdown on the existing create form. No new table, no new API route, no new nav entry.

---

## 1. Wave 1 — schema: `supabase/migrations/0021_life_layer.sql`

Additive only, one file, same convention as 0016/0017.

```sql
-- 0021_life_layer.sql
-- Phase 7: habits, certifications, a capture-inbox task type, and a
-- category tag on plans (goals). Additive only -- no existing column
-- retyped, no existing row touched except where a default backfills it.

-- Quick capture: an "undecided" task type. Rows land here with no due date,
-- no weight/effort judgement made yet, and are excluded from the hub's
-- priority queue and workload chart until converted (see task-mapping.ts /
-- priority.ts changes in Wave 2) -- same pattern 0016 used for every other
-- type value, just one more.
alter table tasks drop constraint tasks_type_check;
alter table tasks add constraint tasks_type_check
  check (type in ('task', 'meeting', 'call', 'assignment', 'quiz', 'ca', 'exam', 'admin', 'capture'));

-- Goals category (see plan doc §0) -- nullable, existing plans stay
-- uncategorized until the user tags them.
alter table plans add column category text
  check (category in ('education', 'career', 'financial', 'personal', 'technical', 'fitness', 'projects'));

comment on column plans.category is
  'Optional cross-cutting tag (spec.md Goal categories). Null means uncategorized -- every pre-Phase-7 plan.';

-- Habits. Deliberately thin: name + cadence + a log table, no streak
-- column (computed at read time, same "derived not stored" convention as
-- plan progress) and no per-habit reminder wiring -- spec.md §20 explicitly
-- warns against overbuilding this.
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
-- machinery you already have instead of inventing a second one. plan_id is
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
```

No seed data — every new table starts empty, unlike 0016's `sources` (which had to seed because existing tasks needed a non-null default).

---

## 2. Wave 2 — Quick Capture

**No new table, no new API route.** `POST /api/action-items` already accepts an optional `type`; the only backend change is that `'capture'` is now a legal value (Wave 1). Everything else is exclusion + UI.

### Exclude captures from ranking
`app/api/hub/summary/route.ts` and `app/(hub)/tasks` (wherever `byPriority`/the fortnight-load loop reads `items`) must filter `type !== 'capture'` before ranking/workload — an untyped capture has no real weight/effort yet, so scoring it would inject noise into the priority queue and load chart. One `.filter()` at the top of `route.ts`, right after mapping `taskRows`.

### UI: a strip on the Today page, not a new nav item
Per spec.md's own framing (quick capture lives *on* the dashboard, not behind a door) and to avoid a 9th sidebar entry for a single input box: add a collapsible "Capture" strip at the top of `app/(hub)/page.tsx` —
- A single text input + Enter → `POST /api/action-items { text, type: 'capture' }`.
- Below it, the list of open `type='capture'` rows (already returned by `/api/hub/summary` once Wave-1's type is legal — add `captureItems` to that route's response, filtered from `items` before the ranking exclusion above, so it's one array serving both purposes), each with three one-tap buttons:
  - **Task** → `PATCH /api/action-items/:id { type: 'task' }` (existing route, existing field).
  - **Event** → opens the existing due/starts-at inputs already used elsewhere, then `PATCH { type: 'meeting', startsAt, durationMinutes }`.
  - **Note** → `POST /api/notes { body: text }` then `PATCH /api/action-items/:id { status: 'dismissed' }` (both existing routes) — client-side two-call sequence, no new backend code. The task row is dismissed, not deleted, so nothing is silently lost if the sequence is interrupted between the two calls.

### Bot: out of scope for v1
`/add` already writes a task in one shot and covers "I know what this is." True inbox capture from Telegram (a bare message with no command, landing as `type='capture'` instead of falling through to the LLM free-text budget) would need `assistant-brain.json`'s command detection touched — deferred; not worth spending a slash command and a parsing branch on a case the web strip already covers, until it's clear the web strip isn't enough on mobile.

---

## 3. Wave 3 — Habits

### API: `app/api/habits/route.ts`, `app/api/habits/[id]/route.ts`
- `GET /api/habits` — list, `is null archived_at`, plus each habit's `habit_logs` for the last 14 day-keys (one extra query, `.in('day', last14)`), grouped client-side.
- `POST /api/habits { name, cadence? }` — create.
- `PATCH /api/habits/:id { archivedAt }` — archive (soft delete, matches `archived_at` column; no hard delete route).
- `POST /api/habits/:id/toggle { day }` — the actual check/uncheck action: if a `habit_logs` row exists for `(habit_id, day)`, delete it; else insert one. One route, one round trip, no separate "mark done" / "undo" endpoints.

### UI: `app/(hub)/habits/page.tsx`
A 7-day grid (today + 6 back), one row per habit, tap a day cell to toggle. Streak shown per habit, computed client-side as a pure function (consecutive day-keys ending today or yesterday with a log row) — same "derived, testable, no stored counter" convention as `plan-mapping.ts`'s progress calc. `lib/streak.ts` + `lib/streak.test.ts`, mirroring `priority.ts`/`priority.test.ts`.

No calendar heatmap, no per-habit stats page, no reminders — spec.md's own warning against overbuilding this holds.

### Nav
Add `{ href: "/habits", label: "Habits", icon: Flame }` to `HUB_ROUTES` in `components/hub/hub-shell.tsx`.

---

## 4. Wave 4 — Certifications

### API: `app/api/certifications/route.ts`, `app/api/certifications/[id]/route.ts`
`GET`/`POST`/`PATCH`, same shape as `app/api/plans/route.ts` — explicit `SELECT_COLUMNS`, `getAccountId` on insert, no `select("*")`.

### UI: `app/(hub)/certifications/page.tsx`
List page filtered by status (planned/studying/scheduled/passed/failed/expired — same filter-chip pattern as `app/(hub)/plans/page.tsx`'s `STATUS_FILTERS`), a create form (name, provider, exam date, cost), and on each row a link to its `plan_id` if set ("Study plan →"), or a "Create study plan" button that `POST /api/plans { title: `Study for ${name}`, category: 'career' }` and `PATCH`es the cert's `plan_id` in the same client action.

### Nav
Add `{ href: "/certifications", label: "Certifications", icon: Award }`.

---

## 5. Wave 5 — Weekly Review

Read-only, no schema. A new small route rather than extending `hub/summary/route.ts` further (that file is already 349 lines and answers a different question — "what's ranked right now" vs. "what happened / what's coming").

### API: `app/api/hub/weekly-review/route.ts`
- `completedThisWeek`: `tasks` where `completed_at` in the last 7 days (same window `doneThisWeekCount` in `hub/summary` already uses, but the actual rows, not just the count) — mapped through the existing `mapTaskRowToActionItem`.
- `missed`: open-status tasks (`OPEN_STATUSES`) with `due_at`/`deadline` before now — same predicate `overdueCount` in `hub/summary` already computes, again returning rows instead of a count.
- `upcomingNextWeek`: open tasks due in the next 7 days, reusing `byPriority`.
- `plansProgress`: pass through `GET /api/plans`'s existing derived-progress shape (one extra fetch, or duplicate the same two-query pattern — cheaper to duplicate here than to import a route handler).
- `habitsWeek`: per-habit count of logged days in the last 7 (skipped gracefully — empty array — if Wave 3 hasn't shipped yet, so this wave can ship independently).

### UI: `app/(hub)/review/page.tsx`
Sections matching spec.md §30: Completed / Missed / Upcoming Deadlines / Goals progress / Habits, closing with the four framing questions as static headings above their answering section (not literal AI prompts — no LLM call, this is a read-only report, same zero-cost principle as the bot's slash commands).

### Nav
Add `{ href: "/review", label: "Review", icon: ClipboardCheck }`.

### Bonus, same wave: bot `/week` command
Zero-LLM, same pattern as `/today`/`/urgent`/`/deadlines`/`/vip` in `assistant-brain.json` — one more entry in `KNOWN_COMMANDS`, one more fixed parameterized query (completed-this-week count + missed count + next deadline), one more reply-formatter node, wired into the same `Return result` convergence point. Costs nothing against the Gemini quota and the mobile-first bot is the primary interface per `assistant-bot-phase` — cheap enough to include in this wave rather than deferring.

---

## 6. Build order and estimate

| Wave | New tables | New API routes | New pages | Nav entries |
|---|---|---|---|---|
| 1. Schema | 2 (`habits`, `habit_logs`, `certifications` = 3) | 0 | 0 | 0 |
| 2. Quick Capture | 0 | 0 (reuses existing) | 0 (strip on Today) | 0 |
| 3. Habits | — | 3 routes | 1 | 1 |
| 4. Certifications | — | 2 routes | 1 | 1 |
| 5. Weekly Review | — | 1 route | 1 | 1 (+ 1 bot command) |
| 6. Goals category | (in Wave 1) | 0 (existing PATCH/POST already pass through unknown-to-them fields? **no** — `POST/PATCH /api/plans` need `category` added to their accepted-body allowlist, same one-line pattern as every other optional field in those routes) | 0 (dropdown added to existing create form) | 0 |

Run in this order — Wave 1 blocks everything else; Waves 2–6 are independent of each other and can build/ship in any order or in parallel.

## 7. Tests (ponytail: one runnable check per non-trivial piece, no framework beyond what's already here)
- `lib/streak.test.ts` — the new pure streak function (Wave 3).
- Extend `lib/priority.test.ts` or add a small assertion in `hub/summary`'s existing coverage confirming `type: 'capture'` items never appear in `doToday`/`fortnightLoad` (Wave 2).
- Route-level: follow whatever this repo's existing convention is for the plans/tasks routes (checked at build time — none of `app/api/plans`, `app/api/action-items` currently have dedicated route tests, so no new precedent is being broken by skipping them here either; the pure-function tests above are where this codebase already puts its test weight).

## 8. Explicitly still out of scope (confirmed dropped by the user)
GPA/academic hierarchy, finance, documents, contacts→important-dates, file attachments. Career/certifications here is deliberately the thin cert-record slice from spec.md §16, not the full career dashboard (§15) with CV/portfolio/job-application tracking — that stays unbuilt until asked for.
