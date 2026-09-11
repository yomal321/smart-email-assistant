# Tasks: Triage (Phase 2)

**Change:** 004-triage
**Created:** 2026-09-08
**Total Tasks:** 6

## Summary

Six tasks across three waves: schema + fixtures (parallel, no dependencies), the two new n8n sub-workflows plus the one additive branch on the already-shipped Email Normaliser (each a distinct component from `architect/03a-component-automation-engine.md`'s diagram), and the setup runbook last, once there's something concrete to point it at — the same shape `002-ingestion`'s task list used. No task is speculative — every file here is named and justified in `design.md`'s File Changes Map.

## Tasks

### Wave 1 — Schema and fixtures

- [x] `T1` — Write the Supabase migration for triage's schema additions
  - Files: `supabase/migrations/0002_triage_schema.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact DDL is in `design.md` § Data Model Changes — use it verbatim: `emails.summary` (text, nullable), `emails.triage_error` (text, nullable), and the `CHECK` constraint on `emails.category` limiting it to the five FR4 values or `NULL`. Include the two column comments recording which workflow writes each column, matching `0001_ingestion_schema.sql`'s existing convention.

- [x] `T2` — Capture fixture email bodies for standalone LLM Gateway / Triage Pipeline testing
  - Files: `n8n/fixtures/triage-fixture-email.json`
  - Estimate: small
  - Kind: test
  - Notes: At least two entries: (1) a normal `{subject, body}` pair suitable for a `needs_reply`-shaped response (AC1/AC3), and (2) a deliberately malformed/empty body for the crash-resistance check (AC2). Also include a way to force an out-of-set `category` response for AC5 — either a distinct fixture whose expected mock response is out-of-set, or a note in the fixture file on how to substitute one when testing LLM Gateway standalone.

### Wave 2 — n8n workflows

- [x] `T3` — Author the LLM Gateway sub-workflow
  - Files: `n8n/workflows/llm-gateway.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes: Generic and triage-agnostic (FR3, NFR1) — `{ system_prompt, user_content, response_schema }` in, `{ success: true, data }` or `{ success: false, error }` out. No DB access, no `emails` awareness. Must be independently invocable against T2's fixture with no Supabase credential configured (AC3). Uses Gemini's structured-output/JSON-mode support so the response is schema-constrained, not a prose reply parsed after the fact.

- [x] `T4` — Author the Triage Pipeline sub-workflow
  - Files: `n8n/workflows/triage-pipeline.json`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T2, T3
  - Notes: `{ email_id, subject, body }` in (FR1). Truncates `body` to ~2000 characters before building the prompt (FR10 — never send `raw_payload` or headers). Calls LLM Gateway (T3) requesting `{category, summary}` per FR4. Validates the returned `category` against the five-value allow-list (FR5) and `summary`'s shape — no newline, no URL, no control characters, ≤160 characters (FR9) — before any write. On success: `UPDATE emails SET category = $1, summary = $2 WHERE id = $3 AND category IS NULL` (FR6, the idempotency guard). On any failure or rejected validation: `UPDATE emails SET triage_error = $1 WHERE id = $2 AND category IS NULL` (FR7). Re-point the "Call LLM Gateway" node at the real imported LLM Gateway workflow once both are imported (same placeholder pattern `002-ingestion` used for its own sub-workflow calls).

- [x] `T5` — Add the Triage Pipeline branch to Email Normaliser
  - Files: `n8n/workflows/email-normaliser.json`
  - Estimate: small
  - Kind: impl
  - Depends: T4
  - Notes: Purely additive (design.md's explicit constraint) — one new node plus one new connection after the existing `Format output` node, calling Triage Pipeline (T4) via n8n's Execute Workflow node **configured not to wait for completion** (FR2, NFR2's non-blocking requirement) only when `Format output`'s `inserted` is `true` (FR1 — a duplicate/conflicting insert never triggers triage, AC4). No existing node, connection, query, or `pinData` fixture in this file is changed — this is the one file in this change already live in production, so the diff here should be reviewable as strictly additive.

### Wave 3 — Setup runbook

- [x] `T6` — Write the triage setup runbook
  - Files: `docs/setup/triage-setup.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T1, T3, T4, T5
  - Notes: Ordered, checklist-style steps mirroring `docs/setup/gmail-ingestion-setup.md`'s structure: creating a Google AI Studio API key, creating the n8n Gemini credential, applying migration `0002` in Supabase Studio, importing `llm-gateway.json` then `triage-pipeline.json` (order matters — Triage Pipeline references LLM Gateway), re-pointing Triage Pipeline's "Call LLM Gateway" node at the real imported workflow, attaching the reused `Supabase Postgres` credential (NFR3 — same credential Email Normaliser already holds, not a new one) to Triage Pipeline's write node, and re-deploying the updated `email-normaliser.json` with its new branch (T5) into the live n8n instance. Close with the AC1–AC6 verification checklist, written as executable steps the way `gmail-ingestion-setup.md` §12 was.

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
