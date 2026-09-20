# Spec: Life Hub (Phase B1) — Plans, Notes, and the Hub Shell

**Change:** 013-life-hub
**Created:** 2026-09-20
**Status:** 🟡 Draft

## Overview

One migration, four new API route files, two new page surfaces, and a navigation regroup — all inside the existing `gmail-dashboard` Next.js app. Two new tables (`plans`, `notes`) and one nullable FK (`tasks.plan_id`) extend the schema additively; no existing table is altered beyond that one added column, and no existing writer changes behaviour.

The load-bearing design choice is that **plans group the `tasks` rows that already exist** rather than introducing a second task system. `0009_tasks_enrichment.sql` already made `tasks.email_id` nullable for `origin = 'manual'` rows, so a hand-typed life task and an email-extracted action item are already the same shape in the same table. Adding `plan_id` means both can belong to the same plan, and the existing Action items page keeps working untouched.

This spec resolves all five of `proposal.md`'s Open Questions explicitly — the rename boundary, what a plan groups, stored-vs-derived plan state, the Overview question, and whether to block on verifying `008`–`011`. Each resolution and its trade-off is recorded in `design.md`'s Key Decisions rather than left implicit.

## Requirements

### Functional Requirements

- **FR1 — `plans` table and CRUD.** A plan has `title` (required), `description` (nullable), `status`, `target_date` (nullable), and timestamps, scoped by `account_id` like every other account-scoped table (`rules`, `settings`, `saved_views`, `categories` in `0010_rules_settings_activity.sql`). Routes: `GET|POST /api/plans`, `GET|PATCH|DELETE /api/plans/:id`.
- **FR2 — `notes` table and CRUD.** A note has `title` (nullable — quick capture often has none), `body` (required), and timestamps, `account_id`-scoped. Routes: `GET|POST /api/notes`, `PATCH|DELETE /api/notes/:id`.
- **FR3 — `tasks.plan_id`, nullable.** One nullable FK to `plans(id)`. Every existing `tasks` row keeps `plan_id = NULL`, and every existing writer — Action Extraction (`005-action-items`) and `POST /api/action-items` (`010`) — is unmodified and continues to write no `plan_id`. There is exactly one task list in this system, not two.
- **FR4 — Assign and unassign a task to a plan.** `PATCH /api/action-items/:id` accepts one additional optional field, `planId` (a plan UUID, or `null` to unassign), alongside its existing `{ status?, dueDate?, priority? }`. This is the only existing route file this change modifies.
- **FR5 — Plan progress is derived, never stored.** A plan's task counts (total, done) are computed at read time from its `tasks` rows. No denormalized counter column exists to drift out of sync — consistent with how `contact_aggregates` is a view and `yourAvgReplyHours` is computed in `contact-mapping.ts` rather than stored.
- **FR6 — Plan status is stored, not derived.** `plans.status` is one of `active` / `paused` / `done` / `archived`, with a `CHECK` constraint, defaulting to `active`. Stored rather than derived because `paused` is a statement of intent that cannot be inferred from the state of the tasks underneath it.
- **FR7 — Plans list page** (`/plans`). Lists plans with derived progress (FR5), grouped or filterable by status, with inline creation of a new plan.
- **FR8 — Plan detail page** (`/plans/:id`). Shows the plan's fields, its tasks, and the controls to edit the plan and to assign/unassign tasks (FR4).
- **FR9 — Notes page** (`/notes`). Quick capture at the top, reverse-chronological list below, edit and delete per note.
- **FR10 — Note search.** `notes` carries a `search_vector` generated column with a GIN index, following `0011_search.sql`'s `emails.search_vector` pattern exactly (`generated always as ... stored`, so Postgres maintains it with no per-writer wiring). `GET /api/notes?q=` filters against it.
- **FR11 — Navigation regrouped into domains.** `components/station/platform-rail.tsx` already renders grouped nav via its `RailSection` component (today: `Board`, `Platforms`, `Saved views`). This change regroups the existing entries and adds one section: **Email** (Inbox, Action items, Drafts, Follow-ups, Contacts), **Life** (Plans, Notes), **Insight** (Overview, Analytics), **System** (Rules, Settings, Guide). `Platforms` and `Saved views` are unchanged.
- **FR12 — Command palette entries.** Plans and Notes register in `components/board/command-palette.tsx` the same way existing pages do, so both are reachable by keyboard without touching the nav.
- **FR13 — Product naming in UI.** User-visible strings and page metadata stop describing the product as a Gmail dashboard. The `gmail-dashboard/` directory itself is **not** renamed (see Out of Scope in `proposal.md` and Key Decisions in `design.md`).
- **FR14 — Overview is untouched.** `app/page.tsx` is not modified by this change at all — no new section, no new import, no new component mounted on it. The email dashboard (Overview, Inbox, Action items, Drafts, Follow-ups, Contacts, Analytics) and the Life section (Plans, Notes) are kept visibly separate, reached through their own sidebar sections, per the operator's explicit instruction not to blend them.
- **FR15 — No notifications, digests, or push from the hub.** Proactive messaging is `012-assistant-bot`'s job by design. No scheduled job, no email, no push is added by this change.

### Non-Functional Requirements

- **NFR1 — Server Components by default**, per `007-web-dashboard`'s NFR2 stack convention; client components only where interactivity requires it, matching how `use-rules.ts` and its consumers are structured today.
- **NFR2 — Full dark-mode parity** for every new surface (`007-web-dashboard` FR6).
- **NFR3 — WCAG AA contrast (4.5:1)** on all new UI (`007-web-dashboard` NFR3).
- **NFR4 — Responsive down to 375px** (`007-web-dashboard` NFR5) — the hub is the laptop client, but it must not break on a phone.
- **NFR5 — Full keyboard operability** (`007-web-dashboard` FR10), including the new command-palette entries.
- **NFR6 — Field minimization.** Every new route declares an explicit `SELECT_COLUMNS` constant mirroring its mapper's row interface — never `select("*")`, matching `app/api/action-items/route.ts`'s stated convention.
- **NFR7 — Auth is middleware's job.** New routes do not re-check the session cookie; `middleware.ts` is deny-by-default over everything except `/login` and `/api/auth/login`, and new `/api/**` paths inherit that automatically.
- **NFR8 — Additive-only schema.** No column is dropped, no constraint on an existing column is tightened, no existing row is rewritten. The change is reversible by `git revert` plus dropping two tables and one column.
- **NFR9 — One mapper per resource.** `lib/data/plan-mapping.ts` and `lib/data/note-mapping.ts` follow `task-mapping.ts`/`message-mapping.ts`'s one-resource-one-mapper convention (`import "server-only"`, a `<X>Row` interface, a `map<X>RowTo<Y>` function) rather than a shared generic abstraction.

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1.** Creating a plan via the Plans page produces a `plans` row with `status = 'active'` and the correct `account_id`, and it appears in the list without a manual refresh.
- **AC2.** Assigning an existing **email-extracted** task (`origin = 'extracted'`) and an existing **manual** task (`origin = 'manual'`) to the same plan both succeed, and the plan detail page shows both — demonstrating the single unified task list (FR3).
- **AC3.** A plan's displayed progress matches a direct `SELECT count(*) FILTER (WHERE status = 'done'), count(*) FROM tasks WHERE plan_id = $1` against the database — confirming it is derived, not stored (FR5).
- **AC4.** Setting a plan to `paused` persists and survives a reload, and the plan's tasks are unaffected — confirming status is stored independently of task state (FR6).
- **AC5.** Deleting a plan that has tasks assigned does not delete those tasks; they return to `plan_id = NULL` and remain visible on the Action items page.
- **AC6.** Capturing a note with a body and no title succeeds (FR2's nullable title), and appears at the top of the Notes list.
- **AC7.** `GET /api/notes?q=<term>` returns only notes whose title or body matches, verified against a note created specifically for the test — confirming the generated `search_vector` and GIN index work (FR10).
- **AC8.** The sidebar renders the four domain sections in the FR11 order, every pre-existing page is still reachable from it, and no previously-reachable route became orphaned.
- **AC9.** Plans and Notes are both reachable from the command palette by keyboard alone, with no mouse (FR12, NFR5).
- **AC10.** `app/page.tsx` is byte-for-byte unchanged by this change — confirmed by diffing against the pre-change file (FR14). The email dashboard and the Life section remain two visibly separate areas of the app, reached only through their own sidebar sections.
- **AC11.** Every new surface passes a dark-mode and 375px-width pass, and contrast is checked at AA on the new text and status colours (NFR2/NFR3/NFR4).
- **AC12.** A schema review confirms: `plans` and `notes` both carry a `NOT NULL account_id` FK; `tasks.plan_id` is nullable with an index; `plans.status` has a `CHECK` constraint; `notes.search_vector` is `generated always as ... stored` with a GIN index; and `architect/04-data-model.md`'s ER diagram reflects all three.
- **AC13.** `tsc --noEmit` and `eslint` both pass, and a run of the existing Action items page confirms `POST /api/action-items` and Action Extraction still write tasks successfully with `plan_id` left null (FR3's no-regression claim).

## Edge Cases

- **A task assigned to a plan, then the plan is deleted.** `tasks.plan_id` is set null by the delete path (no `ON DELETE CASCADE` — deleting a plan must never delete work). Covered by AC5.
- **A note with a body but no title.** Expected and supported (FR2) — the list renders a body excerpt as its label.
- **A plan with zero tasks.** Progress renders as "no tasks yet" rather than `0/0` or a divide-by-zero percentage.
- **An email-extracted task assigned to a plan, then its source email is archived.** Unaffected — `plan_id` and `email_id` are independent, and nothing in this change touches the message mutation routes.
- **`PATCH /api/action-items/:id` called with `planId` pointing at a non-existent plan.** The FK rejects it; the route returns a 400 rather than a raw 500, consistent with its existing validation style.
- **`PATCH /api/action-items/:id` called with only `planId` and no other field.** Must succeed — the route's existing "at least one of status, dueDate, priority is required" guard has to be widened to include `planId`, or assigning a plan alone would 400.
- **An unknown plan id on `GET /api/plans/:id`.** Returns 404 — unlike `PATCH /api/action-items/:id`'s silent-no-op convention for unknown ids, a detail read has no meaningful empty success to return.
- **Notes search with an empty or whitespace-only `q`.** Treated as no filter, returning the full list, rather than an error or an empty result.

## Dependencies

- Existing `tasks` table with `origin`/`email_id` nullable semantics (`0009_tasks_enrichment.sql`) — the precondition for FR3's unified list.
- `accounts` table and `getAccountId()` (`lib/supabase/account.ts`) for the `NOT NULL account_id` FK on both new tables.
- `getSupabaseServerClient()` (`lib/supabase/server.ts`), the service-role server-only client every route already uses.
- `middleware.ts`'s deny-by-default auth (NFR7) — no new auth work.
- `components/station/platform-rail.tsx`'s existing `RailSection` grouping primitive (FR11) — the reason the hub shell is a small change.
- `0011_search.sql`'s `search_vector` pattern as the template for FR10.
- Migration `0015` — `0014_bot_notifications.sql` is taken by `012-assistant-bot`.

## Notes

- `proposal.md`'s five Open Questions are all resolved in `design.md`'s Key Decisions: UI-only rename, plans group tasks only, status stored / progress derived, Overview left fully untouched (revised 2026-09-20 per explicit instruction to keep the email dashboard visibly separate from Life, not blended into it), and proceed without blocking on `008`–`011` verification.
- Calendar/events and habits/routines remain out of scope and unstarted; they are sequencing, not cuts, and each warrants its own proposal (`proposal.md`, Out of Scope).
- Teaching `012-assistant-bot` to read `plans` and `notes` is named as a follow-up to that change, not part of this one. When it happens, the bot's free-text shortlist gains two sources and its slash-command set likely gains one or two entries.
- This change's verification does **not** constitute verification of `008`–`011`. Those remain outstanding independently.
