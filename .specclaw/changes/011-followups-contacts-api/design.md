# Design: Follow-ups & Contacts API (Backend Phase 3 of 6)

**Change:** 011-followups-contacts-api
**Created:** 2026-09-14

## Technical Approach

Three layers, each depending on the one before it:

1. **Ingestion widening + normaliser writes.** `gmail-renewal-recovery.json`'s `watch()` calls start including `SENT`; `email-normaliser.json` gains two new synchronous writes (`contacts` upsert, `thread_entries` insert) inserted **between** the existing `Inserted?` gate and the existing two-branch fan-out, plus a third fan-out branch calling the one genuinely new sub-workflow, `commitment-extraction.json`.
2. **Schema.** Two additive migrations, `0006` and `0007`, landing before the normaliser edit (NFR5) since the new writes target tables that don't exist until then.
3. **API + frontend.** Two new mappers, one edited mapper (`message-mapping.ts`, closing the two placeholders its own comments named this phase as closing), 7 new routes, 2 new providers, 2 rewired pages, and one small addition to `board-provider.tsx`'s existing `toggleVip` action.

This mirrors `010`'s "two independent verticals sharing a precedent" shape, except here the verticals (Follow-ups/commitments, Contacts) share more than a precedent — they share the same upstream write (FR6/FR7 in the normaliser) and the same new participant-identity problem (see Key Decisions), so this design treats schema + normaliser as one shared foundation wave rather than splitting them per-vertical from the start.

## Architecture

```
Gmail                                  n8n: Gmail Renewal & Recovery
  watch() subscribes to                  "Call watch()" / "Re-register watch()"
  INBOX + SENT (FR1)          ◀────────  labelIds: ["INBOX","SENT"]
       │
       ▼
n8n: Email Normaliser
  Normalize (+ is_from_user = labels.includes('SENT'), FR2)
       │
       ▼
  Upsert email (+ is_from_user column, FR5)
       │
       ▼
  Format output ──▶ Inserted? ──true──▶ Upsert contacts (FR6)
                        │                      │
                        │                      ▼
                        │              Insert thread_entries (FR7)
                        │                      │
                        │        ┌─────────────┼─────────────┐
                        │        ▼              ▼             ▼
                        │  Call Triage    Call Action    Call Commitment
                        │  Pipeline       Extraction     Extraction (FR8, new)
                        │  (unchanged)    (unchanged)           │
                        │                                       ▼
                        │                          commitment-extraction.json (FR9)
                        │                          resolves counterparty_id against
                        │                          contacts (already upserted above —
                        │                          no race, see Key Decisions)
                        │                                       │
                        │                                       ▼
                       false                              commitments (0007)
                    (duplicate delivery,
                     nothing runs)

Schema (additive)
------------------
0006: emails.is_from_user, thread_entries, contacts, contact_tone_history, contact_aggregates (view)
0007: commitments, nudges

API tier
--------
GET  /api/commitments?direction=        ─┐
GET  /api/awaiting-reply                 ├─▶ commitment-mapping.ts ─▶ commitments-provider.tsx ─▶ app/follow-ups/page.tsx
PATCH /api/commitments/:id               │
POST /api/nudges                        ─┘

GET  /api/contacts?sort=&groupByDomain= ─┐
GET  /api/contacts/:id                   ├─▶ contact-mapping.ts ─▶ contacts-provider.tsx ─▶ app/contacts/page.tsx
PATCH /api/contacts/:id/vip             ─┘                              │
                                                                         ▼
                                                          board-provider.tsx toggleVip
                                                          (existing local dispatch + new
                                                           fire-and-forget PATCH, FR21)

message-mapping.ts (edited): buildContact() ─▶ contact-mapping.ts lookup (FR12)
                              thread: [] ─▶ thread_entries query (FR12)
```

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/0006_threads_and_contacts.sql` | Create | `emails.is_from_user`, `thread_entries`, `contacts`, `contact_tone_history`, `contact_aggregates` view (spec FR3) |
| `supabase/migrations/0007_commitments.sql` | Create | `commitments`, `nudges` (spec FR4) |
| `n8n/workflows/gmail-renewal-recovery.json` | Edit | Both `watch()` calls' `labelIds` (spec FR1) |
| `n8n/workflows/email-normaliser.json` | Edit | `Normalize` (`is_from_user`), `Upsert email` (+column), new `Upsert contacts` + `Insert thread_entries` nodes, new `Call Commitment Extraction` branch (spec FR2/FR5–FR8) |
| `n8n/workflows/commitment-extraction.json` | Create | New sub-workflow (spec FR9) |
| `gmail-dashboard/lib/data/commitment-mapping.ts` | Create | `commitments` row → `Commitment` (spec FR10) |
| `gmail-dashboard/lib/data/contact-mapping.ts` | Create | `contacts` row + aggregates + tone history → `Contact` (spec FR11) |
| `gmail-dashboard/lib/data/message-mapping.ts` | Edit | `buildContact()` → real lookup; `thread: []` → `thread_entries` query (spec FR12) |
| `gmail-dashboard/app/api/commitments/route.ts` | Create | `GET` (spec FR13) |
| `gmail-dashboard/app/api/commitments/[id]/route.ts` | Create | `PATCH` (spec FR15) |
| `gmail-dashboard/app/api/awaiting-reply/route.ts` | Create | `GET` (spec FR14) |
| `gmail-dashboard/app/api/nudges/route.ts` | Create | `POST` (spec FR16) |
| `gmail-dashboard/app/api/contacts/route.ts` | Create | `GET` (spec FR17) |
| `gmail-dashboard/app/api/contacts/[id]/route.ts` | Create | `GET` (spec FR18) |
| `gmail-dashboard/app/api/contacts/[id]/vip/route.ts` | Create | `PATCH` (spec FR19) |
| `gmail-dashboard/components/board/commitments-provider.tsx` | Create | Fetch-on-mount + optimistic mutations (spec FR20) |
| `gmail-dashboard/components/board/contacts-provider.tsx` | Create | Fetch-on-mount + optimistic mutations (spec FR21) |
| `gmail-dashboard/app/follow-ups/page.tsx` | Edit | Consume `commitments-provider.tsx` instead of direct fixture calls (spec FR20) |
| `gmail-dashboard/app/contacts/page.tsx` | Edit | Consume `contacts-provider.tsx` instead of direct fixture calls (spec FR21) |
| `gmail-dashboard/components/board/board-provider.tsx` | Edit | `toggleVip` gains a fire-and-forget `PATCH /api/contacts/:id/vip` call (spec FR21) |
| `architecture.md`, `architect/04-data-model.md` | Edit | Reflect the five new tables/view (spec FR22) |

No changes to: `app/actions/page.tsx`, `app/inbox/page.tsx`, `app/review/page.tsx`, `app/drafts/page.tsx`, `middleware.ts`, `lib/auth/session.ts`, `n8n/workflows/gmail-ingestion.json` (confirmed to contain no `watch()` call — see spec.md Overview correction), `triage-pipeline.json`, `action-extraction.json`, `draft-generation.json`, `llm-gateway.json`.

## Data Model Changes

`supabase/migrations/0006_threads_and_contacts.sql`:

```sql
-- Deploy together with the email-normaliser.json edit in the same wave (NFR5) —
-- these tables/column must exist before that workflow's new write nodes run,
-- or every subsequent ingested email fails outright.
alter table emails
  add column is_from_user boolean not null default false;

create table thread_entries (
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

create view contact_aggregates as
  select
    c.id as contact_id,
    count(e.id) as message_count,
    max(e.received_at) as last_contact_at
  from contacts c
  left join emails e
    on e.participants @> jsonb_build_array(jsonb_build_object('email', c.email))
  group by c.id;
-- yourAvgReplyHours / openThreadIds are computed in contact-mapping.ts (FR11),
-- not here — see spec.md Notes.
```

`supabase/migrations/0007_commitments.sql`:

```sql
create table commitments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id),
  direction text not null check (direction in ('you-promised','promised-to-you')),
  text text not null,
  trigger_sentence text not null,
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

## API Changes

**`GET /api/commitments?direction=`** — `{ id, direction, text, triggerSentence, sourceMessageId, counterpartyId, dueDate, status, confidence, daysElapsed }[]`, `direction` optional.

**`GET /api/awaiting-reply`** — `{ id, subject, counterpartyId, sentAt, daysElapsed }[]`. Query: group `emails` by `thread_id`, keep threads where the row with `max(received_at)` has `is_from_user = true`.

**`PATCH /api/commitments/:id`** — `{ status: "met" | "missed" }` → `{ updated: Commitment }`.

**`POST /api/nudges`** — `{ commitmentId, body }` → inserts `nudges (commitment_id, email_id, body, sent_at)` with `email_id` read from the commitment row and `sent_at: null`; returns `{ id }`. `404` if `commitmentId` doesn't exist.

**`GET /api/contacts?sort=&groupByDomain=`** — `{ id, name, email, domain, avatarUrl, isVip, messageCount, yourAvgReplyHours, lastContactAt, openThreadIds, toneHistory }[]`, excluding the account owner's own address (see Key Decisions). `sort` mirrors `app/contacts/page.tsx`'s current client-side options; `groupByDomain` returns the same array (grouping stays a frontend concern — matches the page's existing "group-by-company" being a client-side reshape of one flat list, not a different query shape).

**`GET /api/contacts/:id`** — single `Contact`, `404` if not found.

**`PATCH /api/contacts/:id/vip`** — `{ value: boolean }` → `{ updated: Contact }`.

## Key Decisions

1. **`Upsert contacts` and `Insert thread_entries` run synchronously in the main path, not as fire-and-forget fan-out branches like Triage/Action/Commitment Extraction.** These are plain Postgres writes (fast, no LLM latency), and `commitment-extraction.json`'s counterparty lookup (FR9) needs the contact row to already exist — putting them in the synchronous path between `Inserted?` and the three-way fan-out guarantees no race, at the cost of adding (not removing) two nodes to the ingestion path's critical section. This is the one place this design accepts slightly more synchronous work in an already-verified path, and it's bounded (two single-query Postgres nodes, no external call) — unlike the LLM calls, which stay non-blocking per NFR6.
2. **The account owner has no email column anywhere in the schema** (`accounts` table, confirmed by reading `0001_ingestion_schema.sql` directly, has no `email` field — only `provider`/`n8n_credential_id`/sync-state columns). Two ways to identify "which contact is the account owner" were considered: (a) add an `email` column to `accounts` in this phase's migration, or (b) use a per-email heuristic (the `from` participant on an `is_from_user = true` row). **Decision: (b).** Adding a column to `accounts` is a real schema decision with its own migration-ordering and backfill questions (what populates it for the existing single account row?) that this phase's scope — Follow-ups and Contacts — doesn't need solved generally; it only needs "don't create a contacts row for yourself" and "don't show yourself in the contacts list," both of which the heuristic in FR6/FR17 satisfies. If a later phase needs the owner's email for another reason (e.g. Settings), adding the column then is still available and this decision doesn't block it.
3. **`contact_aggregates` (the SQL view in `0006`) computes only `message_count`/`last_contact_at`; `yourAvgReplyHours`/`openThreadIds` live in `contact-mapping.ts` (TypeScript), not SQL.** Reply-pairing (which message replied to which, and how long it took) requires per-thread ordering and `is_from_user` alternation logic that's substantially more complex than a `group by` aggregate, and is far easier to write, test, and adjust as TypeScript against already-fetched rows than as a view definition iterated on via new migrations. This mirrors where `009` put `buildSla` (application layer, not a Postgres function) for the same reason: derived values with real logic behind them stay in the API tier; simple counts/maxes stay in SQL.
4. **`thread_entries.gist` is the first 200 characters of the raw body, not an AI-generated one-line summary.** The normaliser writes this row before Triage Pipeline (a parallel, non-blocking branch with no ordering guarantee) has produced a summary. Three alternatives were considered: (a) leave `gist` empty until a later enrichment step backfills it, (b) have Triage Pipeline itself write `thread_entries` instead of the normaliser, (c) truncate the raw body as an honest, immediately-available placeholder. **Decision: (c)** — (a) makes the Board Sheet timeline visibly broken on every new message until a second write happens; (b) would require restructuring which workflow owns `thread_entries` writes and coupling `thread_entries`' existence to Triage's success/failure, which today can independently fail (`triage_error`) without blocking ingestion. A raw-text truncation is honest about what it is (no attempt to look like an AI summary) and never depends on a second workflow's outcome.
5. **`message-mapping.ts`'s `buildContact()` falls back to the pre-existing placeholder synthesis, not a thrown error, when no matching `contacts` row exists (spec FR12, Edge Cases).** Post-FR6 this should be rare (every normalized email upserts its participants), but a message read via `GET /api/messages` must never 500 because of a contacts-lookup miss — matching this file's existing "fall back rather than throw... so one bad row can't break a list read" convention for the `from` participant fallback.
6. **`GET /api/contacts?groupByDomain=` does not change the query shape** — grouping-by-domain stays a reshape of the same flat contact list the client already does today (reading `app/contacts/page.tsx` confirms this is currently a client-side `groupBy`), so the route accepts the param for forward compatibility with the page's existing UI toggle but the server-side behavior is identical with or without it this phase. If a future phase needs server-side pagination *per group*, this would need revisiting — not needed for the data volumes this dashboard targets today (single-user mailbox).

## Risks & Mitigations

- **Risk: migrations `0006`/`0007` and the `email-normaliser.json` edit ship out of lockstep (spec NFR5).** Unlike `010`'s NFR5 (where the old behavior merely breaks going forward), here the failure mode is worse if the workflow edit lands first: every ingested email's `Upsert contacts`/`Insert thread_entries` node errors against a nonexistent table, potentially failing the *entire* normaliser run (not just the new branches) depending on n8n's node-failure propagation, which could regress Triage/Action Extraction too. *Mitigation:* both migrations must be confirmed live (via a direct schema check, not just "the file was committed") before the workflow JSON is imported/activated; `tasks.md` sequences this as an explicit, non-parallelizable wave-1 dependency, and each migration's header comment states the ordering requirement per NFR5.
- **Risk: the account-owner heuristic (Key Decision 2) misidentifies the owner on an account that has never sent mail yet** (a brand-new account, before `watch()`'s `SENT` coverage produces even one `is_from_user = true` row). Until then, every participant — including the owner, appearing as a `to`/`cc` on inbound mail — gets a `contacts` row, and `GET /api/contacts` (which filters using the same heuristic) has nothing to filter yet, so the owner briefly appears in their own contacts list. *Mitigation:* self-resolving once the account sends its first email post-`watch()`-widening; named explicitly here and in spec.md Edge Cases rather than silently accepted as unknown behavior. Not worth a schema change (Key Decision 2) for a gap that closes itself within one sent email.
- **Risk: `commitment-extraction.json`'s LLM call over-detects commitments in routine phrasing** ("Let me know if you have questions" being flagged as a promise). *Mitigation:* FR9's prompt requires a verbatim `trigger_sentence` the UI displays directly (spec.md Overview/PRODUCT.md's explainability rule) — a wrong extraction is visibly wrong because the quoted sentence sits right next to the claim, the same hallucination-mitigation shape `0003`'s foreign-key-to-source-email comment already established for `tasks`. `confidence` is also captured (FR9) so a future phase could add a review-queue-style threshold; not gated in this phase since Follow-ups has no review-queue equivalent designed yet.
- **Risk: `GET /api/awaiting-reply`'s thread-grouping query performs a `group by thread_id` + `max(received_at)` correlated lookup that could be slow without an index.** *Mitigation:* `emails.thread_id` and `emails.received_at` are both plain, low-cardinality-safe columns already used elsewhere (message-mapping's list route sorts/filters on `received_at`) — no new index is introduced in this phase's migrations, but `tasks.md`'s implementation task for this route notes it as a follow-up if query latency becomes visible at real mailbox volumes (out of scope to speculatively index before evidence of a problem, per this project's "no speculative work" convention).

## Grounding sources

- `BACKEND-REQUIREMENTS.md` §5.2 (`0006`/`0007` migration blocks), §5.3 (Follow-ups/Contacts endpoint tables), §5.4.A (Gmail Renewal & Recovery / Email Normaliser rows), §6 ("Phase 3" build-order row) — the source of this phase's scope boundary.
- `n8n/workflows/gmail-renewal-recovery.json` (read directly: both `labelIds: ["INBOX"]` occurrences, node names `"Call watch()"`/`"Re-register watch()"`) and `n8n/workflows/gmail-ingestion.json` (read directly: contains no `watch()` call) — corrects the proposal's file list; grounds spec FR1.
- `n8n/workflows/email-normaliser.json` (read directly, full file: `Normalize`'s existing `labels` computation, `Upsert email`'s `INSERT`, the `Inserted?` gate, and the existing two-branch non-blocking fan-out with its `004`/`005` notes) — grounds spec FR2/FR5–FR8 and this design's Key Decision 1.
- `gmail-dashboard/lib/data/message-mapping.ts` (read directly, full file: `buildContact()`'s own comment naming "Phase 3" as when it stops being a placeholder; the `thread: []` comment naming `thread_entries`) — grounds spec FR12 and confirms this phase is exactly what those comments were waiting for.
- `gmail-dashboard/lib/data/fixtures/commitments.ts` (read directly: `COMMITMENTS` vs. the separately-defined `AWAITING_REPLY` with its own comment "tracked separately... since these are simply unanswered outbound mail") — grounds spec FR13/FR14's decision to keep these as two distinct reads, resolving the proposal's fourth open question.
- `gmail-dashboard/lib/data/fixtures/contacts.ts` and `gmail-dashboard/lib/data/index.ts` (read directly: `getContacts()`'s `CONTACTS.filter((c) => c.id !== "c-you")`) — confirms the fixture layer already excludes a synthetic "owner" contact, the precedent Key Decision 2's read-time filter follows.
- `supabase/migrations/0001_ingestion_schema.sql` (read directly: `accounts` table definition) — confirms no `email` column exists, grounding Key Decision 2.
- `gmail-dashboard/components/board/board-provider.tsx` (read directly, full file: `toggleVip`'s current dispatch-only action, `isVip`'s `vipOverrides[contactId] ?? fallback` read, and the existing `patchMessage`/`postIds` fire-and-forget helpers) — grounds spec FR21's exact integration point.
- `.specclaw/changes/010-dashboard-actions-drafts-api/design.md` — the precedent this design follows for structure (Technical Approach → Architecture diagram → File Changes Map → Data Model → API → Key Decisions → Risks → Grounding sources) and for citing evidence from files read directly rather than the proposal alone.
