# Tasks: Dashboard Actions & Drafts API (Backend Phase 2 of 6)

**Change:** 010-dashboard-actions-drafts-api
**Created:** 2026-09-14
**Total Tasks:** 13

## Summary

Five waves. Wave 1 lands both migrations and both workflow edits — four tasks, code-independent of each other, but T1/T2 must ship together (dropping the constraint without fixing `Write task`'s `ON CONFLICT` clause breaks every subsequent extraction — spec NFR5). Wave 2 builds the two new per-resource mappers plus the one route that needs no new schema at all (`GET /api/messages/:id`, reusing `009`'s existing mapper). Wave 3 is the eight API routes, grouped by resource rather than one-task-per-route (each group shares a mapper and a filter shape), plus documenting the two new env vars the drafts proxy route needs. Wave 4 rewires the two providers and the one frontend file (`app/drafts/page.tsx`) whose `getMessageById()` calls would otherwise silently break once wired to live data. Wave 5 is the architecture doc. `app/actions/page.tsx`, `app/inbox/page.tsx`, `app/review/page.tsx`, `board-provider.tsx`, and every other n8n workflow are deliberately absent — spec.md FR16/AC14 establish they need no changes.

## Tasks

### Wave 1 — Both migrations, both workflow edits (ship as one unit)

- [ ] `T1` — Migration `0009_tasks_enrichment.sql`
  - Files: `supabase/migrations/0009_tasks_enrichment.sql` (create)
  - Estimate: medium
  - Kind: migration
  - Notes: Drop `tasks_email_id_key`; `alter column email_id drop not null` (design.md Key Decision 2 — manual items need this, extracted items are unaffected since `action-extraction.json` never writes `null` there); add `owner_name text`, `owner_email text`, `priority` (default `'normal'`, check `urgent|normal|low`), `origin` (default `'extracted'`, check `extracted|manual`), `confidence int`; drop/recreate `tasks_status_check` to `todo|in-progress|done|dismissed`. Include a header comment stating this migration and T2 must deploy together (spec NFR5, design.md Risks) — same convention `0003`/`0004`'s header comments already use.

- [ ] `T2` — Fix `action-extraction.json`'s `Write task` node
  - Files: `n8n/workflows/action-extraction.json`
  - Estimate: small
  - Kind: impl
  - Notes: Remove `ON CONFLICT (email_id) DO NOTHING` from the `INSERT` (spec FR2) — it targets a constraint T1 removes and would error on every write once T1 lands. Add `priority = 'normal'`, `origin = 'extracted'` explicitly to the insert's column/value list. Do **not** touch `Build extraction prompt`, `Validate extraction result`, or any other node — the LLM still decides one `has_task`/`task_text`/`deadline` per call (design.md Key Decision 1).

- [ ] `T3` — Migration `0008_drafts_enrichment.sql`
  - Files: `supabase/migrations/0008_drafts_enrichment.sql` (create)
  - Estimate: small
  - Kind: migration
  - Notes: Add `generated_body text`, `tone` (check `formal|friendly|brief|firm`), `length` (check `brief|standard|detailed`), `approved_at timestamptz`, `edit_distance int`; drop/recreate `drafts_status_check` to `pending|approved|sent|discarded`. All five new columns stay nullable — no default needed, existing rows simply have `null` (spec Notes, Backfill).

- [ ] `T4` — Extend `draft-generation.json` to accept `tone`/`length` and persist `generated_body`
  - Files: `n8n/workflows/draft-generation.json`
  - Estimate: medium
  - Kind: impl
  - Notes: `Verify secret` (or a node right after it) reads `body.tone`/`body.length` alongside the existing `body.email_id`, defaulting to `'friendly'`/`'standard'` on anything absent or invalid — never rejecting the request over tone/length (spec FR8). `Build draft prompt`'s `system_prompt` appends a tone/length instruction without touching the existing style-sample or prompt-injection-defense wording. `Write draft`'s `INSERT`/`RETURNING` gain `generated_body` (same value as `draft_body` on first write), `tone`, `length` (spec FR9). Leave the cooldown, `Verify secret`'s auth check itself, the 404/429/502 branches, and the "no Gmail-send credential" boundary untouched.

### Wave 2 — New mappers, and the one route needing no new schema

- [ ] `T5` — `tasks` row → `ActionItem` mapper
  - Files: `gmail-dashboard/lib/data/task-mapping.ts` (create)
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: Maps a post-`0009` `tasks` row to `ActionItem` (spec FR3) — `sourceMessageId` = `email_id` (may be `null` for manual items → map to `""`, matching `ActionItem.sourceMessageId: string`'s existing fixture convention for manual adds), `owner` = `"you"` when `owner_name`/`owner_email` are both null else `{name, email}`, `dueDate` = `deadline`, `status` mapped `'open' → 'todo'`, every other status value passed through unchanged (spec Edge Cases — `'open'` only ever appears on pre-`0009` rows).

- [ ] `T6` — `drafts` row → `Draft` mapper + edit-distance helper
  - Files: `gmail-dashboard/lib/data/draft-mapping.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes: Maps a post-`0008` `drafts` row to `Draft` (spec FR10) — `messageId` = `email_id`, `generatedAt` = `created_at`, `editDistance` = `edit_distance`. Also exports `computeEditDistance(current: string, original: string | null): number` — word-level: split both on whitespace, count differing positions plus the absolute length difference; treat `original === null` as `""` (spec FR12, Edge Cases) rather than throwing. Used by T8's `PATCH /api/drafts/:id`.

- [ ] `T7` — `GET /api/messages/:id`
  - Files: `gmail-dashboard/app/api/messages/[id]/route.ts` (create)
  - Estimate: small
  - Kind: impl
  - Notes: Single-row read using `009`'s exact `MESSAGE_COLUMNS` list and `mapEmailRowToMessage` (`gmail-dashboard/lib/data/message-mapping.ts`, unchanged) — `.eq("id", params.id).maybeSingle()`, `404` with `{error}` when not found (spec FR14, AC12). No new dependency on T1/T3 — this route only needed a caller, which T11 (Wave 4) provides.

### Wave 3 — API routes

- [ ] `T8` — Action-item routes
  - Files: `gmail-dashboard/app/api/action-items/route.ts` (create — GET+POST), `gmail-dashboard/app/api/action-items/[id]/route.ts` (create — PATCH), `gmail-dashboard/app/api/action-items/export.csv/route.ts` (create — GET)
  - Estimate: large
  - Kind: impl
  - Depends: T5
  - Notes: `GET` accepts optional `?status=`, maps every row via T5 (spec FR3). `POST {text, dueDate}` inserts `email_id: null, origin: 'manual', confidence: null, status: 'todo', priority: 'normal'` (spec FR4, design Key Decision 2). `PATCH {status?, dueDate?, priority?}` requires ≥1 field, `400` on an empty body (spec FR5, Edge Cases). `export.csv` reuses the same query/filter as `GET`, renders `text/csv` with header `text,dueDate,priority,status,owner` (spec FR6, AC6 — row count must match the JSON list).

- [ ] `T9` — Draft routes
  - Files: `gmail-dashboard/app/api/drafts/route.ts` (create — GET+POST), `gmail-dashboard/app/api/drafts/[id]/route.ts` (create — PATCH), `gmail-dashboard/app/api/drafts/[id]/status/route.ts` (create — POST)
  - Estimate: large
  - Kind: impl
  - Depends: T6
  - Notes: `GET` accepts optional `?status=`, maps via T6 (spec FR10). `POST {messageId, tone, length}` calls n8n's `POST /webhook/generate-draft` server-side (`{email_id: messageId, tone, length}`, header `x-draft-webhook-secret` from `process.env.DRAFT_WEBHOOK_SECRET`, URL from `process.env.N8N_DRAFT_WEBHOOK_URL`) and relays its status/body — `200` mapped via T6, `404`/`429`/`502` passed through as-is, a fetch failure to n8n itself → `502` generic error (spec FR11, AC9). `PATCH {body?, tone?, length?}` — when `body` is present, call T6's `computeEditDistance(body, row.generated_body)` and write both `draft_body` and `edit_distance` together (spec FR12, AC10). `POST .../status {status}` sets `status`, and when `status === 'approved'` stamps `approved_at = now()` only if it's currently null (spec FR13, AC11).

- [ ] `T10` — `.env.local.example`: document the two new n8n-proxy env vars
  - Files: `gmail-dashboard/.env.local.example` (edit)
  - Estimate: small
  - Kind: docs
  - Depends: T9
  - Notes: Add `DRAFT_WEBHOOK_SECRET` (comment: must match the n8n environment variable of the same name — `n8n/workflows/draft-generation.json`'s `Verify secret` node) and `N8N_DRAFT_WEBHOOK_URL`, matching the file's existing per-var comment style (spec NFR4, design Key Decision 7).

### Wave 4 — Frontend rewiring

- [ ] `T11` — `action-items-provider.tsx`: fetch-on-mount + optimistic mutations
  - Files: `gmail-dashboard/components/board/action-items-provider.tsx` (edit)
  - Estimate: medium
  - Kind: impl
  - Depends: T8
  - Notes: Replace the `getActionItems()` fixture seed with a `GET /api/action-items` fetch on mount (`board-provider.tsx`'s `AbortController` + `dispatch({type: "hydrate", ...})` pattern, adapted to this provider's existing `useState` shape). `addManual`/`setStatus` become optimistic-update-plus-API: apply the existing local-state update first, then fire `POST /api/action-items` / `PATCH /api/action-items/:id` in the background (fire-and-forget, matching `board-provider.tsx`'s `postIds`/`patchMessage` helpers — logged on failure, not rolled back). Do not touch `app/actions/page.tsx` (spec FR16 — its `getMessageById()` call stays on fixtures).

- [ ] `T12` — `drafts-provider.tsx` + `app/drafts/page.tsx`: fetch-on-mount, optimistic mutations, real message lookups
  - Files: `gmail-dashboard/components/board/drafts-provider.tsx` (edit), `gmail-dashboard/app/drafts/page.tsx` (edit)
  - Estimate: large
  - Kind: impl
  - Depends: T7, T9
  - Notes: `drafts-provider.tsx`: replace the `getDrafts()` fixture seed with a `GET /api/drafts` fetch on mount; `updateBody`/`setTone`/`setLength` become optimistic-plus-`PATCH /api/drafts/:id`; `setStatus` becomes optimistic-plus-`POST /api/drafts/:id/status`. `app/drafts/page.tsx`: its three `getMessageById(...)` calls (committing view, the pending-drafts list, the approval-history table) switch to fetching from T7's `GET /api/messages/:id` — a small per-id fetch (following `use-sync-state.ts`'s template) rather than the synchronous fixture lookup; each call site handles the loading/not-found state instead of `if (!message) return null` silently hiding the row (spec FR14/FR15, AC13 — this is the fix for the regression this phase exists to prevent). The Regenerate button's `setTimeout` stub is replaced with a real `POST /api/drafts` call (spec FR15).

### Wave 5 — Documentation

- [ ] `T13` — Update `architect/04-data-model.md` for the enriched `tasks` and `drafts` tables
  - Files: `architect/04-data-model.md` (edit)
  - Estimate: small
  - Kind: docs
  - Depends: T1, T3
  - Notes: Reflect both migrations' new columns, per the established convention (`006-draft-generation` AC8, `009`'s T9 precedent). A targeted addition to the existing `tasks`/`drafts` table descriptions, not a rewrite.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
