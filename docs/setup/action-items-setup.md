# Action Items Setup Runbook

Change: `005-action-items`. Covers everything needed to go from a live triage
pipeline (`004-triage`, already running) to that pipeline also extracting
action items into a `tasks` table. Follow the steps in order — later steps
depend on the migration and imports from earlier ones.

Like `004-triage`, this change adds **no new HTTP endpoint** and, unlike
`004-triage`, **no new credential** either — Action Extraction reuses the
existing `Gemini API` credential (via LLM Gateway, untouched) and the existing
`Supabase Postgres` credential.

---

## 1. Apply the Supabase migration

- [ ] Open Supabase Studio → SQL Editor.
- [ ] Paste the full contents of `supabase/migrations/0003_action_items_schema.sql` and run it. This creates the `tasks` table (`id`, `email_id` FK + `UNIQUE`, `task_text`, `deadline`, `status`, `created_at`) and adds `emails.action_extraction_error`.
- [ ] Run this **before** step 3 (re-deploying the updated Email Normaliser) — the new branch's downstream write targets these columns.

## 2. Import the new workflow

- [ ] Import `n8n/workflows/action-extraction.json` (name: **Action Extraction**).
- [ ] In **Action Extraction**, re-point the **"Call LLM Gateway"** node at the real **LLM Gateway** workflow via n8n's resource picker — it currently references it by `cachedResultName: "LLM Gateway"` only, with `workflowId.value` blank (same placeholder pattern `004-triage` used).
- [ ] Attach the existing **Supabase Postgres** credential (the same one `email-normaliser.json`'s "Upsert email" and `triage-pipeline.json`'s write nodes already use — do not create a new one, per NFR3) to **Action Extraction**'s **"Write task"** and **"Write extraction error"** nodes, replacing `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID` on each.
- [ ] No Gemini credential step needed here — LLM Gateway is called unmodified and already holds its own credential from `004-triage`.

## 3. Update the live Email Normaliser

- [ ] Re-import (or update in place) `n8n/workflows/email-normaliser.json` in your n8n instance — it now has one additional node, **"Call Action Extraction"**, wired as a second parallel connection off the existing **"Inserted?"** node's true output, alongside the existing **"Call Triage Pipeline"**. No existing node, connection, or credential in this workflow was changed by this update.
- [ ] In **"Call Action Extraction"**, re-point it at the real imported **Action Extraction** workflow via n8n's resource picker, same as step 2's re-pointing — it references `cachedResultName: "Action Extraction"` with a blank `workflowId.value` until you do this.
- [ ] Confirm the node's **"Wait For Sub-Workflow Completion"** option is **off** (`waitForSubWorkflow: false`), same as "Call Triage Pipeline" — this keeps ingestion's speed independent of this new call too.
- [ ] Note: n8n requires sub-workflows to be published before anything that calls them can be published — publish order is **LLM Gateway → Action Extraction → Email Normaliser** (LLM Gateway is already published from `004-triage`).

## 4. Final verification (AC1–AC5)

- [ ] **AC1** — Send a test email with a clear, concrete ask and a near-term day (e.g., "please send the Q3 report by Friday"). After Email Normaliser's Action Extraction call fires, query the `tasks` table directly (not just n8n's execution log) and confirm a row exists with a non-empty `task_text`, a `deadline` matching `YYYY-MM-DD`, and `email_id` joining back to the source `emails` row.
- [ ] **AC2** — Send a test email with no actionable content (e.g., a newsletter-style email). Confirm **no** `tasks` row was created and **no** `action_extraction_error` was set for that email — this is the common, successful "nothing to extract" path, not a failure.
- [ ] **AC3** — In the n8n editor, open **Action Extraction** and pin a forced-failure mock as the output of its **"Call LLM Gateway"** node — e.g. `{ "success": true, "data": { "has_task": true, "task_text": "" } }` (empty `task_text`, an FR6 violation) or `{ "success": true, "data": { "has_task": true, "task_text": "Reply to client", "deadline": "next week" } }` (a `deadline` not matching `YYYY-MM-DD`). Execute the workflow. Confirm **"Validate extraction result"** rejects it, **"Write extraction error"** is the branch that runs (not "Write task"), and the row ends up with `action_extraction_error` populated while `tasks` gets no new row. No new fixture file is needed for this — pin the mock data directly in the editor (NFR1), the same technique used to verify `004-triage`'s AC5.
- [ ] **AC4** — Open **Email Normaliser** and run it twice using its own pinned test data (top-left trigger node) — once, then again. On the **first** run, confirm "Inserted?" is true and "Call Action Extraction" fires. On the **second** run against the same pinned message, confirm "Inserted?" is false and "Call Action Extraction" does not execute a second time — mirroring exactly how `004-triage`'s AC4 was verified live.
- [ ] **AC5** — Run a schema review of `tasks` and `emails` (e.g. `\d tasks` / `\d emails` in Supabase Studio, or re-read `0003_action_items_schema.sql`) and confirm: `tasks.email_id` is a non-nullable FK to `emails.id` with a `UNIQUE` constraint; `tasks.task_text` is non-nullable; `tasks.status` carries the `CHECK` constraint limited to `open`/`done`/`dismissed`, defaulting to `open`; `emails.action_extraction_error` is a nullable, model-written-only text column.
