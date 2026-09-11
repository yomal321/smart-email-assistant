# Proposal: Outlook Ingestion (Phase 1b)

**Created:** 2026-09-08
**Status:** 🟡 Draft

## Problem

`002-ingestion` proved the ingestion pipe — notification, fetch, normalize, write, renew, recover — end-to-end against Gmail. But the umbrella proposal's (`001-smart-email-assistant`) Phase 1 success criterion is explicit: **both inboxes syncing reliably on push, not polling.** Gmail alone is half of Phase 1, not all of it. Nothing downstream (triage, action extraction, drafting) can treat "the inbox" as unified while one of the two providers it's supposed to unify isn't wired in yet.

`002-ingestion`'s own spec and schema were deliberately built provider-agnostic for this moment: `emails.provider` is an unconstrained text column ready to carry `'outlook'` as a second value, and the normalization step is a separately invocable sub-workflow rather than inlined into the Gmail-specific trigger. This change is that follow-on, now that the Gmail path is validated in production.

One concrete schema gap this proposal surfaces from reading `0001_ingestion_schema.sql` directly: `accounts.provider` carries `check (provider in ('gmail'))` — a hard constraint, not just a convention. Adding Outlook requires a small migration to widen that check, which `emails.provider` (unconstrained) does not need. This is smaller than a rewrite, but it is a migration, and should be scoped as one rather than assumed away.

## Proposed Solution

Push-driven, read-only ingestion from a Microsoft 365 / Outlook.com account into the same `emails` table Gmail already writes to, orchestrated by n8n, mirroring `002-ingestion`'s validated pattern with the provider-specific mechanics swapped:

| Gmail (002, shipped) | Outlook (003, this change) |
|---|---|
| `users.watch()` + Google Cloud Pub/Sub | Microsoft Graph webhook subscription (`/subscriptions`) |
| OIDC token verification (audience + issuer) | `clientState` shared-secret verification on each notification |
| `historyId` cursor via `history.list` | Delta query cursor (`deltaLink`) via `/messages/delta` |
| n8n native Gmail OAuth2 credential | n8n native Microsoft Outlook OAuth2 credential |
| Renewal every 6h against `subscription_expires_at` | Renewal every 6h against `subscription_expires_at` — Graph mail subscriptions max out around 4230 minutes (~2.9 days), well inside a 6h cadence, same margin logic as Gmail's ~7-day window |
| Re-register + bounded catch-up on failed renewal | Re-register + bounded catch-up (`/messages/delta` from last cursor; fall back to a time-filtered `/messages` list if the delta token has expired) |

**Reused as-is, not rebuilt:** the `emails` table, the `sync_outcomes` log, the dedup constraint (`unique (account_id, provider, provider_message_id)` with `ON CONFLICT DO NOTHING`), and — most importantly — the **Email Normaliser** sub-workflow's role in the pipeline. Whether Email Normaliser itself gains an Outlook branch or a distinct "Outlook Normaliser" sub-workflow is called instead is a `/specclaw:plan`-level design decision, not resolved here (see Open Questions) — either way it must land on the identical `emails` row shape Gmail already populates, since that shape is what makes both providers a unified inbox rather than two schemas glued together downstream.

**Credential ownership** follows FR6's precedent unchanged: n8n's native Microsoft Outlook OAuth2 credential is the sole owner of the token and its refresh; `accounts` holds only a reference (`n8n_credential_id`) plus sync state — never token material. Requested scope is read-only (`Mail.Read`), mirroring Gmail's `gmail.readonly` minimum-necessary-scope precedent.

**Schema change required:** `accounts.provider`'s check constraint must be widened from `check (provider in ('gmail'))` to include `'outlook'`. `emails.provider` needs no change — it was already left unconstrained for exactly this. No other column changes are anticipated; Outlook's `clientState` secret and delta cursor fit the existing `n8n_credential_id`-adjacent columns and `sync_cursor` (a generic text column, not Gmail-typed) respectively.

**Done when** — same same-day/multi-day split `002-ingestion` used:
- *Same-day:* a manually sent test email to the target Outlook account appears normalized in `emails` within seconds via a live Graph webhook delivery (not polling), and a notification with a missing/invalid `clientState` is confirmed dropped before fetch.
- *Same-day:* replaying the same notification results in exactly one `emails` row for that message (constraint-enforced, not workflow-enforced).
- *Multi-day:* at least one renewal cycle for the Outlook subscription is observed to fire and succeed.
- *No new criterion needed for token-material exposure* — AC5's schema review from `002-ingestion` already covers `accounts` for both providers once the constraint migration lands; re-running it after this change ships is the confirmation, not a new acceptance criterion.

## Scope

### In Scope
- Microsoft Graph OAuth via n8n's native Outlook node (credential store is sole owner of the token/refresh); Graph webhook subscription creation against the `/me/mailFolders('Inbox')/messages` (or equivalent) resource, with `clientState` verification and HTTPS-only endpoint requirement
- Explicit fetch stage per notification using a per-account delta cursor (`sync_cursor` reused, storing a `deltaLink` rather than Gmail's `historyId`)
- Normalization targeting the existing `emails` schema — no new columns beyond what `002-ingestion` already committed for provider-agnostic use
- Scheduled renewal workflow (same 6-hour cadence as Gmail's, reusing the pattern, not the workflow file) reading `accounts.subscription_expires_at`; re-registration on failed renewal followed by a bounded catch-up fetch, with the resulting gap window recorded in `resync_gap_start`/`resync_gap_end`
- `sync_outcomes` rows (`renewed` / `re-registered` / `failed`) for the Outlook account, same schema, same semantics
- Migration: widen `accounts.provider`'s check constraint to `check (provider in ('gmail', 'outlook'))`
- Target account: TBD — needs a personal Outlook.com or Microsoft 365 mailbox nominated before `/specclaw:plan` (see Open Questions)

### Out of Scope
- Any AI/LLM processing — unchanged from `002-ingestion`'s exclusion, still a later change against `001-smart-email-assistant`
- Next.js frontend or any dashboard UI
- Cross-provider label/folder reconciliation (e.g. treating Gmail's "Inbox" label and Outlook's Inbox folder as one concept) — each provider's native labels/folders are stored as-is, same lossless-not-unified approach `002-ingestion` took for Gmail labels
- Historical backfill beyond the bounded catch-up fetch — same deferral as `002-ingestion`
- Push-based alerting on sync failure — still deferred, `sync_outcomes` remains the pull-based signal for both providers
- Deciding whether Email Normaliser becomes multi-provider or Outlook gets its own normaliser sub-workflow — a `/specclaw:plan` design decision, not a proposal-level one

## Impact

- **Files affected:** ~6–9 (estimated) — one or two new/modified n8n workflow JSON exports (Outlook ingestion trigger + renewal/recovery, and either an extended or new normaliser), one migration file (`accounts.provider` constraint widen), a setup runbook mirroring `docs/setup/gmail-ingestion-setup.md`'s structure for the Outlook-specific provisioning steps (Azure App Registration, Graph API permissions, subscription creation). Smaller than `002-ingestion` since the schema, dedup logic, and health-visibility pattern are all reused rather than designed from scratch.
- **Complexity:** medium — one new OAuth/webhook integration with its own provider-specific renewal window and cursor semantics (delta query vs. `history.list`), but no new architectural pattern; this is the second instance of a pattern already proven once, not a first instance.
- **Risk:** medium — concentrated in Microsoft-specific mechanics: Azure App Registration and Graph API consent, Graph subscription's shorter (~3-day) max lifetime versus Gmail's ~7-day window (mitigated by the same 6-hour renewal cadence, but with less margin for a missed cycle), and delta-token expiry behavior differing from `historyId` expiry in ways not yet exercised against a live account.

Principal risks and mitigations:

| Risk | Impact | Mitigation |
|---|---|---|
| Graph subscription's shorter max lifetime (~3 days vs. Gmail's ~7) leaves less slack if a renewal cycle is missed | A missed renewal window is more likely to lapse into an expired subscription before the next 6h tick recovers it | Same 6h cadence still leaves ~12x margin inside the 3-day window; if AC4-equivalent verification shows this margin is too tight in practice, tighten the schedule rather than redesign |
| `accounts.provider` check constraint currently excludes `'outlook'` | Any Outlook account insert fails at the database until migrated | Explicit migration in this change's scope, called out before `/specclaw:plan` rather than discovered mid-build |
| Delta query (`deltaLink`) expiry/invalidation semantics differ from Gmail's `historyId` in ways not yet exercised | The catch-up fallback path (time-filtered `/messages` list) may need different bounding logic than Gmail's `after:<timestamp>` fallback | Design phase (`/specclaw:plan`) resolves the exact fallback query against Graph API docs before build, same as `002-ingestion` resolved Gmail's fallback during its own design |
| Whether Email Normaliser is extended or duplicated is undecided | Building against the wrong assumption wastes a wave of work | Left as an explicit design.md decision for `/specclaw:plan`, not guessed at here |
| Azure App Registration / Graph consent screen unfamiliar territory (first Microsoft integration in this project) | Setup friction, possible delay parallel to `002-ingestion`'s Oracle Cloud provisioning friction | Same acceptance as `002-ingestion` took with Google's unverified-app test-user path — personal project, self as sole test user |

## Open Questions

- **Target Outlook account** — which mailbox is this built and verified against? `002-ingestion` had `yomaltheekshana66@gmail.com` pinned from the start; this proposal has no equivalent yet and needs one before `/specclaw:plan` can write concrete acceptance criteria.
- **Email Normaliser: extend or duplicate?** — does the existing sub-workflow gain an Outlook branch, or does a parallel "Outlook Normaliser" get its own file? Both land on the same `emails` row shape; this is a design-time call, not a scope-time one.
- **Renewal cadence margin** — is 6 hours still the right cadence given Graph's shorter subscription lifetime, or should Outlook's renewal workflow run more frequently than Gmail's? Worth deciding explicitly in design rather than copying the constant without re-checking it against the shorter window.
- **Shared vs. separate renewal workflow** — does one n8n workflow handle renewal for both providers (branching on `accounts.provider`), or does Outlook get its own `outlook-renewal-recovery.json` mirroring `gmail-renewal-recovery.json`? Affects the file count estimate above either way.

**Party review (CHANGES_REQUESTED — 3 BLOCK, 7 WARN, 3 NOTE, 0 withdrawn; full detail in `party-report.md`):**
- (party-architect) Scope says the renewal workflow reuses "the pattern, not the workflow file" while Open Questions calls the same shared-vs-separate decision unmade — the two sections contradict each other.
- (party-architect) The `clientState` secret has no named storage location — "n8n_credential_id-adjacent columns" isn't a column, and the migration is scoped as constraint-only.
- (party-architect) Whether Email Normaliser gets an Outlook branch or a duplicate sub-workflow is left open, but the one contract both options must share (the exact `emails` row shape) is never written down.
- (party-architect) `sync_cursor` would carry two incompatible value grammars (`historyId` vs. `deltaLink`) with no stated stored form or per-provider null/stale semantics.
- (party-architect) The webhook endpoint's contract only covers rejecting bad `clientState` — the Graph subscription-validation handshake, response codes, and multi-entry payload handling are unspecified.
- (party-architect) Every verification path (AC1–AC4 equivalents) requires live Microsoft infrastructure and wall-clock waiting; no fixture/stub seam is named for offline testing.
- (party-ba) The "unified inbox" benefit claimed in Problem is undercut by Out of Scope explicitly deferring cross-provider label/folder reconciliation — restate the problem as satisfying Phase 1's two-provider checklist item instead.
- (party-ba) The token-material Done-when bullet defers to `002-ingestion`'s AC5 without restating what it checks, so it isn't falsifiable from this document alone.
- (party-ba) The "~4230 minutes" Graph subscription max-lifetime figure (basis for the renewal-margin risk claim) is asserted without a citation.
- (party-po) The cost of doing nothing is argued from a checklist criterion, not from actual expected email volume/cadence on the target mailbox.
- (party-po) The recurring n8n execution cost of the renewal + per-notification workflows is never sized against any infra budget.
- (party-po) The `accounts.provider` constraint migration has independent, low-risk value and could ship as its own first slice ahead of the full webhook build.
- (party-architect, NOTE) Rebuts party-ba's "two separate schemas" framing as overstated — one row shape, one table; the real gap is that the shared row-shape contract is unwritten, not that two schemas exist.

---

**To proceed:** Review this proposal and approve to begin planning.
