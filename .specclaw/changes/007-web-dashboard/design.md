# Design: Web Dashboard (Phase 5) — Professional Dashboard UI/UX

**Change:** 007-web-dashboard
**Created:** 2026-09-12

## Technical Approach

Grow `dashboard/` from a single page (`app/page.tsx` doing everything, client-rendered, fixture state hoisted at the top of one component) into a routed App Router shell:

- `app/layout.tsx` gains the persistent chrome (sidebar, top bar, command palette root) as a Server Component wrapper; today it only sets fonts and a flex body.
- `app/page.tsx`'s current body becomes the **Inbox** route content (`app/inbox/page.tsx`, with `app/page.tsx` redirecting to `/inbox` or `/overview` as the default landing route — Overview is the more natural default per the proposal, so `/` → Overview).
- A new `app/overview/page.tsx` (Server Component shell, client islands for the charts) computes KPIs and chart data from the same fixture arrays, via new pure functions in `lib/analytics.ts` (new file) so the math is unit-testable and independent of any component.
- A new `app/settings/page.tsx` (client component — every control here is stateful) holds theme + density controls, persisted to `localStorage` directly (no context/store library needed for two settings).
- Fixture-derived state (`tasks`, `drafts`, theme, density) currently lives as `useState` inside `app/page.tsx`. It moves up into a small client-side context provider (`components/AppStateProvider.tsx`, new) mounted once in `app/layout.tsx`'s client boundary, so Inbox, Overview, and Settings all read/write the same in-memory state instead of each route re-importing `fixtures.ts` independently and diverging. This is the one structural change everything else depends on — see Key Decisions.
- Command palette: a small self-built client component (`components/CommandPalette.tsx`) rather than pulling in a heavy library, since scope is navigation-only (FR2) plus reading the same nav item list the sidebar already renders — one source of truth for "what pages exist," not a duplicated list.
- Charts: dynamic-imported client components under `components/charts/` (`VolumeChart.tsx`, `CategoryBreakdownChart.tsx`), each with a sibling accessible data-table view toggled by local state — satisfying FR3's non-color-only requirement without a second library.
- Dark mode: today `app/globals.css` defines only light tokens (`:root { --background: #f8fafc; ... }`) with no dark branch at all — FR6 is a net-new addition, not a partial-to-full upgrade. Add a `.dark` class-based override block (class strategy, toggled by the Settings theme control writing a class on `<html>`, plus a `prefers-color-scheme` media query fallback for "System") so existing components that already consume `--color-*` custom properties via Tailwind's `@theme inline` need no per-component changes — only new token values.

## Architecture

```
app/
  layout.tsx            — shell: sidebar + top bar + <CommandPalette/> + <AppStateProvider>
  page.tsx               — redirects "/" -> "/overview"
  overview/page.tsx       — KPI row + VolumeChart + CategoryBreakdownChart
  inbox/page.tsx          — today's app/page.tsx body (InboxRow list + ActionItemSidebar + DraftModal), now reading state via useAppState()
  settings/page.tsx       — theme + density controls

components/
  AppStateProvider.tsx    — new: hoists tasks/drafts/theme/density state + localStorage sync
  Sidebar.tsx             — new
  TopBar.tsx              — new
  CommandPalette.tsx      — new
  charts/VolumeChart.tsx           — new, dynamic import
  charts/CategoryBreakdownChart.tsx — new, dynamic import
  InboxRow.tsx, ActionItemSidebar.tsx, DraftModal.tsx,
  SearchBar.tsx, CategoryBadge.tsx, StatusBadge.tsx, TaskCard.tsx  — unchanged in responsibility, extended for sort/filter/bulk (FR7) and dark-mode tokens only

lib/
  types.ts                — unchanged
  format.ts                — unchanged, extended with a duration formatter for the avg-time-to-draft KPI
  analytics.ts             — new: pure functions computing KPI values + chart series from Email/Task/Draft arrays
  data/fixtures.ts         — extended with more rows (FR4), same shape
```

State flow: `AppStateProvider` (client) holds `tasks`/`drafts` (mutable, mirrors today's `useState` in `app/page.tsx`) and `theme`/`density` (mutable, synced to `localStorage`), seeded from the static `fixtures.ts` exports exactly as today. Every route consumes it via a `useAppState()` hook — no route re-derives its own copy of task/draft state, which is what would let Inbox and Overview drift out of sync.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `dashboard/app/layout.tsx` | Modify | Add sidebar/top-bar/command-palette shell + `AppStateProvider` wrapper; add `.dark` class plumbing to `<html>` |
| `dashboard/app/page.tsx` | Modify | Reduce to a redirect to `/overview` |
| `dashboard/app/inbox/page.tsx` | Create | Today's `app/page.tsx` body, reading shared state via `useAppState()`; adds sort/filter/bulk controls (FR7) and empty states (FR8) |
| `dashboard/app/overview/page.tsx` | Create | KPI row + two charts, per FR3 |
| `dashboard/app/settings/page.tsx` | Create | Theme + density controls, per FR5 |
| `dashboard/components/AppStateProvider.tsx` | Create | Shared tasks/drafts/theme/density state + localStorage sync |
| `dashboard/components/Sidebar.tsx` | Create | Persistent nav (Overview/Inbox/Settings), collapses below `md` per NFR5 |
| `dashboard/components/TopBar.tsx` | Create | Top bar incl. command-palette trigger, existing `SearchBar` relocated here for Inbox context |
| `dashboard/components/CommandPalette.tsx` | Create | ⌘K/Ctrl+K palette, keyboard-operable (FR2) |
| `dashboard/components/charts/VolumeChart.tsx` | Create | Email-volume-over-time chart + accessible table fallback |
| `dashboard/components/charts/CategoryBreakdownChart.tsx` | Create | Category-breakdown bar chart + accessible table fallback |
| `dashboard/components/KpiCard.tsx` | Create | Single KPI card (value + trend indicator) |
| `dashboard/components/InboxRow.tsx` | Modify | Bulk-select checkbox; no change to its existing task/draft display logic |
| `dashboard/components/ActionItemSidebar.tsx` | Modify | Empty state per FR8 |
| `dashboard/components/DraftModal.tsx` | Modify | Dark-mode token check only; no logic change |
| `dashboard/lib/analytics.ts` | Create | Pure KPI/chart-series calculations from `Email`/`Task`/`Draft` arrays |
| `dashboard/lib/format.ts` | Modify | Add a duration formatter (e.g. `formatDuration(ms)`) for the avg-time-to-draft KPI |
| `dashboard/lib/data/fixtures.ts` | Modify | Add rows spanning 14+ days across all categories (FR4); existing `e1`–`e7`/`t1`–`t3`/`d1` untouched |
| `dashboard/app/globals.css` | Modify | Add `.dark` token overrides for every existing token plus new chart/KPI tokens; add density-related spacing tokens if needed for FR5 |
| `dashboard/package.json` | Modify | Add a charting library and any command-palette primitive (see Key Decisions) |
| `dashboard/README.md` | Modify | Update "what's real vs. simulated" table to reflect the new views; note the shell/settings/charts are still fixture-only |

## Data Model Changes

None. No `supabase/migrations/` file is touched, no new table or column — this change operates entirely on the existing `Email`/`Task`/`Draft` TypeScript shapes in `dashboard/lib/types.ts`, which already mirror the live schema exactly (see that file's own header comment). `fixtures.ts` gains more rows of the same shape, not new fields.

## API Changes

None. No new route handler, no new outbound fetch. The existing simulated `generateDraft()` timeout/failure-rate pattern in `app/page.tsx` is preserved (moved into `AppStateProvider` or `inbox/page.tsx`) and the same simulated-delay pattern is reused for the new bulk-action FR9 requirement, rather than inventing a second convention.

## Key Decisions

- **Lift state into a provider instead of prop-drilling across routes.** Once Inbox and Overview are separate routes, `app/page.tsx`'s current pattern (all state in one component) can't reach both. A provider mounted once in `layout.tsx` is the smallest change that keeps a single source of truth; a heavier state library (Redux/Zustand) is unjustified for two arrays plus two settings values.
- **Class-based dark mode (`.dark` on `<html>`), not `prefers-color-scheme`-only.** FR5 requires an explicit Settings toggle (light/dark/**system**), which needs a mechanism that can be forced independent of the OS — class-based is the standard Tailwind v4 pattern for this and composes with a media-query fallback for the "system" option.
- **Self-built command palette over a library.** Scope per FR2 is navigation-only. Pulling in `cmdk` (or similar) is reasonable if the team prefers it, but a ~60-line component reading the same nav array `Sidebar.tsx` uses avoids a new dependency and a second nav-item source of truth; **flagged as an open implementation choice for whoever builds T-CommandPalette, not decided here** — either is compatible with this design.
- **New `lib/analytics.ts` instead of inline chart-component math.** Keeps KPI/series calculations testable and directly reusable by both a chart and its accessible-table fallback, which must agree on the same numbers by construction rather than by two independent implementations staying in sync by convention.
- **Charting library left as an implementation-time choice, constrained by NFR1.** Any client-only charting library is acceptable (Recharts, Chart.js, etc. all satisfy "frontend-only, no server SDK, no network call"); the task list does not pin one so the build step can pick based on Tailwind v4 / React 19 compatibility at build time.

## Grounding sources

- `dashboard/README.md`: *"Runs entirely on fixture data in `lib/data/fixtures.ts` — no Supabase connection, no n8n calls, nothing sent anywhere."* — the fixture-only boundary this design preserves throughout (Data Model Changes, API Changes, NFR1).
- `dashboard/README.md`: *"Derived via the `ui-ux-pro-max` skill for an 'Email Client' / productivity-tool product type... Plus Jakarta Sans, a neutral slate base with a blue primary... Tokens live in `app/globals.css`."* — the existing token system this design extends with `.dark` overrides rather than replacing.
- `architecture.md` (Level 3b, Web Dashboard components): *"The dashboard has exactly one write path — the draft request — and it goes to n8n, not the database. Everything else is a read."* — confirms this change introduces no new write path of that kind; every mutation added here (task/draft status, settings, bulk actions) stays local/fixture-only, consistent with the container boundary even though this change doesn't wire the real write path up yet.
- `README.md` (project root): *"5 | Web dashboard — unified inbox, task sidebar, draft review | ⚪ Not started"* — confirms no other in-repo work already covers this surface; this is the first implementation pass at Phase 5's UI.

## Risks & Mitigations

- **Risk: state-provider refactor accidentally changes existing Inbox/Draft-Modal behavior.** Mitigation: the provider's shape and the mutation functions (`changeTaskStatus`, `changeDraftStatus`, `generateDraft`) are lifted verbatim from `app/page.tsx`'s current implementation, not rewritten — only their location moves.
- **Risk: fixture-data expansion (FR4) accidentally breaks an existing hardcoded reference to `e1`–`e7`/`t1`–`t3`/`d1`.** Mitigation: spec.md's FR4 explicitly requires existing rows stay as-is; new rows are additive with new ids.
- **Risk: dark-mode token pass misses a hardcoded color.** `CategoryBadge.tsx` and similar already use Tailwind classes bound to `--color-cat-*` custom properties (see `bg-cat-needs-reply-bg` etc.), so a `.dark` override block covers them automatically — the risk is limited to any component using a raw hex/Tailwind palette class instead of a `--color-*` token. Mitigation: AC6's contrast check doubles as an audit pass for exactly this.
- **Risk: this change quietly grows into "let's also wire up real data while we're in here."** Mitigation: spec.md's Notes section and NFR1 make the fixture-only boundary explicit; any task that needs a real backend answer should be raised as a question, not resolved inline.
