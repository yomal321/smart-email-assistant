# Phase 6 Implementation Plan — Inbox Noise Control

**Backend build order:** Beyond the five phases BACKEND-REQUIREMENTS.md §6 names — this is the first phase driven by observed production data rather than by the original requirements doc.
**Depends on:** Phase 2 (`0002`, the category taxonomy), Phase 4 (`0010`, `settings.exclusion_rules` / `settings.retention_days`), Phase 5 (`rule-engine.json`).
**Unblocks:** The assistant stops spending LLM calls on marketing mail, and `exclusion_rules` / `retention_days` stop being columns that nothing reads.

Authored directly (no specclaw lifecycle), same as Phases 3–5.

**Build status:** code-complete, all six waves. `tsc --noEmit`, `eslint`, `check-n8n-workflows.mjs` (10/10 workflows) and `check-migrations.mjs` all pass. The n8n edits are hand-authored JSON, same as every prior phase — they cannot be executed or live-tested from here, no live n8n/Supabase/Gmail access exists in this session. Treat n8n changes as pre-verify, same as Phases 4–5; follow `docs/setup/inbox-noise-control-setup.md` to import and verify live. **Nothing has been deleted from the database yet** — `scripts/cleanup-junk.mjs` defaults to a dry run, and `--execute` is a separate, explicit step.

## 1. Why this phase, and what "done" means

This phase exists because of a measurement, not a hunch. As of 2026-09-20 the `emails` table held 124 rows:

| Segment | Count | Share |
|---|---|---|
| `CATEGORY_PROMOTIONS` or `CATEGORY_SOCIAL` | 46 | 37% |
| Triage said `promotional` or `low_priority` | 41 | 33% |
| no-reply / bulk-pattern senders | 38 | 31% |
| Union of the above, after safety guards | **55** | **44%** |
| `category` still null (never triaged) | 52 | 42% |
| `triage_error` set | 21 | 17% |

Top noise sources by exact sender: `temu@commerce.temuemail.com` (17), `messages-noreply@linkedin.com` (9), `notifications-noreply@linkedin.com` (7), `recommendations@discover.pinterest.com` (4), `updates-noreply@linkedin.com` (3).

Three things are wrong, and they compound:

1. **Nothing filters at ingest.** `gmail-ingestion.json` runs `history.list` → `messages.get` → Normaliser with no filtering of any kind. The `watch()` in `gmail-renewal-recovery.json` is registered on `["INBOX","SENT"]`, but promotional mail carries `INBOX` too, so the label filter buys nothing.
2. **Junk costs three LLM calls each.** `email-normaliser.json` fans out to Triage Pipeline, Action Extraction and Commitment Extraction unconditionally. A Temu advert is summarised, mined for action items, and mined again for commitments before anything in the system knows it is an advert.
3. **Both cleanup controls are dead code.** `settings.exclusion_rules` and `settings.retention_days` are written by `PATCH /api/settings` and rendered on `app/settings/page.tsx`, and are read by nothing else in the repo. The only deletion that exists is `POST /api/settings/purge`, which empties every table for the account — the wrong instrument for "my inbox filled up with adverts".

Done means:
- Bulk mail is dropped before it reaches the Normaliser, so it never occupies a row and never costs an LLM call.
- Anything that slips past the gate and is classified `promotional`/`low_priority` costs one LLM call, not three.
- The 55 existing junk rows can be removed selectively, with a dry run first, without touching mail that produced real work.
- `exclusion_rules` is the user-editable input to the ingest gate, and `retention_days` actually expires old low-value mail.
- Gmail itself stops delivering the worst of it, with no OAuth scope change.

## 2. Wave 1 — n8n: stop junk at the door *(built)*

### Edit: `n8n/workflows/gmail-ingestion.json`

One new node, **Junk gate** (`n8n-nodes-base.if`, typeVersion 2.2), inserted between **messages.get fetch** and **Call Email Normaliser**.

The whole test lives in the IF node's own boolean expression rather than in a preceding Code node, so `$json` reaching **Call Email Normaliser** is still the untouched Gmail message — a Code node would have to add a flag field, and that field would ride into `raw_message` and then into `emails.raw_payload`.

Drop conditions, in order:

| Signal | Rationale |
|---|---|
| `labelIds` intersects `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_FORUMS`, `SPAM`, `TRASH` | Gmail's own classifier, already computed, free to read. |
| `List-Unsubscribe` header present | The single most reliable bulk-mail marker. Legitimate one-to-one mail does not carry it; RFC 2369 senders must. |
| `Precedence: bulk\|list\|junk` | The pre-`List-Unsubscribe` convention, still used by mailing lists. |
| `Auto-Submitted: auto-generated\|auto-replied` | RFC 3834 — vacation responders, ticket robots. |
| `From` matches `no-?reply\|donotreply\|do-not-reply\|mailer-daemon\|bounce\|newsletter` | Catches senders the above three miss. |

`CATEGORY_UPDATES` is deliberately **not** a drop condition — see §7 judgment call #1.

Wiring: true (junk) → **Loop message IDs**; false (keep) → **Call Email Normaliser**. Both branches return to the loop node, because `Loop message IDs` is a `splitInBatches` node — a branch that terminates without returning stalls the batch loop and silently halts ingestion mid-run.

## 3. Wave 2 — n8n: stop paying three times for junk that slips through *(built, corrected from the original design below)*

**The design this section originally proposed does not work, and was not built.** It called for gating in `triage-pipeline.json` itself, right after `Write triage success` — the same place Phase 5 hooked `Call Rule Engine`. That place is unreachable for this purpose: `triage-pipeline.json`'s trigger deliberately accepts only `email_id`/`subject`/`body` (its own "Field minimization" comment on `Build triage prompt` — "only subject + a truncated plain-text body ever leave this workflow"), so it never has `received_at`/`is_from_user`/`account_id`/`participants` in hand to forward to Action/Commitment Extraction. Widening that trigger just to pass fields through would work against the reason it's narrow.

### Edit: `n8n/workflows/action-extraction.json` and `n8n/workflows/commitment-extraction.json`

The gate lives in each extraction workflow instead, as its own first step — three new nodes ahead of the existing prompt builder:

1. **Read triage category** (postgres) — `SELECT category FROM emails WHERE id = $1`.
2. **Worth extracting?** (if) — true when category is **not** `promotional`/`low_priority`, which includes **null** (not yet triaged). Fails open on unknown, not closed: `email-normaliser.json`'s existing `Wait before Action Extraction` (5s) / `Wait before Commitment Extraction` (10s) stagger only exists to dodge Gemini's free-tier rate limit, not to guarantee Triage has already written by the time this runs. Treating null as junk risks silently losing a real task or commitment; treating it as worth extracting costs at most one LLM call that Wave 2 would otherwise have saved.
3. **Skipped (low value)** (code, false branch) — returns `{ email_id, extracted: false, skipped: true }`, the same shape this workflow's other no-op outcomes already use, so nothing downstream notices a new terminal state.

**Build extraction prompt** (the existing prompt-builder in both workflows) now reads its input via `$('Execute Workflow Trigger').item.json` instead of `$json` — two new nodes now sit between the trigger and it, so `$json` at that point is the category-read's own output, not the trigger's. This is the same named-node-reference convention `email-normaliser.json` already uses wherever an intermediate Postgres node doesn't carry a needed field forward (e.g. `Insert thread_entries`'s note on why `Call Triage Pipeline` reads `$('Format output')` rather than `$json`).

No change to `email-normaliser.json` or `triage-pipeline.json` — the fan-out shape and the Wait staggers are untouched.

Expected saving: roughly two thirds of the LLM spend on anything the Wave 1 gate lets through but Triage then judges low-value, on whichever fraction of those emails Triage has already written by the time each extraction workflow's gate runs.

## 4. Wave 3 — Selective cleanup API *(built)*

### New: `gmail-dashboard/app/api/settings/cleanup/route.ts`

`POST`, dry-run by default. Deleting requires `confirm: "CLEANUP"`, mirroring the `"PURGE"` gate on the existing purge route.

Candidate rule: `CATEGORY_PROMOTIONS` or `CATEGORY_SOCIAL` label, **or** `category` in (`promotional`, `low_priority`). Optional `olderThanDays` narrows it further.

Three guards, all automatic:
- `is_starred = false` — an explicit keep signal.
- `is_from_user = false` — never delete sent mail.
- **No attached `tasks`, `drafts` or `commitments`.** An email that produced extracted work is not noise by definition. This is the guard `architect/04-data-model.md` §"Open questions" asks for: *"Cascading would silently delete commitments the user still owes."*

Candidates are gathered as three separate queries unioned in TypeScript rather than one PostgREST `.or()` string — jsonb `contains` inside an or-filter needs bracket-and-quote escaping, and getting it subtly wrong silently *widens* a delete.

Deletion order reuses `purge/route.ts`'s documented order (no FK in this schema has `ON DELETE CASCADE`): `nudges` → `rule_runs` → `thread_entries` → `emails`. The `activity_log` row is written *before* the delete, never after, for the same reason purge does it — otherwise the operation erases its own record.

On the current data this rule resolves to **55 rows**: 56 candidates, minus the one OpenRouter promotional email that owns a real extracted task (*"Add the HTTP-Referer and other attribution headers to your app to appear in rankings"*). The work-guard protects it automatically; it is not a hand-maintained exception.

### New: `scripts/cleanup-junk.mjs`

Logs in with `DASHBOARD_LOGIN_SECRET` (middleware is deny-by-default, so the route needs a session cookie), then calls the endpoint. `node scripts/cleanup-junk.mjs` dry-runs; `--execute` deletes; `--older-than N` narrows.

## 5. Wave 4 — Make `exclusion_rules` real *(built)*

Two edits, so the dead column becomes the gate's user-editable input:

| File | Change |
|---|---|
| `n8n/workflows/gmail-ingestion.json` | Added **Read exclusions** (postgres, `SELECT exclusion_rules FROM settings WHERE account_id = $1`) as a second branch off **Read account cursor**, in parallel with `history.list fetch` — read once per Pub/Sub delivery, not per message. **Junk gate**'s expression now also drops when the sender address contains any entry, via `$('Read exclusions').first()?.json?.exclusion_rules`; a missing settings row (never opened Settings) reads as an empty list, not an error. |
| `gmail-dashboard/app/settings/page.tsx` | The UI bound `settings?.exclusionRules?.[0]` — a single text input over an array column, so entry two onward was unreachable. Replaced with an add/remove list (`addExclusion`/`removeExclusion`), and the placeholder copy now matches what the gate actually checks (a sender substring) rather than the old free-form `from:legal@, subject contains "..."` copy, which no logic ever backed. |

## 6. Wave 5 — Make `retention_days` real *(built)*

New scheduled workflow, `n8n/workflows/retention-sweep.json`, modelled on `gmail-renewal-recovery.json`'s schedule trigger. Daily at 3am. Reads `settings.retention_days`; a null value means "keep forever" and the workflow exits at **Retention set?** — `architect/04-data-model.md` records that "Not set" is a real, permanent option, so null must not be coerced to a default.

Rather than reimplementing the candidate rule in SQL, it calls `POST /api/settings/cleanup` with `{ confirm: "CLEANUP", olderThanDays: <retention_days> }`, so the guards live in exactly one place. §9 judgment call #4 originally flagged this as needing a new service-to-service auth path; it doesn't — **Login** simply calls `POST /api/auth/login` with the same `DASHBOARD_LOGIN_SECRET` a human operator uses, and **Extract session cookie** pulls the `Set-Cookie` header out of that response for **Call cleanup** to send back. One new env var, `DASHBOARD_BASE_URL` (same convention as `rule-engine.json`'s `SELF_BASE_URL`), no new secret. The Settings page now says explicitly, next to the control, that this removes low-value mail only — never a blanket "delete everything older than N days."

## 7. Wave 6 — Gmail-side filters *(built)*

`docs/setup/gmail-noise-filters.xml`, importable via Gmail → Settings → Filters and Blocked Addresses → Import filters. Built from the 17 exact sender addresses observed, in three tiers:

- **Tier 1 — trash on arrival:** Temu, Pinterest, Codecademy, roadmap.sh, KodeKloud, Dribbble, fly.io, Google One, Google AI Studio, Microsoft marketing.
- **Tier 2 — archive + `Noise` label:** LinkedIn messages/notifications/updates, Facebook. Noisy but occasionally wanted, so readable rather than destroyed.
- **Tier 3 — catch-all `category:promotions`:** archive + label only, never trash, because it matches a category rather than a sender that has been seen and judged.

`invitations@linkedin.com` is in no tier — a connection invitation is a real message, swept up only by Gmail's `CATEGORY_SOCIAL` tag.

`docs/setup/inbox-noise-control-setup.md` covers importing all four workflows, importing the filter file, and the search queries for clearing mail already sitting in the mailbox.

## 8. Explicitly not in this phase

- **`gmail.modify` scope, and deleting anything in Gmail via API.** `docs/setup/gmail-ingestion-setup.md` pins the scope to `gmail.readonly` and names `gmail.modify` as forbidden under FR10, and `002-ingestion`'s security review reached that conclusion explicitly. Wave 6 achieves the same user-visible outcome through Gmail's own filters, so FR10 stands. Reversing it is a separate change with its own re-consent step.
- **Provider→local deletion propagation.** Still the open question `architect/04-data-model.md` records. Deleting in Gmail does not remove the local row, and this phase does not change that.
- **The 52 untriaged rows and 21 `triage_error` rows.** A real defect — 42% of the table has never been classified — but a different one, with a different root cause. This phase reduces the surface (fewer junk rows entering triage at all) without diagnosing it. It deserves its own change.
- **Learned/statistical junk classification.** The signals here are deterministic and auditable. A model that learns "you ignore this sender" is a larger design with a feedback-trail dependency the codebase does not yet have.
- **Unsubscribing on the user's behalf.** Requires sending mail or following links in untrusted content. Out of the question at `gmail.readonly`, and undesirable regardless.

## 9. Judgment calls this plan makes (surfaced, not hidden)

1. **`CATEGORY_UPDATES` is never a drop signal**, despite being 31 of 124 rows and the single largest remaining bucket. Gmail files bank notices (`sampath.lk`, 6 rows), GitHub, receipts and account-security alerts there. The precision cost of excluding it is far lower than the cost of one silently deleted bank alert.
2. **The work-guard replaces manual review.** Rather than curating an exception list, the rule is structural: an email with a task, draft or commitment is never noise. It happens to save the one OpenRouter email on the current data, but it will keep being right on data nobody has looked at.
3. **A new route instead of extending `purge`.** Purge's contract is "erase everything, confirmed by typing PURGE", and its UI box says so. Overloading it with filters would make a destructive endpoint's blast radius depend on request-body parsing.
4. **Wave 5 calls the dashboard API rather than writing SQL directly.** Keeps one definition of "junk". This reuses the operator's own login (`DASHBOARD_LOGIN_SECRET` → session cookie) rather than adding a second, machine-specific secret — the same credential a human uses, on the same auth path `middleware.ts` already enforces for every route. The cost is that **Retention Sweep** now depends on the dashboard being reachable and up at 3am for retention to actually run; a dashboard outage doesn't lose data, it just delays that day's sweep to the next one.
5. **Wave 2's gate reads `emails.category` fresh in each extraction workflow, rather than threading Triage's verdict through as data.** The alternative — widening `triage-pipeline.json`'s trigger to accept and forward `received_at`/`account_id`/`participants`/`is_from_user` — would make a workflow whose whole design is "only subject and body leave this boundary" carry fields it never touches, purely so something downstream can read them back. One extra `SELECT` per extraction call is cheaper than that, and it's a query these workflows didn't previously make at all.
5. **Gmail filters over API deletion** is a product decision as much as a security one: a filter stops mail before Google delivers it, so the watch never fires and the pipeline never sees it. API-side deletion can only act on mail already received and already processed.

## 10. Acceptance checklist

- [ ] A Temu or LinkedIn notification arriving in Gmail produces **no** new `emails` row, and no Triage/Action/Commitment execution in n8n's run log.
- [ ] A normal personal email still lands, is triaged, and still yields tasks/commitments as before.
- [ ] A bank alert from `sampath.lk` still lands — verifying `CATEGORY_UPDATES` is not being dropped.
- [ ] `node scripts/cleanup-junk.mjs` reports 55 candidates and `kept: 1`, and deletes nothing.
- [ ] `--execute` removes exactly those rows; `emails` drops 124 → 69; the OpenRouter email and its task survive; one `activity_log` row records the cleanup.
- [ ] `tasks`, `drafts`, `commitments` counts are unchanged by the cleanup (13 / 20 / 6).
- [ ] An email classified `promotional` produces a triage row but **no** Action or Commitment Extraction run (Wave 2).
- [ ] A domain added to `exclusion_rules` in Settings causes the next matching email to be dropped at ingest (Wave 4).
- [ ] With `retention_days = 30`, low-value mail older than 30 days disappears on the next sweep; mail with attached work does not (Wave 5).
- [ ] With `retention_days` unset, the sweep exits without deleting anything.
- [ ] `tsc --noEmit`, `eslint`, `check-n8n-workflows.mjs`, `check-migrations.mjs` all pass.
