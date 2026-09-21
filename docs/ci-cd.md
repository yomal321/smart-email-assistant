# CI/CD

One workflow, [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml), covers
all three deployables in this repo.

```
push / PR
   │
   ├─ dashboard    npm ci → lint → tsc --noEmit → next build
   ├─ migrations   naming, ordering, and "already merged" immutability
   └─ n8n          JSON parses, node names unique, connections resolve, no inline secrets
            │
            ├─ PR ────────────► preview      vercel deploy (preview URL)
            │
            └─ main ──────────► migrate      supabase db push
                                    │
                                    └────────► production  vercel deploy --prod → GET /login
```

Schema is pushed **before** the app. Migrations are additive and forward-only, so
new schema under old code is safe for the few seconds between the two jobs; old
schema under new code is not.

## One-time setup

### 1. Repository secrets

Settings → Secrets and variables → Actions:

| Secret | Where to get it |
| --- | --- |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` → `orgId` (run `vercel link` locally if absent) |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` → `projectId` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | Supabase project URL, the `<ref>` in `https://<ref>.supabase.co` |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database → password |

`.vercel/` is gitignored — the IDs live in it locally and as secrets in CI.

### 2. Application environment variables

These are **not** GitHub secrets. `vercel pull` fetches them from the Vercel
project at deploy time, so they are set once in Vercel → Project → Settings →
Environment Variables, for both Preview and Production:

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
`DASHBOARD_LOGIN_SECRET`, `N8N_DRAFT_WEBHOOK_URL`, `DRAFT_WEBHOOK_SECRET`,
`N8N_RESYNC_WEBHOOK_URL`, `RESYNC_WEBHOOK_SECRET`,
`N8N_CALENDAR_PUSH_WEBHOOK_URL`, `CALENDAR_PUSH_WEBHOOK_SECRET`.

See [`gmail-dashboard/.env.local.example`](../gmail-dashboard/.env.local.example)
for what each one does. `DRAFT_WEBHOOK_SECRET` and `RESYNC_WEBHOOK_SECRET` each
have a second copy in n8n's own environment — rotate both sides together.

### 3. Turn off Vercel's own Git deploys

Otherwise every push to `main` deploys twice: once from Vercel's Git
integration, once from this workflow — and Vercel's copy is not gated on the
tests. In Vercel → Project → Settings → Git, set **Ignored Build Step** to
`exit 0`, or commit a `vercel.json` with:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

### 4. Branch protection (optional but the point of the pipeline)

Settings → Branches → protect `main`, requiring the `Dashboard (lint, types,
build)`, `Supabase migrations` and `n8n workflows` checks.

### 5. Deploy approvals (optional)

The `migrate` and `production` jobs both target the `production` GitHub
environment. Adding a required reviewer there (Settings → Environments) turns
every push to `main` into a one-click approval before anything touches the live
database or site.

## What the checks catch

**`scripts/ci/check-migrations.mjs`** — `supabase db push` applies files in
lexicographic order and records each version as applied. So a missing zero-pad
or reused number makes a fresh database build in a different order than
production did, and editing a merged migration changes nothing anywhere except
the developer's own machine. Both are rejected. A numbering gap is a warning,
not a failure — usually a dropped migration, occasionally a lost rebase.

**`scripts/ci/check-n8n-workflows.mjs`** — the workflow JSON is exported from
the n8n editor and committed by hand. A truncated export, a renamed node that
left a dangling connection, or a credential pasted inline instead of read from
`$env` are all invisible in a 2000-line JSON diff. Note that CI only validates
these files; **importing them into n8n is still manual.**

**The dashboard build runs with no secrets**, deliberately. Every env var is
read lazily at request time (`lib/supabase/server.ts`, `lib/auth/session.ts`),
so if the build ever starts needing one, something began reading `process.env`
at module scope — which would also break a Vercel build with a missing var.

## Running the checks locally

```bash
node scripts/ci/check-migrations.mjs          # add a base ref to also check immutability
node scripts/ci/check-n8n-workflows.mjs
cd gmail-dashboard && npm run lint && npx tsc --noEmit && npm run build
```
