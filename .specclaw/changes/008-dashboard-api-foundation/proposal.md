# Proposal: Dashboard API Foundation (Backend Phase 0 of 6)

**Created:** 2026-09-14
**Status:** 🟡 Draft

## Problem

`gmail-dashboard/` is a UI-complete Next.js prototype that reads 100% of its data from hardcoded fixtures in `lib/data/fixtures/` — no route talks to Supabase, no route talks to n8n. `BACKEND-REQUIREMENTS.md` (root of this repo) is a full gap analysis of what's needed to make the dashboard live: ~7 new migrations, ~45 API routes, edits to 5 of 7 n8n workflows, and 4 new workflows, sequenced into 6 phases (§6).

That is too much to build, verify, and land as one change — the earlier phases of this project (002 through 007) were each scoped to one deliverable, and this backend build-out should follow the same discipline. Before any of the ~45 routes in later phases can be built, one decision has to be resolved and one piece of infrastructure has to exist: **how does the browser talk to Supabase at all?**

`CAPABILITIES.md` already flags this as the project's one open blocker: anon key vs. service-role key, with Row Level Security off by design (single-user product, no multi-tenant boundary to enforce). Today neither key is wired into the dashboard — there is no server tier, and no session/auth of any kind gates the app. Building any of the Phase 1+ data routes without settling this first means either re-deciding it under later time pressure, or building routes against a foundation that gets thrown away.

## Proposed Solution

Stand up the minimal server-side foundation that every later phase's API routes will sit on top of, and prove the end-to-end pattern with one real (non-fixture) endpoint — without attempting to wire up the other ~44 routes cataloged in `BACKEND-REQUIREMENTS.md` §5.3. That wiring is explicitly later phases' work.

- **Access model (resolves the `CAPABILITIES.md` blocker):** per `BACKEND-REQUIREMENTS.md` §5.1, the service-role Supabase key is held **only** server-side, inside Next.js Route Handlers under `gmail-dashboard/app/api/**`. The browser never receives a database key. RLS staying off is acceptable because the API layer *is* the trust boundary, not Postgres. n8n is unaffected — it keeps writing to Postgres directly, exactly as it does today.
- **Auth:** a single-user session — one operator, one cookie, no multi-user account system. A login route sets a signed, httpOnly session cookie; a middleware/guard checks it on every `/api/**` request and on the dashboard's own pages, redirecting to a login screen when absent. Credentials (the one operator's password/secret) are an environment variable, not a database row — there is exactly one user and no self-service signup.
- **Supabase server client:** a small server-only module (e.g. `gmail-dashboard/lib/supabase/server.ts`) that constructs a Supabase client from the service-role key read from environment variables, importable only from Route Handlers / server components — never from a `"use client"` file.
- **Prove the pattern on one real endpoint:** pick the simplest existing read — `GET /api/sync` backing `getSyncState()` (reads directly off the `accounts` + `sync_outcomes` tables that already exist, no new migration needed) — and wire it end-to-end: Route Handler → Supabase server client → real query → JSON response, with the sync-clock UI component switched from the fixture call to a `fetch("/api/sync")`. This is the reference implementation later phases copy, not a instruction to migrate every route now.
- **Everything else stays on fixtures.** All other routes/components keep reading `lib/data/fixtures/*` unchanged until their own phase lands.

## Scope

### In Scope
- Session/auth: login route, session cookie (signed, httpOnly), auth guard/middleware in front of `/api/**` and the dashboard pages
- `gmail-dashboard/lib/supabase/server.ts` — server-only Supabase client using the service-role key
- Environment variable wiring: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (or equivalent), the single operator's login secret — added to `.env.local` (already gitignored) and documented
- One real endpoint: `GET /api/sync`, replacing the fixture-backed `getSyncState()` call in the sync-clock component
- A login screen (minimal — one credential field, no styling investment beyond matching the existing dashboard shell)
- Basic error/loading handling for the one wired endpoint (the general loading/error pattern for all routes is Phase 1+ work per `BACKEND-REQUIREMENTS.md` §5.5, but this proposal's one endpoint needs to demonstrate it)

### Out of Scope
- Migrations `0005`–`0011` (message enrichment, threads/contacts, commitments, drafts/tasks enrichment, rules/settings/activity, search) — Phases 1–4
- The other ~44 API routes cataloged in `BACKEND-REQUIREMENTS.md` §5.3 (messages, action items, drafts, follow-ups, contacts, overview/analytics, rules, settings) — Phases 1–5
- Any n8n workflow edits or new workflows — none of Phase 0 touches `n8n/workflows/`
- Rewiring `lib/data/index.ts`'s other 21 functions or the four React providers — Phase 1+ (§5.5)
- Multi-user accounts, OAuth login, password reset flows — this is a single-operator product; a full auth system is not the ask
- Deciding any of the 7 open product questions in `BACKEND-REQUIREMENTS.md` §7 (category vocabulary, send-vs-draft, etc.) — those gate later phases, not this one

## Impact

- **Files affected:** ~6–9 (new: auth route(s), session/middleware guard, `lib/supabase/server.ts`, `app/api/sync/route.ts`, login page; edited: sync-clock component, `.env.local.example` or docs, `lib/data/index.ts` for the one function)
- **Complexity:** small
- **Risk:** low — no schema changes, no n8n changes, no change to any other route's behavior; the one new endpoint reads existing, already-migrated tables (`accounts`, `sync_outcomes`)

## Open Questions

- Session mechanism: a hand-rolled signed cookie, or a lightweight library (e.g. `iron-session`)? Recommend the smallest dependency that does httpOnly + signed cookies well, since this is a single-user gate, not a full auth system.
- Where does the operator's login secret live for local dev vs. deployment (Vercel env vars, per `architecture.md`'s existing hosting plan)? Needs a documented convention, not just a `.env.local` entry that's easy to lose.
- Does the login page need to be a real screen now, or is a temporary/minimal placeholder acceptable until Phase 4 (Settings) gives auth a proper home in the UI? Recommend minimal placeholder — polish is not this phase's job.

---

**To proceed:** Review this proposal and approve to begin planning.
