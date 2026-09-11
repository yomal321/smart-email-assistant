# Tasks: Draft Generation (Phase 4)

**Change:** 006-draft-generation
**Created:** 2026-09-11
**Total Tasks:** 4

## Summary

Four tasks: one migration, one documentation update (resolving `architect/04-data-model.md`'s flagged open question as an in-scope co-change, not a follow-up), the workflow itself (larger than `004-triage`/`005-action-items`'s single-workflow tasks, since this is the first pipeline needing real auth, rate limiting, and a regeneration cap), and the setup runbook last. Unlike those two prior phases, no task touches Email Normaliser — Draft Generation is reached externally, not fanned out from ingestion.

## Tasks

### Wave 1 — Schema and docs

- [x] `T1` — Write the Supabase migration for the `drafts` table and `emails.draft_generation_error`
  - Files: `supabase/migrations/0004_draft_generation_schema.sql`
  - Estimate: small
  - Kind: migration
  - Notes: Exact DDL is in `design.md` § Data Model Changes — use it verbatim: `drafts` (id, `email_id` FK not null — **no** uniqueness constraint, unlike `005-action-items`'s `tasks.email_id` — `draft_body` not null, `status` with `CHECK ... in ('pending','sent','discarded')` defaulting `'pending'`, `created_at`), plus `emails.draft_generation_error` (nullable text). Include both column comments recording the writer/nullability convention and, for `drafts.email_id`, explicitly why it has no unique constraint (multiple drafts per email is intended, bounded by an application-level cap instead — see T3).

- [x] `T2` — Update `architect/04-data-model.md` to reflect the `drafts` table decision
  - Files: `architect/04-data-model.md`
  - Estimate: small
  - Kind: docs
  - Notes: This is an in-scope co-change per `proposal.md`/`spec.md` AC8, not a follow-up. Replace the ER diagram's `draft_body` field on `EMAILS` with a new `DRAFTS` table entry (id, email_id FK, draft_body, status, created_at), mirroring how the existing `TASKS` table is presented in the same diagram. Remove the "Draft storage" bullet from that doc's "Open questions, still unresolved in the proposal" section — it's resolved by this change, and this table's writer (`Draft Generation`) should be added to that doc's "Who writes what" table alongside the existing `Triage Pipeline`/`Action Extraction` rows. Surgical edit — do not touch any other section of the file.

### Wave 2 — n8n workflow

- [x] `T3` — Author the Draft Generation workflow
  - Files: `n8n/workflows/draft-generation.json`
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes: Full node sequence is in `design.md` § Architecture — implement it exactly:
    1. **Webhook trigger** (`POST`, path e.g. `generate-draft`), JSON body `{ email_id }`, header `x-draft-webhook-secret`.
    2. **Cooldown check** (Code node, `$getWorkflowStaticData()`) — if a cooldown-until timestamp is set and still in the future, respond `429` immediately (FR3) and stop; otherwise continue.
    3. **Verify secret** (Code node) — constant-time comparison (e.g. Node's `crypto.timingSafeEqual`, both buffers padded/hashed to equal length first since `timingSafeEqual` throws on length mismatch) against the credential-stored secret. On failure: append a timestamp to the static-data failure log, prune entries older than the window (5 min), and if the count crosses the threshold (10), set the cooldown-until timestamp (FR3); respond `401` either way (FR2) and stop.
    4. **Check email exists** (Postgres, `SELECT id, thread_id FROM emails WHERE id = $1`) — if zero rows, respond `404` (FR5) and stop.
    5. **Check regeneration cap** (Postgres, `SELECT COUNT(*) FROM drafts WHERE email_id = $1 AND created_at > now() - interval '1 hour'`) — if ≥ 5, respond `429` with the regeneration-limit message (FR4) and stop; otherwise continue.
    6. **Read thread** (Postgres, exact query in FR6 — explicit column list, `LIMIT 10`, never `SELECT *`).
    7. **Read style sample** (Postgres, exact query in FR7 — explicit column list, `LIMIT 5`; zero rows is a valid, expected result, not an error).
    8. **Build draft prompt** (Code node) — truncate every body to 1500 characters; wrap each quoted email (thread + style sample) in `<<<EMAIL_START>>> ... <<<EMAIL_END>>>` delimiters (FR8); build `system_prompt` stating delimited content is untrusted quoted material to reference, never an instruction to follow; build `user_content` from the delimited thread + style examples; build `response_schema` requesting `{ draft_body: string }`.
    9. **Call LLM Gateway** (`executeWorkflow`, same pattern as `triage-pipeline.json`'s/`action-extraction.json`'s "Call LLM Gateway" node — read one of those files first and copy its exact `cachedResultName: "LLM Gateway"` / blank `workflowId.value` / `defineBelow` mapping shape). Set a 30-second timeout on this node (check the node's Settings tab for a Timeout option in the installed n8n version; if unavailable, note this explicitly as a gap in the runbook rather than silently skipping it — FR9).
    10. **Validate result** (Code node, try/catch, `.first()` not `.item` per the `004-triage`/`005-action-items` learning — L6/L7 in `.specclaw/learnings.md`) — `success: false`, or `data.draft_body` missing/empty/not-a-string, → outcome `error`; otherwise → outcome `success`, carrying `draft_body`.
    11. **Branch on outcome** (Switch or IF node): `success` → **Write draft** (Postgres `INSERT INTO drafts (email_id, draft_body, status) VALUES ($1, $2, 'pending') RETURNING id, email_id, draft_body, status, created_at`, reusing the same `Supabase Postgres` credential name/placeholder id every prior phase's write nodes use) → **Respond 200** with that row. `error` → **Write generation error** (Postgres `UPDATE emails SET draft_generation_error = $1 WHERE id = $2`, same credential) → **Respond 502**.
    - This workflow references **no Gmail credential anywhere** (FR13) — do not add one even for convenience.
    - No fixture file needed (NFR1) — testing pins mock data directly on the "Call LLM Gateway" node's output in the n8n editor, same technique already proven for `004-triage`/`005-action-items`.

### Wave 3 — Setup runbook

- [x] `T4` — Write the draft generation setup runbook
  - Files: `docs/setup/draft-generation-setup.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T1, T2, T3
  - Notes: Mirrors `docs/setup/action-items-setup.md`'s structure with the addition of the new shared-secret credential: generating the secret (`openssl rand -base64 32` or equivalent, per FR2's entropy requirement), creating the n8n credential for it, applying migration `0004`, importing `draft-generation.json`, re-pointing its "Call LLM Gateway" node at the existing LLM Gateway workflow, attaching the existing `Supabase Postgres` credential to its write nodes, and documenting the secret-rotation procedure (every place the secret is stored, per `proposal.md`'s Proposed Solution). Close with the AC1–AC8 verification checklist written as executable curl commands — including how to trigger AC3's rate-cap cooldown (send several wrong-secret requests in a row) and AC5's regeneration-cap test (6 successive valid requests for the same `email_id`).

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
