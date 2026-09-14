# Proposal: Web Dashboard (Phase 5) — Professional Dashboard UI/UX

**Created:** 2026-09-11
**Revised:** 2026-09-12
**Status:** 🟡 Draft

## Problem

Phases 1–4 (ingestion, triage, action extraction, draft generation) are live and verified, but there is no way to use any of it except by querying Supabase directly or hitting the draft webhook with curl. The project's own success criteria — "inbox triaged in under two minutes," "used daily by choice," "at least half of routine replies start from a generated draft" — are all criteria about a human using a UI, and no full UI exists yet.

A first prototype (`dashboard/`) already validated the core interaction design — inbox, action-item sidebar, draft-review modal, basic search — running entirely on fixture data. It proved the concept but reads as a single-page utility, not a tool someone reaches for daily by choice: no landing overview, no navigation shell, no sense of the pipeline's output at a glance, partial dark mode, and no room to grow into settings or historical/analytics views. This revision re-scopes 007 from "the minimum reader for three tables" to a genuinely professional dashboard product, while deliberately keeping the same boundary that made the prototype safe to iterate on fast: **fixture data only, zero backend/Supabase/n8n wiring**, so visual and interaction design can keep moving without being gated on the still-open backend questions below.

## Proposed Solution

Extend the existing `dashboard/` app (Next.js 16 App Router, TypeScript, Tailwind v4, React 19 — unchanged stack) from a single-page prototype into a full dashboard shell with multiple views, built entirely against `lib/data/fixtures.ts`. Design direction, chosen via the `ui-ux-pro-max` skill against this being a desktop-first, information-dense productivity tool (not a mobile/marketing surface):

- **Style:** Data-Dense Dashboard (BI/Analytics) as the primary style, with Executive Dashboard KPI-row conventions for the new overview page and a light Bento Box Grid treatment for its card layout. Deliberately not the glassmorphism/gradient "SaaS Mobile" pattern — wrong device target.
- **Typography:** keep Plus Jakarta Sans for UI text/headings; add a monospace face (JetBrains Mono or Fira Code) for tabular/numeric data — timestamps, counts, stat deltas — so columns of numbers align, a standard dashboard convention the prototype didn't yet have.
- **Color:** keep the existing neutral slate base, blue primary, and per-category/status accent colors; bring dark mode to full parity with light mode (today it's partial) since a data-dense dashboard is used across a full day, not one sitting.
- **Layout/navigation:** persistent sidebar + top bar shell (replacing the current single-page layout), plus a command palette (⌘K) for power-user navigation and actions.
- **New Overview/Analytics page:** KPI card row (triage volume, tasks completed, draft acceptance rate, avg response time) with count-up + trend sparkline; a line/area chart for email volume over time; a horizontal bar chart for category/sender breakdown (sorted descending, ≤15 categories). Every chart ships a non-color-coded accessibility fallback (data table toggle or direct labels), per WCAG AA.
- **New Settings/preferences page:** edits local/fixture state for now (theme, notification prefs, display density) — establishes the screen and its interaction pattern without needing a real backend to persist to.
- **Table polish across existing views:** sorting, filtering, bulk actions, skeleton loading states, and empty states with a clear next action for the inbox/action-item/draft views that already exist.
- **Implementation conventions:** Server Components by default, Server Actions for any local-state mutations, dynamic import for chart bundles, `'use client'` only where interactivity is actually required.

This is a UI/UX-scope change only. It extends the same prototype app and keeps its explicit "no backend" boundary — it does not decide any of the backend/access questions the original 007 proposal raised.

## Scope

### In Scope
- Sidebar + top bar navigation shell replacing today's single-page layout, plus a command palette (⌘K)
- New Overview/Analytics page: KPI cards, volume-over-time chart, category breakdown chart, all against fixture data
- New Settings/preferences page (local/fixture state only — no persistence backend)
- Full dark mode parity (today partial) across every existing and new view
- Sorting, filtering, bulk actions, skeleton loading states, and empty states added to the existing inbox/action-item/draft views
- A tabular/monospace type addition for numeric and timestamp display
- All of the above stays inside the existing `dashboard/` app, its current stack, and its fixture-data-only boundary — no new dependency on Supabase, n8n, or any network call

### Out of Scope
- Any real Supabase/n8n wiring, or removing/reducing the fixture-data boundary — that is a separate, later change
- The access model question (anon key vs. service-role key), the auth/access-gate mechanism, and the `search_vector` migration — unresolved exactly as in the original proposal, not decided here
- Resolving whether a self-reported `sent` draft status should exist, or any other open question already on record below
- Any send-mail capability, direct or indirect
- Multi-user support or a real auth system
- Outlook data, calendar integration, semantic/vector search, learned per-sender priority — out of scope per the original v1 proposal and unchanged here

## Impact

- **Files affected:** ~25–35 (estimated) — new nav shell/layout components, a new overview route + chart components, a new settings route, additions to existing view components; no backend or migration files touched
- **Complexity:** medium — larger surface than the original narrow prototype, but constrained to frontend-only work against an existing stack and existing fixtures, with no new integration risk
- **Risk:** low — nothing here talks to a real credential, a real database, or the public internet beyond static hosting; the risk profile the original proposal flagged (RLS, first internet-reachable Supabase client) is entirely deferred to whichever later change actually wires up real data

## Open Questions

- **Fixture data richness.** The new Overview/Analytics page needs enough historical fixture data (volume over multiple days/weeks, category distribution) to look credible — does `lib/data/fixtures.ts` get extended with a richer synthetic dataset as part of this change, or is a separate, smaller fixture-data pass preferred first?
- **Command palette scope.** Should ⌘K in this iteration cover navigation only (jump to Inbox/Overview/Settings), or also fixture-state actions (mark task done, open a draft) — the latter needs more interaction design before it's a small addition?
- **When does this reconverge with the backend questions?** This change explicitly doesn't resolve the original proposal's access-model/auth-gate/search-migration questions — is there an expected follow-on change once this UI work lands, or does the professional-dashboard UI ship and sit on fixtures indefinitely until those are separately decided?

**Carried over from the original proposal — still unresolved, not addressed by this UI/UX-scoped revision:**
- **Access model.** Anon key from the browser vs. server-only service-role key, once real data is wired up.
- **Auth/access gate.** Single shared password, Vercel deployment protection, or something else, once the dashboard is backed by real data and reachable at a public URL.
- **Search migration ownership.** `0005_search_schema.sql` (tsvector column + index) doesn't exist yet — built as part of the eventual real-data change, or as an independent prerequisite change.
- **Draft edit before send.** Read-only + copy-to-clipboard, or inline editing of `draft_body`.
- **"Sent" is a self-report.** Whether a self-reported `sent` status is acceptable, or should be dropped until there's a real signal.

---

**To proceed:** Review this proposal and approve to begin planning.
