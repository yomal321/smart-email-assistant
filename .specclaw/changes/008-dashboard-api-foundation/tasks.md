# Tasks: Dashboard API Foundation (Backend Phase 0 of 6)

**Change:** 008-dashboard-api-foundation
**Created:** 2026-09-14
**Total Tasks:** 10

## Summary

Four waves. Wave 1 lays the two independent primitives (Supabase server client, session signing) plus a small type change everything downstream needs. Wave 2 builds the auth surface and the one real endpoint on top of Wave 1. Wave 3 wires the dashboard's existing sync-clock UI to that endpoint. Wave 4 documents what changed. No task touches a migration, an n8n workflow, or any route beyond `/api/sync` and `/api/auth/*`.

## Tasks

### Wave 1 — Server primitives & type contract

- [x] `T1` — Server-only Supabase client
  - Files: `gmail-dashboard/lib/supabase/server.ts` (create), `gmail-dashboard/package.json` (add `@supabase/supabase-js`, `server-only`)
  - Estimate: medium
  - Kind: impl
  - Notes: Throws a specific, named error if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset (spec Edge Cases). Import `server-only` at the top of the file per design Key Decision 1 — this is what makes AC9 a build failure instead of a silent leak.

- [x] `T2` — Session signing (Web Crypto HMAC)
  - Files: `gmail-dashboard/lib/auth/session.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Notes: `signSession()` / `verifySession()` using `crypto.subtle`, not Node's `crypto` module — must run correctly in both Edge middleware and Node route handlers (spec FR2, design Risk 2). Payload is `{ exp }` only. Reads `SESSION_SECRET` from the environment.

- [x] `T3` — `SyncState.lastSyncAt` becomes nullable
  - Files: `gmail-dashboard/lib/data/types.ts`
  - Estimate: small
  - Kind: refactor
  - Notes: `lastSyncAt: string` → `lastSyncAt: string | null` (spec FR9). Confirm `gmail-dashboard/lib/data/fixtures/sync.ts` still type-checks unchanged — all fixture values are non-null, so this is additive only.

### Wave 2 — Auth surface + the one real endpoint

- [x] `T4` — Auth guard middleware
  - Files: `gmail-dashboard/middleware.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes: Deny-by-default (design Key Decision 5). Allow-list exactly `/login` and `/api/auth/login`. Page requests without a valid session redirect to `/login`; `/api/**` requests return `401` JSON. A present-but-invalid cookie must be treated the same as absent — never throw (spec FR6, AC11).

- [x] `T5` — Login + logout routes
  - Files: `gmail-dashboard/app/api/auth/login/route.ts` (create), `gmail-dashboard/app/api/auth/logout/route.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes: Login checks `DASHBOARD_LOGIN_SECRET` with a constant-time-equivalent comparison, applies the 10-failures/5-minute cap (spec FR3/FR4), and sets the httpOnly `SameSite=Lax` cookie via T2's `signSession()`. Logout clears it. Mirror `n8n/workflows/draft-generation.json`'s auth-failure-cap logic in spirit, not by copying n8n JSON.

- [x] `T6` — Login page
  - Files: `gmail-dashboard/app/login/page.tsx` (create)
  - Estimate: small
  - Kind: impl
  - Depends: T5
  - Notes: One password field, one submit button, posts to `/api/auth/login`, redirects to `/` on `200`. Placeholder-level styling only (spec FR7) — reuse existing base classes from the dashboard shell, no new design work.

- [x] `T7` — `GET /api/sync`
  - Files: `gmail-dashboard/app/api/sync/route.ts` (create)
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T3
  - Notes: `select * from accounts limit 1` (design Key Decision 3) plus a `sync_outcomes` count/latest-row query, mapped exactly per spec FR8. `queueDepth`/`nextRetryAt` are `0`/`null` with an inline comment citing `BACKEND-REQUIREMENTS.md` §5.4 (design Key Decision 4) — do not invent values. No `accounts` row → `200` with `status: "offline"`, `lastSyncAt: null`, never a `500` (AC8).

### Wave 3 — Wire the dashboard to live data

- [x] `T8` — `useSyncState()` hook
  - Files: `gmail-dashboard/lib/data/use-sync-state.ts` (create)
  - Estimate: small
  - Kind: impl
  - Depends: T7
  - Notes: `fetch("/api/sync")` client-side, returns `{ data: SyncState | null, loading: boolean, error: string | null }`. This is the pattern every later phase's read hooks copy — keep it generic enough to be an obvious template, not overly specific to sync state.

- [x] `T9` — Wire the sync clock to live data
  - Files: `gmail-dashboard/components/board/concourse-bar.tsx`, `gmail-dashboard/app/settings/page.tsx`, `gmail-dashboard/components/station/sync-clock.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T8, T3
  - Notes: Replace `getSyncState()` imports/calls with `useSyncState()` in the first two files; handle `loading` (simple inline fallback, no new skeleton component needed) and `error` (don't crash) without changing the visual result once loaded. `SyncClock` renders `lastSyncAt === null` as "Never" instead of formatting `null` (spec FR11). After this task, `grep -rn "getSyncState" gmail-dashboard/components gmail-dashboard/app` should return nothing.

### Wave 4 — Documentation

- [x] `T10` — Document the new env vars, login flow, and corrected data-flow diagrams
  - Files: `gmail-dashboard/.env.local.example` (create), `gmail-dashboard/README.md` (edit), `architect/02-container.md` (edit), `architect/03b-component-web-dashboard.md` (edit)
  - Estimate: small
  - Kind: docs
  - Depends: T1, T4, T7
  - Notes: `.env.local.example` lists `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `DASHBOARD_LOGIN_SECRET` with placeholder values and one-line descriptions — no real secrets. `README.md` gets a short "Local setup" note on logging in. The two `architect/` files get their data-flow line corrected per design.md's Architecture section (dashboard reads via its own API tier, not a direct browser-side Supabase client) — a small, targeted edit, not a diagram rewrite.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
