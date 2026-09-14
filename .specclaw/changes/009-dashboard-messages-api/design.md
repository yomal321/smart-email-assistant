# Design: Dashboard Messages API (Backend Phase 1 of 6)

**Change:** 009-dashboard-messages-api
**Created:** 2026-09-14

## Technical Approach

Three layers, built bottom-up so each can be verified before the next depends on it: **schema** (migration `0005`, additive-only), **intelligence** (Triage Pipeline's prompt/validator/write extended, same workflow), **surface** (a small, fully-consumed API route set plus the one frontend file — `board-provider.tsx` — that actually gates whether the dashboard shows real data).

The defining decision this design makes, ahead of `proposal.md`'s literal route list: read the actual frontend files before building their backing routes. `app/inbox/page.tsx`, `app/review/page.tsx`, and `app/page.tsx` all derive their view by filtering/sorting the one array `board-provider.tsx` holds — none of them fetch by id or call a dedicated counts/review/overview endpoint. Building those anyway would be speculative code with no caller. This design builds the smaller set that's actually wired to something, and documents the four dropped routes as a resolved, evidence-backed deviation (spec.md's Overview and Notes carry the full reasoning) rather than silently narrowing scope.

## Architecture

```
n8n: Triage Pipeline (edited)
  Build triage prompt ──▶ Call LLM Gateway (unchanged) ──▶ Validate triage result (extended)
                                                                   │
                                                    ok ────────────┼──────── not ok
                                                     ▼                        ▼
                                     Write triage success (extended SET)   Write triage failure (unchanged)
                                                     │
                                                     ▼
                                        emails (20 new columns, migration 0005)
                                                     │
                                                     │  read via lib/supabase/server.ts (008)
                                                     ▼
                              gmail-dashboard/app/api/messages/**  +  /api/analytics/volume
                                                     │
                                    ┌────────────────┼──────────────────────┐
                                    ▼                                       ▼
                     board-provider.tsx (fetch on mount,          app/page.tsx
                     optimistic mutations → the 6 routes)         (fetch /api/analytics/volume,
                                    │                              getAwaitingReply() unchanged)
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
         app/inbox/page.tsx  app/review/page.tsx  Board Sheet
         (unchanged — reads via useBoard())       (unchanged — reads its
                                                    message prop from the
                                                    same array)
```

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0005_dashboard_message_enrichment.sql` | Create | 20 new `emails` columns, `emails_platform_check` (spec FR1/FR2) |
| `n8n/workflows/triage-pipeline.json` | Edit | "Build triage prompt", "Validate triage result", "Write triage success" nodes only (spec FR3–FR5) |
| `gmail-dashboard/app/api/messages/route.ts` | Create | `GET` — list, bounded, maps to `Message[]` (FR6/FR7) |
| `gmail-dashboard/app/api/messages/archive/route.ts` | Create | `POST` (FR8) |
| `gmail-dashboard/app/api/messages/done/route.ts` | Create | `POST` (FR8) |
| `gmail-dashboard/app/api/messages/snooze/route.ts` | Create | `POST` (FR8) |
| `gmail-dashboard/app/api/messages/restore/route.ts` | Create | `POST` (FR8) |
| `gmail-dashboard/app/api/messages/[id]/platform/route.ts` | Create | `PATCH` (FR8) |
| `gmail-dashboard/app/api/messages/[id]/star/route.ts` | Create | `PATCH` (FR8) |
| `gmail-dashboard/app/api/analytics/volume/route.ts` | Create | `GET` — 14-day aggregation (FR9) |
| `gmail-dashboard/lib/data/message-mapping.ts` | Create | Shared DB-row → `Message` mapper (FR6) — one place, reused by list and every mutation's "return the updated row" response |
| `gmail-dashboard/components/board/board-provider.tsx` | Edit | Fetch-on-mount + optimistic-update-plus-API mutations (FR10) |
| `gmail-dashboard/app/page.tsx` | Edit | `getVolumeTrend()` → `fetch("/api/analytics/volume")` only (FR12) |
| `architect/04-data-model.md` | Edit | Reflect the enriched `emails` table (established convention — `006-draft-generation` AC8) |

No changes to: `app/inbox/page.tsx`, `app/review/page.tsx`, `components/board/board-list.tsx`, any Board Sheet component, any other n8n workflow. Spec FR11/FR13 state this as a requirement so verify can confirm it stayed true.

## Data Model Changes

`supabase/migrations/0005_dashboard_message_enrichment.sql`:

```sql
alter table emails
  add column platform            text,
  add column confidence          int,
  add column priority            text check (priority in ('urgent','normal','low')),
  add column priority_score      int,
  add column reasons             jsonb,
  add column tone                text check (tone in ('tense','neutral','warm')),
  add column tone_evidence       text,
  add column tldr                text,
  add column entities            jsonb,
  add column attachments         jsonb,
  add column gmail_url           text,
  add column is_unread           boolean not null default true,
  add column is_starred          boolean not null default false,
  add column status              text not null default 'open'
                                 check (status in ('open','archived','snoozed','done')),
  add column snoozed_until       timestamptz,
  add column handled_at          timestamptz,
  add column handled_action      text check (handled_action in ('archived','done','snoozed')),
  add column sla_target_hours    int,
  add column model_run           text,
  add column processed_at        timestamptz,
  add column is_from_user        boolean not null default false;

alter table emails add constraint emails_platform_check
  check (platform is null or platform in
    ('needs-reply','meeting','invoice','fyi','newsletter','automated','spam-ish'));
```

`emails.category` and `emails_category_check` (5-value, from `0002`) are **not touched** — see design's Key Decisions and spec.md's Notes.

## API Changes

**`GET /api/messages`** — `?status=&platform=&unanswered=` accepted (spec FR7), unused by `board-provider.tsx` in this phase. Returns `Message[]`, `limit 500` bound.

**`POST /api/messages/archive` / `/done` / `/restore`** — `{ ids: string[] }` → `{ updated: Message[] }`

**`POST /api/messages/snooze`** — `{ ids: string[], until: string }` → `{ updated: Message[] }`

**`PATCH /api/messages/:id/platform`** — `{ platform: Platform }` → `{ updated: Message }`

**`PATCH /api/messages/:id/star`** — `{ value: boolean }` → `{ updated: Message }`

**`GET /api/analytics/volume`** — `{ day: string, received: number, handled: number }[]`, 14 entries.

## Key Decisions

1. **`platform` is a new column; `category` and its constraint are untouched.** Lower risk than widening a constraint `004-triage`/`006-draft-generation` depend on being exactly 5 values, and it's what the dashboard's code actually reads. Full reasoning in spec.md Notes.
2. **Four routes from `proposal.md` are not built** (`/api/messages/:id`, `/api/messages/counts`, `/api/review-queue`, `/api/overview`) — investigation showed zero caller for each in the current frontend. Building them would be either dead code or would force more frontend rewiring than this phase's goal justifies. Documented, not silently dropped.
3. **A shared `message-mapping.ts` module, not inline mapping per route.** Six of the eight routes return a `Message`/`Message[]` shape (the list read, and every mutation's "return the updated row"); one mapper keeps the placeholder logic (minimal `Contact` synthesis, empty `thread`, SLA defaults) in exactly one place instead of drifting across files.
4. **`board-provider.tsx` is the only frontend file with real rewiring work**, despite not being named in `proposal.md`'s prose scope — it's the mechanism `app/inbox/page.tsx`/`app/review/page.tsx` depend on. Spec FR10/FR11 make this explicit rather than leaving it implied.
5. **500-row bound and a 14-day analytics window are fixed constants, not configurable.** Real pagination and date-range controls are follow-on work once a live mailbox's actual size is known — inventing a pagination API now, before that's measured, would be speculative.
6. **`sla_target_hours`/`attachments`/`is_from_user` ship as columns with no writer in this phase** — consistent with `008-dashboard-api-foundation`'s established "honest placeholder" pattern (`queueDepth`/`nextRetryAt`) rather than fabricating values or blocking this phase on decisions that belong to Phase 2/3.

## Risks & Mitigations

- **Risk: the Triage Pipeline prompt change regresses `category`/`summary` output quality** (a bigger prompt asking for more fields could dilute the model's attention on the fields it already handles well). *Mitigation:* `category`/`summary` stay in the same `response_schema` positions with unchanged wording (spec FR3); AC2/AC3 require a live-verified run, matching `004-triage`'s own verification discipline, not just a code review.
- **Risk: the 500-row bound silently hides older mail**, and a user with more than 500 emails sees an incomplete board with no indication why. *Mitigation:* NFR2 requires an inline code comment; this is flagged as a known limitation in spec.md's Edge Cases, not hidden — a real fix (pagination) is explicitly named as later-phase work rather than promised here.
- **Risk: the minimal `Contact` synthesis (no real `id`, no VIP/stats) could look like real per-contact data and mislead a reviewer into thinking Phase 3's contacts work is already done.** *Mitigation:* `message-mapping.ts`'s synthesis is inline-commented citing this design doc and `BACKEND-REQUIREMENTS.md`'s contacts-table gap; AC9/AC10 give verify a concrete grep to confirm no contacts-table code snuck in.
- **Risk: dropping four routes from the approved proposal could look like silently under-delivering.** *Mitigation:* spec.md's Overview leads with the reasoning and evidence before any requirement; this design doc repeats it in Key Decisions; nothing about the drop is discovered only by reading a diff.

## Grounding sources

- `BACKEND-REQUIREMENTS.md` §1 — "the ingestion and AI pipeline is real and working, but it produces a *much* thinner record than the dashboard was designed around" — names the exact gap this phase closes.
- `n8n/workflows/triage-pipeline.json` ("Build triage prompt", "Validate triage result", "Write triage success" node contents, read directly) — grounds spec FR3–FR5's exact edit boundaries and the `WHERE category IS NULL` guard that stays unchanged.
- `n8n/workflows/llm-gateway.json` (its own note: "Model id updated 2026-09-08 to 'gemini-3.6-flash' after live verification... 'gemini-2.0-flash' returned a deprecation error") — the source of `model_run`'s literal value (spec FR5), not invented.
- `gmail-dashboard/app/inbox/page.tsx`, `app/review/page.tsx`, `components/board/board-list.tsx` (read directly, confirmed no fixture import beyond `useBoard()`) — the evidence behind Key Decision 2 and 4.
- `gmail-dashboard/app/page.tsx` (read directly: `getAwaitingReply()` and `getVolumeTrend()` are its only two `lib/data` calls) — grounds spec FR12's precise scope.
- `supabase/migrations/0002_triage_schema.sql` / `0003_action_items_schema.sql` — confirm the exact existing constraint/column names this migration must not collide with or accidentally duplicate.
- `.specclaw/changes/008-dashboard-api-foundation/design.md` — the "honest placeholder" pattern (`queueDepth`/`nextRetryAt`) this design's Key Decision 6 reuses verbatim, and the `use-sync-state.ts` fetch-hook pattern spec FR10 follows.
