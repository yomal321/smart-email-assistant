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
