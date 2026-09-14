# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the mailbox owner, who is also the project's operator — one person managing their own Gmail (and eventually Outlook) inbox. There is no other audience: multi-user/multi-tenant support is explicitly out of scope for v1. Success is measured by this one person using the dashboard **daily, by choice**, alongside their real mail client — not as a demo.

## Product Purpose

Smart Email Assistant turns an overloaded inbox into three scannable outputs: a per-email category + one-line summary, a task list of commitments extracted from threads (each task foreign-keyed to the email it came from, so a wrong extraction is visibly checkable rather than blindly trusted), and on-demand reply drafts grounded in the thread and the user's own sent-mail style. Ingestion, triage, and action extraction (Phases 1–3) and draft generation (Phase 4) are already live and verified against a real deployment. The Web Dashboard (Phase 5) is the last unbuilt v1 piece — the only interface to any of this today is querying Supabase directly or calling the draft webhook with curl.

Success criteria (from the original proposal, not yet validated against real usage): inbox triaged in under two minutes, no forgotten commitments that were present in email, and at least half of routine replies starting from a generated draft.

## Positioning

Two structural bets a competing tool would also have to make: (1) every extracted task and every draft sits beside its source (email or thread), so a hallucination is caught by juxtaposition, not trust; (2) the system **cannot** send mail — there is no Gmail credential anywhere near draft generation or the dashboard, so "no auto-send" is a structural fact, not a setting someone could leave on. It is also built to unify Gmail and Outlook behind one normalized schema and one LLM gateway, so provider and model choice are each a one-node change upstream — though Outlook ingestion is currently parked (proposed, reviewed, not approved), so this dashboard is Gmail-only in practice even though the schema underneath is provider-agnostic.

## Operating Context

- Backend is three independent n8n pipelines (triage, action extraction, draft generation) over a Supabase/Postgres database (`accounts`, `emails`, `tasks`, `drafts`), all live and verified for Phases 1–4.
- The dashboard is the **first** container that talks to Supabase from something reachable on the public internet. Row-level security is off project-wide by design (the existing n8n path uses a direct Postgres credential, not the anon/authenticated client) — a browser-reachable client changes what "RLS off" exposes.
- The dashboard's only outbound write to n8n is `POST /webhook/generate-draft` (shared-secret authenticated). Every other interaction is either a Supabase read or a narrow status-column write (`tasks.status`, `drafts.status`) on tables it already owns the display of.
- Full-text search is Postgres `tsvector`-based; there is no vector/semantic search in v1.
- Used repeatedly across a normal day, not in one sitting — meant to sit alongside the user's real Gmail client, not replace it.

## Capabilities and Constraints

- Must never send mail, directly or indirectly. No Gmail credential may exist in the dashboard.
- Draft generation is the only side-effecting action the dashboard triggers; it always produces a `pending` draft for human review and is capped at 5 regenerations per email per hour by the existing endpoint.
- The dashboard's only direct schema writes are `tasks.status` and `drafts.status`; every other table it touches is read-only from this container.
- Out of scope for v1: multi-user support, calendar integration, semantic/vector search, learned per-sender priority.
- Outlook ingestion (change 003) is parked — the dashboard must not assume Outlook data is present.
- `search_vector` (tsvector column + GIN index, migration `0005`) does not exist in the schema yet; it is a prerequisite, not something already available to query against.
- **Explicitly undecided**, tracked in `.specclaw/changes/007-web-dashboard/proposal.md` and `party-report.md` — do not infer an answer:
  - Supabase access model: anon key from the browser vs. server-only service-role key.
  - The single-owner access-gate mechanism (shared password, Vercel deployment protection, or other).
  - Whether the draft review modal is read-only-plus-copy for v1, or supports inline editing of `draft_body` before the user pastes it into Gmail.
  - Whether a self-reported `sent` status should exist at all, given the dashboard has no way to verify a draft was actually sent.

## Brand Commitments

Product name is "Smart Email Assistant." No other naming, logo, or visual identity has been committed. `dashboard/` is currently an unmodified `create-next-app` scaffold — no incumbent visual world exists yet.

## Evidence on Hand

- Real, already-live schema and pipelines: `supabase/migrations/`, `n8n/workflows/`, `architect/` (C4 diagrams), `architecture.md`.
- Verification reports with real acceptance-criteria evidence for Phases 1–4 under `.specclaw/changes/*/verify-report.md`.
- No sample UI, mockups, testimonials, usage metrics, or screenshots exist. The dashboard has no users yet — "used daily by choice" is a target to design toward, not an observed fact, and nothing should be fabricated to imply otherwise.

## Product Principles

1. A wrong AI output must be checkable at a glance, not trusted — every task sits beside its source email; every draft sits beside its source thread.
2. Nothing sends without an explicit human action, and that boundary is structural, never a toggle.
3. The dashboard reads before it writes — its footprint stays inside the architecture's stated boundary (Supabase reads plus two status columns; n8n only via the one existing draft webhook).
4. Provider- and model-agnosticism upstream should not be undone by the UI — design for the normalized schema, not "Gmail," even while Outlook stays parked.
5. Ship what's decided; surface what isn't. Open access-model and status-semantics questions get flagged, not silently resolved by whichever default is easiest to build.
