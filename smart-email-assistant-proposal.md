# Smart Email Assistant — Project Proposal

**Author:** Yomal
**Type:** Personal project
**Date:** September 2026
**Status:** Proposal

---

## 1. Problem
![alt text](image.png)
Email volume grows faster than the time available to handle it. Three specific pains:

- You can't tell at a glance which emails actually need you.
- Commitments buried in email threads get forgotten because nothing extracts them into a task list.
- Writing routine replies takes disproportionate time relative to their value.

Existing tools solve one of these at a time, or only work with one provider. Nothing handles Gmail and Outlook together in a single unified view.

---

## 2. Goal

Build a personal email assistant that:

1. Triages and summarizes incoming mail so the inbox can be scanned in seconds.
2. Extracts action items into a task list linked back to the source email.
3. Drafts replies on demand, in the user's own writing style, with human review before sending.

Working across both Gmail and Microsoft Outlook.

---

## 3. Scope

### In scope (v1)

- Read-only sync from Gmail and Outlook
- AI triage: category + one-line summary per email
- Action item extraction with optional deadline
- On-demand draft reply generation
- Web dashboard: unified inbox, action-item sidebar, draft review

### Out of scope (v1)

- Auto-sending any email without user approval
- Multi-user / multi-tenant support
- Mobile app
- Calendar integration
- Semantic / vector search (full-text search only for v1)

---

## 4. Architecture

### Ingestion — n8n

Native Gmail and Microsoft Outlook nodes handle OAuth and push notification subscriptions. Both providers are normalized into a single internal email schema before anything downstream touches the data.

Push notifications, not polling:

- **Gmail:** `watch()` + Google Cloud Pub/Sub
- **Outlook:** Microsoft Graph webhook subscriptions

### Intelligence — n8n + Gemini Flash

Three separate pipelines rather than one large prompt:

| Pipeline | Trigger | Output |
|---|---|---|
| Triage | Every new email | Category + one-line summary (structured JSON) |
| Action extraction | Every new email | Task text + optional deadline, or none |
| Draft generation | On demand only | Draft reply grounded in thread + past sent emails |

**All LLM calls route through a single n8n sub-workflow.** This is the one architectural rule worth enforcing on day one — it makes swapping models a one-node change rather than a refactor.

### Storage — Supabase (PostgreSQL)

- `accounts` — provider credentials and sync state
- `emails` — normalized email records
- `tasks` — extracted action items, foreign-keyed to source email

Full-text search via Postgres `tsvector`. No vector database in v1.

### Frontend — Next.js (App Router) + TypeScript

Reads directly from Supabase. Calls an n8n webhook for on-demand actions such as draft generation.

### Hosting

| Component | Host | Cost |
|---|---|---|
| n8n | AWS EC2 (Ubuntu, Docker + Caddy) | Free tier |
| Frontend | Vercel | Free |
| Database | Supabase | Free tier |
| Pub/Sub | Google Cloud (required for Gmail push) | Free tier |

---

## 5. Model strategy

### Primary: Gemini Flash (free tier)

- 15 requests/min, 1M tokens/day at no cost
- Quality is sufficient for classification, summarization, and structured extraction
- Cheapest paid tier available if outgrown

### Planned fallback (build only if needed)

| Tier | Model | Role |
|---|---|---|
| Primary | Gemini Flash free tier | All pipelines, normally |
| Fallback | Local 7B–14B model via Ollama (Qwen / Llama, quantized) | Triage + extraction when rate-limited |
| Escalation | Small paid balance (Gemini paid or a hosted frontier API) | Draft generation only, if quality demands it |

**Deliberately deferred.** For a single user, 1M tokens/day is unlikely to be reached. The fallback router is not built in v1 — only the single LLM choke point that makes adding it trivial later. Build it when 429 errors actually appear, not before.

**Note on Kimi K3:** considered and rejected for self-hosting. At 2.8T parameters it requires a multi-node GPU cluster and cannot run locally or on any personally affordable instance. Its hosted API remains an option for the escalation tier, subject to data-residency considerations.

---

## 6. Delivery phases

### Phase 1 — Ingestion

Gmail + Outlook connected via n8n. Normalized emails landing in Supabase. No AI yet.

*Success: both inboxes syncing reliably on push, not polling.*

### Phase 2 — Triage

Gemini node classifies and summarizes each new email.

*Success: every new email has a category and summary within seconds of arrival.*

### Phase 3 — Action items

Extraction pipeline writing to the `tasks` table.

*Success: action items from a test set of emails extracted with acceptable accuracy and no obvious hallucinations.*

### Phase 4 — Draft generation

Webhook-triggered draft endpoint with style grounding from past sent emails.

*Success: drafts require light editing rather than rewriting.*

### Phase 5 — Frontend

Unified inbox, action-item sidebar, draft review modal.

*Success: usable as a daily driver alongside the real mail client.*

---

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free-tier LLM providers may train on submitted data | Email content is personal and involves third parties | Decide deliberately before Phase 2. Options: cheap paid tier, or local Ollama for sensitive processing. |
| Gmail OAuth verification required for sensitive scopes | Cannot share beyond test users | Acceptable for a personal project. Self as test user. |
| Hallucinated action items or drafts erode trust fast | Product becomes unusable | Strict structured output schemas. Never auto-send. Always show source email alongside extracted task. |
| Self-managed VM means self-managed ops | Downtime, TLS expiry, security exposure | Docker Compose + Caddy for automatic TLS. Open 80/443/22 in the EC2 instance's Security Group. |
| n8n workflows become visual spaghetti as branching grows | Hard to maintain or debug | One workflow per pipeline. Peel complex logic into code if it outgrows the node editor. |
| Free-tier rate limits tighten without warning | Pipeline stalls | Single-user volume is well within limits. Single LLM choke point makes provider swap cheap. |

---

## 8. Success criteria

The project succeeds if, after Phase 5, it is used **daily by choice** — not as a demo. Concretely:

- Inbox can be triaged in under two minutes.
- No forgotten commitments that were present in email.
- At least half of routine replies start from a generated draft.

---

## 9. Future direction

- Semantic search over email history
- Calendar integration for deadline-aware task scheduling
- Learned per-sender priority rules
- Fallback model router, if free-tier limits are actually reached
- Multi-user support, if it proves useful to others
