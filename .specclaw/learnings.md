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

## [L5] design_gap — Hardcoded Gemini model id 'gemini-2.0-flash' in llm-gatew...

**When:** 2026-09-08 17:01 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
Hardcoded Gemini model id 'gemini-2.0-flash' in llm-gateway.json's HTTP Request node was deprecated by Google before/at deployment time, returning an API error instructing to use 'gemini-3.6-flash' instead. Confirmed live via a real triage_error row on a test email. Fixed by updating the URL to gemini-3.6-flash; the structured-output request shape (generationConfig.responseMimeType/responseSchema) worked unchanged against the new model.

### Action
When building Phase 3/4 workflows that also call LLM Gateway, don't assume a hardcoded Gemini model id stays valid indefinitely -- check for deprecation notices at deploy time. Worth considering whether the model id should live as a credential-adjacent config value rather than hardcoded in the HTTP node's URL, since a live-deploy fix was needed here.

---

## [L6] agent_issue — triage-pipeline.json's 'Format success output' and 'Forma...

**When:** 2026-09-10 07:25 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail
triage-pipeline.json's 'Format success output' and 'Format failure output' Code nodes used $('Validate triage result').item.json.email_id, which throws 'Multiple matches' whenever more than one item is in flight through the workflow (e.g. testing with two pinned fixture items executed together). This wasn't a production bug (Triage Pipeline is always invoked with exactly one email per call from Email Normaliser) but broke live testing with the multi-item fixture file. Fixed by using .first() instead of .item in both nodes.

### Action
When a Code node needs to read a specific upstream node's output via $('NodeName'), default to .first() rather than .item unless the node genuinely needs strict 1:1 paired-item tracking across a branch -- .item can throw ambiguously whenever more than one item might be in flight, including during multi-fixture testing that the production code path never exercises.

---

## [L7] agent_issue — Action Extraction's 'Call LLM Gateway' node threw 'Invali...

**When:** 2026-09-11 06:03 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail
Action Extraction's 'Call LLM Gateway' node threw 'Invalid input for response_schema: expects a object but we got [object Object] ' (note trailing space in the error) after re-pointing the sub-workflow reference reset its Workflow Inputs. Root cause: n8n only passes an expression field's native type through when the field content is EXACTLY '={{ expression }}' with nothing else -- any extra character, including a trailing space left from re-typing the field, makes n8n treat the whole field as a string template and stringify the object via toString() into literal '[object Object]' text. This is a second, distinct whitespace-in-n8n-fields gotcha (the first, already logged, was trailing space in schema field NAMES; this one is trailing space in an expression VALUE causing silent type coercion rather than a missing-field error).

### Action
When re-pointing an Execute Workflow node's sub-workflow reference resets its input mappings, re-type expression fields carefully and verify no trailing/leading characters remain, especially for fields expected to carry an object/array (not a primitive) -- a stray trailing space silently downgrades the passed value to a stringified object with no upstream error, only a downstream 'expects a object but we got string' validation failure on the receiving sub-workflow's trigger.

---

## [L8] agent_issue — 'docker compose restart <service>' does not pick up chang...

**When:** 2026-09-11 08:24 UTC
**Category:** agent_issue
**Priority:** low
**Status:** pending

### Detail
'docker compose restart <service>' does not pick up changes made to docker-compose.yml (new/changed environment variables, volumes, etc.) -- it only stops/starts the existing container with its already-baked-in config. Discovered live while setting DRAFT_WEBHOOK_SECRET on the n8n-host EC2 instance (~/n8n-stack/docker-compose.yml): after adding the env var and running 'docker compose restart n8n', 'docker compose exec n8n env | grep DRAFT_WEBHOOK_SECRET' returned nothing.

### Action
Use 'docker compose up -d' instead of 'docker compose restart' whenever docker-compose.yml itself changed -- it detects the diff and recreates only the affected service(s) in place. Reserve 'restart' for when the container's own process needs a restart but the compose file is unchanged.

---

## [L9] design_gap — draft-generation.json's tasks.md (T3) called for a 30-secon...

**When:** 2026-09-11 09:40 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
draft-generation.json's tasks.md (T3) called for a 30-second timeout on the "Call LLM Gateway" Execute Workflow node, with an explicit fallback note to flag it as a gap if unconfirmable. Confirmed live during 006-draft-generation deployment: this n8n version's Execute Workflow node has no Timeout field anywhere in its Settings tab (only Always Output Data / Execute Once / Retry On Fail / On Error / Notes) -- the subagent's uncertainty was correct, not overcautious. This affects every phase that calls LLM Gateway (004, 005, 006 all use the same Execute Workflow pattern), not just this one.

### Action
Moved the timeout to the one place a real network call actually happens: llm-gateway.json's "Call Gemini generateContent" HTTP Request node now sets options.timeout=30000. This single choke point protects all three callers at once, since HTTP Request nodes (unlike Execute Workflow nodes) do expose a genuine Options > Timeout setting in this n8n version. General rule: don't assume a caller-side per-node timeout setting exists just because a design doc calls for one -- for Execute Workflow nodes specifically in this n8n version, push timeout enforcement into the sub-workflow's own outbound HTTP node instead.

---

## [L10] agent_issue — draft-generation.json's 'Verify secret' Code node uses re...

**When:** 2026-09-11 09:05 UTC
**Category:** agent_issue
**Priority:** high
**Status:** pending

### Detail
draft-generation.json's 'Verify secret' Code node uses require('crypto') for the constant-time secret comparison (FR2). This n8n instance's Code node sandbox rejects it outright at runtime with 'Module 'crypto' is disallowed', which is invisible at build/import time -- it only surfaces once a real webhook request is sent and the node actually executes, caught by inspecting the node's output in the Executions log. Every single request, correct secret or not, failed auth 401 until this was fixed, since the try/catch swallows the error into authFailed:true with no visible symptom other than a generic 401.

### Action
n8n's Code node blocks Node built-in modules by default; the n8n environment variable NODE_FUNCTION_ALLOW_BUILTIN=crypto must be set explicitly to allow require('crypto') inside a Code node. Any future Code node that needs a Node built-in module (crypto, and likely others: fs, path, etc.) will hit the same wall -- check this env var first, and add the runbook step proactively rather than waiting for a live 401 to diagnose it. When a Code node's own try/catch masks the real error behind a generic auth-style failure, always check the node's actual execution output in n8n's Executions log before assuming the input data (e.g. the secret value) is wrong.

---

## [L11] agent_issue — Immediately after fixing L10 (crypto module), the same '...

**When:** 2026-09-11 09:15 UTC
**Category:** agent_issue
**Priority:** high
**Status:** pending

### Detail
Immediately after fixing L10 (crypto module), the same 'Verify secret' node failed with a second, distinct sandbox error: 'access to env vars denied' -- this n8n instance also blocks $env access from Code nodes by default, separately from the builtin-module restriction. Same invisible-until-a-real-request symptom as L10: generic 401 with no clue which of two independent sandbox restrictions was the cause until the Executions log was checked a second time.

### Action
Set N8N_BLOCK_ENV_ACCESS_IN_NODE=false in the n8n environment to allow $env reads inside Code nodes. This and NODE_FUNCTION_ALLOW_BUILTIN=crypto (L10) are BOTH required together for any Code node that reads $env AND uses a builtin module -- they are independent sandbox gates, fixing one does not imply the other is also fixed. Any future phase whose Code nodes read $env (not just this one) needs N8N_BLOCK_ENV_ACCESS_IN_NODE=false already set; worth proactively adding both env vars to the base docker-compose.yml template for any n8n instance this project stands up in the future, rather than discovering them one at a time against a live 401.

---
