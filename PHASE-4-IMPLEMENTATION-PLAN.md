# Phase 4 Implementation Plan — Settings, Rules Storage, Activity Log, Sync, Search

**Backend build order:** Phase 4 of 6 (see [BACKEND-REQUIREMENTS.md](BACKEND-REQUIREMENTS.md) §6).
**Depends on:** Phase 0 (auth/API tier), Phase 1 (`0005`, messages API), Phase 2 (`0008`/`0009`, actions/drafts API), Phase 3 (`0006`/`0007`, follow-ups/contacts API) — all shipped (specclaw changes `008`–`011`, all built; `008`/`009` verified, `010`/`011` not yet verified but code-complete).
**Unblocks:** Settings, Activity log, Sync clock, Search (command palette + `/`), Rules storage (rules do not *run* until Phase 5 — BACKEND-REQUIREMENTS.md §8.2).

This plan is authored directly (no specclaw lifecycle) at the user's request, following the same wave structure `PHASE-3-IMPLEMENTATION-PLAN.md` used.

**Build status:** all 5 waves below are code-complete (migrations, the n8n workflow edit, types/mappers, API routes, frontend wiring) — `npm run build`, `tsc --noEmit`, and `eslint` all pass. Nothing has been **live-verified** yet (no live Supabase to apply `0010`/`0011` against, no live n8n to activate the new webhook trigger on, no live Gmail account) — this project's own convention (every prior phase's `verify-report.md`) is that "done" means observed against a live deployment, not just code review. Treat this as the pre-verify state Phase 1–3 were in right after their own build step, before their live-deployment pass.

## 1. Why this phase, and what "done" means

Per BACKEND-REQUIREMENTS.md §8.2, five dashboard surfaces are still fixture/local-state-only: Settings (`app/settings/page.tsx` — every field is `defaultValue`, nothing persists, Resync button is inert), Activity log (same page, reads `getActivityLog()` fixture), Sync clock (`/api/sync` GET already reads live `accounts`/`sync_outcomes`, but `queueDepth` is a hardcoded `0` placeholder and there's no resync action), Search (no `/api/search` exists; the command palette's "Resync now" item is a no-op and nothing searches message/contact content beyond the 6 items already loaded client-side), and Rules (`app/rules/page.tsx` — rule list is fixture-seeded local state, the builder's "would have matched N messages" count is `Math.round((value.length * 7 + field.length) % totalMessages)`, i.e. fake, and category Rename/Merge buttons do nothing).

Done means:
- `rules`, `settings`, `activity_log`, `saved_views`, `categories` tables exist and are reachable through a real API.
- Settings page reads/writes one real `settings` row per account instead of uncontrolled `defaultValue` inputs.
- Activity log reads real `activity_log` rows (populated going forward only — BACKEND-REQUIREMENTS.md §8.2 flags this as not retroactive; existing rows from before this phase don't exist, so the table starts empty, which is correct, not a bug).
- Rules CRUD is real; the builder's preview count is a real query against `emails`, not a hash of the input string's length.
- `/api/sync` reports a real `queueDepth`; "Resync now" (Settings page and command palette) actually triggers Gmail re-sync instead of doing nothing.
- `/api/search` exists and the command palette's "Messages"/"Contacts" groups search server-side instead of only ever showing the first 6 fixture-order rows.
- Saved views persist (unblocks the "Save view" affordance in the Smart Inbox filter bar per BACKEND-REQUIREMENTS.md §5.3).

Out of scope for this phase (explicitly deferred, per BACKEND-REQUIREMENTS.md §8.2/§8.3 and this plan's own judgment calls — see §7):
- **Rules actually running** (auto-label/auto-archive/auto-prioritise/auto-draft) — the Rule Engine sub-workflow is Phase 5. This phase only makes rules a durable, queryable, real-preview-count resource.
- **Scheduled retention/auto-purge** — `settings.retention_days` ships as a real column, and the manual "Purge all processed data" button is wired to actually delete (immediate, user-confirmed), but no scheduled n8n job auto-purges on a timer. Per BACKEND-REQUIREMENTS.md §8.3, retention *durations* are an explicitly undecided product question ("Not set" is a real, permanent option) — building a scheduler against an admittedly-undecided policy would be speculative work this plan avoids. Flagged as a fast-follow once that product decision lands, not a blocker.
- **Daily Digest workflow** — listed as "conditional — only if the digest toggle ships" (BACKEND-REQUIREMENTS.md §5.4.B #5). The digest toggle in Settings persists as a real setting in this phase; the scheduled email/notification job that would act on it is deferred for the same reason as retention (no decided channel — mirrors the "Alerting channel" open question `002-ingestion` already carried and never resolved).
- **AI model selector, retention duration options beyond "Not set", category Merge semantics** — stubbed by product decision (BACKEND-REQUIREMENTS.md §8.3), unaffected by this phase.
- **Full-text semantic ranking** — `/api/search` is `tsvector`/`plainto_tsquery`, matching `architect/04-data-model.md`'s "Why no vector column" decision; not revisited here.

## 2. Wave 1 — Migrations (ship together, additive only)

Both are pure additions — no existing table is altered.

### `supabase/migrations/0010_rules_settings_activity.sql`

```sql
create table rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  enabled boolean not null default true,
  conditions jsonb not null,               -- [{field, operator, value}]
  actions jsonb not null,                  -- [{type, params}]
  condition_summary text not null,
  action_summary text not null,
  daily_cap int,
  confidence_floor int,                    -- required for auto-reply rules; enforced in the API, not a CHECK (only auto-reply rules need it)
  created_at timestamptz not null default now()
);

create table rule_runs (                   -- backs "N runs / 30d"
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references rules(id),
  email_id uuid references emails(id),
  ran_at timestamptz not null default now()
);

create table settings (                    -- one row per account
  account_id uuid primary key references accounts(id),
  signature text,
  style_samples text,
  summary_length text not null default 'one-line' check (summary_length in ('one-line','short')),
  digest_enabled boolean not null default false,
  digest_time text,
  exclusion_rules jsonb not null default '[]'::jsonb,
  retention_days int,                      -- null = "Not set" (BACKEND-REQUIREMENTS.md §8.3)
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
  undo_payload jsonb                       -- what it takes to reverse it; null when undoable=false
);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  slug text not null,
  label text not null,
  filters jsonb not null,
  unique (account_id, slug)
);

create table categories (                  -- rename / merge / custom categories
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  key text not null,
  label text not null,
  number int not null,
  merged_into uuid references categories(id),
  unique (account_id, key)
);
```

**Backfill note:** `activity_log` starts empty — it populates going forward only (BACKEND-REQUIREMENTS.md §8.2). `settings` starts with zero rows until the first `GET /api/settings` upserts a default row for the account (see Wave 4) — a missing row is "defaults", not an error. `categories` starts empty too; the API falls back to the 7 built-in `PLATFORMS` (from `lib/data/types.ts`) until a row exists for a given key, so Rename/Merge has something to operate on from day one without a seed migration inventing account-specific data.

### `supabase/migrations/0011_search.sql`

```sql
alter table emails add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body, ''))
  ) stored;

create index emails_search_vector_idx on emails using gin (search_vector);
```

Using a `generated always as ... stored` column instead of a trigger: Postgres maintains it automatically on every insert/update to `subject`/`body`, which is simpler and less failure-prone than a trigger function, and covers every writer (Normaliser, any future backfill job) with no per-writer wiring. `architect/04-data-model.md` already anticipates this column ("Postgres | `emails.search_vector` (generated / trigger-maintained)") — this migration is what makes that line true.

## 3. Wave 2 — n8n workflow changes

| Workflow | Change | Notes |
|---|---|---|
| `n8n/workflows/gmail-renewal-recovery.json` | Add a webhook trigger (`POST /webhook/resync`) in parallel with the existing `Every 6 Hours` schedule trigger, both feeding into the same `Read account state` node. A `Verify secret` code node (same `x-resync-webhook-secret` / `RESYNC_WEBHOOK_SECRET` pattern as `draft-generation.json`'s `Verify secret` node) gates the webhook path only — the schedule path is unaffected and needs no auth. | This is the one genuinely new trigger this phase needs. `POST /api/sync/resync` (Wave 4) calls this webhook so "Resync now" (Settings page and command palette) does something real, instead of the inert button that exists today. |

No other workflow needs editing. Rules do not run yet (Phase 5's Rule Engine), so nothing in Triage/Action Extraction/Draft Generation/Email Normaliser changes. `activity_log` writes are populated by the API tier itself (undo-eligible dashboard mutations — see Wave 4's `/api/undo` note), not by n8n, since every action this phase makes loggable already happens through the Next.js API, not inside a workflow.

## 4. Wave 3 — Types and mappers

`gmail-dashboard/lib/data/types.ts` additions:
- `Settings` interface (mirrors the `settings` table 1:1, camelCased).
- `SavedView` interface: `{ id, slug, label, filters: Record<string, unknown> }`.
- `Category` interface: `{ id, key, label, number, mergedInto: string | null }`.
- `SearchResult` interface: `{ type: "message" | "contact"; id: string; title: string; subtitle: string }` — a small discriminated union is enough for the command palette to render one flat, ranked list instead of two separately-fetched groups.
- Extend `Rule` with optional `conditions`/`actions`/`dailyCap`/`confidenceFloor` (all present when a rule was created through the real builder; the 5 fixture rules that ship as UI seed data never populated these, so they must stay optional rather than required).

New mapper files under `gmail-dashboard/lib/data/` (same convention as `commitment-mapping.ts`/`contact-mapping.ts` — one mapper function per row shape, named column list, `server-only`):
- **`rule-mapping.ts`** — `mapRuleRowToRule(row: RuleRow, runCount30d: number): Rule`. `runCount30d` is computed by the route (a `count` query against `rule_runs` scoped to the last 30 days), not stored on the row, so it's passed in rather than joined inside the mapper.
- **`settings-mapping.ts`** — `mapSettingsRowToSettings(row: SettingsRow): Settings` and the reverse `mapSettingsToUpdate(partial: Partial<Settings>): Partial<SettingsRow>` for `PATCH`.
- **`category-mapping.ts`** — `mapCategoryRowToCategory(row: CategoryRow): Category`.

`activity_log` and `saved_views` rows map closely enough to their camelCase types that a route-local inline map is clearer than a dedicated file (same judgment call `sync/route.ts` already made for `SyncState` — no `sync-mapping.ts` exists either).

## 5. Wave 4 — API routes

All routes follow existing conventions: `middleware.ts` already enforces auth, never `select("*")`, named column-list constants. Every route that writes to a Phase-4 table first resolves the single account row (`lib/supabase/account.ts`'s new `getAccountId(supabase)` helper — the same `.from("accounts").select("id").limit(1).maybeSingle()` lookup `sync/route.ts` already inlines, extracted once now that four different routes need it, not duplicated four times).

**Rules**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/rules` | Joins each rule with its 30-day `rule_runs` count. |
| POST | `/api/rules` `{conditions, actions, conditionSummary, actionSummary, dailyCap?, confidenceFloor?}` | `confidenceFloor` required (400 if missing) when any action in `actions` has `type: "auto-reply"` — BACKEND-REQUIREMENTS.md §5.2's "required for auto-reply rules" is enforced here, not as a DB CHECK, since it's conditional on the row's own JSON content. |
| PATCH | `/api/rules/:id` `{enabled?}` | Toggle only, for this phase — matches `app/rules/page.tsx`'s current UI (a `Switch` per rule; the pencil-icon edit affordance has no open editor to wire yet, and isn't specified beyond the icon existing). |
| DELETE | `/api/rules/:id` | |
| POST | `/api/rules/preview` `{conditions}` | **Replaces the fake `Math.round((value.length * 7 ...))` count.** Translates each `{field, operator, value}` condition into a real Postgres filter against `emails` (field → column: `Sender domain` → `participants` containment check, `Subject` → `ilike`, `Category` → `platform =`, `Confidence` → `confidence >` / `<`, `Has attachment` → `attachments <> '[]'`) and returns `count` from the last 30 days. Conditions this mapping can't express (compound and/or trees — the UI's "+ and/or" button has no wired behavior yet either) return `count: 0` with a `partial: true` flag rather than guessing, so the UI can show an honest "preview not available for this combination" rather than a fabricated number that looks equally confident as a real one. |

**Categories**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | Returns the 7 built-in `PLATFORMS` merged with any `categories` row that overrides a `label` for that `key` — a category with no override row still returns its default label. |
| POST | `/api/categories` `{key, label, number}` | Custom category creation ("+ Create custom category"). |
| PATCH | `/api/categories/rename` `{key, label}` | **By key, not `/api/categories/:id`** — a built-in platform with no override row yet has no `id` to PATCH (`GET` returns `id: null` for it), so this route upserts on the `unique (account_id, key)` constraint instead. Merge is explicitly out of scope (BACKEND-REQUIREMENTS.md §8.3 — "Merge semantics ... need a decision before the endpoint can be specified"); the Merge button stays a disabled no-op, same as today, not silently implemented against an undecided semantic. |

**Settings**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings` | Upserts a default row on first read if none exists (`account_id` PK, `on conflict do nothing` then re-select) so the route never 404s for a fresh account. |
| PATCH | `/api/settings` `{...partial}` | Whitelist-validates each field's type/enum before writing (mirrors `contacts/[id]/vip`'s `typeof value !== "boolean"` 400 pattern) rather than passing the body through. |
| POST | `/api/settings/purge` `{confirm: "PURGE"}` | 400 unless `confirm === "PURGE"` exactly (matches the UI's own confirmation-string gate). Deletes this account's `emails` (cascades to `tasks`/`drafts`/`thread_entries`/`commitments`/`nudges`/`contacts`/`contact_tone_history`... — **note:** none of those FKs currently have `ON CONFLICT`/`ON DELETE CASCADE` defined (checked `0001`–`0009`; all FKs are plain `references`, no cascade clause), so this route must delete children explicitly, in FK-safe order, inside one Supabase multi-statement call, rather than relying on a cascade that doesn't exist. Logged to `activity_log` as a non-undoable entry before executing (so the log survives the purge it describes — write the log row first, then delete, never the reverse, or the purge would erase its own record). |

**Sync & Activity**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sync` | *Edit, not new* — add a real `queueDepth`. Chosen definition: `count(emails) where processed_at is null` (mail ingested but not yet triage-processed). This project has no message broker to instrument (Pub/Sub is fire-and-forget, per `002-ingestion`'s own design) — "queue depth" as BACKEND-REQUIREMENTS.md's "counter table the existing workflows write to" describes would mean inventing a counter nothing currently increments/decrements correctly. Counting unprocessed rows is truthful today, needs no new column, and degrades honestly to 0 when nothing is backlogged, instead of a fabricated metric. |
| POST | `/api/sync/resync` | Calls the new webhook (Wave 2) with the shared secret header; proxies its response the same way `POST /api/drafts` proxies `draft-generation.json` (n8n owns the outcome, this route relays it). Also writes an `activity_log` row (`action: "Resync triggered"`, `undoable: false`). |
| GET | `/api/activity` | Optional `?limit=` (default 50, matches the Settings page table not needing pagination controls yet). |
| POST | `/api/undo/:actionId` | Reads the `activity_log` row by id, 404s if `undoable` is false or the row doesn't exist, otherwise applies `undo_payload` (a `{table, id, column, previousValue}` shape written by whichever mutation route created the log entry) and marks the row `undoable: false` so a second undo attempt 404s instead of double-applying. **Scope note:** only the existing message mutation routes (`archive`/`done`/`snooze`) are wired to *write* an undoable log entry in this phase (they already have a `restore` endpoint from Phase 1 — this route becomes a second, generic path to the same effect, keyed by log entry instead of by message ids). Rule/category/settings changes log as `undoable: false` for now; a generic reverse-any-mutation system is more scope than this phase's "Undo becomes a server call, not local state" requirement (BACKEND-REQUIREMENTS.md §8.2) asks for. |

**Search & saved views**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/search?q=` | `emails` via `search_vector @@ plainto_tsquery('english', q)` (subject/sender snippet as `title`/`subtitle`) unioned with `contacts` via `ilike` on `name`/`email`, each capped at 8, mapped to the shared `SearchResult` shape. Empty/whitespace `q` returns `[]` rather than every row. |
| GET | `/api/saved-views` | |
| POST | `/api/saved-views` `{slug, label, filters}` | |
| DELETE | `/api/saved-views/:id` | |

## 6. Wave 5 — Frontend wiring

- **`app/settings/page.tsx`** — replace every `defaultValue`-only field with a controlled value sourced from a new `useSettings()` hook (fetch-on-mount + optimistic `PATCH`, same shape as `use-sync-state.ts`). Resync button calls `POST /api/sync/resync` and shows a loading state instead of doing nothing. Activity log table switches from `getActivityLog()` (fixture) to `GET /api/activity`. Purge box's `Button` gets a real `onClick` calling `POST /api/settings/purge` behind the existing `purgeConfirm !== "PURGE"` disabled-guard (already correct client-side; it just needs a real request to fire).
- **`app/rules/page.tsx`** — rule list fetches from `GET /api/rules` instead of seeding local state from the fixture; the `Switch` toggle becomes an optimistic `PATCH /api/rules/:id`. `RuleBuilder`'s fake `previewCount` formula is replaced with a debounced call to `POST /api/rules/preview`; "Save rule" POSTs to `/api/rules`. Category rows' "Rename" button opens an inline edit (reusing the existing row layout) that `PATCH`es `/api/categories/:id`; "Merge" stays a no-op (see Wave 4 note). Priority-weighting sliders persist through `PATCH /api/settings` (`priority_weights`) instead of local `useState`.
- **`components/board/command-palette.tsx`** — the "Messages"/"Contacts" groups switch from `messages.slice(0, 6)`/`contacts.slice(0, 6)` (first-N-of-whatever-loaded) to a debounced `GET /api/search?q=` call keyed on the palette's own input value, falling back to the current first-6 behavior only when the query is empty (so the palette isn't blank on open). "Resync now" call sites (here and Settings) both call the same `POST /api/sync/resync`.
- No page needs a net-new route — Activity log lives inside `/settings` (as it already visually does; BACKEND-REQUIREMENTS.md's table lists "Activity log" as its own dashboard surface, but no dedicated `/activity` route exists in `app/`, and this plan doesn't add one — it's a section of the Settings page today and stays that way).

## 7. Judgment calls this plan makes (surfaced, not hidden)

1. **Scheduled retention/purge and Daily Digest are deferred**, not built as inert stubs — see §1. Both are gated on undecided product questions (retention duration options, digest channel), so building the automation now would be guessing at a policy the product hasn't set. The manual purge path *is* built, since "type PURGE to confirm" is an unconditional, already-decided action.
2. **`queueDepth` is redefined** from "a counter table workflows write to" (BACKEND-REQUIREMENTS.md's suggested design) **to "count of unprocessed `emails` rows"** — see Wave 4. Functionally equivalent for this single-mailbox, push-based system; avoids inventing an increment/decrement counter with no natural writer.
3. **Rules preview is a best-effort real query, not a full condition-tree evaluator.** Compound and/or logic (the UI's "+ and/or" button) isn't wired to anything yet either, so a preview endpoint that only handles single conditions matches the builder's actual current capability — extending both together, once and/or is built, is a fast-follow, not a regression introduced here.
4. **Category Merge stays unimplemented.** BACKEND-REQUIREMENTS.md §8.3 already calls this out as blocked on an undecided semantic; this plan does not invent one.
5. **Undo is wired generically at the log-entry level, not per-mutation-type.** Existing per-action `/api/messages/restore` still exists and is unaffected; `/api/undo/:actionId` is additive.

## 8. Acceptance checklist

- [ ] `0010_rules_settings_activity.sql` and `0011_search.sql` applied; both additive, no existing table altered or dropped.
- [ ] `gmail-renewal-recovery.json`'s new webhook path is reachable and gated by `RESYNC_WEBHOOK_SECRET`, without touching the existing 6-hourly schedule path's behavior.
- [ ] `/api/rules`, `/api/rules/:id`, `/api/rules/preview`, `/api/categories`, `/api/categories/:id`, `/api/settings`, `/api/settings/purge`, `/api/activity`, `/api/undo/:actionId`, `/api/search`, `/api/saved-views` all live, reading named column lists only.
- [ ] `/api/sync`'s `queueDepth` reflects real unprocessed-row count instead of a hardcoded `0`.
- [ ] `POST /api/sync/resync` actually re-triggers the renewal workflow.
- [ ] `app/settings/page.tsx` has no remaining `defaultValue`-only field for anything this phase's `settings` table backs; Activity log table reads live data; Purge button is functional.
- [ ] `app/rules/page.tsx`'s rule list, toggle, builder preview, and category rename are all live; no remaining fake-count formula.
- [ ] Command palette search is server-backed for a non-empty query.
- [ ] Architecture docs (`architecture.md`, `architect/04-data-model.md`) updated with the five new tables and the `search_vector` column, matching the pattern `011-followups-contacts-api` used for its own tables.
