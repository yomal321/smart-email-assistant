# Spec: Dashboard API Foundation (Backend Phase 0 of 6)

**Change:** 008-dashboard-api-foundation
**Created:** 2026-09-14
**Status:** 🟡 Draft

## Overview

This change resolves the one open blocker `CAPABILITIES.md` names: "which Supabase access model (anon key vs. service-role key) the real dashboard uses, and what gates access to it." The answer, per `BACKEND-REQUIREMENTS.md` §5.1, is neither key from the browser — a server-side API tier (Next.js Route Handlers) holds the service-role key, and a single-operator session cookie gates both the API tier and the dashboard pages themselves.

This change stands up that foundation and proves it end-to-end on one real (non-fixture) endpoint: `GET /api/sync`, which backs the sync clock already rendered in `ConcourseBar` and the Settings page. No other route, migration, or n8n workflow is touched — those are Phases 1–5, proposed and built one at a time after this lands.

## Requirements

### Functional Requirements

- **FR1 — Server-only Supabase client.** `gmail-dashboard/lib/supabase/server.ts` constructs a Supabase client from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` read from environment variables. The module imports the `server-only` package so any accidental import from a `"use client"` file fails the build, not just a review — the service-role key must never reach a client bundle.
- **FR2 — Hand-rolled session, not a library.** A session token is a signed payload — `{ exp: <unix ts> }` — verified with HMAC-SHA256 via the Web Crypto API (`crypto.subtle`), not Node's `crypto` module, so the same verification code runs identically in Next.js Edge Middleware and in Node-runtime Route Handlers. The signing secret is `SESSION_SECRET`, a new environment variable. No session-management npm dependency is added.
- **FR3 — Login.** `POST /api/auth/login` accepts `{ password: string }`, compares it to `DASHBOARD_LOGIN_SECRET` (an environment variable — the one operator's shared secret, not a database row), and on match sets an httpOnly, `SameSite=Lax` cookie carrying the FR2 session token with a fixed expiry (24h). A mismatch returns `401` with `{ "error": "invalid password" }` and sets no cookie.
- **FR4 — Login rate limiting.** An in-memory counter rejects login attempts with `429` once 10 failures occur within a 5-minute rolling window, for that window's duration — mirroring `006-draft-generation`'s FR3 global auth-failure cap. This is a best-effort deterrent, not a durable guarantee (see Notes).
- **FR5 — Logout.** `POST /api/auth/logout` clears the session cookie (empty value, `Max-Age=0`) and returns `200`.
- **FR6 — Deny-by-default auth guard.** `gmail-dashboard/middleware.ts` runs on every request. Requests to `/login` and `/api/auth/login` pass through unconditionally. Every other request is checked against the FR2 session cookie: page requests without a valid session redirect to `/login`; `/api/**` requests without a valid session return `401` JSON (`{ "error": "unauthorized" }`) with no page body. A present-but-expired-or-tampered cookie is treated identically to a missing one — never a `500`.
- **FR7 — Login page.** `/login` (`gmail-dashboard/app/login/page.tsx`) is a minimal client component: one password field, one submit button, posts to `/api/auth/login`, and on success redirects to `/`. No design investment beyond matching the existing dashboard shell's base styles — this is a placeholder, not a polished screen (per the proposal's Open Question, resolved in favor of minimal).
- **FR8 — `GET /api/sync`, real data.** `gmail-dashboard/app/api/sync/route.ts` queries `accounts` and `sync_outcomes` (both from migration `0001`, already applied) via the FR1 client and returns a `SyncState`-shaped JSON object:
  - `status`, `lastSyncAt` — derived from the single `accounts` row (`select * from accounts limit 1` — the product is explicitly single-mailbox, see Notes). No `accounts` row means "never connected": `status: "offline"`, `lastSyncAt: null`.
  - `failedCount` — `count(*) from sync_outcomes where outcome = 'failed' and occurred_at > now() - interval '30 days'`.
  - `error` — built from the most recent `sync_outcomes` row when `outcome = 'failed'`, else `null`.
  - `queueDepth`, `nextRetryAt` — returned as `0` and `null` respectively, with an inline code comment stating these have no backing column yet and are placeholders pending the counter table proposed in `BACKEND-REQUIREMENTS.md` §5.4 (a later phase). Never fabricated as a plausible-looking non-zero number.
- **FR9 — `SyncState.lastSyncAt` becomes nullable.** `gmail-dashboard/lib/data/types.ts`: `lastSyncAt: string` → `lastSyncAt: string | null`, to honestly represent the never-synced case FR8 introduces (fixtures are unaffected — they always model a connected account, so this is additive, not a fixture-breaking change).
- **FR10 — `useSyncState()` client hook.** `gmail-dashboard/lib/data/use-sync-state.ts` fetches `/api/sync` client-side and returns `{ data: SyncState | null, loading: boolean, error: string | null }`. This is the reference pattern later phases copy for their own routes — it is the one new thing this change teaches the codebase, not a one-off.
- **FR11 — Wire the two existing call sites.** `components/board/concourse-bar.tsx` and `app/settings/page.tsx` replace their direct `getSyncState()` fixture call with `useSyncState()`, rendering a minimal loading state (existing skeleton/placeholder pattern if one exists, else a simple text fallback) while `loading` is true, and not crashing when `error` is set. `components/station/sync-clock.tsx` renders `lastSyncAt === null` as "Never" rather than passing `null` into a date formatter. After this change, no production code path calls the fixture-backed `getSyncState()`.

### Non-Functional Requirements

- **NFR1 — Minimal new dependencies.** Exactly two new packages: `@supabase/supabase-js` (the client) and `server-only` (the import guard). No session/auth framework.
- **NFR2 — Constant-time-equivalent comparisons.** FR3's password check and FR2's signature verification both use primitives (`crypto.subtle.verify` / `timingSafeEqual`-equivalent) that do not leak timing information — mirroring the project's existing convention in `006-draft-generation`'s webhook auth.
- **NFR3 — n8n is untouched.** No file under `n8n/workflows/` changes. n8n continues writing to Postgres with its own direct credential, exactly as today; this change only adds a second, narrower reader (the dashboard's service-role-keyed server client) behind its own boundary.
- **NFR4 — No multi-user system.** One operator, one password, one session. No user table, no signup, no password reset flow — consistent with the project's documented single-user scope (`README.md`: "This is a personal, single-user project... assumes one mailbox owner who is also the operator").

## Acceptance Criteria

Each criterion must pass for the change to be considered complete.

- **AC1.** An unauthenticated `GET /` (or any other dashboard page) redirects to `/login`.
- **AC2.** An unauthenticated `GET /api/sync` returns `401` with `{ "error": "unauthorized" }` and no sync data in the body.
- **AC3.** `POST /api/auth/login` with the correct password returns `200`, sets a session cookie (httpOnly, confirmed via response headers), and a subsequent request carrying that cookie to `GET /api/sync` succeeds.
- **AC4.** `POST /api/auth/login` with the wrong password returns `401`, sets no cookie, and a subsequent request to `GET /api/sync` with no cookie still returns `401`.
- **AC5.** 10 consecutive failed login attempts within 5 minutes cause an 11th attempt — even with the correct password — to return `429` until the window elapses, confirming FR4's cap is global to the window, not per-request correctness.
- **AC6.** `POST /api/auth/logout` clears the cookie; a page request that previously succeeded while authenticated now redirects to `/login`.
- **AC7.** With a real `accounts` row and a mix of `sync_outcomes` rows (including at least one `failed` within 30 days) seeded in Supabase, an authenticated `GET /api/sync` returns a JSON object matching the `SyncState` shape, with `failedCount` matching the real count and `queueDepth`/`nextRetryAt` present as `0`/`null` — not omitted, not fabricated.
- **AC8.** With no `accounts` row at all, an authenticated `GET /api/sync` returns `200` with `status: "offline"` and `lastSyncAt: null` — not a `500`, and not a fabricated timestamp.
- **AC9.** `grep -rn "use client" gmail-dashboard | xargs grep -l "lib/supabase/server"` (or equivalent) returns zero matches — the service-role key's import path never crosses into client code. A production build (`next build`) succeeds, confirming `server-only`'s guard doesn't fire.
- **AC10.** `ConcourseBar` and `SettingsPage` render the sync clock / activity sections from live `GET /api/sync` data (confirmed via network inspection or by temporarily returning a distinctive value from the route and seeing it rendered) — and neither file imports `getSyncState` from `@/lib/data` any longer.
- **AC11.** Manually corrupting the session cookie's value (e.g. editing one character in the browser) results in the next request being treated as unauthenticated (AC1/AC2 behavior), never a server error.

## Edge Cases

- **No `accounts` row exists** (fresh database, ingestion never run) — AC8, `status: "offline"`, `lastSyncAt: null`, not a crash.
- **`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` missing at runtime** — the FR1 client module throws a clear, specific error message on first use (naming the missing variable), not a generic Supabase SDK stack trace.
- **Session cookie present but expired** — treated identically to absent (FR6), never a `500`.
- **Session cookie present but tampered** (signature doesn't verify) — same as expired: treated as unauthenticated (AC11).
- **Middleware runs on the Edge runtime by default** — FR2's Web Crypto choice is what keeps HMAC verification working there; a Node-`crypto`-based implementation would fail silently or not run at all in middleware.
- **Login rate-limit window and session expiry interacting** — independent: a rate-limited IP with an already-valid session is unaffected (FR4 only gates `/api/auth/login`, not authenticated requests elsewhere).
- **`sync_outcomes` has zero rows** (fresh account, renewal job hasn't run yet) — `failedCount: 0`, `error: null`, not an error.

## Dependencies

- `@supabase/supabase-js` (new) and `server-only` (new) — the only two new npm packages this change adds.
- Existing `accounts` and `sync_outcomes` tables from `supabase/migrations/0001_ingestion_schema.sql` — no new migration.
- Existing `SyncState` type and `getSyncState()` fixture function in `gmail-dashboard/lib/data/` — extended (FR9), not replaced; the fixture stays available for local development without a database connection.
- New environment variables (documented, not committed with real values): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `DASHBOARD_LOGIN_SECRET`.

## Notes

- **Single-account assumption (FR8) is deliberate, not a shortcut.** `README.md` states the project "is not multi-tenant... assumes one mailbox owner." `select * from accounts limit 1` is the correct query for that scope, not a placeholder for a future `account_id`-scoped version — later phases that need per-account routing (should the product ever grow beyond one mailbox) would revisit this explicitly, not inherit it by accident.
- **`queueDepth`/`nextRetryAt` placeholders (FR8) are an honest gap, not an oversight.** `BACKEND-REQUIREMENTS.md` §5.4 already scopes the real counter table to a later migration (`0010`, Phase 4). Returning `0`/`null` now with a code comment is more honest than either fabricating plausible-looking numbers or blocking this endpoint on a migration that's out of scope for Phase 0.
- **The in-memory login rate limiter (FR4) is a known-weak mitigation if this ever runs on a serverless platform** (Vercel, per `architecture.md`'s hosting plan) — function instances don't share memory, so the counter can reset on a cold start. It is included anyway because it mirrors an established project convention (`006-draft-generation`) and costs nothing to add; the real defense is the password itself. A durable (KV- or DB-backed) limiter is a fast follow if and when this ships to serverless, not a blocker for this change. See `design.md`'s Risks section.
- **Session design deliberately mirrors `006-draft-generation`'s shared-secret pattern** (constant-time-equivalent comparison, a global failure-rate cap) rather than introducing a new security idiom — this project has one established way to guard a secret-gated boundary, and this change reuses it rather than inventing a second.
- This spec does not touch any of the ~44 other API routes, the 7 later migrations, or any n8n workflow — see `proposal.md`'s Scope for the explicit boundary.
