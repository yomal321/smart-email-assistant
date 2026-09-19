# Phase 5 Implementation Plan — Rule Engine Execution & Analytics

**Backend build order:** Phase 5 of 6, the last one BACKEND-REQUIREMENTS.md §6 names (see [BACKEND-REQUIREMENTS.md](BACKEND-REQUIREMENTS.md) §6).
**Depends on:** Phase 4 (`0010`/`0011`, rules/settings/activity/search API — see `PHASE-4-IMPLEMENTATION-PLAN.md`) — this phase is the one that makes `rules` rows *do* something instead of just being stored.
**Unblocks:** Rules actually run against new mail; Analytics stops being four hardcoded fixture arrays (BACKEND-REQUIREMENTS.md §8.2: "Rules do not run until Phase 5" / "Analytics ... Charts need accumulated history to be meaningful").

Authored directly (no specclaw lifecycle), same as Phases 3–4.

**Build status:** code-complete — migrations aside (none needed; this phase adds no tables), `tsc --noEmit`, `eslint`, and `npm run build` all pass for the TypeScript half. The n8n half (`rule-engine.json`, the `triage-pipeline.json` edit) is hand-authored JSON, same as every prior phase's workflow edits, and carries the same caveat Phase 4's resync webhook did: it cannot be executed or live-tested from here — no live n8n/Supabase/Gmail access exists in this session. Treat it as pre-verify, same as Phase 4.

## 1. Why this phase, and what "done" means

Two things are currently inert:

1. **Rules are stored but never evaluated.** `app/rules/page.tsx` (Phase 4) lets you toggle, build, and preview a rule's match count — but nothing runs it against a real incoming email. The `rules`/`rule_runs` tables exist; `rule_runs` has never had a row written to it because nothing writes to it.
2. **Every analytics chart is fixture data**, per `app/analytics/page.tsx`'s own comment ("every figure here is fixture data, footnoted per PRODUCT.md"): `ResponseTimeHistogram` has a hardcoded 7-bucket array, `CategoryBreakdown` has a hardcoded 6-week × 7-platform `DATA` map, `BusiestHoursHeatmap` computes a synthetic `cellValue()` function, and the AI-performance cells are four hardcoded percentages. Oddly, `GET /api/analytics/volume` already exists and is live (built in an earlier, unlabelled pass) — but `app/analytics/page.tsx` still calls the fixture `getVolumeTrend()` instead of it. That wiring gap is fixed here too.

Done means:
- New mail that matches an enabled rule's condition gets that rule's action applied automatically (auto-archive, auto-prioritise, or auto-draft — see §7 judgment call #1 on why auto-label is scoped out), a `rule_runs` row recorded, and an `activity_log` entry written.
- `daily_cap` is enforced — a rule that already ran its cap's worth of times today does not run again.
- All four analytics charts read real, computed data; the AI-performance cells read a real (if currently sparse) feedback trail instead of four fixed percentages.
- The already-built `/api/analytics/volume` is finally wired to the page it was built for.

Out of scope (surfaced, not hidden — see §7 for the full reasoning):
- **`confidence_floor`-gated auto-reply.** The rules builder's `ACTIONS` list (`Auto-label`, `Auto-archive`, `Auto-prioritise`, `Auto-draft`) has never included an "auto-reply" option, and the separate "Auto-reply rules" section of `app/rules/page.tsx` is its own unwired UI (Phase 4 explicitly left it local-state-only). There is nothing for the Rule Engine to execute here yet.
- **Auto-label**, for the same reason `app/rules/page.tsx`'s builder never collects a target category to label *with* — matching rules is real, but there's no value to apply. Detected and skipped, not silently guessed.
- **A rule-builder UI for compound (and/or) conditions**, still unbuilt from Phase 4 — the Rule Engine evaluates the same single-condition shape the preview endpoint does, nothing more.
- **A dedicated corrections/feedback table.** BACKEND-REQUIREMENTS.md §7 Q5 flags that nothing records reassignments or edit distances as a trail today. This phase adds reassignment logging (to the already-existing `activity_log`) and reads `drafts.edit_distance` (already written since Phase 2) rather than inventing a new table — see §7 judgment call #3.

## 2. Wave 1 — n8n: the Rule Engine

### New workflow: `n8n/workflows/rule-engine.json`

Sub-workflow, invoked with `{ email_id }`. Modeled structurally on `commitment-extraction.json` (single-purpose, non-blocking caller) rather than `triage-pipeline.json` (no LLM call needed here — rule matching is deterministic).

Linear node graph (no fan-out/merge — every read after the first carries the account/email context forward via named-node references, e.g. `$('Read email').first().json`, the same pattern `gmail-renewal-recovery.json` and `commitment-extraction.json` already use, rather than a parallel-branch + Merge node, which is harder to get right by hand and unnecessary here):

1. **Execute Workflow Trigger** — input: `email_id`.
2. **Read email** (postgres) — `SELECT id, account_id, subject, participants, platform, confidence, attachments FROM emails WHERE id = $1`. Single row; this is what every condition test below reads.
3. **Read matching rules** (postgres) — one query does the account scope, the enabled filter, *and* the daily-cap count in one shot: `SELECT r.id, r.conditions, r.actions, r.daily_cap, (SELECT count(*) FROM rule_runs rr WHERE rr.rule_id = r.id AND rr.ran_at > now() - interval '1 day')::int AS run_count_today FROM rules r WHERE r.account_id = $1 AND r.enabled = true`. Returns one item per enabled rule (zero items = nothing to do, the rest of the workflow simply doesn't execute for this email).
4. **Evaluate rule** (code, once per rule item from step 3) — reads the email's fields via `$('Read email').first().json` and this item's own `conditions[0]` (single-condition only, same field/operator mapping `POST /api/rules/preview` already implements: Sender domain/Subject/Category/Confidence/Has attachment) to decide `matched`, and compares `run_count_today` against `daily_cap` to decide `underCap`. Outputs `{ ruleId, actionType, matched: matched && underCap }` per rule — matching the dashboard's TypeScript preview logic in spirit (same field semantics) but re-implemented in the workflow's own Code node, since n8n can't import `gmail-dashboard`'s TypeScript.
5. **Matched?** (if) — `matched === true` only continues.
6. **Route by action** (switch on `actionType`):
   - `Auto-archive` → **Apply archive** (postgres): `UPDATE emails SET status='archived', handled_at=now(), handled_action='archived' WHERE id = $1`.
   - `Auto-prioritise` → **Apply prioritise** (postgres): `UPDATE emails SET priority='urgent', priority_score = greatest(priority_score, 90) WHERE id = $1`.
   - `Auto-draft` → **Call draft webhook** (httpRequest) — POSTs to the same `generate-draft` webhook `draft-generation.json` already exposes, with the same `x-draft-webhook-secret` header `POST /api/drafts` already sends from the dashboard side. Calling the public webhook rather than an internal Execute Workflow node because `draft-generation.json`'s only entry point is that webhook trigger (no Execute Workflow Trigger exists on it) — consistent with how the dashboard itself calls it.
   - `Auto-label` → **no node** — the switch has no output for this case; nothing executes, and neither `rule_runs` nor `activity_log` gets a row (see §1 — there's no target value to apply, so nothing happened).
7. **Record run** (postgres, after any of the three real actions) — `INSERT INTO rule_runs (rule_id, email_id) VALUES ($1, $2)`.
8. **Log activity** (postgres) — one `activity_log` row per applied action: `action` = the action type, `target` = the email's subject, `cause` = `'Rule: ' || condition_summary`, `undoable` = `true` only for `Auto-archive` (reuses the exact `{table:"emails", action:"restore", ids:[email_id]}` undo payload shape `lib/data/activity-log.ts` already writes for manual archive/done/snooze, so `POST /api/undo/:actionId` handles a rule-driven archive with no new code), `false` for the other two (a priority bump and a draft aren't "undo" in the same one-call sense).

### Edit: `n8n/workflows/triage-pipeline.json`

| Change | Why |
|---|---|
| Add **Call Rule Engine** (executeWorkflow, `waitForSubWorkflow: false`) as a second output of **Write triage success**, alongside the existing **Format success output** | Rules match on `platform`/`confidence` — fields Triage Pipeline itself just wrote — so the Rule Engine must run *after* that write, not in parallel with Triage (unlike Action Extraction/Commitment Extraction, which the Normaliser already fans out to in parallel because they don't depend on triage's output). Non-blocking, same convention as every other post-write fan-out in this codebase (`waitForSubWorkflow: false`), so a slow or failing Rule Engine run never delays or breaks Triage Pipeline's own response. |

No other workflow changes. `email-normaliser.json`, `action-extraction.json`, `commitment-extraction.json`, `llm-gateway.json`, `gmail-ingestion.json`, `gmail-renewal-recovery.json` are all untouched.

## 3. Wave 2 — Analytics endpoints

All follow existing conventions: named column lists, no `select("*")`, auth via `middleware.ts`.

| Method | Path | Computation |
|---|---|---|
| GET | `/api/analytics/response-times` | Buckets every inbound→outbound reply gap (same thread-pairing walk `lib/data/contact-mapping.ts`'s `computeAvgReplyHours` already does — extracted into a shared `lib/data/reply-gaps.ts` so both call one pairing implementation instead of two copies) into the same 7 buckets `components/charts/response-time-histogram.tsx` renders (`0-2h` … `4d+`), across every thread account-wide rather than per-contact. Also returns the overall average (hours) the histogram's caption line already shows. |
| GET | `/api/analytics/categories?weeks=6` | Groups `emails.platform` counts by ISO week over the requested window (default 6), one row per `(week, platform)`, zero-filled for a platform with no mail that week — mirrors `CategoryBreakdown`'s existing `DATA` shape (`Record<Platform, number[]>` across N week buckets) so the component's rendering logic barely changes. |
| GET | `/api/analytics/busiest-hours` | Groups `emails.received_at` counts by `(day-of-week, hour)`, replacing `cellValue()`'s synthetic formula with `count(*) ... group by extract(dow from received_at), extract(hour from received_at)` (computed in TS the same "fetch raw timestamps, group in code" way `/api/analytics/volume` already does — no GROUP BY available through PostgREST). |
| GET | `/api/analytics/ai-performance` | Real, but honestly partial (see §7 judgment call #3): **accuracy** = `1 - (reassignments in window / triaged emails in window)`, where "reassignment" is now logged by `PATCH /api/messages/:id/platform` (this phase adds that logging — Phase 4 only wired archive/done/snooze); **draft acceptance rate** = `count(drafts.status='approved' or 'sent') / count(drafts)`; **drafts edited before send** = `count(drafts where edit_distance > 0) / count(drafts.status in ('approved','sent'))`; **time saved** stays a documented heuristic (`processedCount * 4min + inboxCount * 1.5min`, the same formula `lib/data/index.ts`'s fixture-era `getKpis()` already used) — flagged in the response itself (`timeSavedIsEstimate: true`) rather than presented with the same confidence as the three measured numbers, since no experiment comparing against a human-only baseline exists to measure it for real. |

## 4. Wave 3 — Frontend wiring

- **`app/analytics/page.tsx`** — replace `getVolumeTrend()` (fixture) with a fetch from the already-existing `/api/analytics/volume`; the other three chart components stop synthesizing their own data and instead accept it as a prop, fetched at the page level (one `useEffect`-driven load, following `use-sync-state.ts`'s established hook shape, one hook per chart's shape — `use-response-times.ts`, `use-category-breakdown.ts`, `use-busiest-hours.ts`, `use-ai-performance.ts`).
- **`components/charts/response-time-histogram.tsx`**, **`category-breakdown.tsx`**, **`busiest-hours-heatmap.tsx`** — each loses its internal hardcoded array/function and gains a `data` prop, mirroring how `volume-trend.tsx` was already built (props in, no internal fixture) since Phase 1. Empty-history accounts (a fresh connection, or the 30-day-old fixture data purged) render a real empty/zero state instead of the fixture's populated-looking bars — an honest "not enough history yet" is more correct than a graph that still looks the same as the old fixture.
- **AI-performance cells** — same page, now read from `useAiPerformance()`; the existing "Prototype figures from fixture data" footnote becomes conditional: shown only for `timeSavedIsEstimate`'s one still-heuristic figure, not all four.
- **`app/api/messages/[id]/platform/route.ts`** — edited to read the row's prior `platform` before updating, and (only when the new value differs from the old one — a no-op reassignment to the same platform isn't a correction) write an `activity_log` row (`action: "Reassigned platform"`, `target`: subject + old→new, `cause: "Manual correction"`, `undoable: false`) so `/api/analytics/ai-performance`'s accuracy figure has something real to count.

## 5. Wave 4 — Docs

- `architect/04-data-model.md`'s "Who writes what" table gains a Rule Engine row (`rule_runs`: full row; the three action types' own column writes on `emails`; `activity_log`), and its "Unwritten this phase" line drops `rule_runs` (Phase 4's doc said it "stays empty until the Rule Engine (Phase 5) runs" — that's now true only until this ships and actually runs).

## 6. Explicitly not in this phase

- Auto-reply rules (no UI capability exists to build one — see §1).
- Auto-label's target-category selection UI (would require a Phase 4 rules-builder change, not this phase's).
- Compound (and/or) rule conditions.
- A real corrections/feedback table beyond reassignment logging + existing `edit_distance` (§7 judgment call #3).
- Retention/auto-purge scheduling and Daily Digest — still deferred from Phase 4 for the same reason (undecided product policy).

## 7. Judgment calls this plan makes (surfaced, not hidden)

1. **Auto-label is detected but never applied.** The builder's `THEN` selector picks an action *type* only — it has never collected "label it as ___". Silently picking an arbitrary target category would be worse than doing nothing; this plan does nothing and says so, rather than inventing a default.
2. **The Rule Engine calls the public draft webhook over HTTP, not an internal Execute Workflow node**, because `draft-generation.json` was built with only a webhook trigger (no Execute Workflow Trigger entry point exists on it). Adding one now would be a second, riskier edit to an already-shipped, verified (`006-draft-generation`'s verify-report: PASS, 8/8 criteria) workflow, for marginal benefit over an HTTP call within the same n8n instance.
3. **`ai-performance`'s "time saved" stays a heuristic, not a measurement**, because measuring it for real needs a human-only baseline this product has never run — the same honesty this project applied to `sync`'s `queueDepth` in Phase 4 (redefine to something real, or say plainly it's an estimate, never fabricate precision that doesn't exist).
4. **Reassignment logging piggybacks on the existing `activity_log`**, not a new corrections table — one more `undoable: false` row type, same shape every other logged action already uses, rather than standing up a parallel feedback-tracking schema for one metric.

## 8. Acceptance checklist

- [ ] `rule-engine.json` exists; `triage-pipeline.json`'s "Write triage success" fans out to it non-blocking, without touching the existing success/failure formatting branches.
- [ ] A rule with `Auto-archive`/`Auto-prioritise`/`Auto-draft` and no `daily_cap` runs on the next matching email; a `rule_runs` row and an `activity_log` row are written; a second matching email the same day is blocked once `daily_cap` is reached.
- [ ] `/api/analytics/response-times`, `/api/analytics/categories`, `/api/analytics/busiest-hours`, `/api/analytics/ai-performance` all live, reading named column lists only.
- [ ] `app/analytics/page.tsx` has no remaining hardcoded fixture array or synthetic formula in any of its four charts; `/api/analytics/volume` (previously built, never wired) is now actually called by the page.
- [ ] `PATCH /api/messages/:id/platform` logs a reassignment to `activity_log` only when the platform actually changes.
- [ ] `architect/04-data-model.md` updated for the Rule Engine's writes.
