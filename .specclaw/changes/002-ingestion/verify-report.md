# Verification Report: 002-ingestion

**Verified:** 2026-09-11 (AC1–AC3, AC5 confirmed 2026-09-08; AC4 confirmed 2026-09-11)
**Model:** claude-sonnet-5 / claude-opus-5
**Verdict:** PASS

All five acceptance criteria are now confirmed against the live deployment. AC4 was deliberately left open at the original verification pass because it is a multi-day criterion — it requires observing a *real* scheduled renewal cycle succeed, which cannot be simulated by executing the workflow manually. Three days of production ticks have now provided that evidence.

## Acceptance Criteria

- ✅ **AC1:** A manually sent test email produced a normalised `emails` row within seconds, confirmed by observing the live Pub/Sub delivery fire and trigger the pipeline — not by polling the table for a new row.
- ✅ **AC2:** A push request with a missing/invalid OIDC token was discarded before the fetch step, with the drop observable in n8n's execution log and no `emails` row written.
- ✅ **AC3:** A replayed notification for the same message produced exactly one `emails` row — the `unique (account_id, provider, provider_message_id)` constraint plus the normaliser's insert guard held.
- ✅ **AC4:** **Confirmed 2026-09-11 with three days of production evidence.** `sync_outcomes` holds **12 `renewed` rows and zero `failed`** (latest `2026-09-11 06:30:16`) — 6-hourly ticks at a 100% success rate. `accounts.subscription_expires_at` is `2026-09-18 06:30:16`, exactly 7 days after that latest renewal's own timestamp, which is what distinguishes a genuine renewal from a stale row. `last_successful_sync` (`2026-09-11 07:52`) and an advancing `sync_cursor` (`261981`) confirm mail continued flowing through the renewed subscription. This is observed success, not a deployed-and-assumed workflow — exactly what the criterion demanded.
- ✅ **AC5:** Schema review of `accounts` confirmed 10 columns, none holding OAuth token or refresh-token material — only `n8n_credential_id` (a reference) plus sync-state columns.

## Issue Found During AC4 Verification (fixed)

**The GCP topic placeholder reached production data.** `accounts.subscription_id` contains the literal string `projects/REPLACE_WITH_GCP_PROJECT_ID/topics/gmail-push-notifications`.

Root cause: `gmail-renewal-recovery.json` hardcodes the topic string in **four** functional locations, but `docs/setup/gmail-ingestion-setup.md` step 9 enumerated only three — omitting the `options.queryReplacement` array in the **"Record renewed"** Postgres node, which is precisely the one that writes `subscription_id`. The runbook said "every occurrence" and then gave an incomplete list, so following it correctly still produced the wrong result.

Why it stayed invisible: the `watch()` call uses a *different* copy of the string (location 1, correctly replaced), so renewals succeed normally. The column is only ever `SELECT`ed and never branched on — no node consumes `subscription_id` for logic — so a wrong value changes no behaviour. It is a data-hygiene and debuggability defect, not a functional one: anyone later reading that column to diagnose a subscription problem would be misled, and any future code that used it to re-register would break.

**Fixed:** the runbook now enumerates all four locations explicitly, flags location 4 as the silent one, and includes a backfill statement for deployments that already hit this. Logged as learning L12.

This is a documentation defect rather than a design or code defect — the workflow JSON's placeholder convention is deliberate and correct; the instructions for resolving it were incomplete.

## Test Results

No automated test suite exists in this repo (`test_command`/`lint_command`/`build_command` are unset in `config.yaml`). Verification is direct observation of live n8n executions, real Pub/Sub deliveries, and Supabase table state.

## Summary

**Passed (live-verified):** 5/5 criteria
**Failed:** 0/5 criteria
**Verdict:** PASS
