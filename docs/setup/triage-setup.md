# Triage Setup Runbook

Change: `004-triage`. Covers everything needed to go from a live Gmail ingestion
pipeline (`002-ingestion`, already running) to that pipeline also writing a
`category` and `summary` to every new email. Follow the steps in order — later
steps depend on IDs/credentials produced by earlier ones.

Unlike `002-ingestion`, this change adds **no new HTTP endpoint** — Triage
Pipeline is invoked internally by Email Normaliser, the same way Gmail
Ingestion already invokes Email Normaliser. There is no webhook URL to
register with any provider, and no OAuth consent screen to configure.

---

## 1. Create a Google AI Studio API key

- [ ] Go to [Google AI Studio](https://aistudio.google.com/) and create an API key with access to a Gemini Flash model that supports structured output / JSON mode.
- [ ] Note the key value. It goes **directly into n8n's credential store** (step 3) — never into any file in this repo, never committed, never pasted into the workflow JSON.
- [ ] Decide and record which data-retention tier this key is provisioned under (free tier vs. paid) — `design.md`'s Risks table calls this out explicitly, since email content leaves the system to this endpoint (FR10 limits what's sent to `subject` + a truncated `body`, but the destination's retention policy is still a deliberate choice, not a default).

## 2. Apply the Supabase migration

- [ ] Open Supabase Studio → SQL Editor.
- [ ] Paste the full contents of `supabase/migrations/0002_triage_schema.sql` and run it. This adds `emails.summary`, `emails.triage_error`, and the `CHECK` constraint restricting `emails.category` to the five values (`needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`) or `NULL`.
- [ ] Run this **before** step 6 (re-deploying the updated Email Normaliser) — the new branch's downstream write targets these columns.

## 3. Create the Gemini n8n credential

- [ ] Create a new n8n credential named **Gemini API**, type **HTTP Header Auth**, with header name `x-goog-api-key` and the step-1 key as its value.
- [ ] This is a new credential — it does not reuse anything from `002-ingestion`.

## 4. Import the two new workflows

Import in this order so the sub-workflow reference resolves:

- [ ] Import `n8n/workflows/llm-gateway.json` first (name: **LLM Gateway**) — it must exist before Triage Pipeline can reference it.
- [ ] Import `n8n/workflows/triage-pipeline.json` (name: **Triage Pipeline**).
- [ ] In **Triage Pipeline**, re-point the **"Call LLM Gateway"** node at the real imported LLM Gateway workflow via n8n's resource picker — it currently references it by `cachedResultName: "LLM Gateway"` only, with `workflowId.value` blank (same placeholder pattern `002-ingestion` used for its own sub-workflow calls).
- [ ] Attach the step-3 **Gemini API** credential to **LLM Gateway**'s "Call Gemini generateContent" node, replacing the placeholder credential id `REPLACE_WITH_GEMINI_API_CREDENTIAL_ID`.
- [ ] Attach the existing **Supabase Postgres** credential (the same one `email-normaliser.json`'s "Upsert email" node already uses — do not create a new one, per NFR3) to **Triage Pipeline**'s "Write triage success" and "Write triage failure" nodes, replacing `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID` on each.
- [ ] (Offline check, no live account needed) Before wiring anything live, you can validate LLM Gateway in isolation using its pinned test data — execute it standalone in the n8n editor with its own `pinData` and confirm it returns `{ success: true, data: {...} }` for the example. You can similarly execute Triage Pipeline standalone using its `normal` / `malformed_empty_body` pinned inputs (from `n8n/fixtures/triage-fixture-email.json`) to exercise the prompt-building and validation logic before connecting it to a live ingestion run.

## 5. Update the live Email Normaliser

- [ ] Re-import (or update in place) `n8n/workflows/email-normaliser.json` in your n8n instance — it now has two additional nodes, **"Inserted?"** and **"Call Triage Pipeline"**, appended after the existing "Format output" node. No existing node, connection, or credential in this workflow was changed by this update.
- [ ] In **"Call Triage Pipeline"**, re-point it at the real imported **Triage Pipeline** workflow via n8n's resource picker, same as step 4's re-pointing — it references `cachedResultName: "Triage Pipeline"` with a blank `workflowId.value` until you do this.
- [ ] Confirm the node's **"Wait For Sub-Workflow Completion"** option is set to **off** (`waitForSubWorkflow: false` in the exported JSON) — this is what keeps Gmail Ingestion's already-verified latency (`002-ingestion` AC1) independent of Gemini's response time.

## 6. Final verification (AC1–AC6)

- [ ] **AC1** — Send a manual test email. After Email Normaliser's Triage Pipeline call fires, query the `emails` table directly (not just n8n's execution log) and confirm that row has a non-null `category` (one of the five values) and a `summary` at or under 160 characters with no newline.
- [ ] **AC2** — Send (or simulate, via a fixture with `subject: null, body: ""`) a test email with an empty/malformed body. Confirm neither Email Normaliser nor Triage Pipeline crashes, and the row ends up either with a valid `category`/`summary` or with `category IS NULL` and a non-null `triage_error`.
- [ ] **AC3** — In the n8n editor, execute **LLM Gateway** standalone using its own pinned `system_prompt`/`user_content`/`response_schema` example, with no Supabase credential attached to that execution. Confirm it returns a parsed `{ success: true, data }` response.
- [ ] **AC4** — Replay the same Pub/Sub notification for the AC1 test email a second time (the `002-ingestion` AC3 dedup case). Confirm in n8n's execution log that "Inserted?" evaluates false for the conflicting insert and "Call Triage Pipeline" does not execute a second time for that message.
- [ ] **AC5** — Pin `n8n/fixtures/triage-fixture-email.json`'s `invalid_category_mock` entry as the output of Triage Pipeline's "Call LLM Gateway" node, then execute the workflow. Confirm "Validate triage result" rejects it, the row (or a disposable test row) ends up with `category IS NULL` and `triage_error` populated, and `category` is never set to the invalid value. Repeat with `oversized_summary_mock` to confirm the summary shape guard (FR9) rejects it the same way.
- [ ] **AC6** — Run a schema review of `emails` (e.g. `\d emails` in Supabase Studio, or re-read `0001_ingestion_schema.sql` + `0002_triage_schema.sql` together) and confirm `category` carries the five-value `CHECK` constraint, and `summary`/`triage_error` are nullable, model-written-only columns.
