# Tasks: Dashboard Messages API (Backend Phase 1 of 6)

**Change:** 009-dashboard-messages-api
**Created:** 2026-09-14
**Total Tasks:** 9

## Summary

Five waves, bottom-up: schema and the Triage Pipeline edit first (independent of each other), then the shared mapper and the analytics route (both only need the schema), then the routes that depend on the mapper, then the two frontend call sites, then the architecture doc. `app/inbox/page.tsx`, `app/review/page.tsx`, `board-list.tsx`, and any Board Sheet component are deliberately absent — spec.md FR11/FR13 established they need no changes.

## Tasks

### Wave 1 — Schema and the Triage Pipeline edit (independent of each other)

- [ ] `T1` — Migration `0005_dashboard_message_enrichment.sql`
  - Files: `supabase/migrations/0005_dashboard_message_enrichment.sql` (create)
  - Estimate: medium
  - Kind: migration
  - Notes: Exact column list and `emails_platform_check` per design.md's Data Model Changes. Do **not** touch `emails_category_check` or `category` — spec FR1 and design Key Decision 1 are explicit that these stay as `0002` left them. `attachments`, `sla_target_hours`, `is_from_user` get no default beyond what's listed (mostly `null`/`false`) — no writer populates them in this change (FR2).

- [ ] `T2` — Enrich Triage Pipeline's prompt, validator, and write
  - Files: `n8n/workflows/triage-pipeline.json`
  - Estimate: large
  - Kind: impl
  - Notes: Edit exactly three nodes — "Build triage prompt", "Validate triage result", "Write triage success" — per spec FR3/FR4/FR5. Keep `category`/`summary` in the schema and prompt unchanged in wording/position. The `WHERE category IS NULL` guard on the UPDATE stays as-is — only extend its `SET` list and query params. `model_run` is the literal string `'gemini-3.6-flash'` — read from `n8n/workflows/llm-gateway.json`'s HTTP node URL, don't invent or guess a different model id. Do not touch "Execute Workflow Trigger", "Call LLM Gateway", "Write triage failure", or any other workflow file — those are unmodified per NFR3.

### Wave 2 — Depend only on the schema

- [ ] `T3` — Shared `Message` row mapper
  - Files: `gmail-dashboard/lib/data/message-mapping.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: One function mapping an `emails` row (post-migration shape) to the dashboard's `Message` interface (`gmail-dashboard/lib/data/types.ts`), per spec FR6. Synthesizes minimal `Contact` objects from `participants` jsonb (id = the address, `isVip: false`, `messageCount: 0`, etc. — design's Key Decision 3 and Risk 3 are explicit this must read as an honest placeholder, inline-commented as such, not real contact data). `thread: []`. `ai.actionItemIds` via `select id from tasks where email_id = $1` (0 or 1 result — `tasks.email_id` is still `UNIQUE`). `ai` is `null` when `platform is null`. `sla.targetHours: 0` / `sla.state: "ontime"` / `sla.overdueBy: null` when `sla_target_hours is null` (every row, this phase). This is the one place all of that placeholder logic lives — reused by T4 and T5, not reimplemented per-route.

- [ ] `T6` — `GET /api/analytics/volume`
  - Files: `gmail-dashboard/app/api/analytics/volume/route.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: Two grouped-count queries (received by `received_at`, handled by `handled_at`) over the last 14 days, merged into `{ day, received, handled }[]`, zero-filling days with no rows on either side (spec FR9, AC8). Does not use T3's mapper — this route returns aggregate counts, not `Message` objects.

### Wave 3 — Depend on the mapper

- [ ] `T4` — `GET /api/messages`
  - Files: `gmail-dashboard/app/api/messages/route.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T3
  - Notes: `select * from emails order by received_at desc limit 500` (the bound is a named constant with an inline comment per NFR2 — cite spec.md's Edge Cases). Accepts and applies `status`/`platform`/`unanswered` query params server-side per spec FR7, even though this phase's only caller (T7) calls it with none — don't skip implementing the filters just because nothing uses them yet, they're part of the documented contract. Maps each row via T3.

- [ ] `T5` — Six mutation routes
  - Files: `gmail-dashboard/app/api/messages/archive/route.ts` (create), `gmail-dashboard/app/api/messages/done/route.ts` (create), `gmail-dashboard/app/api/messages/snooze/route.ts` (create), `gmail-dashboard/app/api/messages/restore/route.ts` (create), `gmail-dashboard/app/api/messages/[id]/platform/route.ts` (create), `gmail-dashboard/app/api/messages/[id]/star/route.ts` (create)
  - Estimate: large
  - Kind: impl
  - Depends: T3
  - Notes: Exact column effects per spec FR8 — mirror `board-provider.tsx`'s reducer cases (`archive`/`done`/`snooze`/`restore`/`reassign`/`star`) precisely, including `platform` reassignment also setting `confidence = 100`. An unknown id is a silent no-op (empty `updated` array/object in the response), not a 404 — matches the reducer's own tolerant behavior. Each route returns the updated row(s) mapped via T3.

### Wave 4 — Frontend call sites

- [ ] `T7` — `board-provider.tsx`: fetch-on-mount + optimistic mutations
  - Files: `gmail-dashboard/components/board/board-provider.tsx`
  - Estimate: large
  - Kind: impl
  - Depends: T4, T5
  - Notes: Replace the `getMessages()` fixture seed with a `GET /api/messages` fetch on mount (spec FR10) — call with no query params, matching what `getMessages()` returned (everything). `archive`/`done`/`snooze`/`restore`/`reassign`/`star` reducer actions become optimistic-update-plus-API: update local state immediately (existing reducer logic, unchanged), then fire the matching T5 route in the background, following the `useSyncState()`/fetch-hook pattern `008-dashboard-api-foundation` established. `toggleVip` is untouched — it was already local-only before this change (no regression). Do not touch `app/inbox/page.tsx`, `app/review/page.tsx`, or `board-list.tsx` — spec FR11 requires they need no changes; if you find yourself wanting to edit one of them, stop and reconsider rather than expanding scope.

- [ ] `T8` — `app/page.tsx`: wire the volume trend to `/api/analytics/volume`
  - Files: `gmail-dashboard/app/page.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T6
  - Notes: Replace the `getVolumeTrend()` import/call with a `fetch("/api/analytics/volume")` (loading/error handling following `008`'s established pattern). Leave `getAwaitingReply()` exactly as it is — spec FR12 is explicit this stays on fixture data until Phase 3's `commitments` table exists; do not attempt to wire or remove it.

### Wave 5 — Documentation

- [ ] `T9` — Update `architect/04-data-model.md` for the enriched `emails` table
  - Files: `architect/04-data-model.md` (edit)
  - Estimate: small
  - Kind: docs
  - Depends: T1
  - Notes: Reflect migration `0005`'s new columns on `emails`, per the project's established convention of keeping this doc in sync with schema changes (see `006-draft-generation`'s AC8 precedent). A targeted addition to the existing `emails` table description, not a rewrite of the whole document.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
