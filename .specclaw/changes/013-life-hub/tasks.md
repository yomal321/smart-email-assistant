# Tasks: Life Hub (Phase B1) — Plans, Notes, and the Hub Shell

**Change:** 013-life-hub
**Created:** 2026-09-20
**Total Tasks:** 8

## Summary

Four waves, bottom-up. Wave 1 lands the schema and the type/mapper layer everything else reads through. Wave 2 builds the API on top of it. Wave 3 builds the three UI surfaces — two new pages plus the nav regroup — which are independent of each other and can proceed in parallel once the API exists. Wave 4 updates the two docs that track schema and phase state.

The email dashboard's Overview page (`app/page.tsx`) is not touched anywhere in this task list, per the operator's explicit instruction to keep the email dashboard visibly separate from Life rather than blending them onto one page (spec.md FR14, revised 2026-09-20).

Only one existing behaviour-bearing route is modified in the whole change (`app/api/action-items/[id]/route.ts`, T4), and it gains exactly one optional field.

## Tasks

### Wave 1 — Data foundation

- [ ] `T1` — Migration `0015_plans_notes.sql`
  - Files: `supabase/migrations/0015_plans_notes.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact SQL is in `design.md`'s Data Model Changes — copy it, including the comments, which carry the reasoning for the stored-vs-derived split and the deliberate absence of `ON DELETE CASCADE`. Three things must all be true when done: `plans.status` has its `CHECK`, `notes.search_vector` is `generated always as ... stored` with a GIN index, and `tasks.plan_id` is nullable with a partial index. `0014` belongs to `012-assistant-bot` — do not reuse that number.

- [ ] `T2` — Types and mappers
  - Files: `gmail-dashboard/lib/data/types.ts`, `gmail-dashboard/lib/data/plan-mapping.ts`, `gmail-dashboard/lib/data/note-mapping.ts`, `gmail-dashboard/lib/data/task-mapping.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: Add `Plan`, `Note`, `PlanStatus` to `types.ts`, and `planId` to `ActionItem`. Two new mappers following `task-mapping.ts`'s exact convention — `import "server-only"`, a `<X>Row` interface listing precisely the columns the mapper reads, one `map<X>RowTo<Y>` function, no shared abstraction between them (`design.md` Key Decisions). `plan-mapping.ts` carries the derived `taskCount`/`doneCount`; these are computed from passed-in task rows, never read from a column — there is no such column (FR5). Extend `TaskRow` with `plan_id` and map it to `planId`.

### Wave 2 — API

- [ ] `T3` — Plans and Notes API routes
  - Files: `gmail-dashboard/app/api/plans/route.ts`, `gmail-dashboard/app/api/plans/[id]/route.ts`, `gmail-dashboard/app/api/notes/route.ts`, `gmail-dashboard/app/api/notes/[id]/route.ts`
  - Estimate: large
  - Kind: impl
  - Depends: T2
  - Notes: Full contract table is in `design.md`'s API Changes. Every route declares its own `SELECT_COLUMNS` const mirroring its mapper's row interface — never `select("*")` (NFR6). `account_id` on both `POST` paths comes from `getAccountId()` (`lib/supabase/account.ts`). Three behaviours are easy to get wrong and are each covered by an acceptance criterion: `GET /api/plans/:id` returns **404** on an unknown id (not the silent-no-op convention `action-items/[id]` uses — a detail read has no meaningful empty success); `DELETE /api/plans/:id` must null `plan_id` on the plan's tasks **before** deleting the plan, never cascade (AC5); and `GET /api/notes?q=` treats an empty or whitespace-only `q` as no filter rather than as an error or an empty result.

- [ ] `T4` — Extend `PATCH /api/action-items/:id` with `planId`
  - Files: `gmail-dashboard/app/api/action-items/[id]/route.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: One additional optional field, `planId: string | null`. Two traps: the existing guard reads "at least one of status, dueDate, priority is required" and must be widened to include `planId`, or assigning a plan on its own would 400 (spec.md Edge Cases); and a `planId` naming a non-existent plan must return 400 rather than letting the FK violation surface as a raw 500. Add `plan_id` to this file's `SELECT_COLUMNS` to match T2's widened `TaskRow`. This is the only existing behaviour-bearing route the change touches — keep the diff to exactly this.

### Wave 3 — UI surfaces (independent of each other)

- [ ] `T5` — Plans surfaces
  - Files: `gmail-dashboard/lib/data/use-plans.ts`, `gmail-dashboard/app/plans/page.tsx`, `gmail-dashboard/app/plans/[id]/page.tsx`
  - Estimate: large
  - Kind: impl
  - Depends: T3, T4
  - Notes: `use-plans.ts` follows `use-rules.ts`'s template exactly — `{ data, loading, error, ...mutators }`, `AbortController` cleanup in the effect, optimistic update with rollback on failure. List page shows derived progress per plan and inline creation; detail page shows the plan's fields, its tasks, and assign/unassign via T4's `planId`. A plan with zero tasks renders "no tasks yet", never `0/0` or a divide-by-zero percentage (spec.md Edge Cases). Server Components by default, client islands only where interaction requires them (NFR1).

- [ ] `T6` — Notes surface
  - Files: `gmail-dashboard/lib/data/use-notes.ts`, `gmail-dashboard/app/notes/page.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes: Same hook template as T5. Quick capture at the top, reverse-chronological list, per-note edit and delete, search box wired to `?q=`. A note with a body and no title is the normal case, not an edge case — the list renders a body excerpt as its label (FR2, AC6).

- [ ] `T7` — Hub shell: nav regroup, command palette, product naming
  - Files: `gmail-dashboard/components/station/platform-rail.tsx`, `gmail-dashboard/components/board/command-palette.tsx`, plus user-visible product-name strings and page metadata
  - Estimate: medium
  - Kind: impl
  - Depends: T5, T6
  - Notes: Regroup the existing `ROUTES` array into the four `RailSection`s shown in `design.md`'s before/after diagram — Email, Life, Insight, System — leaving `Platforms` and `Saved views` untouched. Every pre-existing page must remain reachable; AC8 checks this route by route, so verify none was dropped in the regroup. Register Plans and Notes in the command palette the same way existing pages do. Product naming changes cover UI strings and metadata only — **do not rename the `gmail-dashboard/` directory** (`design.md` Key Decisions; it would touch every import, the CI workflow, and the Vercel project config). Do **not** touch `app/page.tsx` (Overview) — it stays a separate, self-contained area of the app, reached through its own Email/Insight sections rather than blended with Life (FR14).

### Wave 4 — Documentation

- [ ] `T8` — Update architecture and status docs
  - Files: `architect/04-data-model.md`, `README.md`
  - Estimate: small
  - Kind: docs
  - Depends: T7
  - Notes: Add `PLANS` and `NOTES` to `04-data-model.md`'s ER diagram with their relationships (`PLANS ||--o{ TASKS`, both `ACCOUNTS ||--o{`), add `plan_id` to the `TASKS` block, and add rows to its "Who writes what" table — `plans`/`notes` written by the dashboard's new routes, `tasks.plan_id` written only by `PATCH /api/action-items/:id`. Add one row to `README.md`'s phase status table for Life Hub (Phase B1), with the state accurate at merge time.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
