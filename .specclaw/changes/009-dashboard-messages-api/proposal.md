# Proposal: Dashboard Messages API (Backend Phase 1 of 6)

**Created:** 2026-09-14
**Status:** 🟡 Draft

## Problem

`008-dashboard-api-foundation` proved the pattern (server-side API tier, session auth, one live endpoint) but left the dashboard's core product surface — the inbox itself — on fixtures. `BACKEND-REQUIREMENTS.md` §4.2 catalogs why the message list can't simply point at today's schema: `emails` carries only `category` and `summary`. The dashboard's board rows, Board Sheet detail panel, review queue, and Overview KPIs all render fields that don't exist yet — `priority`, `confidence`, `reasons[]`, `tone`, `tldr`, `entities`, `status`, `platform` (7 values, vs. today's 5 `category` values) — none of it backed by a column, and the Triage Pipeline that would populate them still only writes two.

This is, per `BACKEND-REQUIREMENTS.md` §1, "the single biggest gap": the AI pipeline is real and running, but its output is too thin for the product the dashboard was designed around. Phase 1 closes that specific gap — nothing else.

## Proposed Solution

Three pieces, in the order they depend on each other: **enrich the schema**, **enrich what Triage writes into it**, **expose it through the API tier `008` built**.

- **Migration `0005_dashboard_message_enrichment.sql`.** Adds the ~20 columns `BACKEND-REQUIREMENTS.md` §5.2 specifies to `emails` — `platform`, `confidence`, `priority`, `priority_score`, `reasons` (jsonb), `tone`, `tone_evidence`, `tldr`, `entities` (jsonb), `attachments` (jsonb), `gmail_url`, `is_unread`, `is_starred`, `status`, `snoozed_until`, `handled_at`, `handled_action`, `sla_target_hours`, `model_run`, `processed_at`, `is_from_user`. The existing `emails_category_check` constraint is widened (in practice, replaced) to the dashboard's 7-value platform vocabulary — resolving `BACKEND-REQUIREMENTS.md` §7 open question 1 in favor of migrating the backend to match the dashboard, per that document's own recommendation, rather than mapping 5→7 in the API layer and leaving `meeting`/`invoice`/`automated`/`spam-ish` permanently unpopulated.
- **Triage Pipeline gets a bigger prompt, not a new workflow.** `n8n/workflows/triage-pipeline.json`'s "Build triage prompt" and "Validate triage result" nodes are edited to request and check the fuller structured output (platform, confidence, priority + score, `reasons[]`, tone + evidence, tldr, entities) instead of just category + summary. It still calls the same unmodified LLM Gateway — this is a richer ask of the same pipeline, not a new one.
- **The messages API.** New Route Handlers under `gmail-dashboard/app/api/**` (messages list/detail/counts, review queue, the four board mutations — archive/done/snooze/restore — plus platform-reassign and star, and the two Overview/analytics reads this phase covers) per `BACKEND-REQUIREMENTS.md` §5.3's "Messages / board" and "Overview & analytics" tables, built on the auth-gated Supabase server client `008-dashboard-api-foundation` already established.
- **Frontend rewiring for exactly what this unlocks.** Inbox (the board), the Board Sheet detail view, the Review queue, and Overview's KPI cards / priority queue / volume trend switch from `lib/data/index.ts` fixtures to real fetches, following the `useSyncState()`-style hook pattern `008` set as the template.

## Scope

### In Scope
- `supabase/migrations/0005_dashboard_message_enrichment.sql`
- `n8n/workflows/triage-pipeline.json` edit (prompt + validator only — trigger, LLM Gateway call, and write nodes' shape stay structurally the same, just with more columns)
- API routes: `GET /api/messages`, `GET /api/messages/:id`, `GET /api/messages/counts`, `GET /api/review-queue`, `POST /api/messages/archive`, `POST /api/messages/done`, `POST /api/messages/snooze`, `POST /api/messages/restore`, `PATCH /api/messages/:id/platform`, `PATCH /api/messages/:id/star`, `GET /api/overview`, `GET /api/analytics/volume`
- Rewiring `app/inbox/page.tsx`, the Board Sheet component, `app/review/page.tsx`, and `app/page.tsx` (Overview) off fixtures
- `architect/04-data-model.md` updated to reflect the enriched `emails` table (the project's established convention — see `006-draft-generation`'s AC8 precedent)

### Out of Scope
- Migrations `0006`–`0011` (threads/contacts, commitments, drafts enrichment, tasks enrichment, rules/settings/activity, search) — Phases 2–3
- Action items, drafts, follow-ups, contacts, rules, and settings endpoints — Phases 2–4
- Any n8n workflow besides Triage Pipeline — Email Normaliser, Action Extraction, Draft Generation, Gmail Ingestion, Gmail Renewal & Recovery, and LLM Gateway are all untouched
- Sent-mail ingestion and the `is_from_user` column's actual population (the column is added by this migration for forward-compatibility with Phase 3's commitments work, but nothing in this change writes `true` to it — Gmail Renewal & Recovery's `watch()` scope is a Phase 3 change)
- `GET /api/analytics/response-times`, `/categories`, `/ai-performance` — those analytics endpoints need data this phase doesn't produce (response-time and category-breakdown history, a corrections feedback trail) and belong to Phase 5
- Deciding priority-scoring mechanics beyond what Triage's own prompt produces — `BACKEND-REQUIREMENTS.md` §7 open question 4 (LLM-only vs. LLM-signals-fed-into-a-Rules-slider-formula) stays open; this phase ships the LLM-produced `priority`/`priority_score`/`reasons[]` only, not a weighting formula

## Impact

- **Files affected:** ~16 (1 migration, 1 n8n workflow, ~11 new route files, ~4 rewired frontend files, 1 architecture doc)
- **Complexity:** large — this is the first phase touching both the AI pipeline and a real migration, not just an API/auth layer
- **Risk:** medium — the category constraint widen is a breaking schema change for any row triaged under the old 5-value vocabulary (existing rows keep their old category value, which is still valid data, but the *set* of allowed new values changes); the Triage Pipeline prompt change is a live-model-output change that needs the same fixture-pinning verification discipline `004-triage` established

## Open Questions

- **Backfill.** Existing `emails` rows triaged before this change have `category` set but every new column `null`. Does Phase 1 include re-running enriched triage over historical rows (`BACKEND-REQUIREMENTS.md` §5.4.B's "Backfill / Re-enrich" workflow), or does the dashboard simply show blank/degraded rows for anything triaged before this ships? Recommend: explicitly out of scope for this proposal, called out as a known gap rather than silently accepted — the Backfill workflow is its own small, separately-proposable change once this lands.
- **`status` default for pre-existing rows.** The new `status` column defaults to `'open'` for everything, including already-archived-in-spirit old mail. Acceptable, or does it need a smarter default? Recommend: accept `'open'` as the default — it's the safe, visible-by-default choice, and nothing before this migration had a status concept to preserve.
- **SLA target hours.** `sla_target_hours` is a column this migration adds, but nothing populates it yet — Triage's prompt isn't asked to produce it, since `BACKEND-REQUIREMENTS.md`'s SLA fields are explicitly derived (`elapsedHours`/`state`/`overdueBy` from `received_at` + `sla_target_hours`), not LLM output. Does this phase set a fixed default (e.g. 24) at the column level, or leave it `null` until a later phase decides the mechanism? Recommend: leave `null` for now — a fabricated default would make the SLA feature look more finished than it is.

---

**To proceed:** Review this proposal and approve to begin planning.
