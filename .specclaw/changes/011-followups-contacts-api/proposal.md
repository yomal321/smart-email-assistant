# Proposal: Follow-ups & Contacts API (Backend Phase 3 of 6)

**Created:** 2026-09-14
**Status:** 🟡 Draft

## Problem

`/follow-ups` and `/contacts` are the two dashboard modules with **zero** backend support today (BACKEND-REQUIREMENTS.md §1, §4) — both routes read `lib/data/fixtures/*` directly, and `board.toggleVip` is client-only reducer state that is never persisted even though VIP status is supposed to feed priority scoring. `message-mapping.ts` currently synthesizes a placeholder `Contact` object per message (its own header comment documents this as a stopgap "until [the contacts table] does not exist yet") because there is no real per-contact aggregation anywhere in the schema.

Structurally, this is blocked on two things nothing else in the backend build has needed: the assistant has never ingested the user's own sent mail (Gmail `watch()` only covers `INBOX`), so there is no way to detect a reply, pair it against an inbound thread, or measure reply latency; and there is no `contacts` table for messages to aggregate against.

Per BACKEND-REQUIREMENTS.md §6, this is Phase 3 of the 6-phase backend build order, following directly after completed changes `008` (API foundation), `009` (messages API), and `010` (actions/drafts API) — all shipped and verified. The doc calls this phase "where it becomes the product the positioning claims": Follow-ups (bidirectional commitment tracking) and Contacts (aggregates, VIP, tone history) are named in `PRODUCT.md` as the differentiator, not incidental features.

## Proposed Solution

Full detail is drafted in [`PHASE-3-IMPLEMENTATION-PLAN.md`](../../../PHASE-3-IMPLEMENTATION-PLAN.md) at the repo root; this proposal summarizes it.

1. **Sent-mail ingestion** — add `SENT` to the `labelIds` watched in `gmail-ingestion.json` and `gmail-renewal-recovery.json` (one line each). Ingestion inherits sent mail automatically once the subscription covers it — no other ingestion change needed.
2. **Migrations `0006` (`thread_entries`, `contacts`, `contact_tone_history`, `contact_aggregates` view, `emails.is_from_user`) and `0007` (`commitments`, `nudges`)** — both purely additive, no existing column altered.
3. **`email-normaliser.json` edit** — set `is_from_user`, upsert `contacts`, insert `thread_entries`, and add a third parallel non-blocking branch (alongside the existing Triage/Action-Extraction calls) invoking a new sub-workflow.
4. **New `commitment-extraction.json` sub-workflow** — the one genuinely new n8n workflow this phase requires. Extracts promise-like sentences in both directions with a verbatim `trigger_sentence`, modeled structurally on `action-extraction.json`.
5. **New mappers** — `commitment-mapping.ts`, `contact-mapping.ts`, replacing `message-mapping.ts`'s placeholder Contact synthesis now that the real table exists.
6. **New API routes** — `/api/commitments`, `/api/awaiting-reply`, `/api/nudges`, `/api/contacts`, `/api/contacts/:id`, `/api/contacts/:id/vip`.
7. **Frontend wiring** — `/follow-ups` and `/contacts` get their first provider layer (fetch-on-mount, optimistic updates), matching the pattern `010` established for `/actions` and `/drafts`. `board-provider.tsx`'s `toggleVip` delegates to the new persisted endpoint instead of local state.

## Scope

### In Scope
- Migrations `0006`, `0007`.
- Edits to `gmail-ingestion.json`, `gmail-renewal-recovery.json`, `email-normaliser.json`.
- New `commitment-extraction.json` workflow.
- New mappers: `commitment-mapping.ts`, `contact-mapping.ts`; update to `message-mapping.ts`'s Contact construction.
- New routes listed above (7 total).
- New `commitments-provider.tsx` (or equivalent) and `contacts-provider.tsx`; rewiring `app/follow-ups/page.tsx` and `app/contacts/page.tsx`; persisting `board.toggleVip`.
- Architecture doc updates (`architecture.md`, `architect/04-data-model.md`) reflecting the new tables.

### Out of Scope
- Rules, Settings, Activity log, Search, saved views (Phase 4).
- Rule execution, full Analytics aggregation, AI-performance panel (Phase 5).
- Actually sending the Nudge (no `gmail.send` credential is introduced by this change — `POST /api/nudges` persists a row only; see Open Questions).
- The Backfill/Re-enrich workflow that would populate historical commitments/contacts for mail ingested before this change ships (BACKEND-REQUIREMENTS.md §5.4.B lists it as needed for "Phase 1 & 3" but treats it as separable).
- Todoist/Notion/Jira export, AI model selector, retention durations, category "Merge", Auto-reply — stubbed by product decision (§8.3), unaffected here.

## Impact

- **Files affected:** ~14 (estimated) — 2 migrations, 3 edited n8n workflows + 1 new workflow, 2 new mappers + 1 edited mapper, 6 new route files, 2 new/edited providers, 2 rewired pages, 2 architecture docs.
- **Complexity:** large (touches all three containers — Gmail ingestion scope, a new n8n sub-workflow, two new tables, a new provider layer on two routes that have never had one).
- **Risk:** medium — migrations are additive-only (low risk in isolation), but the `email-normaliser.json` edit adds a third branch to an already-live, already-verified ingestion path (002-ingestion AC1–AC5) and must stay non-blocking (`waitForSubWorkflow: false`) like its two existing siblings to avoid regressing verified behavior. The Gmail `watch()` scope change also widens what the assistant reads (now the user's own sent mail), which is a real behavior change worth flagging even though it's a one-line diff.

## Open Questions

1. **Sent-mail ingestion scope** — all history, or from a start date? Determines the Gmail OAuth scope requested and whether Follow-ups/Contacts start empty or backfilled. (Carried from BACKEND-REQUIREMENTS.md §7 Q3.)
2. **Send or don't send** — does the Nudge dialog's "Send" actually send via Gmail, create a Gmail draft, or (as this proposal defaults) just persist a `nudges` row for now? Sending would trade away the "no Gmail-send credential" guarantee and, per BACKEND-REQUIREMENTS.md §5.3, should be its own reviewed change. (Carried from §7 Q2.)
3. **Is the Backfill/Re-enrich workflow in scope here?** Without it, Follow-ups/Contacts show nothing for mail ingested before this change ships — acceptable as a fast-follow, or a blocker for this phase?
4. **`getAwaitingReply` semantics** — the exact join/filter that defines "awaiting reply" needs to be pinned down against the current fixture behavior (`lib/data/fixtures/commitments.ts`) before the route can be specified precisely.

---

**To proceed:** Review this proposal and approve to begin planning.
