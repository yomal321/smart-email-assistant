# Proposal: Smart Email Assistant (v1)

**Created:** 2026-09-05
**Status:** 🟡 Draft

## Problem

Email volume grows faster than the time available to handle it. Three concrete pains, all present today across a Gmail account and a Microsoft Outlook account:

1. **No signal at a glance.** Nothing distinguishes mail that needs a human decision from mail that does not, so the whole inbox has to be read to find the few items that matter.
2. **Commitments get lost.** Promises and requests buried inside threads are never extracted into a task list, so they are forgotten until someone follows up.
3. **Routine replies cost disproportionate time.** Low-value replies take the same drafting effort as important ones.

Existing tools address one pain at a time, or bind to a single provider. Nothing gives a unified Gmail + Outlook view with triage, task extraction, and drafting together.

Source document: `smart-email-assistant-proposal.md` at the repository root.

## Proposed Solution

A single-user email assistant assembled from managed free-tier components rather than custom infrastructure.

- **Ingestion — n8n.** Native Gmail and Microsoft Outlook nodes handle OAuth and push subscriptions (Gmail `watch()` + Google Cloud Pub/Sub; Microsoft Graph webhooks). Push, never polling. Both providers normalize to one internal email schema before anything downstream reads them.
- **Intelligence — n8n + Gemini Flash.** Three narrow pipelines instead of one large prompt: triage (category + one-line summary), action extraction (task text + optional deadline), and draft generation (on demand only, grounded in the thread plus past sent mail). All structured JSON output.
- **One LLM choke point.** Every model call routes through a single n8n sub-workflow. This is the one architectural rule enforced from day one — it makes a model or provider swap a one-node change instead of a refactor, and it is where a fallback router would later attach.
- **Storage — Supabase (Postgres).** `accounts` (credentials + sync state), `emails` (normalized records), `tasks` (extracted items, FK to source email). Full-text search via `tsvector`; no vector database in v1.
- **Frontend — Next.js App Router + TypeScript.** Reads Supabase directly; calls an n8n webhook for on-demand actions such as draft generation. Unified inbox, action-item sidebar, draft review modal.
- **Hosting.** n8n on Oracle Cloud free-tier ARM (Docker Compose + Caddy for automatic TLS), frontend on Vercel, database on Supabase, Pub/Sub on Google Cloud — all free tier.

**Model strategy:** Gemini Flash free tier (15 req/min, 1M tokens/day) as primary for all pipelines. A local Ollama 7B–14B fallback and a small paid escalation tier are designed but **deliberately not built** — for one user, 1M tokens/day is unlikely to be reached. Build the router when 429s actually appear. Kimi K3 is rejected for self-hosting (2.8T parameters needs a multi-node GPU cluster); its hosted API stays an option for escalation, subject to data residency.

**Delivery order** (each phase independently useful and independently verifiable):

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Ingestion — both providers into Supabase, no AI | Both inboxes sync reliably on push, not polling |
| 2 | Triage — category + summary per email | Every new email has both within seconds of arrival |
| 3 | Action items — extraction into `tasks` | Test-set extraction is accurate with no obvious hallucinations |
| 4 | Draft generation — webhook endpoint with style grounding | Drafts need light editing, not rewriting |
| 5 | Frontend — unified inbox, task sidebar, draft review | Usable as a daily driver alongside the real mail client |

## Scope

### In Scope
- Read-only sync from Gmail and Microsoft Outlook via n8n, push-notification driven
- Normalized cross-provider email schema in Supabase
- AI triage: category + one-line summary per email
- Action-item extraction with optional deadline, foreign-keyed to its source email
- On-demand draft reply generation, style-grounded in past sent mail
- Single n8n LLM sub-workflow that every model call routes through
- Next.js dashboard: unified inbox, action-item sidebar, draft review modal
- Postgres full-text search (`tsvector`)
- Deployment: Oracle Cloud ARM VM (Docker + Caddy), Vercel, Supabase, GCP Pub/Sub

### Out of Scope
- Auto-sending any email without explicit user approval — a hard product rule, not a v1 deferral
- Multi-user / multi-tenant support
- Mobile application
- Calendar integration and deadline-aware scheduling
- Semantic / vector search
- The fallback model router (Ollama + paid escalation) — designed, not built
- Learned per-sender priority rules

## Impact

- **Files affected:** ~40–60 (estimated) — n8n workflow JSON exports, Supabase migrations, Next.js app routes and components, Docker Compose and Caddy config. Greenfield: the repository currently holds only the source proposal.
- **Complexity:** large — five delivery phases spanning two OAuth integrations, three AI pipelines, a database, a frontend, and a self-managed VM.
- **Risk:** medium-high — concentrated in third-party dependencies (provider OAuth verification, free-tier terms, OCI ARM capacity) rather than in the code itself.

Principal risks and mitigations:

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier LLM providers may train on submitted data | Email content is personal and involves third parties who never consented | **Decide deliberately before Phase 2.** Options: cheap paid tier with no-training terms, or local Ollama for sensitive processing |
| Gmail OAuth verification required for sensitive scopes | Cannot share beyond test users | Acceptable for a personal project; self as sole test user |
| Hallucinated action items or drafts | Trust erodes fast; product becomes unusable | Strict structured-output schemas, never auto-send, always show source email beside the extracted task |
| Oracle Cloud ARM capacity errors | Blocked on provisioning | Try alternate availability domains, retry on a schedule, budget setup time |
| Self-managed VM means self-managed ops | Downtime, TLS expiry, security exposure | Docker Compose plus Caddy for automatic TLS; open 80/443 in **both** the OCI security list and instance iptables |
| n8n workflows become visual spaghetti | Hard to maintain or debug | One workflow per pipeline; peel complex logic into code when it outgrows the node editor |
| Free-tier rate limits tighten without warning | Pipeline stalls | Single-user volume sits well within limits; the single LLM choke point makes a provider swap cheap |

**Success criteria:** the project succeeds if, after Phase 5, it is used **daily by choice** rather than as a demo — inbox triaged in under two minutes, no forgotten commitments that were present in email, and at least half of routine replies started from a generated draft.

## Open Questions

- **Should this ship as one change or five?** All five phases in one specclaw change produces a very large `tasks.md`. Splitting into `002-ingestion` … `006-frontend` keeps each build loop verifiable. Recommendation: split after approval, keeping this document as the umbrella proposal.
- **Data-privacy decision, required before Phase 2.** Does the Gemini Flash free tier permit personal email content under its training terms? If not, choose between a paid no-training tier and local Ollama — this gates all AI work, not just triage.
- What is the triage category set — a fixed enum, or model-proposed labels?
- How much sent-mail history grounds the draft style, and does that corpus go to the provider on every draft call or get distilled once into a stored style profile?
- Where does OAuth token refresh live — n8n's credential store alone, or mirrored in the `accounts` table?
- Does deleting or archiving an email in Gmail/Outlook propagate to the local `emails` row, and what happens to a `task` whose source email disappears?
- What is the backfill policy on first connect — recent mail only, or full history?

---

**To proceed:** Review this proposal and approve to begin planning.
