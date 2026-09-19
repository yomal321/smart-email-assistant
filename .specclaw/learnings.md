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

## [L12] design_gap — A runbook said 'every occurrence' of a placeholder but t...

**When:** 2026-09-11 10:45 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
A runbook said 'every occurrence' of a placeholder but then enumerated an incomplete list, so following it correctly still produced wrong production data. gmail-renewal-recovery.json hardcodes the Pub/Sub topic string in FOUR functional locations (Call watch() jsonBody, Re-register watch() jsonBody, Prepare catch-up newSubscriptionId, and -- the missed one -- the options.queryReplacement array in the 'Record renewed' Postgres node). docs/setup/gmail-ingestion-setup.md step 9 listed only the first three. Result: accounts.subscription_id held the literal 'projects/REPLACE_WITH_GCP_PROJECT_ID/topics/gmail-push-notifications' for three days of successful renewals. The failure was silent because the watch() call uses a DIFFERENT copy of the string (correctly replaced), so renewals succeeded normally at 12/12; and because nothing branches on subscription_id -- it is only ever SELECTed, never consumed -- so no behaviour changed. Found only when AC4's verification query surfaced the raw column value.

### Action
Fixed the runbook to enumerate all four locations explicitly, flag location 4 as the silent one, and supply a backfill UPDATE for deployments that already hit it. Two general rules: (1) when a placeholder appears N times across a workflow, never write 'every occurrence' followed by a prose list -- state the count explicitly and enumerate every one, because a reader treats the list as exhaustive; (2) the same literal value duplicated across an API-call node and a database-write node is a latent trap -- the API node's copy is validated by the provider (a wrong topic fails loudly) while the database node's copy is validated by nothing, so a partial replacement is invisible. Prefer deriving the stored value from the actual API request/response (as the 'Record re-registered' node already does via $('Prepare catch-up').item.json.newSubscriptionId) over a second hardcoded copy.

---

## [L13] design_gap — AppStateProvider.tsx:48 has a react-hooks/set-state-in-ef...

**When:** 2026-09-11 21:19 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail
AppStateProvider.tsx:48 has a react-hooks/set-state-in-effect lint error (setThemeState/setDensityState called synchronously in the localStorage-hydration useEffect), flagged by T8's agent but out of T8's file scope

### Action
Fix during T13 (responsive/dark-mode sweep) — e.g. read localStorage via a lazy useState initializer instead of an effect

---

## [L14] design_gap — The entire dashboard/ prototype scaffold (DraftModal.tsx,...

**When:** 2026-09-11 22:06 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
The entire dashboard/ prototype scaffold (DraftModal.tsx, SearchBar.tsx, StatusBadge.tsx, TaskCard.tsx, lib/types.ts, config files, README.md, public/ assets) was untracked in git before this build started — none of tasks.md's 15 tasks declared these files, so they were committed separately as a one-off chore commit outside any task scope

### Action
When planning a build, check 'git status' for pre-existing untracked files under the target directory before assuming committed files are the true baseline

---

## [L15] design_gap — T12 created chart components at dashboard/components/Volu...

**When:** 2026-09-11 22:06 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail
T12 created chart components at dashboard/components/VolumeChart.tsx and CategoryBreakdownChart.tsx (flat), not the design.md/tasks.md-declared dashboard/components/charts/VolumeChart.tsx nested path

### Action
Harmless naming/placement drift; consider nesting under components/charts/ in a later pass for consistency with design.md, or update design.md to match if flat placement is preferred going forward

---

## [L16] agent_issue — T12's coding agent did not self-commit its changes despit...

**When:** 2026-09-11 22:06 UTC
**Category:** agent_issue
**Priority:** low
**Status:** pending

### Detail
T12's coding agent did not self-commit its changes despite the standard build-context instruction to commit, unlike every other task's agent in this build

### Action
No action needed here (the build loop's own specclaw-build commit step covers this), but worth watching if it recurs across builds

---

## [L17] pattern — Two 'sweep'-style tasks (T13 responsive/dark-mode, T14 ke...

**When:** 2026-09-11 22:06 UTC
**Category:** pattern
**Priority:** medium
**Status:** pending

### Detail
Two 'sweep'-style tasks (T13 responsive/dark-mode, T14 keyboard/contrast) each found and fixed real bugs beyond their literally-flagged issue — T13 found a global dark-mode-not-applying bug and two overflow bugs, T14 found two missing-focus-ring bugs in the command palette — by actually running the app (Playwright against the dev server) rather than reading code

### Action
Keep specifying 'do a real sweep, not just a read-through' with a concrete verification method for any future cross-cutting polish/audit task

---

## [L18] design_gap — File gmail-dashboard/.gitignore was modified but not decl...

**When:** 2026-09-14 06:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
File gmail-dashboard/.gitignore was modified but not declared in T10's file list — needed to add '!.env.local.example' so the blanket '.env*' rule didn't silently block committing the new example file the task required.

### Action
When a task creates a file whose name matches an existing ignore pattern, declare the .gitignore edit explicitly in tasks.md rather than leaving it implicit.

---

## [L19] spec_gap — spec.md FR8 didn't specify how to derive SyncState.status...

**When:** 2026-09-14 06:36 UTC
**Category:** spec_gap
**Priority:** low
**Status:** pending

### Detail
spec.md FR8 didn't specify how to derive SyncState.status ('synced'/'syncing'/'failed'/'offline') from the accounts/sync_outcomes schema, which has no in-progress or status column at all. The build agent reasonably defaulted to 'synced' whenever an accounts row exists, documented inline.

### Action
Future specs for derived enum fields should either state the exact derivation rule or explicitly flag it as an open question for the build agent to surface, as this one implicitly did.

---

## [L20] design_gap — The new /login page (T6) renders inside the existing AppS...

**When:** 2026-09-14 06:36 UTC
**Category:** design_gap
**Priority:** low
**Status:** resolved (2026-09-14, commit a6a7d80) — `app/providers.tsx` now checks
`usePathname() === "/login"` and skips `<AppShell>`, rendering the login
form's children directly instead.

### Detail
The new /login page (T6) renders inside the existing AppShell (sidebar/nav) because app/layout.tsx wasn't in T6's file list, so an unauthenticated visitor sees the full dashboard chrome around the login form.

### Action
A follow-up task (or a note in the next phase's proposal) should decide whether /login needs a route-group layout override for a standalone screen, or whether this is acceptable for a single-operator tool.

---

## [L21] pattern — Passing large specclaw-build-context payloads (~3500 line...

**When:** 2026-09-14 06:36 UTC
**Category:** pattern
**Priority:** medium
**Status:** pending

### Detail
Passing large specclaw-build-context payloads (~3500 lines / ~90k tokens each) directly in an Agent tool prompt is wasteful and can silently fail if constructed via unexecuted shell substitution. Writing the context to a scratchpad file and instructing the subagent to Read it itself worked reliably and kept orchestrator context small.

### Action
Consider having specclaw-build-context write directly to a file path (or the build skill documenting the read-from-file dispatch pattern) rather than assuming the payload is always inlined into the prompt string.

---

## [L22] agent_issue — specclaw-build setup's base_branch auto-detect (empty str...

**When:** 2026-09-14 07:01 UTC
**Category:** agent_issue
**Priority:** high
**Status:** pending

### Detail
specclaw-build setup's base_branch auto-detect (empty string -> origin/HEAD first) forked specclaw/009-dashboard-messages-api off a stale origin/main (last pushed before 008's work), silently dropping all of Phase 0's files (lib/supabase/, middleware.ts, app/api/) from the new branch's working tree. Caught before any build agent ran by noticing app/providers.tsx had reverted to its pre-008 content.

### Action
Pinned git.base_branch: "main" explicitly in config.yaml rather than relying on auto-detect, since local main is ahead of origin/main and nothing currently pushes to keep them in sync. Reset the branch with 'git reset --hard main' (safe since it had zero unique commits yet). Consider pushing main to origin regularly, or teaching auto-detect to prefer local main over a stale origin/HEAD.

---

## [L23] spec_gap — spec.md's Overview said migration 0005 adds ~20 columns w...

**When:** 2026-09-14 07:23 UTC
**Category:** spec_gap
**Priority:** low
**Status:** pending

### Detail
spec.md's Overview said migration 0005 adds ~20 columns while FR1's own prose and design.md's SQL block both list 21 -- a trivial counting inconsistency in the spec text itself, not a functional gap. T1's build agent correctly followed design.md's literal SQL rather than guessing which column to omit.

### Action
When a spec states an approximate/round count alongside an exact enumerated list, prefer the exact list and don't bother reconciling the round number -- or just drop round-number counts from spec prose entirely to avoid this class of non-issue.

---

## [L24] best_practice — Designing one shared row-mapper module (message-mapping.t...

**When:** 2026-09-14 07:23 UTC
**Category:** best_practice
**Priority:** medium
**Status:** pending

### Detail
Designing one shared row-mapper module (message-mapping.ts, T3) that every read and mutation route reuses -- rather than inline-mapping DB rows to the Message shape per route -- meant T4/T5's six-plus routes all built cleanly in parallel against a stable, already-typed contract with zero drift in the placeholder logic (Contact synthesis, SLA defaults, null ai handling).

### Action
For any future phase with multiple routes returning the same view-model shape (e.g. tasks/drafts/contacts in Phases 2-3), plan a shared mapper module as its own early task before the routes that consume it -- same pattern as this phase's T3.

---

## [L25] pattern — Two parallel wave-3 agents (T4 and T5) independently hit ...

**When:** 2026-09-14 07:23 UTC
**Category:** pattern
**Priority:** low
**Status:** pending

### Detail
Two parallel wave-3 agents (T4 and T5) independently hit and independently fixed the same TypeScript quirk: supabase-js's untyped client returns a GenericStringError fallback type for string-built .select() calls, requiring an 'as unknown as EmailRow' double-cast instead of a direct 'as EmailRow'. Both agents converged on the identical fix without coordination, and a whole-project tsc --noEmit after the wave confirmed zero remaining errors.

### Action
When a shared client/type quirk is likely to recur across parallel tasks touching the same table (any future phase adding more routes over emails/tasks/drafts), consider noting the 'as unknown as X' cast convention once in the shared mapper module's own file comment, so future single-task agents don't have to rediscover it independently.

---

## [L26] design_gap — design.md's FR2 description (fix action-extraction.json's...

**When:** 2026-09-14 08:01 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail
design.md's FR2 description (fix action-extraction.json's Write task node) named the ON CONFLICT removal and the new priority/origin columns but didn't call out that the insert's literal status value ('open') would violate migration 0009's widened tasks_status_check (todo|in-progress|done|dismissed) -- 'open' isn't in the new enum. Caught and fixed during T2 implementation before it could break every subsequent extraction write in production.

### Action
When a migration narrows/replaces a check constraint, explicitly audit every existing INSERT/UPDATE literal against the new allowed values as part of design.md's Key Decisions or the task's own Notes -- don't rely on catching it during build.

---

## [L27] design_gap — Gemini free-tier quota is a hard 20 requests/day per model, not just "429s eventually"

**When:** 2026-09-19 06:19 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail
architect/03a-component-automation-engine.md's original fallback-router sketch treated rate-limiting as a someday hypothetical ("when 429s actually appear"). Live deployment of 011-followups-contacts-api's Email Normaliser changes hit it almost immediately: a handful of test emails, each firing three parallel Gemini calls (Triage, Action Extraction, Commitment Extraction), exhausted the account's entire daily quota. n8n's default HTTP Request error handling (`neverError: false`, `onError: continueRegularOutput`) discards the actual response body on failure, surfacing only a generic axios message ("Try spacing your requests out using the batching settings under 'Options'") that looks like a per-minute burst problem but isn't -- it cost real diagnostic time chasing a burst/stagger fix (staggering the 3 parallel calls 5s/10s apart, which was still worth doing and is now live) before the real cause was confirmed. Root cause was only visible after temporarily flipping the Gemini HTTP node's `neverError` to `true` for one test call, which surfaced Gemini's actual error body: `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`, model `gemini-3.6-flash`.

### Action
20 requests/day is roughly 6-7 real emails/day before the pipeline goes dark until next-day reset -- this is the real operating ceiling, not a testing artifact. The fallback router (OpenRouter, triggered specifically on `RESOURCE_EXHAUSTED`/429) is being built now rather than left as future work -- see architect/03a-component-automation-engine.md's updated "Where the fallback router goes" section. Also: when a `Call Gemini generateContent`-shaped node fails with an unhelpfully generic message, temporarily set `options.response.response.neverError` to `true` for one diagnostic call to see Gemini's real `quotaId`/`quotaValue` instead of guessing -- revert immediately after, since it also disables that node's `retryOnFail` for as long as it's set.

---

## [L28] design_gap — One unfetchable Gmail message permanently blocked all future ingestion

**When:** 2026-09-19 07:45 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail
`gmail-ingestion.json`'s `Loop message IDs` (SplitInBatches) processes every message id from a `history.list` batch sequentially through `messages.get fetch` -> `Call Email Normaliser`, and only reaches `Advance cursor` after the entire loop finishes. `messages.get fetch` had no `onError` handling, so a single bad id anywhere in the batch (confirmed live: a Gmail draft-autosave revision that had already been superseded before n8n got to fetch it, `404 Requested entity was not found`) aborted the whole execution before the cursor ever moved. Every subsequent push notification then re-fetched `history.list` from the same stale cursor, hit the same dead id first, and every genuinely new email queued behind it -- confirmed live: two real test emails sent minutes apart were both silently stuck for over 10 minutes while Google Cloud Pub/Sub kept redelivering the same failing notification on its own backoff schedule.

### Action
`messages.get fetch` now has `onError: continueRegularOutput`, feeding a new `Fetch succeeded?` IF node: the failure branch logs the skipped id (`Log skipped message`, console-only -- there's no `emails` row yet to attach a per-row error column to, unlike triage/action-extraction failures) and rejoins the loop, so the cursor still advances and one bad id can never again block the rest of a batch. Any per-item loop over an external API in this codebase should get the same per-item error isolation before it ships, not after it silently eats real mail in production.

---

## [L29] design_gap — Asymmetric terminal branches in a synchronously-called sub-workflow caused a race that silently dropped real results

**When:** 2026-09-19 08:12 UTC
**Category:** design_gap
**Priority:** high
**Status:** pending

### Detail
Adding the OpenRouter fallback to `llm-gateway.json` (L27) gave the workflow two differently-shaped terminal branches: `Quota exceeded?`'s false output (the normal, no-fallback-needed path) ended immediately with zero further nodes, while its true output continued through two more nodes (`Call OpenRouter chat completion` -> `Parse OpenRouter response`) before ending. Every caller of this gateway (`Triage Pipeline`, `Commitment Extraction`, confirmed live on both) uses a *blocking* Execute Workflow call (`waitForSubWorkflow: true`) since it needs the model's result synchronously. n8n's sub-workflow completion detection raced on that branch-depth asymmetry: most calls worked, but intermittently (roughly half the live test runs) the parent execution would silently stop dead at the `Call LLM Gateway` node -- `lastNodeExecuted` showing that node, execution status "success", no error anywhere -- despite the node's own output already holding the fully correct `{ success: true, data: {...} }` result. Real triage categorizations and real commitment extractions were computed correctly and then silently never written, non-deterministically, for over half an hour of live testing before this was traced to the branch shape rather than the data.
Symptom fingerprint worth remembering: a blocking Execute Workflow call whose target has more than one possible terminal leaf, where `lastNodeExecuted` is the calling `executeWorkflow` node itself and the run is marked "success" with no error -- that combination means the parent probably never got the continue signal, not that the graph legitimately ends there.

### Action
Any sub-workflow called with `waitForSubWorkflow: true` must have exactly one terminal/leaf node reachable from every branch -- converge branches into a shared no-op (`n8n-nodes-base.noOp`) "Return result" node rather than letting them end at different depths. Fixed in `llm-gateway.json` by routing both `Quota exceeded?` outputs into one `Return result` node. Before adding a new conditional branch to any workflow other synchronous callers depend on, check every existing caller uses `waitForSubWorkflow: true` and verify the new graph still converges to one leaf.

---

## [L30] agent_issue — A newly-wired Execute Workflow node was silently `disabled: true`, and every parameter-only edit preserved that flag invisibly

**When:** 2026-09-19 08:29 UTC
**Category:** agent_issue
**Priority:** medium
**Status:** pending

### Detail
`Triage Pipeline`'s `Call Rule Engine` node reached this state left unconfigured (blank `workflowId`, no `workflowInputs`) from an earlier deployment pass, and at some point picked up a top-level `disabled: true` -- not present in the repo's `triage-pipeline.json`, so it happened live, most plausibly n8n itself defaulting an unresolved-target Execute Workflow node to disabled. A disabled node still reports `executionStatus: success` and produces a harmless-looking stub output (bare `{"success": true}`, none of the mapped input fields echoed back, unlike every enabled non-blocking Execute Workflow call in this codebase which echoes its full input) -- so nothing in the execution list or the node's own output flagged it as inert. Every fix applied across several iterations (setting `workflowId`, adding `workflowInputs` with a full `schema`, fixing the *target* workflow's own `settings.executionOrder`, even deactivating/reactivating the target) legitimately improved the configuration but did nothing, because none of them touched the one top-level `disabled` flag on the *calling* node -- each fetch-modify-PUT cycle round-tripped the full live JSON and silently preserved it. Only a full byte-for-byte diff against a known-working sibling node (`Call Action Extraction`) surfaced it.
Symptom fingerprint worth remembering: an Execute Workflow node whose own output is a bare `{"success": true}` with none of its mapped input fields echoed back (contrast a healthy non-blocking call, which always echoes its full input alongside `success: true`) means the node itself is disabled, not that the target is misconfigured -- check `disabled` on the node before touching `parameters` again.

### Action
When a node behaves as a no-op despite parameters looking correct, diff its full JSON (not just `parameters`) against a known-working sibling of the same type before trying another parameter fix -- `disabled` and similar top-level flags are easy to miss when every fetch-modify-PUT cycle only inspects and edits `parameters`.

---
