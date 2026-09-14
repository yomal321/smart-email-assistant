# Design: Dashboard API Foundation (Backend Phase 0 of 6)

**Change:** 008-dashboard-api-foundation
**Created:** 2026-09-14

## Technical Approach

Two pieces, deliberately kept separable: a **trust boundary** (session auth + a server-only Supabase client) and a **reference endpoint** (`GET /api/sync`) that proves the boundary works end-to-end and gives every later phase a pattern to copy.

The trust boundary follows `BACKEND-REQUIREMENTS.md` §5.1's recommendation exactly: the service-role key never leaves the server. Session auth is hand-rolled with the Web Crypto API rather than a library — this project already has a precedent for exactly this shape of problem (`006-draft-generation`'s shared-secret, constant-time-checked, rate-capped webhook auth), and Web Crypto is the one primitive that behaves identically in both runtimes this code has to run in: Next.js Edge Middleware (no Node builtins) and Node-runtime Route Handlers.

The reference endpoint intentionally does not try to fully populate `SyncState` — two fields (`queueDepth`, `nextRetryAt`) have no backing column until a later-phase migration. The design keeps those as clearly-commented placeholders rather than stretching this phase to include a migration that `BACKEND-REQUIREMENTS.md` §5.4 already scopes elsewhere. This is Phase 0's job: prove the pattern honestly, not fake completeness.

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           Browser (dashboard)             │
                    │  ConcourseBar / SettingsPage / SyncClock   │
                    │        useSyncState() → fetch()            │
                    └───────────────────┬─────────────────────┘
                                        │  session cookie (httpOnly)
                                        ▼
                    ┌─────────────────────────────────────────┐
                    │      gmail-dashboard/middleware.ts         │
                    │   deny-by-default; verifies session via    │
                    │   crypto.subtle HMAC (Edge runtime)         │
                    └───────────────────┬─────────────────────┘
                     unauth'd ──────────┤──────────── authenticated
                     → /login           │             → next()
                                        ▼
        ┌───────────────────────────────────────────────────────┐
        │                 app/api/** (Route Handlers)              │
        │  /api/auth/login   /api/auth/logout   /api/sync (NEW)    │
        └───────────────────────────┬───────────────────────────┘
                                    │  lib/supabase/server.ts
                                    │  (service-role key, server-only)
                                    ▼
                    ┌─────────────────────────────────────────┐
                    │         Supabase · PostgreSQL              │
                    │      accounts · sync_outcomes (0001)        │
                    └───────────────────▲─────────────────────┘
                                        │  direct Postgres credential
                                        │  (unchanged — NFR3)
                    ┌───────────────────┴─────────────────────┐
                    │              n8n workflows                 │
                    └─────────────────────────────────────────┘
```

The browser never holds a database credential — only the session cookie, which authorizes it to call the dashboard's own API, not Supabase directly. This changes the data-flow assumption baked into `architect/02-container.md`'s current diagram (`web -->|"Reads emails and tasks / Supabase client"| db`) — that line described direct browser-to-Supabase access, which this change deliberately replaces with an API-tier hop. `architect/02-container.md` and `architect/03b-component-web-dashboard.md` are updated to match (see File Changes Map).

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `gmail-dashboard/lib/supabase/server.ts` | Create | Server-only Supabase client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; imports `server-only` to hard-fail any client-side import |
| `gmail-dashboard/lib/auth/session.ts` | Create | `signSession()` / `verifySession()` using `crypto.subtle` HMAC-SHA256; cookie name + options constants |
| `gmail-dashboard/lib/data/types.ts` | Edit | `SyncState.lastSyncAt: string` → `string \| null` |
| `gmail-dashboard/middleware.ts` | Create | Deny-by-default guard for pages + `/api/**`, allow-listing `/login` and `/api/auth/login` |
| `gmail-dashboard/app/api/auth/login/route.ts` | Create | `POST` — password check, rate limit, sets session cookie |
| `gmail-dashboard/app/api/auth/logout/route.ts` | Create | `POST` — clears session cookie |
| `gmail-dashboard/app/login/page.tsx` | Create | Minimal login form (client component) |
| `gmail-dashboard/app/api/sync/route.ts` | Create | `GET` — real query over `accounts` + `sync_outcomes` |
| `gmail-dashboard/lib/data/use-sync-state.ts` | Create | Client hook: `fetch("/api/sync")` → `{ data, loading, error }` |
| `gmail-dashboard/components/board/concourse-bar.tsx` | Edit | `getSyncState()` → `useSyncState()`, loading/error handling |
| `gmail-dashboard/app/settings/page.tsx` | Edit | `getSyncState()` → `useSyncState()`, loading/error handling |
| `gmail-dashboard/components/station/sync-clock.tsx` | Edit | Render `lastSyncAt === null` as "Never" |
| `gmail-dashboard/package.json` | Edit | Add `@supabase/supabase-js`, `server-only` |
| `gmail-dashboard/.env.local.example` | Create | Documents required env vars — no real secrets, safe to commit |
| `gmail-dashboard/README.md` | Edit | Document login flow + required env vars |
| `architect/02-container.md` | Edit | Data-flow line: dashboard reads via its own API tier, not a direct browser Supabase client |
| `architect/03b-component-web-dashboard.md` | Edit | "Data Access Layer" component note updated to reflect the Route Handler boundary |

`gmail-dashboard/.env.local` (real local secrets) is edited locally during build but is already gitignored — not part of the diff.

## Data Model Changes

None. No migration in this change — `accounts` and `sync_outcomes` already exist from `0001_ingestion_schema.sql`. The only schema-adjacent change is the TypeScript-level `SyncState.lastSyncAt` nullability (FR9), not a database change.

## API Changes

**`POST /api/auth/login`**
```
Request:  { "password": "<string>" }
200:      Set-Cookie: <session>; HttpOnly; SameSite=Lax; Max-Age=86400
401:      { "error": "invalid password" }
429:      { "error": "too many attempts, try again later" }
```

**`POST /api/auth/logout`**
```
200:      Set-Cookie: <cleared>; Max-Age=0
```

**`GET /api/sync`**
```
401 (unauthenticated, via middleware): { "error": "unauthorized" }
200:
{
  "status": "synced" | "syncing" | "failed" | "offline",
  "lastSyncAt": "<ISO 8601>" | null,
  "queueDepth": 0,              // placeholder — no backing column yet, see spec FR8
  "failedCount": <int>,
  "nextRetryAt": null,          // placeholder — no backing column yet, see spec FR8
  "error": { "code": "...", "message": "..." } | null
}
```

## Key Decisions

1. **Hand-rolled Web Crypto session, not a library.** Zero new session-management dependency; identical verification code in Edge middleware and Node route handlers; mirrors the project's existing `006-draft-generation` security idiom instead of introducing a second one.
2. **Session payload carries only `{ exp }`.** No user id, no roles — there is exactly one operator, so the simplest tamper-evident token that still expires is correct; anything richer would be state with no reader.
3. **Single-account query (`limit 1`) for `GET /api/sync`.** Matches the project's explicit single-mailbox scope (`README.md`). Not scoped by `account_id` — there's nothing to scope by yet.
4. **`queueDepth`/`nextRetryAt` shipped as honest placeholders.** Real values need the counter table `BACKEND-REQUIREMENTS.md` §5.4 scopes to a later migration (`0010`). Faking plausible numbers here would make Phase 0 look more complete than it is and would need to be silently corrected later.
5. **Middleware is deny-by-default with an explicit allow-list**, not the reverse. As routes multiply in later phases, a new route is protected automatically unless someone deliberately exempts it — the safer failure direction.
6. **Architecture docs get a small, honest correction.** `architect/02-container.md` currently documents "Web Dashboard reads Supabase directly via a Supabase client" — this change is exactly the decision that supersedes that, so the diagram is updated rather than left to drift from what's actually built.

## Risks & Mitigations

- **Risk: in-memory login rate limiter (`spec.md` FR4) doesn't survive across serverless instances.** If this ever deploys to Vercel (per `architecture.md`'s hosting plan), each cold-started function instance gets its own counter, weakening the cap. *Mitigation:* documented as best-effort in `spec.md` Notes, not claimed as a hard guarantee; the real defense is `DASHBOARD_LOGIN_SECRET`'s strength. A durable (KV/DB-backed) limiter is explicitly deferred, not silently assumed solved.
- **Risk: Edge middleware's restricted runtime silently breaking auth.** If session verification were implemented with Node's `crypto` module instead of Web Crypto, it could fail to run — or throw — inside middleware, potentially failing open or hard-crashing every request. *Mitigation:* Key Decision 1 locks in Web Crypto from the start; `tasks.md` includes verifying the login → protected-request round trip through the actual middleware (not just unit-testing sign/verify in isolation).
- **Risk: the service-role key leaking into a client bundle later**, e.g. a future change imports `lib/supabase/server.ts` from a `"use client"` file without realizing it. *Mitigation:* the `server-only` package (Key Decision 1's sibling) turns that mistake into a build failure, not a silent leak — enforced by `spec.md` AC9.
- **Risk: a single shared operator password with no rotation or MFA.** Acceptable for this phase — `README.md`'s own "Notes" section already documents disabled RLS and shared secrets as deliberate, scoped consequences of being a single-user personal project. Not re-litigated here; flagged so it's a decision, not an oversight.

## Grounding sources

- `CAPABILITIES.md` — "The Phase 5 prototype deliberately does **not** address: which Supabase access model (anon key vs. service-role key) the real dashboard uses... Until that's decided, the dashboard cannot move from fixture data to the live database." — names the exact blocker this change resolves.
- `BACKEND-REQUIREMENTS.md` §5.1 — "**Recommendation: neither from the browser.** Add a server tier — Next.js **Route Handlers**... holding the Supabase service-role key server-side" — the approach adopted verbatim.
- `README.md` — "Row-level security is intentionally off across the project: n8n connects with a direct Postgres credential... Single-user by design." — grounds Key Decision 3 (single-account query) and Risk 4 (shared password acceptable).
- `gmail-dashboard/lib/data/index.ts` (header comment) — "Views import only from here... never from `./fixtures/*` — so a real Gmail + LLM backend can replace the implementation of these functions without touching a single component." — the seam `useSyncState()` is designed to preserve.
- `.specclaw/changes/006-draft-generation/spec.md` FR2/FR3 — "The shared secret is checked, with a constant-time comparison... Once the threshold is hit, all requests... are rejected" — the precedent Key Decision 1 and `spec.md` FR3/FR4 mirror.
