# Learnings: 002-ingestion

Build learnings, spec gaps, and patterns discovered.

**Categories:** spec_gap | design_gap | pattern | best_practice | agent_issue

---

## [L1] design_gap — design.md stated the sync cursor is 'advanced by the same...

**When:** 2026-09-05 19:25 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
design.md stated the sync cursor is 'advanced by the same transaction that writes to emails,' but this isn't achievable across an n8n Execute Workflow sub-workflow call boundary, and the zero-new-message edge case requires the cursor to advance even when the Email Normaliser sub-workflow never runs.

### Action
Resolved during build: Gmail Ingestion (T4) owns cursor advancement exclusively, once per notification regardless of message count; Email Normaliser (T3) never touches accounts.sync_cursor. Future specs describing n8n sub-workflow interactions should state which workflow owns a shared-state write, not describe it as a cross-workflow transaction.

---

## [L2] pattern — FR2/NFR1 called for OIDC token verification on the Pub/Su...

**When:** 2026-09-05 19:25 UTC
**Category:** pattern
**Priority:** low
**Status:** pending

### Detail
FR2/NFR1 called for OIDC token verification on the Pub/Sub push endpoint, but n8n's Code node sandbox has no JWT/JWKS signature-verification library available without a live instance to test package availability against.

### Action
T4 used Google's lightweight tokeninfo endpoint (GET https://oauth2.googleapis.com/tokeninfo?id_token=...) as a pragmatic substitute for local JWKS verification, checking aud + email in the response. Reuse this pattern for any future n8n task needing to verify a Google-issued OIDC token without a crypto library.

---

## [L3] design_gap — Three parallel-authored n8n workflow files (T3, T4, T5) e...

**When:** 2026-09-05 19:25 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail
Three parallel-authored n8n workflow files (T3, T4, T5) each needed to reference the same placeholder credential IDs (Gmail OAuth2, Supabase Postgres) and the same cross-workflow sub-workflow reference (Email Normaliser), but design.md/tasks.md didn't pin the exact placeholder strings up front — T3's agent independently chose a different literal string ('placeholder-supabase-postgres-credential') than T4/T5 ('REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID'), caught only when T6's runbook-writing agent grepped all three files for consistency.

### Action
Fixed by aligning T3's file to the shared convention. When multiple tasks in a wave produce files that share placeholder/naming conventions, pin the exact literal strings in design.md or tasks.md rather than describing them only in prose, so parallel agents converge without needing a downstream task to catch the drift.

---

## [L4] agent_issue — n8n's editor UI for Execute Workflow Trigger's 'Workflow ...

**When:** 2026-09-08 10:12 UTC
**Category:** agent_issue
**Priority:** high
**Status:** pending

### Detail
n8n's editor UI for Execute Workflow Trigger's 'Workflow Input Schema' field names, and the calling Execute Workflow node's mapped input keys, can silently store a trailing space (e.g. 'account_id ' instead of 'account_id') even though the displayed label looks clean and re-typing/deleting/re-adding the field in the UI did not fix it across multiple attempts. Every downstream symptom (Code node throwing 'Cannot read properties of undefined', apparently-correct input data shown in the debug panel, repeated republish/restart cycles) looked like a data-shape or publish-timing bug, wasting many iterations before the real cause was found.

### Action
Diagnosed conclusively by exporting the live workflows directly from the n8n container (docker exec ... n8n export:workflow --all) and diffing the raw JSON against the repo's authored copy, rather than trusting the editor UI. Found literal '"name": "account_id "' keys. Fixed by patching the exported JSON in a script (strip whitespace from every input-schema name and every caller's workflowInputs.value key + schema id/displayName) and re-importing via n8n import:workflow, then publish:workflow --id=<id> per workflow, then a container restart (CLI publish requires a restart to take effect while n8n is running). Future rule: if an Execute Workflow sub-workflow call fails with a field the caller's UI shows as correctly mapped, export the live workflow JSON and grep for trailing/leading whitespace in field names before assuming a logic or timing bug.

---
