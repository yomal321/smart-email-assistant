# Proposal: Dashboard Actions & Drafts API (Backend Phase 2 of 6)

**Created:** 2026-09-14
**Status:** 🟡 Draft

## Problem

`009-dashboard-messages-api` closed the biggest gap — the inbox itself — but left the two other modules with real backend tables sitting on the same `useReducer`-only providers as everything else. `action-items-provider.tsx` and `drafts-provider.tsx` both call a `lib/data` fixture getter once on mount and then mutate an in-memory array that vanishes on refresh; nothing they do reaches `tasks` or `drafts`.

Per `BACKEND-REQUIREMENTS.md` §4.1/§4.2, the schema underneath both tables is also too thin for what the dashboard already renders:

- `tasks.email_id` is `UNIQUE` — Action Extraction can only ever write one task per email, but `ActionItem[]`, the manual-add flow, and the Kanban board all assume many independent items exist side by side.
- `tasks` has no `priority`, `owner`, or `origin` column, and its `status` check (`open`/`done`/`dismissed`) doesn't match the dashboard's Kanban vocabulary (`todo`/`in-progress`/`done`).
- `drafts` has no `tone`, `length`, `generated_body`, `approved_at`, or `edit_distance` — so the tone/length controls, the commit-view diff, and the entire approval-history table have no column to read or write.

`BACKEND-REQUIREMENTS.md` §6 names this combination — migration `0009` + action-item endpoints, migration `0008` + draft endpoints wired to the existing `generate-draft` webhook — as Phase 2, unblocking Actions and Drafts specifically.

## Proposed Solution

Same three-layer shape `009` established (schema → pipeline → API/frontend), run twice — once for tasks, once for drafts — because the two tables are independent and nothing here requires them to land together except the shared precedent.

- **Migration `0009_tasks_enrichment.sql`.** Drops `tasks_email_id_key` (the `UNIQUE` constraint), adds `owner_name`, `owner_email`, `priority` (`urgent`/`normal`/`low`, default `'normal'`), `origin` (`extracted`/`manual`, default `'extracted'`), `confidence`. Widens `tasks_status_check` to `todo`/`in-progress`/`done`/`dismissed` (`BACKEND-REQUIREMENTS.md` §5.2's `0009` block) — noting the dashboard's own `ActionItem.status` type (`gmail-dashboard/lib/data/types.ts`) only has `todo`/`in-progress`/`done`; whether `dismissed` needs a frontend type update or stays a backend-only value the UI never sets is an open question below.
- **Action Extraction gets its `Write task` query fixed, not its prompt rewritten.** `n8n/workflows/action-extraction.json`'s `Write task` node currently does `INSERT ... ON CONFLICT (email_id) DO NOTHING` — that clause references the constraint `0009` drops, so it must change regardless of anything else in scope (an `ON CONFLICT` target column with no matching unique/exclusion constraint is a runtime error, not a no-op). The fix: drop the `ON CONFLICT` clause (every extraction now inserts unconditionally, which is correct once one-per-email is no longer the model) and set `priority = 'normal'`, `origin = 'extracted'` explicitly on the insert (both are `NOT NULL` with defaults, but the workflow writes explicit values everywhere else rather than relying on column defaults). The LLM prompt/schema (`Build extraction prompt`, still `has_task`/`task_text`/`deadline`, one task per call) is **not** touched — extending it to emit multiple tasks per email in one pass is a separate, prompt-engineering-and-live-verification change (`BACKEND-REQUIREMENTS.md` §5.4.A's aspirational "emit many tasks per email"), and nothing in this phase's scope needs it: manual adds already produce independent rows, and dropping the constraint is what makes repeated single-task extraction across a thread possible without collision, without requiring the model to change what it asks for.
- **Migration `0008_drafts_enrichment.sql`.** Adds `generated_body`, `tone` (`formal`/`friendly`/`brief`/`firm`), `length` (`brief`/`standard`/`detailed`), `approved_at`, `edit_distance`. Widens `drafts_status_check` to `pending`/`approved`/`sent`/`discarded` (`BACKEND-REQUIREMENTS.md` §5.2's `0008` block).
- **Draft Generation accepts `tone` + `length` and persists `generated_body`.** Unlike Action Extraction, this workflow needs a real content change, not just a query fix: `n8n/workflows/draft-generation.json`'s `Verify secret` node only reads `body.email_id` today, and `Build draft prompt` has no notion of tone or length at all. `Verify secret` (or a node right after it) reads `tone`/`length` off the request body too; `Build draft prompt`'s `system_prompt` incorporates them (e.g. "draft in a {tone} tone, {length} length" alongside the existing style-sample instruction); `Write draft` inserts `generated_body` (the LLM's raw output, immutable) alongside `draft_body` (already there, the editable copy — on first insert these are identical) and the requested `tone`/`length`. The cooldown, secret check, 404/429/502 responses, and the "no Gmail-send credential" guarantee are untouched.
- **The action-items API.** `GET /api/action-items?status=`, `POST /api/action-items` (`{text, dueDate}` — the manual-add path only; nothing calls the extraction pipeline over HTTP), `PATCH /api/action-items/:id` (`{status, dueDate, priority}` — covers both Kanban drag and the list view's inline controls), per `BACKEND-REQUIREMENTS.md` §5.3.
- **The drafts API.** `GET /api/drafts?status=`, `POST /api/drafts` (`{messageId, tone, length}` — proxies to the existing `generate-draft` n8n webhook server-side, using the same session-auth boundary `008` established; the dashboard's Next.js server holds the `DRAFT_WEBHOOK_SECRET`, the browser never does), `PATCH /api/drafts/:id` (`{body, tone, length}` — computes `edit_distance` against `generated_body` here, in the API layer, not in n8n), `POST /api/drafts/:id/status` (`{status}` — approve/discard/sent, stamping `approved_at`).
- **Frontend rewiring.** `action-items-provider.tsx` and `drafts-provider.tsx` switch from a one-time fixture read + local `useState` mutation to fetch-on-mount + optimistic-update-plus-API, following the exact `board-provider.tsx` pattern `009` set. `app/actions/page.tsx` and `app/drafts/page.tsx` read through the providers already and are expected to need no changes, pending confirmation during design (the same "check for an actual caller before building" discipline `009`'s design.md applied to its four dropped routes).
- **CSV export.** `GET /api/action-items/export.csv` — the dashboard's export button already has a working CSV path per `BACKEND-REQUIREMENTS.md` §2.1; this endpoint is the live-data equivalent of whatever currently generates that CSV from fixtures.
- **`architect/04-data-model.md`** updated for both enriched tables, per the convention `006-draft-generation` set and `009` continued.

## Scope

### In Scope
- `supabase/migrations/0009_tasks_enrichment.sql`
- `supabase/migrations/0008_drafts_enrichment.sql`
- `n8n/workflows/action-extraction.json` — `Write task` node only (drop `ON CONFLICT`, set `priority`/`origin` explicitly)
- `n8n/workflows/draft-generation.json` — request-body read, `Build draft prompt`, and `Write draft` nodes (accept + use `tone`/`length`, persist `generated_body`)
- API routes: `GET /api/action-items`, `POST /api/action-items`, `PATCH /api/action-items/:id`, `GET /api/action-items/export.csv`, `GET /api/drafts`, `POST /api/drafts`, `PATCH /api/drafts/:id`, `POST /api/drafts/:id/status`
- Rewiring `action-items-provider.tsx` and `drafts-provider.tsx` off fixtures
- `architect/04-data-model.md` updated for the enriched `tasks` and `drafts` tables

### Out of Scope
- Migrations `0006`, `0007`, `0010`, `0011` (threads/contacts, commitments, rules/settings/activity, search) — Phases 3–4
- Extending Action Extraction to emit multiple tasks per email in a single LLM call — the constraint drop makes repeated single-task extraction safe, but changing what the model is asked to produce is a separate, live-verification-gated change
- Todoist/Notion/Jira export destinations — stay stubbed per `PRODUCT.md`, only the CSV path goes live
- Whether "Send" in the drafts commit view actually sends via Gmail, or only creates a Gmail draft (`BACKEND-REQUIREMENTS.md` §7 open question 2) — `POST /api/drafts/:id/status` with `status: "sent"` in this phase means "the user marked it sent," not "the API sent an email"; no Gmail-send credential is introduced
- Follow-ups, Contacts, Analytics, Rules, Settings — untouched, per the same phase boundaries `009` established

## Impact

- **Files affected:** ~13 (2 migrations, 2 n8n workflow edits, ~8 new route files, 2 rewired providers, 1 architecture doc)
- **Complexity:** medium — narrower than `009` (no new-column-heavy prompt rewrite; the workflow edits are smaller and more targeted), but two independent migration/endpoint pairs land in one change
- **Risk:** medium — dropping `tasks_email_id_key` while Action Extraction's write query still references it in an `ON CONFLICT` clause is a hard dependency ordering (the migration must land, and the workflow fix must ship, together — a partial rollout breaks every future extraction write); the `tone`/`length` prompt injection into Draft Generation is a live-model-output change needing the same fixture-pinning verification `004-triage`/`009` used

## Open Questions

- **`dismissed` status vocabulary gap.** `0009` widens `tasks_status_check` to include `dismissed` (matching `BACKEND-REQUIREMENTS.md`'s migration spec), but `gmail-dashboard/lib/data/types.ts`'s `ActionItem.status` type only has `todo`/`in-progress`/`done` — nothing in the current UI can produce or read `dismissed`. Recommend: add the column-level value for forward compatibility (as specified) but leave the frontend type/UI untouched this phase — same "honest placeholder, no invented UI" discipline `009` used for unpopulated columns.
- **Where does `edit_distance` get computed?** Recommend: in `PATCH /api/drafts/:id`, comparing the incoming `body` against the row's `generated_body` (not the previous `draft_body`) at write time, so it always reflects total drift from the original AI output rather than drift-since-last-edit.
- **Does `POST /api/action-items` (manual add) get its own `origin`/`confidence` handling, or reuse the same insert path as extraction?** Recommend: a distinct code path — `origin: 'manual'`, `confidence: null` — mirroring `action-items-provider.tsx`'s current `addManual` shape exactly, rather than routing manual adds through anything extraction-shaped.
- **Backfill for existing `tasks`/`drafts` rows.** Existing rows get `priority='normal'`/`origin='extracted'` (tasks) and `null` tone/length/generated_body (drafts) from column defaults — acceptable per `009`'s precedent (it accepted `status='open'` as a blanket default for pre-existing `emails` rows), or does this phase need a backfill step for `generated_body` (there's no way to reconstruct the "original" AI output for drafts written before this migration)? Recommend: accept `null` `generated_body` for pre-existing drafts — the commit-view diff simply has nothing to diff against for those rows, called out as a known gap rather than silently accepted.

---

**To proceed:** Review this proposal and approve to begin planning.
