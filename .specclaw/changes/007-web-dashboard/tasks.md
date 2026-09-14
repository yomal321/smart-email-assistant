# Tasks: Web Dashboard (Phase 5) — Professional Dashboard UI/UX

**Change:** 007-web-dashboard
**Created:** 2026-09-12
**Total Tasks:** 15

## Summary

Four waves: (1) foundation data/state/tokens that every later screen depends on, (2) the navigation shell, (3) the three routed pages built on top of the shell, (4) cross-cutting polish and verification. All work stays inside `dashboard/`, fixture-data-only, per `spec.md`'s NFR1.

## Tasks

### Wave 1 — Foundation: fixtures, shared state, tokens

- [x] `T1` — Expand fixture data for credible analytics
  - Files: `dashboard/lib/data/fixtures.ts`
  - Estimate: medium
  - Kind: impl
  - Notes: Add emails/tasks/drafts spanning 14+ distinct calendar days across all five `EmailCategory` values, plus enough additional tasks/drafts in varied statuses (`open`/`done`/`dismissed`, `pending`/`sent`/`discarded`) that FR3's KPIs and charts aren't flat. Keep existing `e1`–`e7`/`t1`–`t3`/`d1` rows byte-for-byte as-is; only add new rows with new ids. Satisfies FR4/AC4.

- [x] `T2` — Add analytics calculations and duration formatting
  - Files: `dashboard/lib/analytics.ts` (new), `dashboard/lib/format.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: Pure functions taking `Email[]`/`Task[]`/`Draft[]` and returning: total-triaged count, open-task count, draft acceptance rate, avg time-to-draft, a volume-over-time series, and a category-breakdown series. Handle the zero-drafts and zero-emails-in-category edge cases from spec.md's Edge Cases section (no `NaN`, no divide-by-zero). Add a `formatDuration(ms)` helper to `format.ts` alongside the existing `formatRelativeTime`/`formatDeadline`. No component code here — this task is pure logic so both a chart and its accessible-table fallback can consume the same numbers.

- [x] `T3` — Add dark-mode and new chart/KPI color tokens
  - Files: `dashboard/app/globals.css`
  - Estimate: medium
  - Kind: impl
  - Notes: Add a `.dark` class-based override block mirroring every existing `:root` token (background/foreground/card/primary/secondary/muted/border/destructive/success/warning, all `--cat-*` and `--status-*` pairs), plus new tokens for chart series colors and KPI trend up/down colors. Add a `prefers-color-scheme: dark` fallback for the "system" theme option. Every new/existing pairing must meet 4.5:1 contrast (AC6) — check values as you set them, don't defer to T14.

- [x] `T4` — Lift shared state into a provider
  - Files: `dashboard/components/AppStateProvider.tsx` (new)
  - Estimate: medium
  - Kind: refactor
  - Notes: Move `app/page.tsx`'s current `tasks`/`drafts` `useState` plus its `changeTaskStatus`/`changeDraftStatus`/`generateDraft` functions into this provider verbatim (same logic, same simulated-delay/failure-rate behavior for `generateDraft`) — do not rewrite the mutation logic, only relocate it. Add `theme` (`"light" | "dark" | "system"`) and `density` (`"comfortable" | "compact"`) state, synced to `localStorage` on change and read on mount. Export a `useAppState()` hook. This does not yet wire into `layout.tsx` or remove anything from `app/page.tsx` — that's T8/T13.

### Wave 2 — Navigation shell

- [x] `T5` — Build sidebar and top bar
  - Files: `dashboard/components/Sidebar.tsx` (new), `dashboard/components/TopBar.tsx` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T4
  - Notes: Sidebar lists Overview/Inbox/Settings with an active-route indicator; collapses to an accessible off-canvas/toggle pattern below the `md` breakpoint (NFR5/AC9) — reuse the `md:` breakpoint convention already in `app/page.tsx`'s `md:flex-row`. Top bar relocates the existing `SearchBar` (still Inbox-scoped) and adds the command-palette trigger. Keep the nav item list in one place (e.g. exported from `Sidebar.tsx`) so `CommandPalette.tsx` (T6) can reuse it instead of duplicating it.

- [x] `T6` — Build the command palette
  - Files: `dashboard/components/CommandPalette.tsx` (new), `dashboard/package.json` (only if a palette primitive is added — see design.md's Key Decisions on build vs. library)
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes: Opens on ⌘K/Ctrl+K from anywhere in the shell; lists the same nav entries as `Sidebar.tsx` when the query is empty (spec.md's Edge Cases); full keyboard operation (open/arrow/Enter/Esc) and returns focus to the trigger element on close (FR2/AC2/AC10).

- [x] `T7` — Build the Settings page
  - Files: `dashboard/app/settings/page.tsx` (new)
  - Estimate: small
  - Kind: impl
  - Depends: T4
  - Notes: Theme control (light/dark/system) and density control (comfortable/compact) reading/writing `useAppState()`. Selecting a theme applies a `.dark` class to `<html>` (or removes it / defers to the media query for "system") immediately — no reload required (AC5).

- [x] `T8` — Wire the shell into the root layout
  - Files: `dashboard/app/layout.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T4, T5, T6
  - Notes: Mount `AppStateProvider`, `Sidebar`, `TopBar`, and `CommandPalette` once here so every route shares them (AC1). Apply the theme class to `<html>` based on provider state.

### Wave 3 — Routed pages

- [x] `T9` — Create the Inbox route from the current page body
  - Files: `dashboard/app/inbox/page.tsx` (new), `dashboard/components/InboxRow.tsx`, `dashboard/components/ActionItemSidebar.tsx`
  - Estimate: large
  - Kind: refactor
  - Depends: T8
  - Notes: Move `app/page.tsx`'s current inbox/action-item/draft-modal rendering here, reading state via `useAppState()` instead of local `useState`. Add: sort by `received_at`/`category`, a category filter, bulk row selection with a "mark done"/"mark dismissed" bulk action applying the simulated-delay pattern from `generateDraft` for consistency (FR7/FR9/AC7), and an empty state on zero-filter-matches and on the Action Item sidebar having no open tasks (FR8/AC8, extending the existing "no emails match" pattern already in today's `app/page.tsx`). Skip rows with no associated task during a bulk action rather than erroring (Edge Cases).

- [x] `T10` — Reduce the root page to a redirect
  - Files: `dashboard/app/page.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T9
  - Notes: Replace the current full-page implementation with a redirect to `/overview` (Next.js `redirect()` from `next/navigation`).

- [x] `T11` — Build KPI cards and the Overview page shell
  - Files: `dashboard/components/KpiCard.tsx` (new), `dashboard/app/overview/page.tsx` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T2, T8
  - Notes: Four KPI cards (total triaged, open tasks, draft acceptance rate, avg time-to-draft) using `lib/analytics.ts` from T2, each with a trend indicator. Handle the zero-drafts placeholder case from spec.md's Edge Cases (show "—"/"No drafts yet", never `NaN`).

- [x] `T12` — Build the volume-over-time and category-breakdown charts
  - Files: `dashboard/components/charts/VolumeChart.tsx` (new), `dashboard/components/charts/CategoryBreakdownChart.tsx` (new), `dashboard/package.json`
  - Estimate: large
  - Kind: impl
  - Depends: T2, T11
  - Notes: Add one client-only charting library (any is acceptable per NFR1/design.md — pick one compatible with React 19 + Next 16 at implementation time) and dynamic-import both chart components into `app/overview/page.tsx`. Each chart ships a toggle to an equivalent accessible data table driven by the same `lib/analytics.ts` series — never color as the only signal (FR3/AC3). Category-breakdown sorts descending and handles a zero-count category without dividing by zero (Edge Cases).

### Wave 4 — Cross-cutting polish and verification

- [x] `T13` — Responsive and dark-mode sweep
  - Files: any component touched above
  - Estimate: medium
  - Kind: refactor
  - Depends: T9, T10, T11, T12
  - Notes: Verify at 375px/768px/1024px/1440px that nothing produces horizontal scroll and the sidebar's collapsed pattern is usable (AC9). Verify every screen (including a mounted `DraftModal`) renders correctly with dark mode active, not only the new Overview/Settings screens (FR6/AC5) — this is the pass that catches any component using a raw color instead of a `--color-*` token per design.md's Risks.

- [x] `T14` — Keyboard and contrast audit
  - Files: any component touched above, `dashboard/app/globals.css`
  - Estimate: medium
  - Kind: test
  - Depends: T13
  - Notes: Tab from a fresh load through sidebar nav, command-palette trigger, every Inbox sort/filter/bulk control, and every Settings control, confirming a visible focus ring at each stop (AC10). Run a contrast check against the actual token values for every pairing introduced or touched by this change (AC6).

- [x] `T15` — Update the prototype README
  - Files: `dashboard/README.md`
  - Estimate: small
  - Kind: docs
  - Depends: T13, T14
  - Notes: Update the "what's real vs. simulated" table to list Overview/Settings/nav-shell alongside the existing rows, and note explicitly that all of it remains fixture-data-only — mirroring the existing "Deliberately not addressed here" section rather than replacing it.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
