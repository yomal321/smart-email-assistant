# Proposal: Triage (Phase 2)

**Created:** 2026-09-08
**Status:** 🟡 Draft

## Problem

`002-ingestion` lands normalized Gmail rows in `emails` within seconds of arrival, but every row sits there inert — nothing reads `subject`/`body` and turns it into a signal the umbrella proposal (`001-smart-email-assistant`) actually promised: "You can't tell at a glance which emails actually need you." The `emails.category` column already exists (added in `0001_ingestion_schema.sql`, nullable, with a comment explicitly reserving it for "Phase 2's triage pipeline") — it has been sitting empty since `002-ingestion` shipped, on every row ingested since.

Two decisions the ingestion schema deliberately deferred to this change, per its own Notes and Open Questions, are picked up here:
- **Triage category set** — the enum/label values for `category` were left undecided.
- Nothing schema-side stores a *summary* — reading `0001_ingestion_schema.sql` directly shows `category` is the only triage-reserved column; there is no `summary` text column. A one-line summary, the other half of Phase 2's stated output ("category + one-line summary"), has no place to land yet.

Source document: `../001-smart-email-assistant/proposal.md`, Phase 2 row and §5 "Model strategy."

## Proposed Solution

An n8n sub-workflow, triggered per newly-inserted `emails` row, calls Gemini Flash with a structured-output prompt and writes back `category` + a new `summary` column.

**Trigger mechanism — a Supabase Database Webhook, not a change to Gmail Ingestion / Email Normaliser.** Those two workflows are the ones AC1–AC5 already verified live in production under `002-ingestion`; touching them to add an outbound call risks regressing a working pipeline for a feature that doesn't need to live inside it. Supabase's own `INSERT`-triggered Database Webhook on `emails` calls a new n8n webhook endpoint directly — ingestion and triage stay two independently deployable workflows that happen to share a table, exactly the seam `002-ingestion`'s schema comment already implies ("Ingestion + Email Normaliser never write this column").

**The single LLM choke point starts here.** `001-smart-email-assistant`'s one architectural rule ("all LLM calls route through a single n8n sub-workflow") has had nothing to enforce it until now — `002-ingestion` explicitly listed it as out of scope, "irrelevant until Phase 2 introduces LLM calls." This change is that introduction: one **Gemini Triage** sub-workflow makes the only LLM call in the system today, callable independently with a fixture email body (mirroring `002-ingestion`'s NFR3 precedent for Email Normaliser) so prompt changes are testable without a live insert.

**Structured output, not free text.** The prompt requests a JSON object (`{category, summary}`) via Gemini's structured-output / JSON-mode support, not a prose reply parsed after the fact — the umbrella proposal's Risk table names "hallucinated action items or drafts" as a trust-eroding failure mode, and a schema-constrained response is the cheapest guard available at this phase.

**Provisional category set** (five values, revisable in `/specclaw:plan` once real mail has been triaged against it): `needs_reply`, `fyi`, `waiting_on_someone_else`, `promotional`, `low_priority`. Rationale: these map directly to "can I ignore this" and "does this need me," the two questions the umbrella proposal's Problem section names, without inventing a taxonomy speculatively richer than a single mailbox needs on day one.

**Failure handling — no fallback model, fail visibly.** Per the umbrella proposal's "Model strategy" (§5), a fallback router is explicitly deferred until 429s actually appear; this change carries no local LLM, no retry queue. If the Gemini call fails or returns unparseable output, `category`/`summary` are left `null` and the failure is logged in n8n's own execution log — a row with `category is null` past its ingestion time *is* the health signal (same pattern `sync_outcomes` established for sync health in `002-ingestion`'s NFR4), so no new outcomes table is added for this alone.

**Done when:**
- A newly-ingested Gmail message receives a non-null `category` (one of the five provisional values) and a non-empty `summary` within seconds of its `emails` row appearing — confirmed by observing the Database Webhook fire and the Gemini Triage workflow execute, not by polling `emails`.
- The Gemini Triage sub-workflow can be run standalone against a fixture email body (subject + plain-text body) and produce the same structured output, without a live Supabase insert.
- A deliberately malformed/empty email body does not crash the workflow — it either produces a best-effort `category`/`summary` or leaves both `null`, but never leaves the workflow in a failed-and-unlogged state.
- No email's `body`/`subject`/`raw_payload` content is ever written into `category` or `summary` verbatim — both must be Gemini's own structured output, never a pass-through, since sender-controlled text is untrusted per `002-ingestion`'s FR4 boundary.

## Scope

### In Scope
- One new n8n workflow: **Gemini Triage** — Supabase Database Webhook trigger → Gemini Flash call (structured JSON output: `category`, `summary`) → `UPDATE emails SET category = ..., summary = ... WHERE id = ...`
- Migration: add `emails.summary` (text, nullable, model-written only — same "never written by ingestion" boundary `category` already has)
- Supabase Database Webhook configuration: fires on `INSERT` to `emails`, calls the Gemini Triage workflow's webhook URL
- n8n credential for the Gemini API (Google AI Studio API key, free tier per the umbrella proposal's §5)
- The five provisional `category` values, documented as revisable
- Gemini Triage built as an independently invocable sub-workflow (fixture-testable, mirroring Email Normaliser's NFR3 precedent) — a fixture email body/subject pair for testing without a live insert

### Out of Scope
- Action item extraction into a `tasks` table — Phase 3, a separate change
- Draft reply generation — Phase 4
- Any frontend surface for viewing triage results (`emails.category`/`summary` are queryable directly in Supabase Studio for now, same minimal-visibility precedent `002-ingestion` used for `sync_outcomes`)
- Fallback/local model routing (Ollama, escalation tier) — explicitly deferred per the umbrella proposal's §5 until free-tier limits are actually hit
- Outlook-sourced email triage — `003-outlook-ingestion` is deliberately deferred; this change triggers on any `emails` insert regardless of `provider`, so Outlook mail would be triaged automatically once that change ships, but nothing here is built or tested against it now
- Re-triaging existing untriaged rows (every `emails` row ingested before this change ships stays `category IS NULL` until a backfill is separately decided) — a backfill script is a small, separate follow-up, not bundled here
- Retry/backoff logic for failed Gemini calls beyond n8n's default node retry behavior — a dedicated retry queue is deferred with the rest of the fallback-router decision

## Impact

- **Files affected:** ~3–4 (estimated) — one n8n workflow JSON export (Gemini Triage), one migration file (`emails.summary` column), one fixture file (sample email body for standalone testing), minor addition to a setup runbook (Gemini API key creation, Supabase Database Webhook configuration) — smaller than either ingestion change since no OAuth/push-subscription lifecycle is involved.
- **Complexity:** small-to-medium — one LLM call with structured output and one new trigger mechanism (Database Webhooks) not previously used in this project; no polling, no renewal, no multi-day verification window.
- **Risk:** low-to-medium — concentrated in prompt/output quality (a wrong category is embarrassing, not dangerous, since nothing auto-acts on it yet) and in the free-tier Gemini rate limit (15 req/min, 1M tokens/day) being sufficient for single-mailbox volume, which the umbrella proposal already judged likely.

Principal risks and mitigations:

| Risk | Impact | Mitigation |
|---|---|---|
| Gemini free-tier rate limit hit during a burst of incoming mail | Some emails stay untriaged until the limit resets | Single-user volume is well within 15 req/min per the umbrella proposal; `category IS NULL` past ingestion time is the visible signal, same as `sync_outcomes`' health-visibility pattern |
| Structured-output parsing fails (malformed JSON from the model) | Row stays untriaged rather than getting garbage written | `category`/`summary` left `null` on any parse failure — no partial or malformed write |
| Category taxonomy turns out wrong once real mail is triaged against it | Rework of the five provisional values | Explicitly flagged as provisional in this proposal; a `text` column with no `check` constraint (unlike `accounts.provider`) means relabeling is a data update, not a migration |
| Supabase Database Webhooks are a new mechanism, unverified in this project | Setup/debugging friction distinct from the n8n-to-n8n patterns `002-ingestion` already proved | Documented as its own runbook step; failure mode is "webhook never fires," which is directly observable in Supabase's webhook delivery log |
| Sender-controlled email content leaking into a system-derived column via prompt injection (e.g. an email body instructing the model to set `category: needs_reply` regardless of content) | Triage output manipulated by the email's own sender | Structured-output schema constrains the response shape; category values are a closed provisional set the model selects from, not free text it can smuggle instructions into — full injection-hardening of the prompt itself is a `/specclaw:plan`-level detail, not resolved here |

## Open Questions

- **Backfill for pre-existing rows** — every email ingested before this change ships stays untriaged indefinitely unless a backfill is run. Worth a small follow-up script, but is it in-scope for this change or a separate one-off?
- **Category taxonomy validation** — should the five provisional values be reviewed against a sample of real inbox mail before `/specclaw:plan`, or is refining them mid-build acceptable since the column carries no constraint?
- **Database Webhook auth** — Supabase Database Webhooks can sign requests (a shared secret header); should the Gemini Triage endpoint verify this the same way Gmail Ingestion verifies its OIDC token, given `002-ingestion`'s precedent that public n8n webhook endpoints are treated as a trust boundary from day one?
- **Gemini API key custody** — does the key live in n8n's credential store exactly like the Gmail/Outlook OAuth credentials (same custody pattern), or does anything about a raw API key (vs. an OAuth-refreshed token) change that answer?

**Party review (CHANGES_REQUESTED — 5 BLOCK, 18 WARN, 4 NOTE, 1 withdrawn; full detail in `party-report.md`):**
- (party-security) The Database Webhook endpoint's authentication is left as an open question, so as specified it accepts unauthenticated writes to `emails` and an unmetered path to the Gemini quota.
- (party-security) The webhook payload supplies both the row `id` and the model input with no re-read from `emails`; a bad `id` produces a silent zero-row `UPDATE`.
- (party-security) Nothing validates the model's `category` against the five-value set before the write — the stated injection mitigation has no enforcement node behind it.
- (party-architect) The workflow's only entry point (webhook) and its terminal write (`UPDATE ... WHERE id = ...`) are incompatible with the stated standalone-fixture test path; the seam is unnamed.
- (party-architect) No validation layer between the model response and the write enforces the closed category set, despite the codebase's own `check`-constraint precedent (`accounts.provider`) being available and unused.
- (party-security) The `UPDATE` is unconditional — a redelivery or re-run silently overwrites a hand-corrected `category`/`summary` with no prior value retained.
- (party-security) The only stated content guard ("never verbatim") doesn't stop a reworded-instruction or URL injection into `summary`, which is read by humans and by later LLM phases.
- (party-security) `category IS NULL` is asked to mean three different things (not-yet-triaged, call failure, malformed-input best-effort) with no attempt timestamp or error field to tell them apart.
- (party-security) The acceptance criterion observes the workflow executing, not the row it was supposed to write — every silent write failure passes.
- (party-security) The Gemini credential's custody is named; the Supabase write credential's identity and scope are never named.
- (party-architect) The data-access contract (payload vs. re-fetch) and the Supabase write credential are unspecified, though the workflow's only job is to mutate `emails`.
- (party-architect) "Run standalone against a fixture, produce the same structured output" is untestable as a deterministic assertion once a live Gemini call is in the loop — no canned-response injection point is named.
- (party-architect) The webhook delivery contract (response codes, redelivery, whether a second delivery re-runs the LLM call) is unspecified between Supabase and n8n.
- (party-ba) The Problem section's "can't tell at a glance" framing is scoped away from the deliverable — data lands in columns, not in front of the user; Supabase Studio isn't a glance-able surface.
- (party-ba) No Done-when criterion verifies the proposal's own stated problem (human-observable triage usefulness) is resolved — all four test data mechanics only.
- (party-ba) "One-line summary" (the promised output) and "non-empty summary" (the acceptance criterion) are not the same requirement — a paragraph-length summary would pass as written.
- (party-po) The "within seconds" latency requirement is asserted without value justification, and is the reason a new, unverified trigger mechanism (Database Webhooks) is introduced at all.
- (party-po) The recurring Gemini token/request cost is bounded by a stated ceiling but never estimated against actual expected email volume.
- (party-po) The pipeline's cost is never weighed against the manual-scan cost it replaces — no email volume/day figure is given either way.
- (party-visionary) The "null is the health signal" convention already conflates three causes and shouldn't be copied into a later phase where null can mean "nothing to do here" rather than "failed."
- (party-visionary) The five-value category taxonomy has no enforced source of truth — Phase 3 (named in this proposal's own Out of Scope) will hardcode a second copy with nothing to keep them in sync.
- (party-visionary) Calling this change "the introduction" of the single-LLM-choke-point rule risks Phase 4 (a differently-shaped LLM call) inheriting an ambiguous mandate about what that rule actually requires.
- (party-security, rebuttal) The Gemini structured-output schema is not a valid taxonomy source of truth for Phase 3 to read from, since it's the untrusted model's own self-declaration, not an enforced check — the DB constraint should be canonical instead.
- (party-architect, NOTE) The "single LLM choke point" is a placement fact (one caller today), not a mechanism this change builds — worth clarifying if a reusable seam is actually intended.
- (party-architect, NOTE rebuttal) Relaxing the latency requirement doesn't remove the need for a trigger mechanism — a scheduled sweep is a different unbuilt mechanism, not a free alternative.
- (party-security, NOTE) Full mailbox bodies leave the system to a third-party free tier with no stated field-minimization or retention position — the one effect in this proposal that can't be undone.
- (party-architect) Withdrew the round-1 finding that the Database-Webhook trigger choice was unjustified against the existing n8n-to-n8n pattern — the proposal's rationale (not regressing `002-ingestion`'s verified workflows) does address it.

---

**To proceed:** Review this proposal and approve to begin planning.
