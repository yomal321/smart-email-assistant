# Phase 3 Implementation Plan — Follow-ups & Contacts

**Backend build order:** Phase 3 of 6 (see [BACKEND-REQUIREMENTS.md](BACKEND-REQUIREMENTS.md) §6).
**Depends on:** Phase 0 (auth/API tier), Phase 1 (`0005`, `/api/messages*`), Phase 2 (`0008`/`0009`, action-items/drafts API) — all shipped via specclaw changes `008`/`009`/`010`.
**Unblocks:** `/follow-ups` and `/contacts` — currently the two dashboard modules with **zero** backend support (BACKEND-REQUIREMENTS.md §1, §4).

## 1. Why this phase, and what "done" means

Per BACKEND-REQUIREMENTS.md §6: "Phases 1–2 get roughly 70% of the dashboard onto live data. Phase 3 is where it becomes the product the positioning claims" — Follow-ups (commitment tracking, both directions) and Contacts (aggregates, VIP, tone history) are called out in `PRODUCT.md` as the differentiator, not incidental features.

Done means:
- Sent mail is ingested (today only `INBOX` is watched — the assistant never sees what the user replied).
- Every inbound/outbound email can be traced to a `contacts` row, with real aggregates (message count, avg reply time, last contact, open threads) instead of the synthetic per-message `Contact` objects `message-mapping.ts` currently fabricates.
- Commitments ("you owe a reply" / "they owe you one") are extracted with a verbatim trigger sentence, surfaced through `/api/commitments` and `/api/awaiting-reply`.
- `/follow-ups` and `/contacts` read live data through fetch-on-mount providers, matching the pattern `action-items-provider.tsx` and `drafts-provider.tsx` already established in change `010`.
- `board.toggleVip` (currently client-only state in `board-provider.tsx`) persists — VIP status is supposed to feed priority scoring, so an unpersisted toggle is a correctness gap, not just a missing feature.

Out of scope for this phase (explicitly deferred): the Nudge dialog *sending* anything (open question 2 — see §6), Rules/Settings/Search/Activity log (Phase 4), Rule execution and Analytics aggregation (Phase 5).

## 2. Wave 1 — Migrations (ship together, additive only)

Both are pure additions — no existing table is altered, so this wave has no coupling risk with Phases 1/2's already-live columns.

### `supabase/migrations/0006_threads_and_contacts.sql`

```sql
alter table emails
  add column is_from_user boolean not null default false;  -- sent mail, for commitments (§4)

create table thread_entries (            -- the Board Sheet timeline
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  author_is_you boolean not null,
  author_name text not null,
  at timestamptz not null,
  gist text not null
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text, email text not null, domain text, avatar_url text,
  is_vip boolean not null default false,
  unique (account_id, email)
);

create table contact_tone_history (
  contact_id uuid not null references contacts(id),
  month date not null,
  tone text not null check (tone in ('tense','neutral','warm')),
  primary key (contact_id, month)
);
-- messageCount / yourAvgReplyHours / lastContactAt / openThreadIds are a VIEW, not columns
-- (BACKEND-REQUIREMENTS.md §5.2) — add it in this same migration:
create view contact_aggregates as
  select
    c.id as contact_id,
    count(e.id) as message_count,
    max(e.received_at) as last_contact_at
    -- yourAvgReplyHours / openThreadIds need the thread/reply-pairing logic
    -- landing with Wave 2's normaliser edit before they can be computed here
  from contacts c
  left join emails e on e.participants @> jsonb_build_array(jsonb_build_object('email', c.email))
  group by c.id;
```

### `supabase/migrations/0007_commitments.sql`

```sql
create table commitments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  direction text not null check (direction in ('you-promised','promised-to-you')),
  text text not null,
  trigger_sentence text not null,          -- verbatim, for the explainability rule
  counterparty_id uuid references contacts(id),
  due_date date,
  status text not null default 'open' check (status in ('open','met','missed')),
  confidence int not null,
  created_at timestamptz not null default now()
);

create table nudges (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid references commitments(id),
  email_id uuid references emails(id),
  body text not null,
  sent_at timestamptz
);
```

**Backfill note:** both tables start empty. Existing rows in `emails` have no commitments and no contacts until the Backfill/Re-enrich workflow (BACKEND-REQUIREMENTS.md §5.4.B #2) re-runs — that workflow is listed as required for "Phase 1 & 3" but is not part of this plan's scope unless the dashboard needs to look non-empty on day one. Flag this as a follow-up decision, not a blocker (see §6).

## 3. Wave 2 — n8n workflow changes

| Workflow | Change | Notes |
|---|---|---|
| `n8n/workflows/gmail-ingestion.json` | `labelIds: ["INBOX"]` → `["INBOX","SENT"]` in the `watch()` call | One line. `history.list` with `historyTypes=messageAdded` already picks up whatever the subscription covers — no other ingestion change needed (BACKEND-REQUIREMENTS.md §5.4.A). |
| `n8n/workflows/gmail-renewal-recovery.json` | Same `labelIds` change in its own `watch()` call (there are 2 total per BACKEND-REQUIREMENTS.md §5.4.A) | Keeps renewal consistent with the initial watch — a renewal that reverts to `INBOX`-only would silently stop sent-mail ingestion again. |
| `n8n/workflows/email-normaliser.json` | 1) Set `is_from_user` on insert (from the Gmail message's `labelIds` containing `SENT`, or sender == account owner). 2) Upsert into `contacts` (`on conflict (account_id, email) do nothing` — VIP flag is dashboard-owned, never overwritten by ingestion). 3) Insert a `thread_entries` row per normalized message. 4) Add a third parallel branch off `Inserted?`'s true output — same non-blocking pattern as `Call Triage Pipeline` / `Call Action Extraction` (`waitForSubWorkflow: false`) — calling the new **Commitment Extraction** sub-workflow. | The normaliser is already the fan-out point (see `email-normaliser.json:120-184` — `Inserted?` → parallel branches, guarded by "genuinely new, non-duplicate insert"). This is purely additive, same shape as changes `004`/`005` made to this file. |
| **`n8n/workflows/commitment-extraction.json`** (new) | Sub-workflow, invoked by the normaliser with the same inputs Triage/Action Extraction receive (email body, `received_at`, `is_from_user`). Prompts Gemini to detect promise-like sentences in both directions, emit `direction`, `text`, `trigger_sentence` (verbatim), `due_date` (relative dates resolved against `received_at`, same convention Action Extraction already uses), `confidence`; resolves `counterparty_id` against the `contacts` upsert from the normaliser step; writes to `commitments`. | This is the one genuinely new workflow this phase requires (BACKEND-REQUIREMENTS.md §5.4.B #1). Model it structurally on `action-extraction.json` (single-purpose extraction sub-workflow, non-blocking caller) rather than `triage-pipeline.json` (richer, multi-field prompt) — commitments are a narrower extraction than triage. |

**LLM Gateway** needs no change — every extraction sub-workflow already calls through it.

## 4. Wave 3 — Mappers

New files under `gmail-dashboard/lib/data/`, following `message-mapping.ts`'s convention (named column list, `server-only`, one mapper function per row shape, reused across every route that returns that shape):

- **`commitment-mapping.ts`** — `mapCommitmentRowToCommitment(row: CommitmentRow): Commitment`. Computes `daysElapsed` from `created_at` (the `Commitment` type has no elapsed-time column — it's derived, same pattern as `Sla.elapsedHours`). Column list: `id, email_id, direction, text, trigger_sentence, counterparty_id, due_date, status, confidence, created_at`.
- **`contact-mapping.ts`** — `mapContactRowToContact(row: ContactRow, aggregates: ContactAggregateRow): Contact`. Joins the `contacts` row with the `contact_aggregates` view (Wave 1) and a `contact_tone_history` query for the `toneHistory` array. This *replaces* the placeholder Contact-synthesis logic in `message-mapping.ts` (its header comment already documents this as a known placeholder pending "the `contacts` table, which does not exist yet" — that condition is now false). Update `message-mapping.ts`'s sender/recipient construction to look up the real `contacts` row instead of synthesizing one, once this table exists.

## 5. Wave 4 — API routes

All routes follow the existing conventions: `middleware.ts` already enforces auth (no per-route session check needed), never `select("*")`, named column-list constants.

**Follow-ups & commitments**

| Method | Path | Replaces | Notes |
|---|---|---|---|
| GET | `/api/commitments?direction=` | `getCommitments` | Filters on `direction` when given, else both. |
| GET | `/api/awaiting-reply` | `getAwaitingReply` | Query shape TBD against how the fixture defines "awaiting reply" today (`lib/data/fixtures/commitments.ts` / `index.ts`'s `getAwaitingReply`) — likely `commitments` joined with `emails` where `direction = 'promised-to-you'` and no later outbound reply exists in `thread_entries`. |
| PATCH | `/api/commitments/:id` `{status}` | met / missed | |
| POST | `/api/nudges` `{commitmentId, body}` | the Nudge dialog | **Writes a row only** — see §6, open question 2. Do not wire this to an actual send until that question is resolved; the dialog can submit to this route today and simply create a `nudges` row with `sent_at: null`. |

**Contacts**

| Method | Path | Replaces | Notes |
|---|---|---|---|
| GET | `/api/contacts?sort=&groupByDomain=` | `getContacts` | |
| GET | `/api/contacts/:id` | the contact dialog (stats, tone history, open threads) | |
| PATCH | `/api/contacts/:id/vip` `{value}` | `board.toggleVip` | **Must persist** — BACKEND-REQUIREMENTS.md §5.3 flags this explicitly because VIP feeds priority scoring. This also means `board-provider.tsx`'s `toggleVip` action (currently pure client state, `board-provider.tsx:126`) needs to become an optimistic-update-plus-API call, same shape as the Wave 5 provider work below. |

No new env vars are required for this wave (no proxy-to-n8n route like `drafts`' `POST /api/drafts` — commitments/contacts are read/write directly against Supabase, same as `action-items`).

## 6. Wave 5 — Frontend wiring

`/follow-ups` and `/contacts` currently call `lib/data` functions **synchronously and directly** in the page component (`getAwaitingReply()`, `getCommitments()`, `getContacts()` — see `app/follow-ups/page.tsx:18-19`, `app/contacts/page.tsx:24`), unlike `/actions` and `/drafts`, which already go through a provider (`action-items-provider.tsx`, `drafts-provider.tsx`). This phase needs to introduce that provider layer for the first time on these two routes, not just swap a data source:

- **New `commitments-provider.tsx`** (or extend an existing provider) — fetch-on-mount from `/api/commitments` and `/api/awaiting-reply`, optimistic `PATCH` for met/missed, submit-and-refetch for the Nudge dialog against `/api/nudges`.
- **New `contacts-provider.tsx`** — fetch-on-mount from `/api/contacts`, optimistic `PATCH` for VIP toggle. `board-provider.tsx`'s `toggleVip` dispatch should delegate here instead of mutating local reducer state, mirroring how `010` rewired `action-items-provider.tsx` off `useReducer`-only state.
- Both new pages need loading/error states, matching the pattern established for `/actions` and `/drafts` in change `010`.
- `app/contacts/page.tsx` also imports `getMessages` — check whether it needs the same "real message lookups" treatment `010`'s task notes called out for `app/drafts/page.tsx` (i.e., does anything on this page call `getMessageById()` against fixture-only data that would silently break once `/api/messages/:id` is the only truth).

## 7. Open questions to resolve before/during this phase

Carried from BACKEND-REQUIREMENTS.md §7 — these gate specific behavior in this phase, not just later ones:

1. **Sent-mail ingestion scope** (§7 Q3) — all history, or from a start date? Changes the Gmail OAuth scope requested and the Backfill workflow's cost. Needs an answer before Wave 3's `watch()` change ships, since it also determines whether historical commitments/contacts are backfilled or only accrue going forward.
2. **Send or don't send** (§7 Q2) — does the Nudge dialog's "Send" actually send via Gmail, or create a Gmail draft, or (as scoped in Wave 4 above) just persist a `nudges` row for now? This plan defaults to the last option to avoid taking on a `gmail.send` credential inside this phase — revisit as its own reviewed change per BACKEND-REQUIREMENTS.md §5.3's warning under the Drafts API table.
3. **Backfill/Re-enrich workflow** — is it in scope for this phase, or is an empty Follow-ups/Contacts view on day one acceptable until it's built separately (BACKEND-REQUIREMENTS.md §5.4.B lists it as required for "Phase 1 & 3")? Recommend treating it as a fast-follow, not a blocker, to keep this phase's surface area contained to what §6 of BACKEND-REQUIREMENTS.md scopes.

## 8. Explicitly not in this phase

- Rules, Settings, Activity log, Search, saved views (Phase 4).
- Rule execution, full Analytics aggregation, AI-performance panel (Phase 5).
- Todoist/Notion/Jira export, AI model selector, retention durations, category "Merge", Auto-reply — stubbed by product decision (BACKEND-REQUIREMENTS.md §8.3), unaffected by this phase.

## 9. Acceptance checklist

- [ ] `0006_threads_and_contacts.sql` and `0007_commitments.sql` applied; both additive, no existing table altered.
- [ ] Sent mail flows through ingestion end-to-end (`watch()` change verified against a real deployment, per this project's "verification means live evidence" convention — README.md:226).
- [ ] `email-normaliser.json` sets `is_from_user`, upserts `contacts`, inserts `thread_entries`, and fires Commitment Extraction non-blocking, without touching Triage/Action Extraction's existing branches.
- [ ] `commitment-extraction.json` emits both directions with a verbatim `trigger_sentence`.
- [ ] `/api/commitments`, `/api/awaiting-reply`, `/api/nudges`, `/api/contacts`, `/api/contacts/:id`, `/api/contacts/:id/vip` all live, reading named column lists only.
- [ ] `board.toggleVip` persists through the new VIP endpoint instead of local-only state.
- [ ] `/follow-ups` and `/contacts` rewired to fetch-on-mount providers with loading/error states; no remaining direct `lib/data/fixtures` reads on either route.
- [ ] Architecture docs (`architecture.md`, `architect/04-data-model.md`) updated to reflect the new tables, matching the pattern change `010` used for its own architecture-doc update task.
