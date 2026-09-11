# Smart Email Assistant — Dashboard prototype

Professional dashboard UI/UX prototype for Phase 5 (`.specclaw/changes/007-web-dashboard`).
Runs entirely on fixture data in `lib/data/fixtures.ts` — no Supabase connection, no n8n
calls, nothing sent anywhere. Purpose: validate a full dashboard information architecture
(navigation shell, analytics overview, inbox, settings) before wiring up real data.

## Run it

```bash
npm install   # if not already done
npm run dev
```

Open http://localhost:3000.

## What's real vs. simulated

| Piece | Behavior here |
|---|---|
| Navigation shell (sidebar, top bar, ⌘K/Ctrl+K command palette) | Fully functional client-side routing/navigation between `/overview`, `/inbox`, `/settings` — no backend involved by nature |
| Overview / analytics page | KPI cards, volume-over-time chart, category-breakdown chart — all computed client-side from `lib/data/fixtures.ts` via `lib/analytics.ts`; each chart has an accessible data-table toggle |
| Inbox list, category badges, summaries | Static fixture data matching the live schema's shape and enum values exactly; adds sort, category filter, and bulk mark-done/dismissed over the same in-memory data |
| Action item sidebar | In-memory state; mark done/dismissed/reopen — no backend write |
| Draft review modal | "Generate draft" simulates the webhook call (1.2s delay, ~15% simulated failure to exercise the error state); mark sent/discarded/reopen — no backend write |
| Search | Client-side substring match over subject/body — **not** the real `tsvector` full-text search, which is still an open question in the 007 proposal |
| Settings (theme, density) | Persisted to this browser's `localStorage` only — no backend write, no cross-device sync |

## Design system

Derived via the `ui-ux-pro-max` skill: Data-Dense Dashboard (BI/Analytics) blended with
Executive Dashboard KPI-row conventions, for a desktop-first productivity tool rather
than a marketing surface. Plus Jakarta Sans throughout, a neutral slate base with a blue
primary (trust, not flashy), a distinct color per email category / task / draft status,
and dedicated chart-series and KPI-trend tokens. Full dark mode via a `.dark` class on
`<html>` (managed centrally in `AppStateProvider.tsx`) with a `prefers-color-scheme`
fallback for the "system" option. Every token — badges, chart marks, KPI trends — is
verified against WCAG contrast thresholds (4.5:1 text, 3:1 non-text graphical marks) in
both themes. Tokens live in `app/globals.css`. Charts use Recharts.

## Deliberately not addressed here

Everything the 007 party review flagged as a BLOCK for production — access model
(service-role key vs. anon key), an auth gate, sanitizing rendered email content, the
real `search_vector` migration and its backfill — is out of scope for this prototype.
See `.specclaw/changes/007-web-dashboard/proposal.md` Open Questions before any of this
touches real data or a public deployment.
