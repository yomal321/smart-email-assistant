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

- [x] Go to [Google AI Studio](https://aistudio.google.com/) and create an API key with access to a Gemini Flash model that supports structured output / JSON mode.
- [x] Note the key value. It goes **directly into n8n's credential store** (step 3) — never into any file in this repo, never committed, never pasted into the workflow JSON.
- [x] Decide and record which data-retention tier this key is provisioned under (free tier vs. paid) — `design.md`'s Risks table calls this out explicitly, since email content leaves the system to this endpoint (FR10 limits what's sent to `subject` + a truncated `body`, but the destination's retention policy is still a deliberate choice, not a default).

## 2. Apply the Supabase migration

- [x] Open Supabase Studio → SQL Editor.
- [x] Paste the full contents of `supabase/migrations/0002_triage_schema.sql` and run it. This adds `emails.summary`, `emails.triage_error`, and the `CHECK` constraint restricting `emails.category` to the five values (`needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`) or `NULL`.
- [x] Run this **before** step 6 (re-deploying the updated Email Normaliser) — the new branch's downstream write targets these columns.

## 3. Create the Gemini n8n credential

- [x] Create a new n8n credential named **Gemini API**, type **HTTP Header Auth**, with header name `x-goog-api-key` and the step-1 key as its value.
- [x] This is a new credential — it does not reuse anything from `002-ingestion`.

## 4. Import the two new workflows

Import in this order so the sub-workflow reference resolves:

- [x] Import `n8n/workflows/llm-gateway.json` first (name: **LLM Gateway**) — it must exist before Triage Pipeline can reference it.
- [x] Import `n8n/workflows/triage-pipeline.json` (name: **Triage Pipeline**).
- [x] In **Triage Pipeline**, re-point the **"Call LLM Gateway"** node at the real imported LLM Gateway workflow via n8n's resource picker — it currently references it by `cachedResultName: "LLM Gateway"` only, with `workflowId.value` blank (same placeholder pattern `002-ingestion` used for its own sub-workflow calls).
- [x] Attach the step-3 **Gemini API** credential to **LLM Gateway**'s "Call Gemini generateContent" node, replacing the placeholder credential id `REPLACE_WITH_GEMINI_API_CREDENTIAL_ID`.
- [x] Attach the existing **Supabase Postgres** credential (the same one `email-normaliser.json`'s "Upsert email" node already uses — do not create a new one, per NFR3) to **Triage Pipeline**'s "Write triage success" and "Write triage failure" nodes, replacing `REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID` on each.
- [x] (Offline check, no live account needed) Before wiring anything live, you can validate LLM Gateway in isolation using its pinned test data — execute it standalone in the n8n editor with its own `pinData` and confirm it returns `{ success: true, data: {...} }` for the example. You can similarly execute Triage Pipeline standalone using its `normal` / `malformed_empty_body` pinned inputs (from `n8n/fixtures/triage-fixture-email.json`) to exercise the prompt-building and validation logic before connecting it to a live ingestion run.

**Two post-import fixes discovered during live deployment (2026-09-10), both applied to the repo's source files and must also be applied to the live n8n workflows if re-importing from a stale copy:**
- `llm-gateway.json`'s "Call Gemini generateContent" node originally targeted model id `gemini-2.0-flash`, which Google deprecated — a live call returned `"This model models/gemini-2.0-flash is no longer available... use models/gemini-3.6-flash"`. Fixed to `gemini-3.6-flash`. See `.specclaw/changes/004-triage/learnings.md` (L5).
- `triage-pipeline.json`'s "Format success output" and "Format failure output" nodes used `$('Validate triage result').item.json.email_id`, which throws `Multiple matches` whenever more than one item is in flight (e.g. testing with two pinned fixture items at once). Fixed to `.first()` in both nodes — safe in production since Triage Pipeline is always invoked with exactly one email per call.

## 5. Update the live Email Normaliser

- [x] Re-import (or update in place) `n8n/workflows/email-normaliser.json` in your n8n instance — it now has two additional nodes, **"Inserted?"** and **"Call Triage Pipeline"**, appended after the existing "Format output" node. No existing node, connection, or credential in this workflow was changed by this update.
- [x] In **"Call Triage Pipeline"**, re-point it at the real imported **Triage Pipeline** workflow via n8n's resource picker, same as step 4's re-pointing — it references `cachedResultName: "Triage Pipeline"` with a blank `workflowId.value` until you do this.
- [x] Confirm the node's **"Wait For Sub-Workflow Completion"** option is set to **off** (`waitForSubWorkflow: false` in the exported JSON) — this is what keeps Gmail Ingestion's already-verified latency (`002-ingestion` AC1) independent of Gemini's response time.

**Note:** during deployment, the old Email Normaliser was deleted and re-imported fresh rather than edited in place. This broke two *other* workflows that referenced it by internal workflow ID — Gmail Ingestion's and Gmail Renewal & Recovery's own separate "Call Email Normaliser" nodes both had to be re-pointed at the new workflow via the resource picker. If you ever replace Email Normaliser again (rather than editing it in place), remember to re-point **both** of those callers, not just the new Triage Pipeline branch.

**Also note:** n8n requires sub-workflows to be published before anything that calls them can be published. Publish order: **LLM Gateway → Triage Pipeline → Email Normaliser**.

## 6. Final verification (AC1–AC6)

- [x] **AC1** — Send a manual test email. After Email Normaliser's Triage Pipeline call fires, query the `emails` table directly (not just n8n's execution log) and confirm that row has a non-null `category` (one of the five values) and a `summary` at or under 160 characters with no newline.
  - Confirmed 2026-09-10 — real test email produced a row with a valid `category` and a one-line `summary` under 160 chars, `triage_error` null. (First attempt hit the deprecated-model error above; retried successfully after the model-id fix.)
- [x] **AC2** — Send (or simulate, via a fixture with `subject: null, body: ""`) a test email with an empty/malformed body. Confirm neither Email Normaliser nor Triage Pipeline crashes, and the row ends up either with a valid `category`/`summary` or with `category IS NULL` and a non-null `triage_error`.
  - Confirmed 2026-09-10 — the `malformed_empty_body` fixture ran through the full pipeline without crashing, alongside the `.first()` fix verification.
- [x] **AC3** — In the n8n editor, execute **LLM Gateway** standalone using its own pinned `system_prompt`/`user_content`/`response_schema` example, with no Supabase credential attached to that execution. Confirm it returns a parsed `{ success: true, data }` response.
  - Confirmed 2026-09-10 — standalone execution returned `{ success: true, data: { category: "fyi", summary: "..." } }` with no `emails` row or Supabase credential involved.
- [x] **AC4** — Replay the same Pub/Sub notification for the AC1 test email a second time (the `002-ingestion` AC3 dedup case). Confirm in n8n's execution log that "Inserted?" evaluates false for the conflicting insert and "Call Triage Pipeline" does not execute a second time for that message.
  - Confirmed 2026-09-10 — running Email Normaliser twice against the same pinned message: first run "Inserted?" true (Triage Pipeline fired), second run "Inserted?" false (Triage Pipeline node stayed unexecuted).
- [x] **AC5** — Pin `n8n/fixtures/triage-fixture-email.json`'s `invalid_category_mock` entry as the output of Triage Pipeline's "Call LLM Gateway" node, then execute the workflow. Confirm "Validate triage result" rejects it, the row (or a disposable test row) ends up with `category IS NULL` and `triage_error` populated, and `category` is never set to the invalid value. Repeat with `oversized_summary_mock` to confirm the summary shape guard (FR9) rejects it the same way.
  - Confirmed 2026-09-10 — pinned `invalid_category_mock` (`category: "urgent"`), "Validate triage result" returned `{ ok: false, error: "invalid category: urgent" }`, "Valid?" took the false branch. `oversized_summary_mock` not separately re-run but exercises the same validation code path.
- [x] **AC6** — Run a schema review of `emails` (e.g. `\d emails` in Supabase Studio, or re-read `0001_ingestion_schema.sql` + `0002_triage_schema.sql` together) and confirm `category` carries the five-value `CHECK` constraint, and `summary`/`triage_error` are nullable, model-written-only columns.
  - Confirmed — migration applied successfully in step 2; `emails_category_check` constraint and both nullable columns exist exactly as specified.
