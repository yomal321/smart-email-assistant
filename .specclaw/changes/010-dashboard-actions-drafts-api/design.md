# Design: Dashboard Actions & Drafts API (Backend Phase 2 of 6)

**Change:** 010-dashboard-actions-drafts-api
**Created:** 2026-09-14

## Technical Approach

Two independent verticals, each following `009`'s bottom-up shape (schema → pipeline → API → frontend), plus one small piece of unfinished business from `009` itself:

- **Tasks vertical:** migration `0009` drops the constraint that currently caps extraction at one task per email; `action-extraction.json`'s `Write task` node is fixed to match (its `ON CONFLICT` clause would otherwise error on every write); four action-item routes; `action-items-provider.tsx` rewired.
- **Drafts vertical:** migration `0008` adds the columns the tone/length/approval-history UI needs; `draft-generation.json` is extended (not just fixed) to accept and use `tone`/`length` and persist `generated_body`; four draft routes, one of which (`POST /api/drafts`) is a server-side proxy to the existing webhook rather than a direct database write; `drafts-provider.tsx` rewired.
- **The `GET /api/messages/:id` gap:** `009` dropped this route for having no caller. Reading `app/drafts/page.tsx` directly shows it now has one — `getMessageById()` (still the fixture function) gates whether a pending draft renders at all (`if (!message) return null`). Building this route and switching that one page's three call sites to it is the difference between "the Drafts page works" and "the Drafts page silently shows nothing once wired to real data." `app/actions/page.tsx`'s single, already-guarded `getMessageById()` call (a cosmetic subject label) is explicitly left alone — see spec.md Notes.

Both verticals share the same conventions `008`/`009` already established and this design does not deviate from: server-only Supabase client, deny-by-default session middleware (untouched), field-minimized column lists, a mapper module per resource, and the reducer-plus-fire-and-forget-mutation shape in providers.

## Architecture

```
Tasks vertical
--------------
n8n: Action Extraction (Write task node fixed)
  ... Validate extraction result (unchanged) ──▶ Outcome? ──▶ Write task
                                                                 │ INSERT ... priority='normal', origin='extracted'
                                                                 │ (no more ON CONFLICT — constraint gone)
                                                                 ▼
                                                    tasks (0009: no UNIQUE, +owner/priority/origin/confidence,
                                                           email_id now nullable)
                                                                 │
                                        ┌────────────────────────┼────────────────────────┐
                                        ▼                        ▼                        ▼
                          GET /api/action-items      POST /api/action-items      PATCH /api/action-items/:id
                          GET .../export.csv          (manual add, email_id=null)  (status/dueDate/priority)
                                        │                        │                        │
                                        └────────────────────────┼────────────────────────┘
                                                                  ▼
                                                    action-items-provider.tsx
                                                    (fetch-on-mount + optimistic mutations)
                                                                  │
                                                                  ▼
                                                         app/actions/page.tsx (unchanged)


Drafts vertical
----------------
gmail-dashboard server                              n8n: Draft Generation
  POST /api/drafts {messageId,tone,length}  ──HTTP──▶  Draft Webhook ... Build draft prompt (+tone/length)
  (holds DRAFT_WEBHOOK_SECRET,                              │
   N8N_DRAFT_WEBHOOK_URL server-side)                        ▼
                                                      Call LLM Gateway (unchanged) ──▶ Validate result
                                                                                             │
                                                                                    Write draft (+generated_body,
                                                                                                  tone, length)
                                                                                             │
                                                                                             ▼
                                                                                     drafts (0008: +tone/length/
                                                                                       generated_body/approved_at/
                                                                                       edit_distance)
                                                                                             │
                              ┌──────────────────────────────────────────────────────────────┼───────────────┐
                              ▼                                                              ▼               ▼
                 GET /api/drafts                                              PATCH /api/drafts/:id   POST /api/drafts/:id/status
                 (also: GET /api/messages/:id, reused from 009's mapper — the fixed missing piece)
                              │                                                              │               │
                              └──────────────────────────────────────────────────────────────┼───────────────┘
                                                                                              ▼
                                                                              drafts-provider.tsx
                                                                              (fetch-on-mount + optimistic mutations)
                                                                                              │
                                                                                              ▼
                                                                     app/drafts/page.tsx (rewired getMessageById calls)
```

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0009_tasks_enrichment.sql` | Create | Drop `tasks_email_id_key`, drop `not null` on `email_id`, add `owner_name`/`owner_email`/`priority`/`origin`/`confidence`, widen `tasks_status_check` (spec FR1) |
| `supabase/migrations/0008_drafts_enrichment.sql` | Create | Add `generated_body`/`tone`/`length`/`approved_at`/`edit_distance`, widen `drafts_status_check` (spec FR7) |
| `n8n/workflows/action-extraction.json` | Edit | `Write task` node only — drop `ON CONFLICT`, add `priority`/`origin` to the insert (spec FR2) |
| `n8n/workflows/draft-generation.json` | Edit | `Verify secret` (read `tone`/`length`), `Build draft prompt` (use them), `Write draft` (persist `generated_body`/`tone`/`length`) (spec FR8/FR9) |
| `gmail-dashboard/lib/data/task-mapping.ts` | Create | `tasks` row → `ActionItem` mapper (spec FR3), mirrors `message-mapping.ts`'s shape |
| `gmail-dashboard/lib/data/draft-mapping.ts` | Create | `drafts` row → `Draft` mapper (spec FR10), plus the word-level `computeEditDistance()` helper (spec FR12) |
| `gmail-dashboard/app/api/action-items/route.ts` | Create | `GET` (FR3), `POST` (FR4) |
| `gmail-dashboard/app/api/action-items/[id]/route.ts` | Create | `PATCH` (FR5) |
| `gmail-dashboard/app/api/action-items/export.csv/route.ts` | Create | `GET`, `text/csv` (FR6) |
| `gmail-dashboard/app/api/drafts/route.ts` | Create | `GET` (FR10), `POST` — proxies to n8n (FR11) |
| `gmail-dashboard/app/api/drafts/[id]/route.ts` | Create | `PATCH` (FR12) |
| `gmail-dashboard/app/api/drafts/[id]/status/route.ts` | Create | `POST` (FR13) |
| `gmail-dashboard/app/api/messages/[id]/route.ts` | Create | `GET` — reuses `message-mapping.ts` unchanged (FR14) |
| `gmail-dashboard/components/board/action-items-provider.tsx` | Edit | Fetch-on-mount + optimistic mutations (FR16) |
| `gmail-dashboard/components/board/drafts-provider.tsx` | Edit | Fetch-on-mount + optimistic mutations, regenerate calls `POST /api/drafts` (FR15) |
| `gmail-dashboard/app/drafts/page.tsx` | Edit | Three `getMessageById()` fixture calls → `GET /api/messages/:id` (FR14/FR15) |
| `gmail-dashboard/.env.local.example` | Edit | Document `DRAFT_WEBHOOK_SECRET`, `N8N_DRAFT_WEBHOOK_URL` (spec NFR4) |
| `architect/04-data-model.md` | Edit | Reflect enriched `tasks`/`drafts` tables (spec FR17) |

No changes to: `app/actions/page.tsx` (its one `getMessageById()` call stays on fixtures — spec Notes), `app/inbox/page.tsx`, `app/review/page.tsx`, `board-provider.tsx`, any Board Sheet component, `middleware.ts`, `lib/auth/session.ts`, `lib/supabase/server.ts`, and every n8n workflow except the two named above.

## Data Model Changes

`supabase/migrations/0009_tasks_enrichment.sql`:

```sql
alter table tasks drop constraint tasks_email_id_key;
alter table tasks alter column email_id drop not null;
alter table tasks
  add column owner_name text,
  add column owner_email text,
  add column priority text not null default 'normal' check (priority in ('urgent','normal','low')),
  add column origin text not null default 'extracted' check (origin in ('extracted','manual')),
  add column confidence int;
alter table tasks drop constraint tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('todo','in-progress','done','dismissed'));
```

`email_id` becomes nullable specifically for `origin = 'manual'` rows (spec.md Notes) — `action-extraction.json`'s `Write task` node always supplies a real `email_id` and is unaffected.

`supabase/migrations/0008_drafts_enrichment.sql`:

```sql
alter table drafts
  add column generated_body text,
  add column tone text check (tone in ('formal','friendly','brief','firm')),
  add column length text check (length in ('brief','standard','detailed')),
  add column approved_at timestamptz,
  add column edit_distance int;
alter table drafts drop constraint drafts_status_check;
alter table drafts add constraint drafts_status_check
  check (status in ('pending','approved','sent','discarded'));
```

## API Changes

**`GET /api/action-items?status=`** — `{ id, text, sourceMessageId, owner, dueDate, priority, status, origin, confidence }[]`, `status` optional.

**`POST /api/action-items`** — `{ text, dueDate }` → the created `ActionItem` (`origin: "manual"`, `email_id: null`, `confidence: null`).

**`PATCH /api/action-items/:id`** — `{ status?, dueDate?, priority? }` (≥1 field) → `{ updated: ActionItem }`.

**`GET /api/action-items/export.csv`** — same filter as the list read; `Content-Type: text/csv`.

**`GET /api/drafts?status=`** — `{ id, messageId, body, generatedBody, tone, length, status, generatedAt, approvedAt, editDistance }[]`.

**`POST /api/drafts`** — `{ messageId, tone, length }` → proxies to n8n `POST /webhook/generate-draft` (`{ email_id: messageId, tone, length }`, header `x-draft-webhook-secret: $DRAFT_WEBHOOK_SECRET`); relays n8n's status code and body shape, mapped to `Draft` on `200`.

**`PATCH /api/drafts/:id`** — `{ body?, tone?, length? }` → `{ updated: Draft }`; `body` also recomputes `editDistance`.

**`POST /api/drafts/:id/status`** — `{ status: "approved" | "sent" | "discarded" }` → `{ updated: Draft }`.

**`GET /api/messages/:id`** — single `Message`, or `404` if not found. Identical mapping to `009`'s list route, one row.

## Key Decisions

1. **`action-extraction.json` gets a query fix, not a prompt rewrite.** `BACKEND-REQUIREMENTS.md` §5.4.A frames "emit many tasks per email" as what the workflow eventually needs, but nothing in this phase's scope requires the *model* to produce more than one task per call — dropping the uniqueness constraint is what makes repeated single-task extraction (across a thread, or a re-run) safe without colliding. Changing the LLM's response schema is a separate, live-verification-gated change deferred to a later phase (spec.md Notes, mirroring `009`'s Key Decision 1 discipline of keeping each phase's model-facing change as narrow as what it actually needs).
2. **Manual action items get a nullable `email_id`, not a required "pick a source message" UI.** `action-items-provider.tsx`'s `addManual(text, dueDate)` signature has no message reference today, and `0003`'s own comment frames the `not null` FK as a hallucination-mitigation device specific to *extracted* tasks — a rationale that doesn't apply to a manually typed item. Relaxing the constraint (rather than growing the manual-add UI to require picking a message) keeps this phase's frontend surface unchanged beyond the provider rewiring itself.
3. **`POST /api/drafts` proxies to n8n rather than writing `drafts` directly.** The alternative — inserting a `pending` row from the API tier and calling the LLM Gateway directly — would duplicate `draft-generation.json`'s cooldown, secret check, regeneration cap, and prompt-injection handling in a second place. Proxying keeps `006-draft-generation`'s guarantees ("no Gmail-send credential," the regeneration cap, the cooldown) enforced in exactly one workflow, matching `BACKEND-REQUIREMENTS.md` §5.3's explicit instruction: "proxy to the existing n8n `generate-draft` webhook, don't reimplement it."
4. **`GET /api/messages/:id` is added back this phase, not left dropped.** `009` explicitly named "no caller" as its reason for dropping it and implied it would return once one existed. `app/drafts/page.tsx`'s `getMessageById()` calls are that caller — verified by reading the file, not assumed from the proposal (spec.md Overview/Notes carry the evidence).
5. **Two new mapper modules (`task-mapping.ts`, `draft-mapping.ts`), not one shared "resource mapper."** `ActionItem` and `Draft` have no structural overlap worth abstracting over (unlike, say, two routes that both return `Message`) — a shared abstraction here would be premature generalization for two call sites each. Follows `message-mapping.ts`'s precedent of "one mapper per resource shape," not "one mapper" full stop.
6. **`edit_distance` is a word-level count, computed in the API layer (`draft-mapping.ts`) against `generated_body`, not `n8n`.** Keeping it in the Next.js tier (rather than adding a Postgres function or an n8n step) matches where `009`'s comparable derived-value logic (`buildSla`) already lives — application-layer computation over raw columns, not stored precomputed values.
7. **`DRAFT_WEBHOOK_SECRET` exists in two places (n8n's environment and the dashboard server's environment) with the same value, not one shared credential store.** No mechanism exists today for the Next.js server and the n8n instance to share a secret store — matching the existing pattern where `SESSION_SECRET`/`DASHBOARD_LOGIN_SECRET` are already dashboard-only env vars with no n8n equivalent. Documented explicitly in `.env.local.example` and spec NFR4 so this isn't a secret two services independently need to be told to rotate together.
8. **`app/actions/page.tsx`'s cosmetic `getMessageById()` call is left unrewired.** Rewiring it would mean either a second per-row fetch pattern or extending `FR14`'s single-message route's caller list for a label that already degrades gracefully when absent — not worth the added round-trips for every row in the list view. Named explicitly (spec.md Notes) rather than silently left as a stray fixture import.

## Risks & Mitigations

- **Risk: migration `0009` and the `action-extraction.json` fix ship out of lockstep.** Once the constraint is dropped, `Write task`'s existing `ON CONFLICT (email_id)` clause errors on every subsequent extraction (an `ON CONFLICT` target must name a real unique/exclusion constraint) — there is no safe order, only "both at once" vs. "extraction is broken in between." *Mitigation:* spec NFR5 states this explicitly; `tasks.md` sequences the migration and the workflow fix in the same wave with an inline reminder that they deploy together, and AC2 requires a live/pinned verification, not just a code read.
- **Risk: the `DRAFT_WEBHOOK_SECRET` duplication (Key Decision 7) drifts** — someone rotates n8n's copy without updating the dashboard's, silently breaking every `POST /api/drafts` call with a `401` relayed from n8n. *Mitigation:* `.env.local.example`'s comment for this var explicitly says "must match the n8n environment variable of the same name" — the single-source-of-truth problem is named, not solved, since no cross-service secret store exists yet.
- **Risk: `edit_distance`'s word-count algorithm gives a confusing number for very short edits** (e.g. a single typo fix on a 200-word draft could still show a large word-difference count depending on the diff strategy). *Mitigation:* spec FR12/Notes fix the unit (words) and baseline (`generated_body`) precisely enough that `tasks.md` can implement a single, unambiguous algorithm — a simple word-array length-and-position diff, not a smarter semantic diff, matching this table's existing role as a rough tuning signal (`app/drafts/page.tsx`'s own label: "What gets edited before sending feeds prompt tuning over time," not a precision metric).
- **Risk: relaxing `tasks.email_id` to nullable could be read as weakening the hallucination-mitigation guarantee `0003`'s comment describes.** *Mitigation:* Key Decision 2 and spec.md Notes are explicit that the relaxation applies only to `origin = 'manual'` rows — every `origin = 'extracted'` row (the ones the hallucination-mitigation argument is actually about) still gets a real `email_id` from `action-extraction.json`, which never writes `null` there. `tasks.md`'s AC2 confirms this with a live extraction run.

## Grounding sources

- `BACKEND-REQUIREMENTS.md` §5.2 (`0008`/`0009` migration blocks), §5.3 (Action items / Drafts endpoint tables), §5.4.A (Action Extraction / Draft Generation workflow-edit rows), §6 ("Phase 2" build-order row) — the source of this phase's scope boundary.
- `n8n/workflows/action-extraction.json`'s `Write task` node (`INSERT ... ON CONFLICT (email_id) DO NOTHING`, read directly) — grounds spec FR2's exact required edit and NFR5's deployment-ordering risk.
- `n8n/workflows/draft-generation.json`'s `Verify secret`/`Build draft prompt`/`Write draft` nodes (read directly) — grounds spec FR8/FR9's precise edit boundaries; confirms today's webhook body is `{ email_id }` only.
- `gmail-dashboard/app/drafts/page.tsx` (read directly: three `getMessageById()` call sites, one gating whether a pending draft renders at all via `if (!message) return null`) — the evidence behind Key Decision 4 and spec FR14/FR15.
- `gmail-dashboard/app/actions/page.tsx` (read directly: its one `getMessageById()` call is subject-line-only and already null-guarded) — the evidence behind Key Decision 8 and spec FR16's Notes.
- `gmail-dashboard/components/board/board-provider.tsx` (read directly) — the fetch-on-mount / optimistic-mutation / fire-and-forget pattern spec FR15/FR16 and this design's provider rewiring follow verbatim.
- `gmail-dashboard/lib/data/message-mapping.ts` (read directly) — the per-resource-mapper convention Key Decision 5 follows, and FR14's direct reuse target.
- `supabase/migrations/0003_action_items_schema.sql` — its own comment ("every task is always checkable against its source email") is the exact rationale Key Decision 2 weighs against manual items' looser sourcing.
- `.specclaw/changes/009-dashboard-messages-api/design.md` — the precedent for dropping (and, here, restoring) a route based on actual caller evidence rather than the proposal's literal list.
