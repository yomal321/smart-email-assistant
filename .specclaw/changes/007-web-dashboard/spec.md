# Spec: Web Dashboard (Phase 5) — Professional Dashboard UI/UX

**Change:** 007-web-dashboard
**Created:** 2026-09-12
**Status:** 🟡 Draft

## Overview

Extend the existing `dashboard/` prototype (Next.js 16 App Router, TypeScript, Tailwind v4, React 19 — fixture-data only, no backend calls) from a single-page reader into a multi-view professional dashboard: a navigation shell (sidebar + top bar + command palette), a new Overview/Analytics page, a new Settings page, full dark-mode parity, and table-level polish (sort/filter/bulk actions/loading/empty states) on the existing Inbox, Action Items, and Draft Review views. Everything in this change reads and writes `dashboard/lib/data/fixtures.ts` in-memory state only — it adds zero Supabase, n8n, or network calls, per the approved proposal's explicit boundary.

## Requirements

### Functional Requirements

- **FR1** — A persistent navigation shell (sidebar + top bar) replaces today's single `<header>` + single-column layout in `app/page.tsx`. The sidebar exposes at least: Overview, Inbox, Settings. The current Action Item Sidebar and Draft Review Modal remain reachable from Inbox, unchanged in their own scope.
- **FR2** — A command palette (⌘K / Ctrl+K) opens from anywhere in the shell and supports, at minimum, navigating to Overview/Inbox/Settings. It is keyboard-operable end to end (open, arrow through results, Enter to select, Esc to close) and returns focus to the trigger on close.
- **FR3** — A new Overview page (`app/overview/page.tsx` or equivalent route) renders:
  - A KPI card row with at least: total emails triaged, open task count, draft acceptance rate (`sent` / (`sent` + `discarded`) among non-`pending` drafts), and average time-to-draft (`created_at` − source email `received_at`, over drafts that exist). Each KPI card shows its current value and a trend indicator against the fixture data's own prior period.
  - An email-volume-over-time chart (line or area) driven by `received_at` across the fixture dataset.
  - A category-breakdown chart (horizontal bar, sorted descending) driven by `category` across the fixture dataset.
  - Every chart ships a non-color-coded accessible fallback: a toggle to an equivalent data table, or direct value labels — never color as the only signal.
- **FR4** — `dashboard/lib/data/fixtures.ts` is extended with enough synthetic history (multiple distinct days, a spread of categories, several tasks/drafts in varied statuses) that FR3's charts and KPIs render a credible trend rather than a flat/degenerate line. Existing fixture rows (`e1`–`e7`, `t1`–`t3`, `d1`) are kept as-is; new rows are additive.
- **FR5** — A new Settings page exposes at least: a theme control (light/dark/system) and a display-density control (comfortable/compact). Changes apply immediately to the running app and persist across a reload via `localStorage`, scoped to this browser only — no backend write, no cross-device sync.
- **FR6** — Full dark mode: every screen and component in the app (existing Inbox/Action Items/Draft Modal included) renders correctly with the dark theme active, not just the new Overview/Settings screens. Dark-mode color tokens are added to `app/globals.css` alongside the existing light tokens.
- **FR7** — The existing Inbox list gains: column sort (by `received_at`, `category`), a category filter, and a bulk-select + bulk "mark task done/dismissed" action for rows with an associated task. Filtering/sorting operate over the same in-memory `filteredEmails` derivation already in `app/page.tsx` — no new data source.
- **FR8** — Every data view that can be empty (Inbox with an active filter/search that matches nothing, Action Item sidebar with no open tasks, Overview charts with no data) shows an explicit empty state with a clear next action, not a blank region. (The Inbox "no emails match" case already exists in `app/page.tsx` — FR8 extends the same pattern to the other views.)
- **FR9** — Any action with a simulated network delay (draft generation already simulates this; bulk actions introduced by FR7 should too, to stay consistent) shows a loading/skeleton state for its duration rather than an unresponsive UI.
- **FR10** — All new interactive elements (nav items, command palette, chart accessible-fallback toggles, settings controls, sort/filter/bulk controls) are reachable and operable by keyboard alone, with visible focus states.

### Non-Functional Requirements

- **NFR1** — No new runtime dependency on Supabase, n8n, or any network call. The only new dependencies allowed are frontend-only packages needed for charts/command-palette/state (e.g. a charting library, `cmdk`-style palette primitive) — no server SDK, no fetch to an external host.
- **NFR2** — Stack conventions from `.specclaw/context.md`-equivalent project docs (none exists yet; see Dependencies) default to the guidance already used by this prototype and its README: Server Components by default, `'use client'` only where interactivity/state is required, dynamic import for chart bundles.
- **NFR3** — Color contrast meets WCAG AA (4.5:1 for body text) in both light and dark themes; this applies to the existing category/status badge colors as much as to new chart/KPI colors.
- **NFR4** — The app continues to run entirely via `npm run dev` / `npm run build` with no environment variables, no `.env`, and no external service reachable at build or runtime.
- **NFR5** — Responsive down to 375px width: the sidebar collapses to an accessible off-canvas or bottom nav pattern below the `md` breakpoint already used elsewhere in this codebase (see `app/page.tsx`'s existing `md:flex-row`), and no view produces horizontal page scroll.

## Acceptance Criteria

- **AC1** — Loading the app shows the sidebar + top bar shell on every route (Overview, Inbox, Settings); the previous single-page layout is gone from `app/page.tsx` (or its replacement route).
- **AC2** — Pressing ⌘K/Ctrl+K anywhere opens the command palette; typing "Settings" and pressing Enter navigates to the Settings page; Esc closes it and returns focus to where it was before opening.
- **AC3** — The Overview page renders four KPI cards with numeric values computed from fixture data (not hardcoded), a volume-over-time chart, and a category-breakdown chart; toggling each chart's accessible-fallback control reveals an equivalent data table.
- **AC4** — `fixtures.ts` contains email data spanning at least 14 distinct calendar days with a mix of all five categories, and the Overview volume chart visibly shows more than one data point / more than a flat single-value line.
- **AC5** — On the Settings page, switching the theme control to "Dark" immediately re-renders every currently-mounted view (Overview, Inbox, Action Item sidebar, an open Draft Modal if applicable) in dark colors; reloading the page preserves the choice.
- **AC6** — Every color pairing introduced or touched by this change (KPI cards, chart marks, dark-mode badge variants) passes a 4.5:1 contrast check against its background, verified with a contrast checker on the actual token values in `globals.css`.
- **AC7** — On the Inbox, sorting by `received_at` and by `category`, and applying a category filter, each visibly reorders/reduces the row list without a full page reload; selecting 2+ rows and choosing "Mark done" updates each selected row's task status.
- **AC8** — Clearing the Inbox search/filter to a state with zero matches shows an empty-state message with a suggested next action (e.g. "Clear filters"), not a blank list. The same pattern is visible on the Action Item sidebar when no tasks are open.
- **AC9** — Resizing the viewport to 375px wide shows no horizontal scrollbar on any of Overview/Inbox/Settings, and the sidebar becomes an accessible collapsed/off-canvas control rather than being clipped or overlapping content.
- **AC10** — Tabbing through the app from a fresh page load reaches the sidebar nav items, the command palette trigger, every Inbox sort/filter/bulk control, and every Settings control, each with a visible focus ring, without a mouse.

## Edge Cases

- Command palette opened with zero query text should list default navigation entries, not an empty result.
- Bulk "mark done"/"mark dismissed" applied to a selection that includes rows with no associated task must silently skip those rows rather than erroring.
- KPI "average time-to-draft" must handle the case of zero drafts existing (show a placeholder like "—" or "No drafts yet", not `NaN` or a crash).
- Theme control set to "System" must follow the OS `prefers-color-scheme` and update live if the OS preference changes during the session.
- Category-breakdown chart must handle a category with zero emails (omit it or show a zero-length bar, never divide-by-zero or crash).

## Dependencies

- No `.specclaw/context.md` exists yet in this project — this spec's NFR2 instead cites the conventions already established by `dashboard/README.md` and the current `app/page.tsx`/`app/layout.tsx` (Plus Jakarta Sans via `next/font/google`, Tailwind v4 `@theme inline` tokens in `app/globals.css`, fixture-data-only state in `lib/data/fixtures.ts`).
- Builds directly on top of the existing `dashboard/` app committed to the repo (components: `InboxRow`, `ActionItemSidebar`, `DraftModal`, `SearchBar`, `CategoryBadge`, `StatusBadge`, `TaskCard`; types in `lib/types.ts`; formatting helpers in `lib/format.ts`). None of these are replaced — they are relocated into the new nav shell and extended, not rewritten from scratch.
- Depends on the design-system direction already chosen via the `ui-ux-pro-max` skill research recorded in `proposal.md` (Data-Dense Dashboard style, Executive Dashboard KPI conventions, a monospace face added for tabular/numeric data alongside the existing Plus Jakarta Sans).

## Notes

- This spec deliberately does not touch, resolve, or narrow any of the original 007 proposal's still-open backend questions (Supabase access model, auth/access gate, `search_vector` migration, self-reported `sent` status) — see `proposal.md`'s Open Questions. Any task here that appears to require a real backend decision is out of scope; ask rather than assume.
- "Professional dashboard" in this spec means the visual/interaction polish and information architecture of a real BI/productivity tool — it does not mean adding real analytics infrastructure. All KPIs and charts are computed client-side from the same fixture arrays the prototype already uses.
