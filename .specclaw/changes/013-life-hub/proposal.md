# Proposal: Life Hub (Phase B1) — Plans, Notes, and the Hub Shell

**Created:** 2026-09-20
**Status:** 🟡 Draft

## Problem

The stated end goal of this project is a personal assistant. What exists is an email tool with an assistant bolted to the side of it, and the gap shows in three concrete places.

1. **Life work has nowhere to live.** `tasks` already accepts manually-created rows (`origin = 'manual'`, nullable `email_id`, since `0009_tasks_enrichment.sql`), and `POST /api/action-items` already writes them. But a manual task lands in a flat list built for email-derived action items, with no way to group it under the thing it belongs to. "Buy a domain" and "reply to the invoice email" sit at the same level, with no indication that the first is part of a larger effort and the second is a one-off.

2. **There is no place for a thought that isn't an email.** Every capture surface in the app is downstream of a message. An idea, a decision, a piece of reference material, a "remember this" — none of it has a home, so it goes to a notes app outside the system and stops being visible to the assistant that is supposed to know about your life.

3. **The product's name and shape are email-only, and both are already wrong.** The app directory is `gmail-dashboard`, the navigation's top section is "Board" followed by "Platforms" (email platform filters), and there is no structural place to put anything that isn't mail. Outlook ingestion was already proposed against this app, and `012-assistant-bot` added a Telegram client to it. The name describes neither.

The corollary problem, which this proposal treats as a design constraint rather than something to solve: **`012-assistant-bot` exists specifically because the operator cannot sit and watch dashboards.** Building a larger dashboard pulls against that. The hub therefore has to earn its place as a different kind of surface, not more of the same one.

## Proposed Solution

Grow the existing app. **No second application, no second database, no second auth boundary, no second deploy.**

### Part 1 — The hub shell

`components/station/platform-rail.tsx` already renders grouped navigation via a `RailSection` component, with three groups today (`Board`, `Platforms`, `Saved views`). The hub restructure is therefore substantially smaller than it sounds: it adds a **`Life`** section alongside the existing ones and regroups the current entries so the top level reads as domains rather than as one flat email board.

Proposed grouping:

| Section | Contains |
|---|---|
| **Email** | Inbox, Action items, Drafts, Follow-ups, Contacts (today's `Board` entries, minus Overview) |
| **Life** | Plans, Notes *(new in this change)* |
| **Insight** | Overview, Analytics |
| **System** | Rules, Settings, Guide |
| *(unchanged)* | Platforms, Saved views |

Plus product naming: the UI stops calling itself a Gmail dashboard.

### Part 2 — Plans

A `plans` table (a goal, project, or longer-horizon effort) and a nullable `tasks.plan_id` FK. This is the crux of the design: **plans group the tasks that already exist rather than introducing a parallel task system.** A task extracted from an email and a task typed by hand can both belong to the same plan, because they are already the same table. A plan page shows its tasks; the existing Action items page keeps working exactly as it does now, with plan membership as an additional dimension rather than a replacement for the flat view.

### Part 3 — Notes

A `notes` table and a Notes page: quick capture, list, search. Deliberately the simplest possible version — a title, a body, timestamps. The value is that captured thoughts become data the assistant can eventually read, not that this is a competitive notes product.

### What makes this cheap

Everything structural is already built and proven: the App Router shell, the Departure Board design system, the single-operator session auth, the `app/api/**` route conventions, the provider/hook data-fetching pattern, the command palette, dark mode, and the responsive rules. This change adds pages and tables to an existing frame. It does not invent a frame.

## Scope

### In Scope

- Migration adding `plans`, `notes`, and a nullable `tasks.plan_id` FK
- `GET|POST /api/plans`, `PATCH|DELETE /api/plans/:id`, and the equivalent for notes — following the existing `app/api/**` conventions established in `008`–`011`
- `app/plans/page.tsx` and `app/notes/page.tsx`, plus a plan detail view
- Nav restructure in `components/station/platform-rail.tsx` into the domain grouping above
- Plan membership surfaced on the existing Action items page (assign a task to a plan; filter by plan)
- Command-palette entries for the new surfaces, matching how existing pages register
- Product-name changes in user-visible UI strings and metadata
- Dark mode, 375px responsive behaviour, and keyboard operability for every new surface — the same bar `007-web-dashboard` set (its FR6/FR10, NFR3/NFR5)

### Out of Scope

- **Calendar and events.** The heaviest of the four life domains — needs Google Calendar sync and an OAuth scope change. Its own change, later.
- **Habits and routines.** Needs recurrence rules and streak state; a genuinely different data shape from plans and notes. Its own change, later.
- **Teaching the assistant bot about plans and notes.** A follow-up to `012-assistant-bot` (new slash commands, new shortlist sources), not dashboard work. Named here so it isn't forgotten.
- **Any change to `012-assistant-bot`, any n8n workflow, or the ingestion/triage/extraction pipelines.**
- **Renaming the `gmail-dashboard/` directory itself.** See Open Questions — the UI-facing rename is in scope, the filesystem/deployment rename is a separate mechanical change with a much wider blast radius.
- **Notifications or push of any kind from the hub.** That is deliberately the bot's job; see Problem.
- **Rich text, attachments, or collaborative editing on notes.**

## Impact

- **Files affected:** 16–22 (estimated) — 1 migration, ~6 API route files, ~4 page/component files, 1 nav edit, 1–2 providers/hooks, types, plus doc updates to `architect/04-data-model.md` and `README.md`
- **Complexity:** medium — no new infrastructure, no new patterns; the volume is in surface area, not difficulty. The one genuinely novel piece of thinking is the plan-to-task relationship.
- **Risk:** low-to-medium. Structurally additive: no existing table is dropped or repurposed, and `tasks.plan_id` is nullable so every existing row and every existing writer (Action Extraction, `POST /api/action-items`) is unaffected. The medium half is that this stacks new surface on top of `008`–`011`, which are code-complete but still largely unverified against a live deployment.

## Open Questions

- **How far does the rename go?** UI strings and metadata are cheap and in scope. Renaming the `gmail-dashboard/` directory touches every import path, the CI workflow, and the Vercel project configuration — much wider blast radius for zero functional gain. Recommendation: UI naming now, directory rename as its own mechanical change if ever. Needs a decision before build.
- **What does a plan actually group?** Tasks only (simplest, and the one relationship this proposal commits to), or also emails, commitments, and notes? Grouping more is more useful and considerably more schema. Recommend starting with tasks and letting real usage argue for the rest.
- **Does a plan carry its own status and target date, or are both derived from its tasks?** A derived status can't express "this plan is paused"; a stored status can drift from the tasks underneath it. This is the same class of decision `010`'s status vocabulary already wrestled with.
- **What happens to the Overview page?** It is currently email-analytics-shaped. Does it become the hub's landing page — showing today across both email and life — or stay as-is with the hub landing somewhere new? This is the decision that most determines whether the app *feels* like a hub or like an email tool with extra pages.
- **Should this wait on verifying `008`–`011`?** Those 34 API routes are built but mostly unverified with no merged PRs. This change adds ~6 more routes on the same foundation. Not a blocker, but worth a deliberate answer rather than a default.

---

**To proceed:** Review this proposal and approve to begin planning.
