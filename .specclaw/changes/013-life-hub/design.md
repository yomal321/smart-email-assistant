# Design: Life Hub (Phase B1) — Plans, Notes, and the Hub Shell

**Change:** 013-life-hub
**Created:** 2026-09-20

## Technical Approach

Nothing structural is invented here. Every piece of this change has an existing, working template in the repo: the migration follows `0010_rules_settings_activity.sql`'s additive, `account_id`-scoped table shape; the routes follow `app/api/action-items/route.ts`'s `SELECT_COLUMNS` + one-mapper convention; the hooks follow `lib/data/use-rules.ts`'s `{ data, loading, error, ...mutators }` shape with an `AbortController`; the nav change slots into a `RailSection` primitive that already exists and already groups.

The only genuinely new thinking is the plan↔task relationship, and the design there is deliberately minimal: **one nullable FK column.** `tasks.plan_id` is the entire mechanism. No join table, no plan-scoped task copy, no parallel "life task" concept. Because `0009_tasks_enrichment.sql` already dropped the one-task-per-email constraint and made `email_id` nullable for manual rows, the table is already the right shape to hold both kinds of work; this change just gives them a parent.

## Architecture

```
Browser (laptop client)
  │
  ├── /plans ─────────────┐  Server Components (NFR1)
  ├── /plans/:id ─────────┤  + client islands for capture/edit
  └── /notes ─────────────┘    via use-plans.ts / use-notes.ts
        │                        (use-rules.ts's template)
        │
        │   / (Overview) is not in this diagram — untouched by this
        │   change (FR14). The email dashboard and Life are two
        │   separate areas, not one merged page.
        ▼
  middleware.ts — deny-by-default session check (NFR7)
        │
        ▼
  app/api/plans/**        app/api/notes/**       app/api/action-items/[id]
   GET|POST /plans         GET|POST /notes        PATCH (+ planId, FR4)
   GET|PATCH|DELETE         PATCH|DELETE
     /plans/:id              /notes/:id
        │                        │                       │
        └────────────┬───────────┴───────────────────────┘
                     ▼
        lib/data/plan-mapping.ts · note-mapping.ts · task-mapping.ts
          (one mapper per resource, import "server-only", NFR9)
                     │
                     ▼
        getSupabaseServerClient() — service-role, server-only
                     │
                     ▼
  ┌──────────────────────────────────────────────────────┐
  │ plans ──< tasks (plan_id, nullable)                  │
  │   │         ▲                                        │
  │   │         └── also written by Action Extraction     │
  │   │             and POST /api/action-items —          │
  │   │             both unchanged, both leave plan_id null│
  │ notes (search_vector, GIN)                            │
  └──────────────────────────────────────────────────────┘
```

**Navigation, before and after:**

```
 Before                        After
 ─────────────                 ─────────────
 Board                         Email
   Overview                      Inbox
   Inbox                         Action items
   Action items                  Drafts
   Drafts                        Follow-ups
   Follow-ups                    Contacts
   Contacts                    Life            ← new section
   Analytics                     Plans         ← new page
 Platforms   (unchanged)         Notes         ← new page
 Saved views (unchanged)       Insight
                                 Overview
                                 Analytics
                               System
                                 Rules
                                 Settings
                                 Guide
                               Platforms   (unchanged)
                               Saved views (unchanged)
```

## File Changes Map

| File | Action | Description |
|------|--------|--------------|
| `supabase/migrations/0015_plans_notes.sql` | Create | `plans`, `notes` (with generated `search_vector` + GIN), `tasks.plan_id` nullable FK + partial index |
| `gmail-dashboard/lib/data/types.ts` | Modify | Add `Plan`, `Note`, `PlanStatus`; add optional `planId` to `ActionItem` |
| `gmail-dashboard/lib/data/plan-mapping.ts` | Create | `PlanRow` → `Plan`, including derived `taskCount`/`doneCount` |
| `gmail-dashboard/lib/data/note-mapping.ts` | Create | `NoteRow` → `Note` |
| `gmail-dashboard/lib/data/task-mapping.ts` | Modify | Add `plan_id` to `TaskRow` and `planId` to the mapped `ActionItem` |
| `gmail-dashboard/app/api/plans/route.ts` | Create | `GET` (list + derived counts), `POST` (create) |
| `gmail-dashboard/app/api/plans/[id]/route.ts` | Create | `GET` (detail + tasks), `PATCH`, `DELETE` (nulls `plan_id` on its tasks first) |
| `gmail-dashboard/app/api/notes/route.ts` | Create | `GET` (list, optional `?q=` full-text), `POST` |
| `gmail-dashboard/app/api/notes/[id]/route.ts` | Create | `PATCH`, `DELETE` |
| `gmail-dashboard/app/api/action-items/[id]/route.ts` | Modify | Accept optional `planId`; widen the "at least one field" guard to include it |
| `gmail-dashboard/lib/data/use-plans.ts` | Create | Client hook, `use-rules.ts` template |
| `gmail-dashboard/lib/data/use-notes.ts` | Create | Client hook, `use-rules.ts` template |
| `gmail-dashboard/app/plans/page.tsx` | Create | Plans list + inline create |
| `gmail-dashboard/app/plans/[id]/page.tsx` | Create | Plan detail: fields, its tasks, assign/unassign |
| `gmail-dashboard/app/notes/page.tsx` | Create | Capture, list, search |
| `gmail-dashboard/components/station/platform-rail.tsx` | Modify | Regroup `ROUTES` into the four domain `RailSection`s |
| `gmail-dashboard/components/board/command-palette.tsx` | Modify | Register Plans and Notes |
| `architect/04-data-model.md` | Modify | ER diagram + "Who writes what" rows for `plans`, `notes`, `tasks.plan_id` |
| `README.md` | Modify | Phase status table row for Life Hub (Phase B1) |

19 files — 11 created, 8 modified. Of the 8 modified, only one (`app/api/action-items/[id]/route.ts`) is an existing behaviour-bearing API route, and its change is one additional optional field. `app/page.tsx` (Overview) is not in this list — it is not touched (FR14, revised 2026-09-20).

## Data Model Changes

```sql
-- 0015_plans_notes.sql
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
```

## API Changes

| Route | Method | Purpose |
|---|---|---|
| `/api/plans` | `GET` | List plans with derived `taskCount`/`doneCount` |
| `/api/plans` | `POST` | Create — `{ title, description?, targetDate? }`, 400 on empty title |
| `/api/plans/:id` | `GET` | Plan detail plus its tasks; **404** on unknown id |
| `/api/plans/:id` | `PATCH` | `{ title?, description?, status?, targetDate? }` |
| `/api/plans/:id` | `DELETE` | Nulls `plan_id` on its tasks, then deletes the plan |
| `/api/notes` | `GET` | List, reverse-chronological; `?q=` filters via `search_vector` |
| `/api/notes` | `POST` | Create — `{ body, title? }`, 400 on empty body |
| `/api/notes/:id` | `PATCH` | `{ title?, body? }` |
| `/api/notes/:id` | `DELETE` | Delete |
| `/api/action-items/:id` | `PATCH` | **Modified** — additionally accepts `planId: string \| null` |

All inherit `middleware.ts`'s deny-by-default auth; none re-checks the session (NFR7), matching every route written in `008`–`011`.

## Key Decisions

Each of these resolves one of `proposal.md`'s five Open Questions.

- **The rename stops at UI strings.** Product naming in visible copy and metadata changes; the `gmail-dashboard/` directory does not. Renaming the directory would touch every import path, the CI workflow, and the Vercel project configuration for zero functional gain, and it is trivially doable later as its own mechanical change. The cost/benefit is lopsided enough that bundling it here would only put the rest of the change at risk.
- **A plan groups tasks, and nothing else, in B1.** Not emails, not commitments, not notes. Tasks are the only one of those with unambiguous membership semantics — an email can be relevant to three plans, a task belongs to one effort. Grouping more is more schema and more UI for a benefit no real usage has yet argued for. `plan_id` on other tables remains trivially addable later if it does.
- **Plan status is stored; plan progress is derived.** The split matters: `paused` has no representation in the tasks underneath a plan, so status must be stored. Progress, conversely, has exactly one true source — the tasks — so storing a counter would only create something that can drift. This follows the project's existing instinct: `contact_aggregates` is a view, and `yourAvgReplyHours`/`openThreadIds` are computed in `contact-mapping.ts` rather than persisted.
- **Overview is untouched, revised 2026-09-20.** The original design proposed one additive Life block on `app/page.tsx`. The operator explicitly overrode that: the email dashboard stays a separate, self-contained area of the app, not blended with Life on a shared landing page. `app/page.tsx` is therefore not in this change's file list at all — `plans`/`notes` and their pages are the only entry points into Life, reached via the nav regroup (FR11), and `007-web-dashboard`'s spec'd, verified Overview surface is not put at any risk by this change. If a unified "today across email and life" view is ever wanted, that is a new, separate feature to design deliberately — not something this change should produce as a side effect.
- **This change does not wait on verifying `008`–`011`.** Those 34 routes are code-complete but largely unverified. Blocking here would stall on work with no owner or date. The risk is bounded because every route this change adds is a *new file* that does not modify, wrap, or depend on the behaviour of an unverified one — the single existing route touched (`action-items/[id]`) gains one optional field with its own acceptance criterion. Recorded as an accepted risk, not an overlooked one, and `spec.md` states explicitly that verifying `013` verifies nothing about `008`–`011`.
- **Deleting a plan nulls its tasks rather than cascading.** `ON DELETE CASCADE` on `tasks.plan_id` would mean deleting a plan silently deletes work — including email-extracted tasks whose source emails still exist. The FK is deliberately plain, and the `DELETE` route nulls first.
- **Two hooks, not a shared abstraction.** `use-plans.ts` and `use-notes.ts` each follow `use-rules.ts` independently. Same reasoning `task-mapping.ts` records for mappers: two resources with no structural overlap worth generalizing over. Three similar files beat a premature abstraction.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Adding surface on top of `008`–`011`, which are unverified | Every new route is a new file with no dependency on an unverified one; the one modified route has its own AC (AC13). Accepted deliberately — see Key Decisions. |
| The hub quietly starts doing the bot's job (digests, reminders) | `spec.md` FR15 forbids notifications, digests and scheduled jobs in this change outright, not as a guideline |
| `tasks.plan_id` breaking an existing writer | Nullable with no default and no constraint change; Action Extraction and `POST /api/action-items` are untouched and AC13 re-runs them to confirm |
| Deleting a plan destroying work | No `ON DELETE CASCADE`; the `DELETE` route nulls `plan_id` first; AC5 tests exactly this |
| Scope creeping into calendar/habits mid-build | Both are explicitly Out of Scope in `proposal.md` and absent from every task in `tasks.md` |
| The nav regroup orphaning a route someone relies on | AC8 requires every pre-existing page to remain reachable, checked route by route |
| Notes becoming an unusable dumping ground without search | FR10's generated `search_vector` ships in the same migration as the table, not as a follow-up |

## Grounding sources

- `supabase/migrations/0009_tasks_enrichment.sql`: "Manual action items (origin = 'manual') have no source email... `alter table tasks alter column email_id drop not null`" — the precondition that makes FR3's single unified task list possible rather than requiring a parallel table.
- `supabase/migrations/0011_search.sql`: `search_vector tsvector generated always as (...) stored` plus `using gin (search_vector)`, and its comment "`generated always as ... stored` instead of a trigger function: Postgres maintains it on every insert/update to subject/body with no per-writer wiring" — copied wholesale for `notes` (FR10).
- `supabase/migrations/0010_rules_settings_activity.sql`: `account_id uuid not null references accounts(id)` as the shape for every account-scoped table; `plans` and `notes` follow it.
- `gmail-dashboard/app/api/action-items/route.ts`: "Mirrors TaskRow's field list exactly... never `select(\"*\")` (field-minimization convention)" and "Auth is enforced by middleware.ts (deny-by-default) before this handler ever runs" — NFR6 and NFR7 respectively.
- `gmail-dashboard/lib/data/task-mapping.ts`: "One resource, one mapper — mirrors message-mapping.ts's convention rather than a shared 'resource mapper' abstraction" — NFR9 and the two-hooks decision.
- `gmail-dashboard/lib/data/use-rules.ts`: the `{ data, loading, error, ...mutators }` hook shape with `AbortController` cleanup and optimistic update + rollback — the template for `use-plans.ts`/`use-notes.ts`.
- `gmail-dashboard/components/station/platform-rail.tsx:45-78`: three existing `RailSection` groups (`Board`, `Platforms`, `Saved views`) — the primitive that makes FR11 a regroup rather than a rebuild.
- `gmail-dashboard/middleware.ts`: deny-by-default over everything but `/login` and `/api/auth/login` — why the new routes need no auth code.
- `architect/04-data-model.md`: `contact_aggregates` "a SQL view, not a table" and `yourAvgReplyHours`/`openThreadIds` "computed in `contact-mapping.ts` instead, not in SQL" — the derived-not-stored precedent behind FR5.
- `gmail-dashboard/app/api/action-items/[id]/route.ts`: the existing `{status?, dueDate?, priority?}` guard and its silent-no-op-on-unknown-id convention — the code FR4 extends and the convention AC/edge cases had to reconcile against.
