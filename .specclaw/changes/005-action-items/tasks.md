# Tasks: Action Items (Phase 3)

**Change:** 005-action-items
**Created:** 2026-09-10
**Total Tasks:** 4

## Summary

Four tasks: one migration, one new n8n workflow (reusing the existing LLM Gateway and Supabase Postgres credential — no fixture file or new credential needed this time, per NFR1/NFR3), one additive branch on Email Normaliser, and the setup runbook last. Smaller than `004-triage`'s six tasks since this change reuses LLM Gateway and its credential unmodified rather than building either.

## Tasks

### Wave 1 — Schema

- [x] `T1` — Write the Supabase migration for the `tasks` table and `emails.action_extraction_error`
  - Files: `supabase/migrations/0003_action_items_schema.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact DDL is in `design.md` § Data Model Changes — use it verbatim: `tasks` (id, `email_id` FK not null with `UNIQUE`, `task_text` not null, `deadline` nullable date, `status` with `CHECK ... in ('open','done','dismissed')` defaulting `'open'`, `created_at`), plus `emails.action_extraction_error` (nullable text). Include both column comments recording the writer/nullability convention, matching `0001_ingestion_schema.sql`'s and `0002_triage_schema.sql`'s existing style.

### Wave 2 — n8n workflow

- [x] `T2` — Author the Action Extraction sub-workflow
  - Files: `n8n/workflows/action-extraction.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: `{ email_id, subject, body, received_at }` in (FR1/FR5 — `received_at` is the reference date for deadline resolution). Truncate `body` the same way `triage-pipeline.json`'s "Build triage prompt" does (reuse that pattern). Build a `{ has_task, task_text?, deadline? }` `response_schema` with `deadline` constrained to a `YYYY-MM-DD` string pattern (FR4), and include `received_at` in `user_content` (FR5). Call LLM Gateway exactly the way `triage-pipeline.json`'s "Call LLM Gateway" node does — read that node first and copy its `executeWorkflow` pattern (`cachedResultName: "LLM Gateway"`, blank `workflowId.value`, `defineBelow` input mapping). Validate the result (FR6): `success: false` → failure path; `has_task: false` → no-op path (FR9, no write at all); `has_task: true` with empty `task_text` or a `deadline` not matching `YYYY-MM-DD` → failure path; otherwise → success path. Three-way branch (a Switch node, or two chained IF nodes) rather than Triage Pipeline's simple two-way `Valid?`, since this workflow has three terminal outcomes, not two. Success path: `INSERT INTO tasks (email_id, task_text, deadline, status) VALUES ($1, $2, $3, 'open') ON CONFLICT (email_id) DO NOTHING` (FR7), reusing the `Supabase Postgres` credential exactly as `triage-pipeline.json`'s write nodes do (same credential name/placeholder id, NFR3 — no new credential). Failure path: `UPDATE emails SET action_extraction_error = $1 WHERE id = $2` (FR8) — no `WHERE category IS NULL`-style guard needed here since `action_extraction_error` isn't part of a success/failure pair being protected from overwrite the way `category` is, but do still guard against overwriting an existing `tasks` row indirectly via the `ON CONFLICT` on the success path. No-op path: just format a minimal output, no DB write. Pin no fixture file — testing uses n8n's pin-mock-data-on-a-node feature directly on this workflow's own "Call LLM Gateway" node (NFR1), not a JSON fixture.

### Wave 3 — Email Normaliser branch

- [x] `T3` — Add the Action Extraction branch to Email Normaliser
  - Files: `n8n/workflows/email-normaliser.json`
  - Estimate: small
  - Kind: impl
  - Depends: T2
  - Notes: Purely additive (design.md's explicit constraint, same as `004-triage`'s T5) — one new node (`Call Action Extraction`, an `executeWorkflow` node referencing "Action Extraction" by `cachedResultName`, `waitForSubWorkflow: false`) plus one additional connection from the **existing** `Inserted?` node's **true** output, which already connects to `Call Triage Pipeline` — add a second entry to that same output's connection array rather than replacing it (n8n supports multiple connections from one output). No existing node, connection, or credential in this file changes. Pass `{ email_id, subject, body, received_at }` — `received_at` comes from `$('Normalize').item.json.received_at`, the same by-name cross-node reference pattern `Call Triage Pipeline` already uses for `subject`/`body`.

### Wave 4 — Setup runbook

- [x] `T4` — Write the action items setup runbook
  - Files: `docs/setup/action-items-setup.md`
  - Estimate: small
  - Kind: docs
  - Depends: T1, T2, T3
  - Notes: Mirrors `docs/setup/triage-setup.md`'s structure but shorter — no new credentials to create (NFR3): apply migration `0003` in Supabase Studio, import `action-extraction.json`, re-point its "Call LLM Gateway" node at the existing LLM Gateway workflow, attach the existing `Supabase Postgres` credential to its write node(s), update the live Email Normaliser with its new branch (T3), then the AC1–AC5 verification checklist written as executable steps. For AC3/AC4, document the pin-mock-data-on-a-node testing technique explicitly (NFR1) — how to pin a forced-failure response on "Call LLM Gateway" for AC3, and how to re-run Email Normaliser twice against the same pinned fixture for AC4, the same way `004-triage`'s runbook's AC5/AC4 sections were actually exercised live.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**
```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
