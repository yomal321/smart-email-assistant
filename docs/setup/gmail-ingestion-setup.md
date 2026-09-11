# Gmail Ingestion — Setup Runbook

Change: `002-ingestion`. Covers everything needed to go from zero to a live,
push-driven Gmail → Supabase ingestion pipeline. Follow the steps in order —
later steps depend on IDs/URLs produced by earlier ones.

Target account for this change: `yomaltheekshana66@gmail.com`.

---

## 1. Google Cloud project

- [ ] Create or select a Google Cloud project.
- [ ] Enable the **Gmail API** for that project (APIs & Services → Enable APIs and Services → Gmail API).

## 2. Pub/Sub topic

- [ ] Create a Pub/Sub topic, e.g. `gmail-push-notifications`.
- [ ] Note its full resource name: `projects/<GCP_PROJECT_ID>/topics/gmail-push-notifications`. This is the value that fills every `REPLACE_WITH_GCP_PROJECT_ID` placeholder found in `n8n/workflows/gmail-renewal-recovery.json` (the `jsonBody.topicName` sent to `watch()`, in both the "Call watch()" and "Re-register watch()" nodes, and the `newSubscriptionId` fallback string in the "Prepare catch-up" code node).
- [ ] Restrict the topic's publish IAM to **only** the principal `gmail-api-push@system.gserviceaccount.com`, with role `roles/pubsub.publisher`. Do not grant any broader publisher.
- [ ] Create a push subscription on this topic pointed at your n8n webhook URL (final URL comes from step 9 — you can create the subscription now with a placeholder endpoint and edit it once the URL is known, or wait until after step 5/9).

## 3. OAuth consent screen

- [ ] Configure the OAuth consent screen as **External**, in **Testing** mode (the app stays unverified — accepted risk per the umbrella proposal).
- [ ] Scopes: add **only** `gmail.readonly` (per FR10 — do not add broader Gmail scopes such as `gmail.modify` or `mail.google.com`).
- [ ] Add `yomaltheekshana66@gmail.com` as a test user (per spec.md's Dependencies section).

## 4. OAuth 2.0 Client ID

- [ ] Create an OAuth 2.0 Client ID of type **Web application**.
- [ ] Note the Client ID and Client Secret. These go **directly into n8n's credential store** (step 7) — never into any file in this repo, never committed, never pasted into the workflow JSON.

## 5. n8n reachable at a stable public HTTPS address

- [ ] Stand up n8n somewhere with a stable public HTTPS URL before continuing — the webhook URL needed in step 9 and the Pub/Sub push subscription's audience/endpoint (step 2) both depend on this existing first.
  - Production path: AWS EC2 (Ubuntu) + Docker Compose + Caddy (reverse proxy handles the HTTPS cert).
  - Faster path to test the pipeline: a temporary n8n Cloud instance.

## 6. Apply the Supabase migration

- [ ] Open Supabase Studio → SQL Editor.
- [ ] Paste the full contents of `supabase/migrations/0001_ingestion_schema.sql` and run it. This creates `accounts`, `emails`, and `sync_outcomes`.

## 7. Create n8n credentials

Two credentials are referenced by name throughout the workflow JSON files — create both before importing:

- [ ] **Gmail OAuth2** — an n8n Gmail OAuth2 credential using the step-4 Client ID/Secret, scoped to `gmail.readonly`.
- [ ] **Supabase Postgres** — an n8n Postgres credential using the step-6 Supabase project's connection details (Project Settings → Database in Supabase Studio).

(Note: `n8n/workflows/email-normaliser.json`'s Postgres node ships with placeholder credential id `placeholder-supabase-postgres-credential`, while `gmail-ingestion.json` and `gmail-renewal-recovery.json` use `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID` — both resolve to the same credential **name**, `Supabase Postgres`, shown in n8n's editor; when you attach the real credential via the picker in step 9, the underlying id is rewritten regardless of which placeholder string was there.)

## 8. Import the three workflows

Import in this order so sub-workflow references can be resolved:

- [ ] Import `n8n/workflows/email-normaliser.json` first (name: **Email Normaliser**) — it must exist before anything can reference it.
- [ ] Import `n8n/workflows/gmail-ingestion.json` (name: **Gmail Ingestion**).
- [ ] Import `n8n/workflows/gmail-renewal-recovery.json` (name: **Gmail Renewal & Recovery**).
- [ ] In **Gmail Ingestion**, re-point the **"Call Email Normaliser"** node at the real imported Email Normaliser workflow via n8n's resource picker — it currently references it by `cachedResultName: "Email Normaliser"` only, with `workflowId.value` blank.
- [ ] In **Gmail Renewal & Recovery**, re-point its own, separate **"Call Email Normaliser"** node the same way (same placeholder pattern: `cachedResultName: "Email Normaliser"`, blank `workflowId.value`).
- [ ] While in the editor, attach the step-7 **Gmail OAuth2** credential to every node currently showing the placeholder credential id `REPLACE_WITH_GMAIL_OAUTH2_CREDENTIAL_ID` (nodes named "history.list fetch", "messages.get fetch" in Gmail Ingestion; "Call watch()", "Re-register watch()", "messages.get" in Gmail Renewal & Recovery), and attach **Supabase Postgres** to every node showing `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID` or `placeholder-supabase-postgres-credential` ("Read account cursor", "Advance cursor" in Gmail Ingestion; "Read account state", "Record renewed", "Record failed", "Record re-registered", "Record failed — catch-up incomplete" in Gmail Renewal & Recovery; "Upsert email" in Email Normaliser).
- [ ] (Offline check, no live account needed) Before wiring anything live, you can validate Email Normaliser in isolation using its pinned test data — it ships with `n8n/fixtures/gmail-message-sample.json` as its `pinData` for the "Execute Workflow Trigger" node, so you can execute it standalone in the n8n editor and confirm the mapped `emails` row shape looks right.

## 9. Fill in the remaining placeholders

- [ ] In **Gmail Ingestion**, node **"Token valid?"**: replace `REPLACE_WITH_WEBHOOK_PUBLIC_URL` with this workflow's actual public webhook URL (the `Gmail Pub/Sub Webhook` node's path is `gmail-pubsub`, so the full URL is `https://<your-n8n-host>/webhook/gmail-pubsub`). This same URL is also what you register as the OIDC audience on the Pub/Sub push subscription (step 2).
- [ ] In **Gmail Renewal & Recovery**, every occurrence of `REPLACE_WITH_GCP_PROJECT_ID` (in the `jsonBody.topicName` sent by "Call watch()" and "Re-register watch()", and in the `newSubscriptionId` fallback inside "Prepare catch-up"): replace with your real GCP project ID from step 2.

## 10. Register the initial subscription

- [ ] There is no "create account" workflow in this change (out of scope — see design.md), so this step and step 11 are a one-time manual bootstrap.
- [ ] Manually execute the **Gmail Renewal & Recovery** workflow once in the n8n editor (or just its "Call watch()" node) to register the first live `users.watch()` subscription against the step-2 Pub/Sub topic. Capture the response's `historyId` and `expiration`.
- [ ] Note: this first manual run will fail at "Read account state" / the later UPDATE statements if the `accounts` row doesn't exist yet — do step 11 first, then re-run, or run the watch() call standalone and carry its output into the INSERT in step 11.

## 11. Insert the account row

One-time manual insert into `accounts`, matching the migration's columns:

```sql
insert into accounts (
  provider,
  n8n_credential_id,
  sync_cursor,
  subscription_id,
  subscription_expires_at,
  last_successful_sync
) values (
  'gmail',
  '<step-7 Gmail OAuth2 credential id, from n8n>',
  '<historyId returned by the step-10 watch() call>',
  'projects/<GCP_PROJECT_ID>/topics/gmail-push-notifications',
  to_timestamp(<expiration from watch(), ms>::bigint / 1000.0),
  now()
);
```

- [ ] Run this in Supabase Studio's SQL Editor after step 10's `watch()` call has returned, using its real `historyId`/`expiration`.
- [ ] If step 10 was run before this insert existed, re-run **Gmail Renewal & Recovery** once more afterward so its normal renewal path (which reads this row) succeeds end-to-end.

## 12. Final verification (AC1–AC5)

- [x] **AC1** — Send a manual test email to `yomaltheekshana66@gmail.com`. Watch n8n's execution log (not Supabase polling) for a **Gmail Ingestion** execution firing within seconds, and confirm it produced exactly one new row in `emails` for that message.
  - Confirmed 2026-09-08 with a real Gmail message — live Pub/Sub delivery observed firing the pipeline end-to-end.
- [x] **AC2** — Send (or simulate) a push request to the webhook with a missing/invalid OIDC token (e.g. no `Authorization` header, or a garbage bearer token). Confirm in n8n's execution log that the run reaches the **"Drop — invalid token"** node and stops there — no row written to `emails`.
  - Confirmed 2026-09-08 — event log traced two fake pushes, both dropped before fetch.
- [x] **AC3** — Replay the same Pub/Sub notification for the test email from AC1 a second time (or trigger two overlapping deliveries). Confirm `emails` still has exactly one row for that `provider_message_id` — the `ON CONFLICT DO NOTHING` constraint absorbs the duplicate.
  - Confirmed 2026-09-08 — duplicate insert rejected by the constraint; row count held at 1.
- [ ] **AC4 (multi-day)** — Let at least one scheduled tick of **Gmail Renewal & Recovery** run (every 6 hours). Confirm afterward that `accounts.subscription_id` / `accounts.subscription_expires_at` were updated and a `renewed` row was written to `sync_outcomes` for that run — don't just confirm the workflow is deployed/active, confirm an actual successful run happened.
  - **Pending** — workflow is published and scheduled; needs a real 6-hour tick to fire and succeed. Re-check by querying `sync_outcomes` for a `renewed` row for this account.
- [x] **AC5** — Run a schema review of `accounts` (e.g. `\d accounts` in Supabase Studio or re-read `0001_ingestion_schema.sql`) and confirm no column holds OAuth token or refresh-token material — only `n8n_credential_id` (a reference) plus sync-state columns.
  - Confirmed 2026-09-08 — schema inspected directly: 10 columns total, `n8n_credential_id` is a plain-text reference, no OAuth token/refresh-token material present.
