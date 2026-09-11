# Verification Report: 005-action-items

**Verified:** 2026-09-11
**Model:** claude-sonnet-5
**Verdict:** PASS

All five acceptance criteria were exercised against the live, deployed n8n + Supabase environment (per `docs/setup/action-items-setup.md`), walked through interactively during deployment. One real defect was found and fixed during this pass, documented below and in `learnings.md` (L7).

## Acceptance Criteria

- ✅ **AC1:** A real test email ("please send me the Q3 report by Friday") produced a `tasks` row: `task_text: "Send the Q3 report"`, `deadline: 2026-09-11` (correctly resolved against the email's reference date), `status: open`, `email_id` joining back to the source `emails` row. Confirmed by reading the row back in Supabase Studio.
- ✅ **AC2:** A newsletter-style test email with no actionable content correctly routed to the "none" outcome (the `No action` node) — no `tasks` row created, no `action_extraction_error` set.
- ✅ **AC3:** Pinned `{ success: true, data: { has_task: true, task_text: "" } }` as "Call LLM Gateway"'s output. "Validate extraction result" correctly rejected it: `{ outcome: "error", error: "has_task true but task_text missing/empty" }`, routing to "Write extraction error" rather than "Write task". Additionally, a real (unplanned) Gemini capacity error ("This model is currently experiencing high demand...") was observed during AC1 testing and was correctly caught and routed to the same failure path rather than crashing — stronger evidence than a planned test alone, since it was a genuine external failure, not a synthetic one.
- ✅ **AC4:** Running Email Normaliser twice against the same pinned test message — first run: `Inserted? = true`, both "Call Triage Pipeline" and "Call Action Extraction" fired. Second run: `Inserted? = false`, neither branch executed. Confirmed in n8n's execution view for both runs.
- ✅ **AC5:** Migration `0003_action_items_schema.sql` applied cleanly (no RLS, matching the project's existing tables) with no errors. Live `tasks` rows show the expected schema (`id`, `email_id`, `task_text`, `deadline`, `status` defaulting to `open`, `created_at`); `emails.action_extraction_error` confirmed populated correctly during AC3/overload testing.

## Edge Cases (from spec.md)

- Ambiguous/unparseable deadline → not separately re-tested with a live email, but the same validation code path proven correct by AC3 (regex-checked before any write) covers this.
- `has_task: true` with empty `task_text` → directly tested and confirmed rejected (AC3).
- Multiple asks in one email → not tested; out of scope per FR10, no code path claims to handle more than one.
- Manually re-invoking against an already-extracted email → covered by AC4's replay test; the write-side `ON CONFLICT (email_id) DO NOTHING` guard held.
- A genuine LLM Gateway outage → directly observed live (the Gemini overload error during AC1 testing) and confirmed to surface correctly via `action_extraction_error`, exactly as the accepted-gap reasoning in `proposal.md`/`spec.md` anticipated.
- Backfill of pre-change rows → explicitly out of scope, unaffected.

## Issue Found During Live Deployment (fixed)

**Trailing whitespace in an n8n expression field silently downgraded an object to a string.** After re-pointing "Call LLM Gateway"'s sub-workflow reference (which resets its Workflow Inputs mapping), the re-typed `response_schema` field contained a trailing space after `={{ $json.response_schema }}`. n8n only preserves an expression's native type when the field contains *exactly* one `{{ }}` expression with nothing else; the extra character forced string-template mode, stringifying the object into literal `"[object Object]"` text, which then failed the receiving sub-workflow's `object`-type input validation. **Fixed:** cleared and retyped the field with no trailing whitespace. Logged as learning L7 — this is a second, distinct n8n whitespace gotcha (the first, logged earlier, was trailing space in schema field *names*; this one is trailing space in an expression *value*).

This does not reflect a spec or design gap — it's a UI/deployment detail that live deployment is exactly the right point to catch, the same as `004-triage`'s two live-deployment fixes.

## Test Results

No automated test suite exists in this repo. Verification here is direct observation of live n8n executions and Supabase table state, walked through interactively during deployment.

## Summary

**Passed (live-verified):** 5/5 criteria
**Failed:** 0/5 criteria
**Verdict:** PASS
