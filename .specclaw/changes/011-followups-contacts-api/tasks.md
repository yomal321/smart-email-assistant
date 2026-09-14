# Tasks: Follow-ups & Contacts API (Backend Phase 3 of 6)

**Change:** 011-followups-contacts-api
**Created:** 2026-09-14
**Total Tasks:** 15

## Summary

Seven waves. Wave 1 lands both migrations — independent of each other, but both must be live before Wave 2's normaliser edits deploy (spec NFR5; design.md Risks). Wave 2 is the ingestion/normaliser side: the one-line sent-mail watch change, then three edits to `email-normaliser.json` building on each other (`is_from_user` → the two new synchronous writes → the new fan-out branch, which references Wave 3's workflow by name). Wave 3 is the one genuinely new n8n workflow. Wave 4 builds the two new mappers plus the edit to the existing message mapper that closes the two placeholders it has carried since `009`/`010`. Wave 5 is the seven API routes, grouped by resource (commitments+nudges, contacts) matching `010`'s precedent. Wave 6 rewires the two frontend routes that have never had a provider layer at all, plus the one-line addition to `board-provider.tsx`'s existing `toggleVip`. Wave 7 is the architecture docs. `app/actions/page.tsx`, `app/inbox/page.tsx`, `app/review/page.tsx`, `app/drafts/page.tsx`, `gmail-ingestion.json` (confirmed to hold no `watch()` call), and every Triage/Action-Extraction/Draft-Generation node are deliberately absent — spec.md AC18 establishes they need no changes.

## Tasks

### Wave 1 — Schema (both migrations; must be live before Wave 2 deploys)

- [x] `T1` — Migration `0006_threads_and_contacts.sql`
  - Files: `supabase/migrations/0006_threads_and_contacts.sql` (create)
  - Estimate: medium
  - Kind: migration
  - Notes: `alter table emails add column is_from_user boolean not null default false`; create `thread_entries` (`id`, `email_id references emails(id)`, `author_is_you`, `author_name`, `at`, `gist`); create `contacts` (`id`, `account_id references accounts(id)`, `name`, `email not null`, `domain`, `avatar_url`, `is_vip default false`, `unique(account_id, email)`); create `contact_tone_history` (`contact_id references contacts(id)`, `month date`, `tone check (tense|neutral|warm)`, `primary key(contact_id, month)`); create `contact_aggregates` view (`contact_id`, `message_count`, `last_contact_at`) per design.md's exact SQL (spec FR3). Header comment: this migration and Wave 2's `email-normaliser.json` edits must deploy together — the workflow's new write nodes target these tables (spec NFR5, design.md Risks).

- [x] `T2` — Migration `0007_commitments.sql`
  - Files: `supabase/migrations/0007_commitments.sql` (create)
  - Estimate: small
  - Kind: migration
  - Notes: create `commitments` (`id`, `email_id references emails(id)`, `direction check (you-promised|promised-to-you)`, `text`, `trigger_sentence`, `counterparty_id references contacts(id)`, `due_date`, `status default 'open' check (open|met|missed)`, `confidence int not null`, `created_at`); create `nudges` (`id`, `commitment_id references commitments(id)`, `email_id references emails(id)`, `body`, `sent_at timestamptz` nullable) (spec FR4). Same header-comment convention as T1 re: deploy ordering.

### Wave 2 — Sent-mail ingestion + normaliser writes

- [x] `T3` — `gmail-renewal-recovery.json`: widen both `watch()` calls to include `SENT`
  - Files: `n8n/workflows/gmail-renewal-recovery.json` (edit)
  - Estimate: small
  - Kind: impl
  - Notes: Change `labelIds` from `["INBOX"]` to `["INBOX","SENT"]` in both the `"Call watch()"` node and the `"Re-register watch()"` node — the only two `watch()` calls in this file (spec FR1; design.md's Overview correction — `gmail-ingestion.json` has no `watch()` call and is untouched). No other node in this file changes.

- [x] `T4` — `email-normaliser.json`: `Normalize` sets `is_from_user`, `Upsert email` persists it
  - Files: `n8n/workflows/email-normaliser.json` (edit)
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: `Normalize`'s returned JSON gains `is_from_user: (rawMessage.labelIds || []).includes('SENT')`, computed from the same `rawMessage.labelIds` the existing `labels` field already reads (spec FR2). `Upsert email`'s `INSERT`/`VALUES`/`queryReplacement` gain `is_from_user` in the column list, and `Format output` passes it through in its returned `json` (spec FR5). Do not touch `Upsert email`'s `ON CONFLICT` clause or any other column.

- [x] `T5` — `email-normaliser.json`: new `Upsert contacts` + `Insert thread_entries` nodes
  - Files: `n8n/workflows/email-normaliser.json` (edit)
  - Estimate: large
  - Kind: impl
  - Depends: T1, T4
  - Notes: Two new Postgres nodes, inserted between `Inserted?`'s true output and the existing `Call Triage Pipeline`/`Call Action Extraction` branches (design.md Key Decision 1 — synchronous, not fire-and-forget, since Wave 3's counterparty lookup needs the contact row to already exist with no race). `Upsert contacts`: one query over `Normalize`'s `participants` array, upserting every participant **except** the `from` participant on an `is_from_user = true` email (that's the account owner — design.md Key Decision 2) into `contacts` (`account_id`, `name`, `email`, `domain` parsed from the address, `is_vip` defaulted) with `on conflict (account_id, email) do update set name = coalesce(excluded.name, contacts.name)` — never touching `is_vip` on conflict (spec FR6, AC4/AC5). `Insert thread_entries`: one row per normalized email — `author_is_you = is_from_user`, `author_name` = the `from` participant's `name ?? address`, `at = received_at`, `gist` = first 200 characters of `body` (trimmed, `…`-suffixed if truncated) (spec FR7, AC6). Reposition the existing fan-out (`Call Triage Pipeline`/`Call Action Extraction`) to run after these two nodes instead of directly off `Inserted?` — their inputs and non-blocking `waitForSubWorkflow: false` settings do not change.

- [x] `T6` — `email-normaliser.json`: new `Call Commitment Extraction` fan-out branch
  - Files: `n8n/workflows/email-normaliser.json` (edit)
  - Estimate: small
  - Kind: impl
  - Depends: T5, T7
  - Notes: Third parallel branch off the same point `Call Triage Pipeline`/`Call Action Extraction` now run from (post-T5), same `waitForSubWorkflow: false` non-blocking pattern and by-name (`cachedResultName: "Commitment Extraction"`) sub-workflow reference convention as its two siblings (spec FR8, NFR6). Inputs: `email_id`, `subject`, `body`, `received_at`, `is_from_user` — all already in scope from `Normalize`/`Format output` at this point in the graph.

### Wave 3 — New workflow

- [x] `T7` — `commitment-extraction.json` (new sub-workflow)
  - Files: `n8n/workflows/commitment-extraction.json` (create)
  - Estimate: large
  - Kind: impl
  - Depends: T1, T2
  - Notes: Modeled structurally on `action-extraction.json` (single extraction call, non-blocking caller), not `triage-pipeline.json`. Calls the existing `LLM Gateway` sub-workflow with the existing prompt-injection-defense delimiter convention (`README.md`). Prompt: detect at most one promise-like commitment per call in either direction, returning `has_commitment`, `direction`, `text`, `trigger_sentence` (verbatim quote), `due_date` (relative dates resolved against the `received_at` input, matching `action-extraction.json`'s existing convention), `confidence` (spec FR9). On `has_commitment: true`, insert a `commitments` row; resolve `counterparty_id` via `select id from contacts where account_id = $1 and email = $2` against the email's non-owner participant, writing `null` when no match is found rather than failing the insert (spec Edge Cases). On `has_commitment: false`, no write — same "no task, no insert" shape `action-extraction.json` already uses.

### Wave 4 — Mappers

- [x] `T8` — `commitments` row → `Commitment` mapper
  - Files: `gmail-dashboard/lib/data/commitment-mapping.ts` (create)
  - Estimate: small
  - Kind: impl
  - Depends: T2
  - Notes: Maps a `commitments` row to `Commitment` (spec FR10) — `sourceMessageId` = `email_id`, `triggerSentence` = `trigger_sentence`, `counterpartyId` = `counterparty_id` (falls back to `""` when `null` — spec Edge Cases). `daysElapsed` computed from `created_at` against `Date.now()`, matching `message-mapping.ts#buildSla`'s real-clock convention.

- [x] `T9` — `contacts` row + aggregates + tone history → `Contact` mapper
  - Files: `gmail-dashboard/lib/data/contact-mapping.ts` (create)
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes: Maps a `contacts` row joined with `contact_aggregates` (T1's view: `messageCount`, `lastContactAt`) and a `contact_tone_history` query (`toneHistory`) to `Contact` (spec FR11). Computes `yourAvgReplyHours` and `openThreadIds` here in TypeScript (design.md Key Decision 3) — `yourAvgReplyHours`: average elapsed time between a message from this contact and the next `is_from_user = true` reply in the same thread; `openThreadIds`: distinct `thread_id`s involving this contact with no message newer than the contact's own last message, or design's discretion for a simpler first-pass definition consistent with the fixture's intent. Export a helper usable by both `GET /api/contacts` (list) and `GET /api/contacts/:id` (single) without duplicating the aggregate query.

- [x] `T10` — `message-mapping.ts`: real contact lookup + real thread
  - Files: `gmail-dashboard/lib/data/message-mapping.ts` (edit)
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T9
  - Notes: Replace `buildContact()`'s placeholder synthesis with a `contacts` lookup by participant address (scoped to `account_id`), reusing T9's mapper; fall back to today's placeholder synthesis only when no matching row exists (spec FR12, Edge Cases, design.md Key Decision 5 — never throw). Replace the hardcoded `thread: []` with a `thread_entries` query filtered on the message's `thread_id`, ordered by `at` ascending, mapped to `ThreadEntry[]` (spec FR12, AC17). Do not change `buildAi`, `buildSla`, or any other part of this file.

### Wave 5 — API routes

- [x] `T11` — Commitments, awaiting-reply, and nudges routes
  - Files: `gmail-dashboard/app/api/commitments/route.ts` (create — GET), `gmail-dashboard/app/api/commitments/[id]/route.ts` (create — PATCH), `gmail-dashboard/app/api/awaiting-reply/route.ts` (create — GET), `gmail-dashboard/app/api/nudges/route.ts` (create — POST)
  - Estimate: large
  - Kind: impl
  - Depends: T8
  - Notes: `GET /api/commitments?direction=` maps every row via T8, `direction` optional (spec FR13, AC8). `PATCH /api/commitments/:id {status}` updates only `status` (spec FR15, AC10). `GET /api/awaiting-reply` groups `emails` by `thread_id`, keeps threads whose `max(received_at)` row has `is_from_user = true`, returns the `AwaitingReply` shape directly — not routed through T8's mapper (spec FR14, AC9; design.md API Changes). `POST /api/nudges {commitmentId, body}` inserts a `nudges` row with `sent_at: null`, `404` if `commitmentId` doesn't exist, and makes no outbound network call of any kind (spec FR16, NFR4, AC11).

- [x] `T12` — Contacts routes
  - Files: `gmail-dashboard/app/api/contacts/route.ts` (create — GET), `gmail-dashboard/app/api/contacts/[id]/route.ts` (create — GET), `gmail-dashboard/app/api/contacts/[id]/vip/route.ts` (create — PATCH)
  - Estimate: medium
  - Kind: impl
  - Depends: T9
  - Notes: `GET /api/contacts?sort=&groupByDomain=` maps every row via T9, excluding the account owner's own address using the same from-participant-on-sent-mail heuristic T5 writes against (design.md Key Decision 2; spec FR17, AC12); `groupByDomain` is accepted but does not change the query shape (design.md Key Decision 6). `GET /api/contacts/:id` — single contact, `404` if not found (spec FR18, AC13). `PATCH /api/contacts/:id/vip {value}` updates `contacts.is_vip` (spec FR19, AC14).

### Wave 6 — Frontend rewiring

- [x] `T13` — `commitments-provider.tsx` + `app/follow-ups/page.tsx`: first provider layer for this route
  - Files: `gmail-dashboard/components/board/commitments-provider.tsx` (create), `gmail-dashboard/app/follow-ups/page.tsx` (edit)
  - Estimate: large
  - Kind: impl
  - Depends: T11
  - Notes: New provider, fetch-on-mount from `GET /api/commitments` and `GET /api/awaiting-reply` (parallel requests, same `AbortController` pattern `board-provider.tsx` already establishes), `PATCH /api/commitments/:id` as an optimistic-update-plus-API mutation (fire-and-forget, matching `board-provider.tsx`'s `patchMessage` helper), and a submit-then-refetch (or optimistic-insert) call to `POST /api/nudges` for the Nudge dialog. `app/follow-ups/page.tsx` switches its current direct `getAwaitingReply()`/`getCommitments()` fixture calls to consume the new provider, with loading/error states matching the convention `010` established for `/actions`/`/drafts` (spec FR20, AC15).

- [x] `T14` — `contacts-provider.tsx` + `app/contacts/page.tsx` + `board-provider.tsx` VIP persistence
  - Files: `gmail-dashboard/components/board/contacts-provider.tsx` (create), `gmail-dashboard/app/contacts/page.tsx` (edit), `gmail-dashboard/components/board/board-provider.tsx` (edit)
  - Estimate: large
  - Kind: impl
  - Depends: T12
  - Notes: New provider, fetch-on-mount from `GET /api/contacts` (and `GET /api/contacts/:id` for the contact dialog), same loading/error convention as T13. `app/contacts/page.tsx` switches its current direct `getContacts()` call to consume the new provider (spec FR21, AC16). `board-provider.tsx`'s `toggleVip` action gains a fire-and-forget `patchMessage(`/api/contacts/${contactId}/vip`, { value })` call alongside its existing `dispatch`, computing `value` from the same `!(state.vipOverrides[contactId] ?? fallback)` expression the reducer already uses — `fallback` comes from the contact object the caller already has in hand (`app/contacts/page.tsx`'s existing `board.isVip(c.id, c.isVip)` call site), so no reducer-shape change is needed, only the added API call.

### Wave 7 — Documentation

- [x] `T15` — Update `architecture.md` and `architect/04-data-model.md` for the five new tables/view
  - Files: `architecture.md` (edit), `architect/04-data-model.md` (edit)
  - Estimate: small
  - Kind: docs
  - Depends: T1, T2
  - Notes: Reflect `contacts`, `thread_entries`, `contact_tone_history`, `contact_aggregates`, `commitments`, `nudges`, and `emails.is_from_user`, per the convention `006-draft-generation`/`009`/`010` established (spec FR22). A targeted addition, not a rewrite.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
