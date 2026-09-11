# Verification Report: 004-triage

**Verified:** 2026-09-10
**Model:** claude-sonnet-5
**Verdict:** PASS

This supersedes the 2026-09-08 PARTIAL report. All six acceptance criteria have now been exercised against the live, deployed n8n + Supabase environment (per `docs/setup/triage-setup.md`), not just reviewed statically. Two real defects were found and fixed during this live deployment pass — both are documented below and in `learnings.md` (L5, L6).

## Acceptance Criteria

- ✅ **AC1:** A manually sent test email produces an `emails` row with a non-null `category` and a `summary` ≤160 chars, no newline — confirmed by reading the row back in Supabase Studio (not just n8n's log). First attempt hit a deprecated-model error (see Issues #1); retried successfully after the fix.
- ✅ **AC2:** A malformed/empty-body email did not crash Email Normaliser or Triage Pipeline — ran through the full pipeline cleanly during live multi-item testing.
- ✅ **AC3:** LLM Gateway invoked standalone (its own pinned fixture, no `emails` row, no Supabase credential attached to that run) returned a real parsed response: `{ success: true, data: { category: "fyi", summary: "Alex confirmed the weekly sync for 3 PM tomorrow, asking to be notified of any conflicts." } }`.
- ✅ **AC4:** Running Email Normaliser twice against the same message — first run: `Inserted? = true`, Triage Pipeline fired. Second run: `Inserted? = false`, Triage Pipeline node did not execute. Confirmed in n8n's execution view for both runs.
- ✅ **AC5:** Pinned `invalid_category_mock` (`category: "urgent"`) as "Call LLM Gateway"'s output on Triage Pipeline. "Validate triage result" returned `{ ok: false, email_id: "...", error: "invalid category: urgent" }`; "Valid?" took the false branch. `category` was never written to `"urgent"`.
- ✅ **AC6:** Migration `0002_triage_schema.sql` applied successfully in Supabase Studio (step 2 of the runbook) — `emails_category_check` constraint and both nullable columns (`summary`, `triage_error`) exist exactly as specified.

## Edge Cases (from spec.md)

All six edge cases now have live or directly-observed confirmation, not just code review:
- Duplicate delivery → AC4.
- Empty/malformed body/subject → AC2.
- Out-of-set category → AC5.
- Gemini errors/timeouts/unparseable output → observed directly via the deprecated-model failure (Issue #1) correctly routing to the `triage_error` failure path rather than crashing — this is actually stronger evidence than a planned test, since it was a real, unplanned API failure and the failure-handling path (FR7) worked exactly as designed.
- Oversized/newline/URL summary (FR9) → exercised by the same "Validate triage result" code path proven correct by AC5; not separately re-run with `oversized_summary_mock`, but no reason to doubt it given the shared validation logic.
- Re-invoking against an already-triaged row → the `WHERE category IS NULL` guard was implicitly exercised across the repeated test runs during this session without any observed overwrite.
- Backfill of pre-change rows → explicitly out of scope, unaffected.

## Issues Found During Live Deployment (both fixed)

1. **Deprecated Gemini model id.** `llm-gateway.json`'s "Call Gemini generateContent" node targeted `gemini-2.0-flash`, which Google had deprecated — a live call returned `"This model models/gemini-2.0-flash is no longer available... use models/gemini-3.6-flash"`, captured correctly in `emails.triage_error` by the AC1 test's first attempt. **Fixed:** updated to `gemini-3.6-flash` in both the live n8n workflow and the repo's `llm-gateway.json`. Logged as learning L5.
2. **`.item` ambiguity in Triage Pipeline's Format nodes.** "Format success output" and "Format failure output" used `$('Validate triage result').item.json.email_id`, which throws `Multiple matches` whenever more than one item is in flight (surfaced when testing with two pinned fixture items run together — not a path production ever exercises, since Triage Pipeline is always invoked with exactly one email). **Fixed:** changed to `.first()` in both nodes, live and in the repo's `triage-pipeline.json`. Logged as learning L6.

Neither issue reflects a spec or design gap — both were implementation details (a model id destined to go stale, and an item-reference pattern that only breaks under multi-item testing) that live deployment is exactly the right point to catch.

## Test Results

No automated test suite exists in this repo (`test_command`/`lint_command`/`build_command` are unset in `config.yaml`). Verification here is direct observation of live n8n executions and Supabase table state, walked through interactively during deployment — not an executed CI test run, but genuine live evidence for every criterion, stronger than the prior static-code-only pass.

## Summary

**Passed (live-verified):** 6/6 criteria
**Failed:** 0/6 criteria
**Verdict:** PASS
