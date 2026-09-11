# Smart Email Assistant — Dashboard prototype

UI/UX prototype for Phase 5 (`.specclaw/changes/007-web-dashboard`). Runs entirely on
fixture data in `lib/data/fixtures.ts` — no Supabase connection, no n8n calls, nothing
sent anywhere. Purpose: validate the inbox/action-item/draft-review/search interaction
design before wiring up real data.

## Run it

```bash
npm install   # if not already done
npm run dev
```

Open http://localhost:3000.

## What's real vs. simulated

| Piece | Behavior here |
|---|---|
| Inbox list, category badges, summaries | Static fixture data matching the live schema's shape and enum values exactly |
| Action item sidebar | In-memory state; mark done/dismissed/reopen — no backend write |
| Draft review modal | "Generate draft" simulates the webhook call (1.2s delay, ~15% simulated failure to exercise the error state); mark sent/discarded/reopen — no backend write |
| Search | Client-side substring match over subject/body — **not** the real `tsvector` full-text search, which is still an open question in the 007 proposal |

## Design system

Derived via the `ui-ux-pro-max` skill for an "Email Client" / productivity-tool product
type: Flat Design + Minimalism with subtle micro-interactions, Plus Jakarta Sans, a
neutral slate base with a blue primary (trust, not flashy), and a distinct color per
email category / task / draft status. Tokens live in `app/globals.css`.

## Deliberately not addressed here

Everything the 007 party review flagged as a BLOCK for production — access model
(service-role key vs. anon key), an auth gate, sanitizing rendered email content, the
real `search_vector` migration and its backfill — is out of scope for this prototype.
See `.specclaw/changes/007-web-dashboard/proposal.md` Open Questions before any of this
touches real data or a public deployment.
