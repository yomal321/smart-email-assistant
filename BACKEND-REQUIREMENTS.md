# Backend Requirements for the Gmail Dashboard

**Written for:** you (and whoever builds the backend) — a build spec, not a status report.

Scope: everything `gmail-dashboard/` (Next.js prototype, fixture data only) needs from a server in order to stop being a prototype. It compares the dashboard's feature surface against what already exists in `supabase/migrations/` + `n8n/workflows/`, then lists exactly what has to be built.

Sources read: `gmail-dashboard/lib/data/types.ts`, `gmail-dashboard/lib/data/index.ts`, all 11 routes + 4 providers, `supabase/migrations/0001–0004`, all 7 n8n workflows, `CAPABILITIES.md`.

---

## 1. Executive summary

| | |
|---|---|
| Dashboard modules built | 11 routes, 100% on hardcoded fixtures |
| Dashboard read functions to serve | 22 (`lib/data/index.ts`) |
| Dashboard write/mutation actions to serve | 23 (4 React providers) |
| Backend tables today | 5 (`accounts`, `emails`, `tasks`, `drafts`, `sync_outcomes`) |
| Backend HTTP endpoints today | 2 (`/webhook/gmail-pubsub`, `/webhook/generate-draft`) |
| Dashboard data fields with **no** backend column | ~35 (priority, confidence, reasons, tone, entities, SLA, snooze, commitments, contacts, rules, activity log…) |
| Dashboard modules with **zero** backend support | Follow-ups, Contacts, Analytics, Rules, Settings, Activity log, Search |
| Estimated coverage of the dashboard by today's backend | **~20%** |

The blunt version: the ingestion and AI pipeline is real and working, but it produces a *much* thinner record than the dashboard was designed around. The dashboard assumes a message carries a priority score, a confidence number, an explanation, a tone, extracted entities, an SLA clock and a handling status. The database stores a category string and a summary string. Most of the backend work below is **enriching the triage output and adding a read/write API**, not rebuilding ingestion.

---

## 2. What the dashboard can do (full inventory)

### 2.1 Routes

| Route | Module | What the user can do there |
|---|---|---|
| `/` | Overview | Balance band (waiting on you vs them), 5 KPI cards, top-8 priority queue with inline row actions, 14-day volume trend, 3 quick actions (triage / review drafts / clear low-priority) |
| `/inbox` | Smart Inbox | The board: filter by priority / has-action-items / unanswered, sort by priority·date·delay·sender, filter by platform via `?platform=`, saved views via `?view=`, deep-link a message via `?open=`, full keyboard triage, bulk selection, undo |
| *(overlay)* | Board Sheet | Per-message detail: summary, TL;DR, "why this was prioritised" + confidence, reassign platform, mark sender VIP, thread timeline, extracted entities, action items, suggested reply with tone control + regenerate, commit/diff view before send, sender stats, Open-in-Gmail deeplink |
| `/actions` | Action items | List view grouped Overdue / This week / Later / No date, Kanban view (todo → in-progress → done), manual add, export (CSV live; Todoist/Notion/Jira stubbed) |
| `/drafts` | Drafts | Pending drafts beside the original message, tone (formal/friendly/brief/firm), length (brief/standard/detailed), regenerate, insert-phrase snippets, free edit, approve → commit view → send, discard, approval-history table (edit distance, time-to-approve) |
| `/follow-ups` | Follow-ups & commitments | Three sections: Awaiting reply, You promised, Promised to you — each with days elapsed, the verbatim trigger sentence, a confidence figure, and a "Nudge" composer dialog |
| `/contacts` | Contacts | Sortable table (messages, your avg reply time, last contact, open threads), group-by-company, VIP toggle, per-contact dialog with stats + 6-month tone history + open threads |
| `/analytics` | Analytics | Volume trend, response-time histogram, category breakdown by week, busiest-hours heatmap, 4 AI-performance figures |
| `/rules` | Rules & automation | Enable/disable rules, IF/THEN rule builder with a match-count preview, category rename/merge/create, 4 priority-weight sliders, auto-reply rule with daily cap + confidence floor |
| `/settings` | Settings | Connected account + resync, AI model/summary-length/signature/style samples, daily digest + schedule, privacy exclusion rules + retention + purge, working hours + timezone, theme, density, activity log table |
| `/review` | Review queue | Every message the classifier couldn't parse (`ai === null`) or scored `< 50` confidence |

### 2.2 Cross-cutting behaviour

- **Command palette** (`⌘K` / `/`) — actions, route jumps, message search, contact search.
- **Keyboard triage** — `J/K` move, `Enter` open, `E` archive, `D` done, `S` snooze, `R` reply, `X` select, `⇧J/⇧K` extend selection, `1–7` reassign platform, `!` VIP, `U` undo, `G+letter` navigation, `?` shortcut sheet.
- **Undo** on every destructive action, 8-second window.
- **Sync clock** — status, last sync, queue depth, failed count, error message, "Resync now".
- **Theme + density**, persisted to `localStorage` (this one genuinely stays client-side).

### 2.3 The read API the dashboard already expects

All of `gmail-dashboard/lib/data/index.ts` — this file is the contract. Every function here needs a server equivalent:

`getMessages` · `getMessageById` · `getContacts` · `getActionItems` · `getDrafts` · `getCommitments` · `getAwaitingReply` · `getSyncState` · `getRules` · `getActivityLog` · `getBoardMessages` · `needsReview` · `getReviewQueue` · `getInboxMessages` · `getHandledMessages` · `getMessagesByPlatform` · `getPlatformCounts` · `getSortedByPriority` · `getPriorityQueue` · `getBalance` · `getKpis` · `getVolumeTrend`

### 2.4 The write API the dashboard already expects

From the four providers — these are currently in-memory `useReducer` calls that vanish on refresh:

| Provider | Mutations |
|---|---|
| `board-provider` | `archive`, `markDone`, `snooze`, `restore`, `reassign`, `toggleStar`, `toggleVip`, plus selection/undo bookkeeping |
| `action-items-provider` | `addManual`, `setStatus` |
| `drafts-provider` | `updateBody`, `setTone`, `setLength`, `setStatus` (pending/approved/sent/discarded) |
| `preferences-provider` | `setTheme`, `setDensity` *(client-only, no backend needed)* |

Plus mutations that exist only as UI today: rule create/update/toggle, category rename/merge/create, priority-weight save, auto-reply config, nudge send, settings save, purge, resync, regenerate draft, save view, CSV export.

---

## 3. What the backend already has

### 3.1 Database (`supabase/migrations/`)

```
accounts       id, provider, n8n_credential_id, sync_cursor, subscription_id,
               subscription_expires_at, last_successful_sync,
               resync_gap_start, resync_gap_end, created_at
emails         id, account_id, provider, provider_message_id, thread_id,
               participants(jsonb), subject, body, raw_payload(jsonb), labels(jsonb),
               category, summary, received_at, created_at,
               triage_error, action_extraction_error, draft_generation_error
tasks          id, email_id (UNIQUE), task_text, deadline, status(open|done|dismissed), created_at
drafts         id, email_id, draft_body, status(pending|sent|discarded), created_at
sync_outcomes  id, account_id, outcome(renewed|re-registered|failed), occurred_at
```

### 3.2 n8n workflows

| Workflow | Trigger | What it does |
|---|---|---|
| **Gmail Ingestion** | webhook `gmail-pubsub` | Verifies the Pub/Sub OIDC token, reads the cursor, `history.list` → `messages.get`, calls Email Normaliser, advances the cursor |
| **Email Normaliser** | sub-workflow | Normalises the provider payload, upserts `emails`, and on a fresh insert fans out to Triage + Action Extraction |
| **Triage Pipeline** | sub-workflow | Prompts the LLM, validates, writes `category` + `summary`, or `triage_error` |
| **Action Extraction** | sub-workflow | Prompts the LLM for a commitment, writes one `tasks` row, or `action_extraction_error` |
| **Draft Generation** | webhook `generate-draft` | Secret check + cooldown + 404 + 5/hour regeneration cap, reads the thread + a style sample, prompts, writes a `pending` draft |
| **LLM Gateway** | sub-workflow | Single Gemini call site, shared by all three AI workflows |
| **Gmail Renewal & Recovery** | 6-hourly schedule | Renews the Gmail `watch()`, re-registers on failure, catch-up via `history.list` with a `messages.list` fallback, records the outcome |

### 3.3 Guarantees worth preserving

- No Gmail-send credential exists anywhere in the system — auto-send is structurally impossible.
- Every task and draft is foreign-keyed to its source email.
- Prompt-injection delimiters wrap all untrusted email content.
- The draft endpoint has a constant-time secret check, brute-force cooldown, and a regeneration cap.

---

## 4. Gap analysis — dashboard concept vs backend reality

### 4.1 Vocabulary mismatch (decide this before writing any code)

| Dashboard | Backend | Problem |
|---|---|---|
| 7 platforms: `needs-reply, meeting, invoice, fyi, newsletter, automated, spam-ish` | 5 categories: `needs_reply, fyi, waiting_on_someone_else, promotional, low_priority` | Neither is a subset of the other. `meeting`, `invoice`, `automated`, `spam-ish` don't exist server-side; `waiting_on_someone_else` and `low_priority` don't exist client-side. **The check constraint on `emails.category` has to change.** |
| `ActionItem[]` per message (`ai.actionItemIds` is an array) | `tasks.email_id` is **UNIQUE** — at most one task per email | The unique constraint must be dropped, or the dashboard permanently shows at most one item per message. |
| `Draft` with `tone`, `length`, `generatedBody`, `editDistance`, `approvedAt` | `drafts` has `draft_body` + `status` only | Tone/length controls and the whole approval-history table have nowhere to persist. |
| `Commitment` with direction `you-promised` | Nothing — and **sent mail is not ingested at all** | "You promised" cannot be populated. This is the product's headline differentiator per `PRODUCT.md`. |

### 4.2 Field-level gaps on a message

Every one of these is rendered by the dashboard and has no column today:

`ai.confidence` · `ai.priority` · `ai.priorityScore` · `ai.reasons[]` · `ai.tone` · `ai.toneEvidence` · `ai.tldr` · `ai.entities.{dates,amounts,people,links,addresses}` · `ai.processedAt` · `ai.modelRun` · `sla.{targetHours,elapsedHours,state,overdueBy}` · `status(open|archived|snoozed|done)` · `snoozedUntil` · `handledAt` · `handledAction` · `isUnread` · `isStarred` · `attachments[]` · `thread[]` (per-message gists) · `gmailUrl`

### 4.3 Module-level coverage

| Module | Backend support today | Verdict |
|---|---|---|
| Smart Inbox | `emails.category` + `summary` only | **Partial** — no priority, no SLA, no status |
| Board Sheet | summary only | **Partial** — the explainability panel has no data |
| Review queue | `triage_error` exists, but no confidence score | **Partial** — can show hard failures, not low-confidence |
| Action items | `tasks` table | **Partial** — 1-per-email cap, no priority, no owner, no origin |
| Drafts | `drafts` table + generate endpoint | **Partial** — no tone/length/history |
| Overview | — | **Missing** — every KPI is computed client-side from fixtures |
| Follow-ups | — | **Missing** entirely |
| Contacts | `participants` jsonb only | **Missing** — no contacts table, no aggregates |
| Analytics | — | **Missing** entirely |
| Rules | — | **Missing** entirely |
| Settings | `accounts` row | **Missing** — no settings storage |
| Activity log | `sync_outcomes` only | **Missing** |
| Search | — | **Missing** (`tsvector` never migrated) |
| Sync state | `accounts` + `sync_outcomes` | **Partial** — no queue depth, no failed count, no live status |

---

## 5. What has to be built

### 5.1 Decision to make first — the access model

`CAPABILITIES.md` flags this as the one open blocker: anon key vs service-role key, with RLS off by design.

**Recommendation: neither from the browser.** Add a server tier — Next.js **Route Handlers** inside `gmail-dashboard/app/api/**` — holding the Supabase service-role key server-side, with a single-user session cookie in front. The browser never sees a database key, RLS staying off becomes acceptable (the API is the boundary), and n8n keeps writing to Postgres directly as it does now. It also means `lib/data/index.ts` gets replaced function-for-function with `fetch` calls and nothing in the view layer changes — which is exactly what that file was built for.

### 5.2 Schema migrations (new)

**`0005_dashboard_message_enrichment.sql`**

```sql
alter table emails
  add column platform            text,      -- the 7-value vocabulary
  add column confidence          int,       -- 0-100; < 50 routes to the review queue
  add column priority            text check (priority in ('urgent','normal','low')),
  add column priority_score      int,       -- 0-100, drives the default sort
  add column reasons             jsonb,     -- string[]: the "why this was prioritised" bullets
  add column tone                text check (tone in ('tense','neutral','warm')),
  add column tone_evidence       text,
  add column tldr                text,
  add column entities            jsonb,     -- {dates,amounts,people,links,addresses}
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
  add column is_from_user        boolean not null default false;  -- sent mail, for commitments
-- widen the category constraint to the 7-platform vocabulary (or map in the API layer)
```

`sla.elapsedHours`, `sla.state` and `sla.overdueBy` are **derived** from `received_at` + `sla_target_hours` — compute them in a view, not in columns.

**`0006_threads_and_contacts.sql`**

```sql
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
-- messageCount / yourAvgReplyHours / lastContactAt / openThreadIds: a view, not columns
```

**`0007_commitments.sql`**

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

**`0008_drafts_enrichment.sql`**

```sql
alter table drafts
  add column generated_body text,          -- the original, for the commit-view diff
  add column tone   text check (tone in ('formal','friendly','brief','firm')),
  add column length text check (length in ('brief','standard','detailed')),
  add column approved_at timestamptz,
  add column edit_distance int;
alter table drafts drop constraint drafts_status_check;
alter table drafts add constraint drafts_status_check
  check (status in ('pending','approved','sent','discarded'));
```

**`0009_tasks_enrichment.sql`**

```sql
alter table tasks drop constraint tasks_email_id_key;   -- allow many per email
alter table tasks
  add column owner_name text, add column owner_email text,
  add column priority text not null default 'normal' check (priority in ('urgent','normal','low')),
  add column origin text not null default 'extracted' check (origin in ('extracted','manual')),
  add column confidence int;
alter table tasks drop constraint tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('todo','in-progress','done','dismissed'));
```

**`0010_rules_settings_activity.sql`**

```sql
create table rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  enabled boolean not null default true,
  conditions jsonb not null,               -- [{field, operator, value}]
  actions jsonb not null,                  -- [{type, params}]
  condition_summary text, action_summary text,
  daily_cap int, confidence_floor int,     -- required for auto-reply rules
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
  signature text, style_samples text,
  summary_length text, digest_enabled boolean, digest_time text,
  exclusion_rules jsonb, retention_days int,
  timezone text, work_hours_start time, work_hours_end time,
  priority_weights jsonb                   -- {vip, deadline, direct_question, age}
);
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  at timestamptz not null default now(),
  action text not null, target text, cause text,
  undoable boolean not null default false,
  undo_payload jsonb                       -- what it takes to reverse it
);
create table saved_views (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  slug text not null, label text not null, filters jsonb not null,
  unique (account_id, slug)
);
create table categories (                  -- rename / merge / custom categories
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  key text not null, label text not null, number int,
  merged_into uuid references categories(id),
  unique (account_id, key)
);
```

**`0011_search.sql`** — the `tsvector` column + GIN index + trigger that `CAPABILITIES.md` says was never migrated.

### 5.3 HTTP API to build

Every route below replaces one function in `lib/data/index.ts` or one provider mutation. "Depends on" names the migration that must land first.

**Messages / board**

| Method | Path | Replaces | Depends on |
|---|---|---|---|
| GET | `/api/messages?status=&platform=&priority=&hasActions=&unanswered=&sort=&view=&limit=&cursor=` | `getInboxMessages`, `getMessagesByPlatform`, `getSortedByPriority`, filter bar, saved views | 0005 |
| GET | `/api/messages/:id` | `getMessageById` + Board Sheet | 0005, 0006 |
| GET | `/api/messages/counts` | `getPlatformCounts`, rail badges | 0005 |
| GET | `/api/review-queue` | `getReviewQueue` (`ai is null or confidence < 50`) | 0005 |
| POST | `/api/messages/archive` `{ids[]}` | `board.archive` | 0005 |
| POST | `/api/messages/done` `{ids[]}` | `board.markDone` | 0005 |
| POST | `/api/messages/snooze` `{ids[], until}` | `board.snooze` | 0005 |
| POST | `/api/messages/restore` `{ids[]}` | `board.restore` / undo | 0005 |
| PATCH | `/api/messages/:id/platform` `{platform}` | `board.reassign` (also a training signal — log it) | 0005 |
| PATCH | `/api/messages/:id/star` `{value}` | `board.toggleStar` | 0005 |
| POST | `/api/undo/:actionId` | the 8-second undo bar, server-side | 0010 |
| GET | `/api/search?q=` | command palette + `/` search | 0011 |

**Action items**

| Method | Path | Replaces |
|---|---|---|
| GET | `/api/action-items?status=` | `getActionItems` |
| POST | `/api/action-items` `{text,dueDate}` | `addManual` |
| PATCH | `/api/action-items/:id` `{status,dueDate,priority}` | `setStatus`, Kanban moves |
| GET | `/api/action-items/export.csv` | the Export → CSV item |

**Drafts**

| Method | Path | Replaces |
|---|---|---|
| GET | `/api/drafts?status=` | `getDrafts` + approval history |
| POST | `/api/drafts` `{messageId,tone,length}` | Regenerate / first generation — **proxy to the existing n8n `generate-draft` webhook**, don't reimplement it |
| PATCH | `/api/drafts/:id` `{body,tone,length}` | `updateBody`, `setTone`, `setLength` (compute `edit_distance` here) |
| POST | `/api/drafts/:id/status` `{status}` | approve / discard / sent |

> **Sending is the one irreversible action.** Today there is deliberately no Gmail-send credential. If "Send" in the commit view is to actually send, that guarantee is being traded away — do it as its own reviewed change with `gmail.send` scope isolated to a single workflow, or keep it as "create a Gmail draft" (`gmail.compose`) and let the user press send in Gmail.

**Follow-ups & commitments**

| Method | Path | Replaces |
|---|---|---|
| GET | `/api/commitments?direction=` | `getCommitments` |
| GET | `/api/awaiting-reply` | `getAwaitingReply` |
| PATCH | `/api/commitments/:id` `{status}` | met / missed |
| POST | `/api/nudges` `{commitmentId,body}` | the Nudge dialog |

**Contacts**

| Method | Path | Replaces |
|---|---|---|
| GET | `/api/contacts?sort=&groupByDomain=` | `getContacts` |
| GET | `/api/contacts/:id` | the contact dialog (stats, tone history, open threads) |
| PATCH | `/api/contacts/:id/vip` `{value}` | `board.toggleVip` — must persist, it feeds priority scoring |

**Overview & analytics**

| Method | Path | Replaces |
|---|---|---|
| GET | `/api/overview` | `getKpis` + `getBalance` + `getPriorityQueue` in one call |
| GET | `/api/analytics/volume?days=14` | `getVolumeTrend` |
| GET | `/api/analytics/response-times` | the histogram (currently hardcoded buckets) |
| GET | `/api/analytics/categories?weeks=6` | the breakdown (currently a hardcoded `DATA` map) |
| GET | `/api/analytics/busiest-hours` | the heatmap (currently a synthetic `cellValue()` function) |
| GET | `/api/analytics/ai-performance` | accuracy / acceptance / edit rate / time saved — needs a feedback trail: reassignments, draft edit distances, corrections |

**Rules**

| Method | Path | Replaces |
|---|---|---|
| GET / POST / PATCH / DELETE | `/api/rules[/:id]` | rule list, toggle, builder save |
| POST | `/api/rules/preview` `{conditions}` | "Would have matched N messages in the last 30 days" — **currently a fake count derived from string length**; this needs to be a real query |
| GET / POST / PATCH | `/api/categories` | rename / merge / create custom |

**Settings & system**

| Method | Path | Replaces |
|---|---|---|
| GET / PATCH | `/api/settings` | the whole Settings page except theme/density |
| GET | `/api/sync` | `getSyncState` — status, lastSyncAt, queueDepth, failedCount, nextRetryAt, error |
| POST | `/api/sync/resync` | "Resync now" (both places) — triggers the n8n recovery workflow |
| GET | `/api/activity` | `getActivityLog` |
| POST | `/api/settings/purge` `{confirm:"PURGE"}` | the purge box |
| GET / POST / DELETE | `/api/saved-views` | "Save view" in the filter bar |
| — | auth: session cookie, login, logout | nothing exists today |

### 5.4 Pipeline work — what is a new workflow, what is an edit, what is neither

Most of the backend work is **not** n8n. The existing 7 workflows cover the hard parts (Gmail auth, push, cursor management, recovery, the LLM call site) and mostly need editing, not replacing. The API tier in §5.3 is where the bulk of new code lives.

#### A. Existing workflows to edit (5 of 7)

| Workflow | Change | Why |
|---|---|---|
| **Gmail Renewal & Recovery** | `labelIds: ["INBOX"]` → `["INBOX","SENT"]` in both `watch()` calls (2 places). Add a webhook trigger alongside the 6-hourly schedule | Sent mail currently never fires a push notification — this one line is what blocks Follow-ups, avg reply time and the response-time histogram. The webhook trigger backs "Resync now" |
| **Email Normaliser** | Set `is_from_user`; upsert `contacts`; insert `thread_entries`; add a fan-out call to Commitment Extraction | The normaliser is already the fan-out point — it calls Triage + Action Extraction today. One more branch |
| **Triage Pipeline** | Bigger prompt + validator: platform (7 values), confidence, priority + score, `reasons[]`, tone + evidence, tldr, entities. Write ~15 columns instead of 2 | This is the single biggest gap. No new workflow — same shape, richer output |
| **Action Extraction** | Emit *many* tasks per email, with priority / owner / origin / confidence | Depends on dropping the UNIQUE constraint (0009) |
| **Draft Generation** | Accept `tone` + `length` in the request; persist `generated_body`, `tone`, `length` | The endpoint, auth, cooldown and cap all stay exactly as they are |

**LLM Gateway** and **Gmail Ingestion** need no changes at all. (Ingestion inherits SENT mail automatically once `watch()` includes it — `history.list` with `historyTypes=messageAdded` already picks up whatever the subscription covers.)

#### B. Genuinely new workflows (4 required, 2 conditional)

| # | New workflow | Trigger | Required for | Phase |
|---|---|---|---|---|
| 1 | **Commitment Extraction** | sub-workflow, called by Email Normaliser | Follow-ups — both directions, emitting the verbatim trigger sentence the UI displays | 3 |
| 2 | **Backfill / Re-enrich** | manual, one-off | Historical + sent mail, and re-running enriched triage over rows already in `emails` (otherwise the dashboard is empty on day one of every new field) | 1 & 3 |
| 3 | **Rule Engine** | sub-workflow, after triage | Rules actually running: auto-label / auto-archive / auto-prioritise / auto-draft, writing `rule_runs` + `activity_log`, enforcing `daily_cap` + `confidence_floor` | 5 |
| 4 | **Retention & Purge** | schedule | The Settings retention period and the purge box | 4 |
| 5 | **Daily Digest** | schedule | *Only if* the digest toggle ships | 4 |
| 6 | **Gmail Draft / Send** | webhook | *Only if* open question 2 says the commit view actually sends (or creates a Gmail draft). Also backs the Nudge send. Keep it as one isolated workflow so the credential boundary stays auditable | TBD |

#### C. Not a workflow — do it in SQL or the API tier

| Need | Where it belongs |
|---|---|
| SLA state (`elapsedHours`, `state`, `overdueBy`) | A view over `received_at` + `sla_target_hours`. A job only if you want overdue *notifications* |
| Contact aggregates (`messageCount`, `yourAvgReplyHours`, `lastContactAt`, `openThreadIds`) | A view |
| Monthly tone rollup | A materialised view, refreshed nightly |
| All analytics (volume, response times, category breakdown, busiest hours) | SQL aggregation behind the `/api/analytics/*` endpoints |
| Search | `tsvector` + GIN index (0011), queried by `/api/search` |
| Undo, saved views, settings CRUD, rules CRUD, CSV export | API tier |
| Sync state (queue depth, failed count) | A counter table the existing workflows write to — no new workflow, just two extra Postgres nodes |

**Summary:** 5 workflows edited, 4 new (plus 2 conditional), and roughly 45 API routes. The n8n side is the smaller half of the job.

### 5.5 Frontend work this implies

Small but unavoidable: replace `lib/data/index.ts` with `fetch` calls, convert the four providers from `useReducer`-only to optimistic-update-plus-API (undo becomes "call the restore endpoint"), add loading/error states per route, and add auth. The view components should not need to change — that was the point of the data-access layer.

---

## 6. Suggested build order

| Phase | Deliverable | Unblocks |
|---|---|---|
| **0** | Auth + `/api` tier + service-role key server-side | Everything. Resolves the open blocker in `CAPABILITIES.md` |
| **1** | Migration 0005 + enriched triage prompt + `GET/POST /api/messages*` | Inbox, Board Sheet, Review queue, Overview KPIs — the actual product |
| **2** | Migration 0009 + action-item endpoints; 0008 + draft endpoints wired to the existing generate webhook | Actions and Drafts go live |
| **3** | Sent-mail ingestion + 0006/0007 + commitments workflow | Follow-ups + Contacts + the differentiator in `PRODUCT.md` |
| **4** | 0010 + settings/activity/sync endpoints; 0011 + search | Settings, Rules storage, command-palette search |
| **5** | Rule engine execution + analytics aggregation endpoints | Rules actually run; Analytics stops being decorative |

Phases 1–2 get roughly 70% of the dashboard onto live data. Phase 3 is where it becomes the product the positioning claims.

---

## 7. Open questions to settle before coding

1. **Category vocabulary** — migrate the backend to the dashboard's 7 platforms, or map 5→7 in the API layer and accept that `meeting`/`invoice`/`automated`/`spam-ish` are never populated? (Recommend: migrate.)
2. **Send or don't send.** Does "Send" in the commit view send via Gmail, or create a Gmail draft? This decides whether the no-send-credential guarantee survives.
3. **Sent-mail ingestion scope** — all history, or from a start date? It changes the Gmail scope requested and the backfill cost.
4. **Priority scoring** — LLM-produced, or a deterministic formula fed by the four Rules sliders? The sliders imply the formula; the `reasons[]` field implies the LLM. Probably both: the LLM produces signals, the formula weights them.
5. **Where do the AI-performance numbers come from?** They need a correction/feedback trail (reassignments, edit distances) that nothing records today.
6. **Retention + purge semantics** — what exactly does "Purge all processed data" delete? Raw payloads too, or only derived fields?
7. **Auto-reply** — ship it at all in v1? It is the only irreversible automated action in the product.

---

## 8. Definition of done — will the whole dashboard work after this?

**Short answer: yes for the backend, no for "the dashboard works".** Everything in §5.2–5.4 is the complete backend scope — no further server work is hidden elsewhere in this document. But three things sit outside it, and the dashboard is not functional until they are handled too.

### 8.1 The three things a complete backend does *not* cover

1. **The frontend rewiring (§5.5) is mandatory, not optional.** Today every route reads from `lib/data/fixtures/*`. A finished backend changes nothing on screen until `lib/data/index.ts` is swapped for `fetch` calls, the four providers do optimistic-update-plus-API, and each route gains loading and error states. Budget this as real work — it touches every route, even though no view component changes.
2. **Seven open questions (§7) gate specific features.** They are not academic: question 1 decides whether four of the seven platforms can ever be populated, and question 2 decides whether the Send button sends.
3. **Some surfaces are stubbed by decision, and stay stubbed.** See the table in §8.3 — these are deliberate product choices recorded in `PRODUCT.md`, not gaps in this plan.

### 8.2 Per-module: what makes each surface actually work

| Dashboard surface | Fully functional after | Caveat |
|---|---|---|
| Overview — balance band, KPIs, priority queue | Phase 1 | Volume trend needs 14 days of real history, or the Backfill workflow |
| Smart Inbox — list, filters, sort, platform views | Phase 1 | Saved views need Phase 4 |
| Board Sheet — summary, why-prioritised, entities, thread, reassign | Phase 1 | Sender stats need Phase 3; suggested reply needs Phase 2 |
| Review queue | Phase 1 | — |
| Keyboard triage, bulk actions, undo | Phase 1 | Undo becomes a server call, not local state |
| Action items — list, Kanban, manual add, CSV | Phase 2 | Todoist / Notion / Jira stay disabled — see §8.3 |
| Drafts — tone, length, regenerate, edit, approve, history | Phase 2 | "Send" depends on open question 2 |
| Follow-ups — awaiting reply, both commitment directions | Phase 3 | Nudge send depends on open question 2 |
| Contacts — table, aggregates, VIP, tone history | Phase 3 | Tone history shows only months that have been ingested |
| Settings — account, AI config, digest, privacy, hours | Phase 4 | Model selector stays stubbed — see §8.3 |
| Activity log | Phase 4 | Populates going forward only; it is not retroactive |
| Sync clock — status, queue depth, failed count, resync | Phase 4 | — |
| Search — command palette and `/` | Phase 4 | — |
| Rules — create, toggle, match preview | Phase 4 (storage) | Rules do not *run* until Phase 5 |
| Analytics — 4 charts | Phase 5 | Charts need accumulated history to be meaningful |
| AI performance — accuracy, acceptance, edit rate, time saved | Phase 5 | Near-empty at launch by nature; needs weeks of corrections and draft edits to mean anything |
| Theme, density | **Already works** | `localStorage`, correctly client-side |

### 8.3 What will still not function, on purpose

| Surface | Why | Source |
|---|---|---|
| Todoist / Notion / Jira export | Third-party integration credentials are explicitly undecided and out of scope; they exist as UI affordances only | `PRODUCT.md` — "Capabilities and Constraints" |
| AI model selector in Settings | The model vendor and version are undecided and "not to be invented" | `PRODUCT.md` |
| Data retention durations | Undecided — the dropdown ships with "Not set" as a real option | `PRODUCT.md` |
| Category "Merge" button | Merge semantics (what happens to already-classified mail) need a decision before the endpoint can be specified | this document, §5.2 `categories` table |
| Auto-reply | Gated on open question 7 | §7 |

### 8.4 So, in one sentence

Finish §5.2–5.4, do the frontend rewiring in §5.5, and answer the seven questions in §7 — and every surface in the dashboard runs on live data except the five deliberately stubbed items in §8.3. There is no additional backend work hiding outside this document.
