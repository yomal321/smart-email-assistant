# Inbox Noise Control Setup Runbook

Change: Phase 6 (`PHASE-6-IMPLEMENTATION-PLAN.md`). Covers everything needed to
go from a live pipeline (Phases 1–5, already running) to one that stops
ingesting promotional/social mail, stops spending LLM calls on what slips
through, and can clean out what has already accumulated. Follow the steps in
order — later steps depend on imports from earlier ones.

**No new tables, no new credentials.** One new env var (`DASHBOARD_BASE_URL`)
for the Retention Sweep workflow only.

---

## 1. Re-import the edited workflows

Three existing workflows changed; one is new. Publish order matters where a
sub-workflow is called by another (n8n requires the callee published first).

- [ ] Re-import `n8n/workflows/gmail-ingestion.json` — adds **Junk gate** (drops bulk-labelled/no-reply mail before the Normaliser) and **Read exclusions** (reads `settings.exclusion_rules`). Re-attach the **Supabase Postgres** credential to **Read exclusions**, replacing `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID`.
- [ ] Re-import `n8n/workflows/action-extraction.json` — adds **Read triage category** / **Worth extracting?** / **Skipped (low value)** before the existing prompt-building step. Re-attach **Supabase Postgres** to **Read triage category**.
- [ ] Re-import `n8n/workflows/commitment-extraction.json` — same three-node gate as Action Extraction. Re-attach **Supabase Postgres** to **Read triage category**.
- [ ] Import `n8n/workflows/retention-sweep.json` (new, name: **Retention Sweep**). Re-attach **Supabase Postgres** to **Read retention_days**.
- [ ] Publish order: **Action Extraction** and **Commitment Extraction** before **Email Normaliser** re-publishes over them (their trigger schema is unchanged, so the Normaliser's calls into them do not need re-pointing) → **Gmail Ingestion** → **Retention Sweep** (standalone, no callers).

## 2. Set the new environment variable

- [ ] In your n8n instance's environment variables, add `DASHBOARD_BASE_URL` — the deployed dashboard's reachable base URL (e.g. `https://your-app.vercel.app`). Same convention as `rule-engine.json`'s existing `SELF_BASE_URL`.
- [ ] Confirm `DASHBOARD_LOGIN_SECRET` is already set in n8n's environment and matches `gmail-dashboard/.env.local`'s value exactly — **Retention Sweep**'s **Login** node depends on it.

## 3. Import the Gmail-side filters

- [ ] Gmail → **Settings → Filters and Blocked Addresses → Import filters** → upload `docs/setup/gmail-noise-filters.xml`.
- [ ] Review the proposed filters before confirming — Tier 1 (Temu, Pinterest, Codecademy, roadmap.sh, KodeKloud, Dribbble, fly.io, Google One/AI Studio, Microsoft marketing) trashes on arrival; Tier 2 (LinkedIn notifications, Facebook) archives under a **Noise** label instead of deleting, since those are occasionally wanted; Tier 3 is a `category:promotions` catch-all, archive-only.
- [ ] `invitations@linkedin.com` is intentionally not covered by any tier — a connection invite is a real message that Gmail's own classifier happens to tag Social.
- [ ] This changes nothing in the OAuth scope — still `gmail.readonly`, per `docs/setup/gmail-ingestion-setup.md` FR10. Filters run inside Gmail before the message is ever delivered to the account's `watch()` subscription.

## 4. Clear out what has already accumulated

- [ ] Start the dashboard locally (`cd gmail-dashboard && npm run dev`) or point `BASE_URL` at a deployed instance.
- [ ] Dry run: `node scripts/cleanup-junk.mjs` — prints the candidate count and a sender-domain breakdown, deletes nothing.
- [ ] Read the output. Confirm the `bySenderDomain` breakdown matches senders you actually recognize as junk — if anything looks wrong, fix the rule in `gmail-dashboard/app/api/settings/cleanup/route.ts` (`BULK_LABELS`/`BULK_CATEGORIES`) before proceeding, not after.
- [ ] Execute: `node scripts/cleanup-junk.mjs --execute`.
- [ ] In Gmail, clear what's already sitting in the mailbox for the worst senders, e.g. search `from:(temu@commerce.temuemail.com OR recommendations@discover.pinterest.com OR messages-noreply@linkedin.com)` and select-all-delete. This is separate from step 3's filters, which only apply to *future* mail.

## 5. Final verification

- [ ] Send or wait for a Temu/LinkedIn-style email to arrive. Confirm it produces **no** new `emails` row and **no** Triage/Action/Commitment execution in n8n's run log (should stop at **Junk gate**).
- [ ] Confirm a normal personal email still lands, triages, and still yields tasks/commitments as before.
- [ ] Confirm a `sampath.lk` (or your own bank's) email still lands — this checks `CATEGORY_UPDATES` is not being dropped (see Phase 6 plan §9, judgment call #1).
- [ ] In Settings → Privacy, add a sender to **Exclusion rules**. Confirm the next matching email is dropped at ingest.
- [ ] Set **Data retention period** to 30 days. The next morning (or trigger **Retention Sweep** manually in n8n), confirm low-value mail older than 30 days is gone and an `activity_log` row records it; confirm mail with an attached task/draft/commitment is not touched.
- [ ] Set retention back to **Not set**. Confirm the sweep's next run does nothing (exits at **Retention set?**).
- [ ] `tsc --noEmit`, `eslint`, `node scripts/ci/check-n8n-workflows.mjs`, `node scripts/ci/check-migrations.mjs` all pass (no schema changes in this phase, so migrations should report unchanged).
