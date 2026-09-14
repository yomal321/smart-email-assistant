# Spec: Follow-ups & Contacts API (Backend Phase 3 of 6)

**Change:** 011-followups-contacts-api
**Created:** 2026-09-14
**Status:** 🟡 Draft

## Overview

Phase 3 gives `/follow-ups` and `/contacts` their first backend support — both currently read `lib/data/fixtures/*` directly and are named in BACKEND-REQUIREMENTS.md §1/§4 as having **zero** backend support. Unlike Phases 1/2 (enrich an existing table, fix an existing workflow node), this phase's schema is entirely new: `contacts`, `thread_entries`, `contact_tone_history`, `commitments`, and `nudges` don't exist yet, and neither does the one signal all of it depends on — the assistant has never seen the user's own sent mail (Gmail `watch()` only covers `INBOX`).

**Correction to the proposal's file list, found by reading the workflow files directly (the same discipline `009`'s and `010`'s design docs applied):** the proposal names "`gmail-ingestion.json` and `gmail-renewal-recovery.json`" as needing the `SENT` label change. Reading both files shows `gmail-ingestion.json` contains no `watch()` call at all — both `labelIds: ["INBOX"]` occurrences (`"Call watch()"` and `"Re-register watch()"`) live inside the single file `gmail-renewal-recovery.json`. FR1 below targets the correct location.

Three structural pieces, in dependency order:

1. **Sent-mail ingestion.** `gmail-renewal-recovery.json`'s two `watch()` calls add `"SENT"` to `labelIds`. `email-normaliser.json`'s `Normalize` node already captures `labels: rawMessage.labelIds || []` (read directly) — deriving `is_from_user` is a pure function of data already flowing through that node, not a new lookup.
2. **New schema** (migrations `0006`, `0007`) and **three normaliser-side writes** (`is_from_user` on `emails`, an upsert into `contacts`, an insert into `thread_entries`) plus **one new sub-workflow** (`commitment-extraction.json`), fanned out from the same `Inserted?` gate `004-triage`/`005-action-items` already established.
3. **API + frontend**, following `008`/`009`/`010`'s established shape: mappers → routes → provider rewiring. This phase also closes a comment `message-mapping.ts` has carried since `009`/`010`: `buildContact()`'s placeholder Contact synthesis and the hardcoded `thread: []` were both written with a comment naming this exact phase as when they'd stop being placeholders.

`getAwaitingReply` and `getCommitments` are **not the same query** — reading `lib/data/fixtures/commitments.ts` directly shows `AWAITING_REPLY` is a separate list ("sent with no response, tracked separately from detected commitments since these are simply unanswered outbound mail") from `COMMITMENTS` (`direction: "promised-to-you"`). FR13/FR12 below keep that distinction; this resolves the proposal's fourth open question.

## Requirements

### Functional Requirements

**Sent-mail ingestion**

- **FR1.** `n8n/workflows/gmail-renewal-recovery.json`: change `labelIds` from `["INBOX"]` to `["INBOX","SENT"]` in both the `"Call watch()"` node and the `"Re-register watch()"` node (the two, and only two, `watch()` calls in the workflow). No other node in this file changes.
- **FR2.** `n8n/workflows/email-normaliser.json`'s `Normalize` node: add `is_from_user: (rawMessage.labelIds || []).includes('SENT')` to its returned JSON, alongside the existing `labels` field it already computes from the same array. Sent mail is inherited automatically once FR1 ships — `history.list` with `historyTypes=messageAdded` already reflects whatever the subscription covers (BACKEND-REQUIREMENTS.md §5.4.A); no ingestion-trigger change is needed beyond FR1/FR2.

**Schema**

- **FR3.** Migration `0006_threads_and_contacts.sql`: `alter table emails add column is_from_user boolean not null default false`; create `thread_entries` (`id`, `email_id references emails(id)`, `author_is_you`, `author_name`, `at`, `gist`); create `contacts` (`id`, `account_id references accounts(id)`, `name`, `email not null`, `domain`, `avatar_url`, `is_vip default false`, `unique(account_id, email)`); create `contact_tone_history` (`contact_id references contacts(id)`, `month date`, `tone check (tone in ('tense','neutral','warm'))`, `primary key(contact_id, month)`); create a `contact_aggregates` view (`contact_id`, `message_count`, `last_contact_at` — computed from `contacts` joined to `emails` on `participants @> jsonb_build_array(jsonb_build_object('email', c.email))`). `yourAvgReplyHours` and `openThreadIds` are **not** in this view — see Notes.
- **FR4.** Migration `0007_commitments.sql`: create `commitments` (`id`, `email_id references emails(id)`, `direction check (direction in ('you-promised','promised-to-you'))`, `text`, `trigger_sentence`, `counterparty_id references contacts(id)`, `due_date`, `status default 'open' check (status in ('open','met','missed'))`, `confidence int not null`, `created_at`); create `nudges` (`id`, `commitment_id references commitments(id)`, `email_id references emails(id)`, `body`, `sent_at timestamptz` — nullable, see FR15).

**Normaliser writes (all gated behind the existing `Inserted?` true branch — never run for a duplicate delivery)**

- **FR5.** `Upsert email`'s `INSERT` gains `is_from_user` in its column/value list (from `Normalize`'s new field, FR2), and `Format output` passes it through to the branch's downstream `$json`.
- **FR6.** A new `Upsert contacts` Postgres node, positioned after `Inserted?`'s true output and before the three sub-workflow calls (see Key Decisions for why it must run first, not in parallel). One query, driven off `Normalize`'s `participants` array: for every participant **except** the `from` participant on an `is_from_user = true` email (that participant is the account owner, who has no `contacts` row — see Edge Cases), `insert into contacts (account_id, name, email, domain, is_vip) ... on conflict (account_id, email) do update set name = coalesce(excluded.name, contacts.name)` — `is_vip` is never touched by conflict (only set on first insert, default `false`), so a dashboard-side VIP toggle (FR18) is never silently reverted by a later inbound email from the same address.
- **FR7.** A new `Insert thread_entries` Postgres node, same position as FR6 (can run in either order relative to it — no dependency between them). One row per normalized email: `author_is_you = is_from_user`, `author_name` = the `from` participant's `name ?? address`, `at = received_at`, `gist` = the first 200 characters of `body` (trimmed, ellipsis-suffixed if truncated) — see Notes for why this is body text, not an AI summary.
- **FR8.** A third parallel branch off `Inserted?`'s true output, alongside the existing `Call Triage Pipeline` and `Call Action Extraction`: `Call Commitment Extraction`, same `waitForSubWorkflow: false` non-blocking pattern, same by-name (`cachedResultName`) sub-workflow reference convention. Inputs: `email_id`, `subject`, `body`, `received_at`, `is_from_user` (all already present in scope at that point in the graph).

**New workflow**

- **FR9.** `n8n/workflows/commitment-extraction.json` (new): a single-purpose extraction sub-workflow modeled structurally on `action-extraction.json` (not `triage-pipeline.json` — this is a narrow extraction, not a multi-field classification). Prompts the LLM Gateway to detect at most one promise-like commitment per call in either direction, returning `has_commitment`, `direction`, `text`, `trigger_sentence` (verbatim quote the detection fired on), `due_date` (relative dates resolved against the `received_at` input, same convention `action-extraction.json` already uses), `confidence`. On `has_commitment: true`, writes a `commitments` row, resolving `counterparty_id` via `select id from contacts where account_id = $1 and email = $2` against the email's non-owner participant (already upserted by FR6 in the same run — no race, see Key Decisions). Follows the same prompt-injection-defense convention (`README.md`'s documented delimiter pattern) every other extraction sub-workflow uses.

**Mappers**

- **FR10.** `gmail-dashboard/lib/data/commitment-mapping.ts` (new): maps a `commitments` row to `Commitment` (`lib/data/types.ts`). `daysElapsed` is computed from `created_at` against the real clock (`Date.now()`, matching `message-mapping.ts#buildSla`'s established convention of computing elapsed time server-side rather than storing it).
- **FR11.** `gmail-dashboard/lib/data/contact-mapping.ts` (new): maps a `contacts` row, joined with the `contact_aggregates` view (FR3) and a `contact_tone_history` query, to `Contact`. `yourAvgReplyHours` and `openThreadIds` are computed here (see Notes for the exact query), not in the FR3 view.
- **FR12.** `gmail-dashboard/lib/data/message-mapping.ts`: `buildContact()` is replaced with a real `contacts` lookup (by participant address, scoped to `account_id`) via FR11's mapper, falling back to today's placeholder synthesis only when no matching `contacts` row exists (should be rare post-FR6, but a `Message`'s `sender`/`recipients` must never fail to render). Separately, the hardcoded `thread: []` is replaced with a `thread_entries` query for the message's `thread_id`, ordered by `at` — this closes the exact gap `message-mapping.ts`'s own comment names ("Needs thread_entries (Phase 3)").

**API — Follow-ups & commitments**

- **FR13.** `GET /api/commitments?direction=` — reads `commitments` mapped via FR10; `direction` optional (`you-promised` | `promised-to-you`), omitted means both.
- **FR14.** `GET /api/awaiting-reply` — **not** a `commitments` read (Overview, above). Reads `emails` grouped by `thread_id`, selecting threads whose most-recent message (`max(received_at)`) has `is_from_user = true` — i.e., the user sent the last message in the thread and nothing has arrived since. Returns `{ id, subject, counterpartyId, sentAt, daysElapsed }[]`, matching the fixture's `AwaitingReply` shape exactly (`lib/data/fixtures/commitments.ts`).
- **FR15.** `PATCH /api/commitments/:id {status: "met" | "missed"}` — updates `status`.
- **FR16.** `POST /api/nudges {commitmentId, body}` — inserts a `nudges` row with `sent_at: null`. Does **not** call Gmail or any send mechanism (Open Question 2 / Notes) — this route's entire effect is persisting the row so the Nudge dialog has somewhere to write.

**API — Contacts**

- **FR17.** `GET /api/contacts?sort=&groupByDomain=` — reads `contacts` (excluding the account owner's own row — see Edge Cases) mapped via FR11. `sort` and `groupByDomain` mirror the fixture page's current client-side sort/group options (`app/contacts/page.tsx`), now applied server-side.
- **FR18.** `GET /api/contacts/:id` — single contact, full `Contact` shape (stats, `toneHistory`, `openThreadIds`) for the contact dialog. `404` if not found.
- **FR19.** `PATCH /api/contacts/:id/vip {value: boolean}` — updates `contacts.is_vip`. `board-provider.tsx`'s `toggleVip` (FR21) is the only caller.

**Frontend**

- **FR20.** New `commitments-provider.tsx` (fetch-on-mount from FR13/FR14, optimistic `PATCH` for FR15, submit-and-refetch for FR16's Nudge dialog) and `app/follow-ups/page.tsx` rewired off its current direct `getAwaitingReply()`/`getCommitments()` fixture calls to consume it — the first provider layer either route has had (they currently bypass the provider pattern `008` established for `/actions`/`/drafts` entirely).
- **FR21.** New `contacts-provider.tsx` (fetch-on-mount from FR17/FR18, optimistic `PATCH` for FR19) and `app/contacts/page.tsx` rewired off its current direct `getContacts()` call. `board-provider.tsx`'s `toggleVip` action gains a `patchMessage`-style fire-and-forget call to FR19 alongside its existing local `dispatch` — computed from the same `!(state.vipOverrides[contactId] ?? fallback)` logic the reducer already uses, so the value sent to the API matches what the UI shows immediately.

**Shared**

- **FR22.** `architecture.md` and `architect/04-data-model.md` updated to reflect the five new tables/view and the `emails.is_from_user` column, per the convention every prior phase's design.md has followed.

### Non-Functional Requirements

- **NFR1.** Every new route selects an explicit column list — never `select("*")`, never `raw_payload` (established convention).
- **NFR2.** No changes to `middleware.ts` or `lib/auth/session.ts` — new routes live under `/api/**`, covered by the existing deny-by-default session check as-is.
- **NFR3.** `commitment-extraction.json` and the two new normaliser Postgres nodes reuse the existing `Supabase Postgres` credential (same name, same placeholder-id convention); `commitment-extraction.json` calls through the existing `LLM Gateway` sub-workflow — no new credential, no new gateway.
- **NFR4.** No `gmail.send`/`gmail.compose` scope or credential is introduced anywhere in this phase. FR16 is a database write only.
- **NFR5.** Migrations `0006`/`0007` must be live before `email-normaliser.json`'s FR5–FR8 edits are deployed — those nodes write to tables (`contacts`, `thread_entries`, `commitments`) that don't exist until the migrations land. Unlike `010`'s NFR5 (a broken write on old data), deploying the workflow edit first means every subsequent ingested email fails outright (the whole normaliser run errors, not just the new branches) — call this out in both migrations' own header comments.
- **NFR6.** `commitment-extraction.json` matches its two siblings' fire-and-forget contract exactly: `waitForSubWorkflow: false`, so Gemini's latency/availability can never affect the already-verified ingestion path (`002-ingestion` AC1–AC5), same guarantee `004`/`005` established and this phase must not weaken.

## Acceptance Criteria

- **AC1.** After FR1 ships and a real `watch()` re-registration occurs, a sent email produces a Pub/Sub `historyTypes=messageAdded` event and is ingested exactly like an inbound one — verified live, not just by reading the diff (this project's "verification means live evidence" convention, `README.md:226`).
- **AC2.** A normalized row for a message whose raw `labelIds` includes `"SENT"` has `is_from_user = true`; one without it has `is_from_user = false` (FR2/FR5).
- **AC3.** After migrations `0006`/`0007`, all five new tables and the `contact_aggregates` view exist with the exact columns/constraints FR3/FR4 specify; no existing table's existing column is altered.
- **AC4.** A normalized email with two `to` participants and one `cc` participant produces exactly the expected number of `contacts` upserts (FR6) — the account owner's own address, when it's the `from` on an `is_from_user = true` email, produces **no** `contacts` row.
- **AC5.** Toggling a contact's `is_vip` to `true` via `PATCH /api/contacts/:id/vip`, then normalizing a new inbound email from that same address, leaves `is_vip = true` (FR6's `on conflict` never touches it).
- **AC6.** Each normalized email produces exactly one `thread_entries` row with `gist` truncated to ≤200 characters plus an ellipsis when the source body exceeds that length (FR7).
- **AC7.** A live (or pinned-fixture) run of Commitment Extraction against an email containing a clear promise ("I'll send the revised SOW by Thursday") produces a `commitments` row with a non-empty `trigger_sentence` that is a verbatim substring of the input body, and a `direction` matching whether the sender or the recipient made the promise (FR9).
- **AC8.** `GET /api/commitments?direction=you-promised` returns only rows with that `direction`; omitting the param returns both (FR13).
- **AC9.** `GET /api/awaiting-reply` returns a thread only when its chronologically-last message has `is_from_user = true` — appending a new inbound message to a previously-"awaiting reply" thread removes it from this endpoint's next response (FR14).
- **AC10.** `PATCH /api/commitments/:id {status: "met"}` changes only `status`; the row's `direction`/`text`/`trigger_sentence` are unchanged (FR15).
- **AC11.** `POST /api/nudges {commitmentId, body}` creates a `nudges` row with `sent_at: null` and does not produce any outbound network call to Gmail (FR16/NFR4 — verified by the absence of any Gmail-scoped credential reachable from this route).
- **AC12.** `GET /api/contacts` excludes the account owner's own address and includes every other upserted contact, each with a real (non-placeholder) `messageCount` and `lastContactAt` (FR17).
- **AC13.** `GET /api/contacts/:id` for a contact with tone-history rows returns a non-empty `toneHistory` array; for one with none, returns `[]` (not `null`, not a 500) (FR18).
- **AC14.** `PATCH /api/contacts/:id/vip {value: true}` persists; a subsequent `GET /api/contacts/:id` reflects `isVip: true` (FR19).
- **AC15.** With `commitments-provider.tsx` wired, `/follow-ups` renders both "Awaiting reply" and both commitment directions from live data, not `lib/data/fixtures/commitments.ts` (FR20).
- **AC16.** With `contacts-provider.tsx` wired, `/contacts` renders from live data, and clicking the VIP star fires `PATCH /api/contacts/:id/vip` (verified by network inspection, not just the optimistic UI flip) (FR21).
- **AC17.** A `Message` returned by `GET /api/messages` (or `/:id`) for a thread with ≥2 normalized emails has a non-empty `thread` array ordered by `at`, sourced from `thread_entries` — not the hardcoded `[]` `message-mapping.ts` returned before this phase (FR12).
- **AC18.** `app/actions/page.tsx`, `app/inbox/page.tsx`, `app/review/page.tsx`, `app/drafts/page.tsx`, and every n8n workflow's Triage/Action-Extraction/Draft-Generation nodes are untouched by this change — verify confirms this with a diff, not just a claim (mirroring `010`'s AC14 convention).

## Edge Cases

- **The account owner's own email address is not stored anywhere in the schema** (`accounts` has no `email` column — confirmed by reading `0001_ingestion_schema.sql` directly). FR6 identifies "the owner" heuristically: the `from` participant on an `is_from_user = true` email. This means an **inbound** email where the owner happens to appear as a `to`/`cc` participant (a normal occurrence — the owner is a recipient of their own inbox) still gets a `contacts` row upserted for that address. This is a known, accepted imprecision — see Key Decisions — not a blocker, since `GET /api/contacts` (FR17) filters it out at read time using the same "appears as `from` on an `is_from_user=true` row" signal, not by trusting a clean write-time set.
- **Pre-FR3 emails have no `thread_entries`.** A thread that existed entirely before this migration shipped renders an empty `thread` array (FR12) exactly as it did before this phase — not a regression, since it was already `[]`. A thread straddling the migration boundary shows only the entries for messages ingested after it (a partial, not full, timeline) — the Backfill/Re-enrich workflow (out of scope, per the approved proposal) is what would close this gap.
- **A `commitments` row whose `counterparty_id` lookup (FR9) finds no matching `contacts` row** (e.g. the email's only other participant is the owner, or lookup order raced despite FR6/FR7 running before the fan-out). Write `counterparty_id: null` rather than failing the insert — `Commitment.counterpartyId` is typed as `string`, not `string | null`, so FR10's mapper falls back to an empty string in this case, matching `message-mapping.ts`'s existing "fall back rather than throw" convention for malformed/incomplete upstream data.
- **`GET /api/awaiting-reply` with a thread that has only ever had one message, sent by the user, with no inbound reply ever received** (a cold outbound email, not a reply). This still qualifies under FR14's definition (last message in thread `is_from_user = true`) — matches the fixture's own `AwaitingReply` semantics, which track "sent with no response" regardless of whether anything came before it.
- **`POST /api/nudges` against a `commitmentId` that doesn't exist.** Returns `404` — same not-found contract every other `:id`-scoped route in this API already uses.

## Dependencies

- `009-dashboard-messages-api`'s `lib/data/message-mapping.ts`, `EmailRow`, and `mapEmailRowToMessage` — FR12 edits it directly.
- `010-dashboard-actions-drafts-api`'s provider-rewiring pattern (`action-items-provider.tsx`, `drafts-provider.tsx`) — FR20/FR21 follow the same fetch-on-mount-plus-optimistic-mutation shape.
- `008-dashboard-api-foundation`'s `lib/supabase/server.ts` and `middleware.ts` session gate — every new route in this phase relies on both, unchanged.
- `005-action-items`'s `action-extraction.json` — FR9's `commitment-extraction.json` is modeled on its structure (single extraction call, non-blocking caller), not copied from it.
- `002-ingestion`'s `email-normaliser.json` `Inserted?` gate and non-blocking fan-out pattern (`004`/`005` precedent) — FR6/FR7/FR8 extend it a third and fourth time.

## Notes

- **Why `contact_aggregates` (FR3) doesn't compute `yourAvgReplyHours`/`openThreadIds`.** Both need real reply-pairing logic (which message replied to which, and within what elapsed time) that depends on `thread_id` grouping and `is_from_user` alternation — genuinely query logic, not a `group by` aggregate, and belongs in FR11's mapper where it can be written, tested, and iterated on in TypeScript rather than a SQL view. The proposal's own migration sketch left this exact gap ("needs the thread/reply-pairing logic landing with Wave 2's normaliser edit before they can be computed here") — this spec resolves it by moving both computations into FR11 rather than leaving them undefined.
- **`thread_entries.gist` is raw truncated body text, not an AI summary (FR7).** The normaliser writes this row before Triage Pipeline has run (they're parallel, non-blocking fan-out branches with no ordering guarantee between them) — there is no AI summary available at the point this row is written, and waiting for one would mean either blocking on Triage (violating NFR6-equivalent guarantees `004` established) or writing the row from inside Triage Pipeline instead of the normaliser (a bigger structural change than this phase's scope). A future phase could enrich `gist` after the fact; this phase writes an honest placeholder, following the same "state the placeholder, don't hide it" discipline `message-mapping.ts`'s existing comments already model.
- **Backfill is explicitly out of scope (per the approved proposal).** Every Edge Case above that mentions "pre-migration" or "before this phase" data describes a real, accepted gap — Follow-ups and Contacts will look sparse immediately after this ships and fill in only as new mail arrives, not retroactively.
- **Open Question 2 (send vs. persist) is resolved for this phase as: persist only (FR16, NFR4).** Actually sending a nudge is explicitly deferred to a separate, reviewed change per the proposal and BACKEND-REQUIREMENTS.md §5.3's warning about the Drafts approve flow's equivalent tradeoff.
- **Open Question 1 (sent-mail history scope) is not resolved by this spec** — FR1's `watch()` change affects only *future* mail going forward; it does not itself backfill historical sent mail. Historical scope remains an open product decision (proposal Open Question 1), separate from whether the *ingestion mechanism* works, which this phase fully delivers.
