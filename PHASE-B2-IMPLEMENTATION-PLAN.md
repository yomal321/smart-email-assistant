# Phase B2 Implementation Plan — The Life Load Board

**Depends on:** Phase B1 (`0015_plans_notes.sql`, `0016_life_load.sql`, `lib/priority.ts`, the `app/(hub)` shell).
**Unblocks:** a hub that is worth opening in the morning — and a realistic surface to judge the design against before the ICS ingestion work in B3 is committed to.

Authored directly (no specclaw lifecycle), same as Phases 3–6.

**Build status:** plan only, nothing built.

---

## 1. Why this phase

Phase B1 built the machinery: one commitment table with a `type` discriminator, a tested priority score, a hub shell with five rooms. Opening it looks like this:

- Seven rows, all extracted from Gmail, all `type='task'`, all on the Work source.
- No **Scheduled today** section — nothing in the database has `starts_at`, because nothing writes it.
- No **This week** section — nothing is far enough out.
- Half the viewport is empty.
- "3h 30m planned · capacity 5h" is `7 × the 30-minute default effort`. It is an item counter wearing a clock.

The machinery is sound and the product is not there. Three distinct causes, which need three different fixes:

**1. There is only one kind of thing in the database.** The ranking function ranks across sources, types, weights and efforts. It currently has one source, one type, one weight and one effort to work with. No layout change fixes this.

**2. There is no visual model of load.** The spec's highest-value claim — spotting the week where exams from both programmes land on a work deliverable — has no representation anywhere on screen. That insight is the reason the product exists and it is currently something you would have to work out by reading a list.

**3. The information hierarchy is inverted.** The most urgent item on screen ("Send the Q3 report", overdue 9 days) is rendered in a row identical in height and weight to "Check on the invoice status." The most visually prominent real estate — top right — is occupied by four cards reading "0 active" and "0 total". Source is an 8px dot with no legend.

### The source-colour collision

`0016` seeds three source colours: `#4f46e5`, `#0891b2`, `#c026d3`. The first is **identical to `--departure`**, the brand primary. Every task was also backfilled onto the Work source, so on screen all seven dots are the same indigo — the same indigo as the active nav item and every primary button. Source colour currently carries zero information and actively competes with the brand.

### Done means

- The hub renders all three sections with realistic content across three sources and eight commitment types.
- A collision week is visible as a shape, not as a list you have to read.
- Every item on the Today screen can be completed from the Today screen, with undo.
- The load figure is derived from real per-item effort estimates, not a default multiplied by a row count.
- The user can name their own sources, set their own capacity, and add a course without writing SQL.
- `tsc --noEmit`, `eslint`, and `vitest run` all pass.

---

## 2. Scope boundary — seeded data, not ingestion

This phase uses invented data. **ICS feed ingestion is Phase B3** and is explicitly out of scope here.

### Decision: seed the real database; do not build a mock mode

Two options were considered.

| Option | Cost |
|---|---|
| A dev-only mock mode — API routes return fixtures behind a flag | A second code path through every route, which proves nothing about the real queries and has to be deleted later. The repo already removed its `lib/data/fixtures/` directory once. |
| **A seed SQL file against the real Supabase project** ✅ | Throwaway content in a real system. Every query, index, mapper and API route is exercised for real. Deleting it is one statement. |

The second is chosen. The app has no mock plumbing to maintain, and what you look at on screen is what the production code path actually produces.

### Files

- `supabase/seed_demo.sql` — idempotent (`on conflict (id) do nothing`), every row carrying a **deterministic UUID** in a reserved `dddddddd-…` prefix so the data is recognisable on sight and removable exactly.
- `supabase/unseed_demo.sql` — deletes by that prefix, in FK-safe order. Touches nothing else.

Neither is a migration. `supabase/migrations/` stays schema-only, and `scripts/ci/check-migrations.mjs` continues to see an unbroken sequence.

### What gets seeded

**Sources** (renames the `0016` placeholders in place, keeps their ids):

| Name | kind | code | colour | why |
|---|---|---|---|---|
| Work | work | `WK` | `#0f766e` teal | moved off `#4f46e5` so it stops colliding with `--departure` |
| MSc — Data Science | academic | `DS` | `#b45309` amber | |
| BSc — Software Engineering | academic | `SE` | `#7c3aed` violet | |

Programme names rather than institution names — they read better on a badge and they are what actually distinguishes the two workloads. Renameable in Settings (Wave 2), so these are a starting point, not a commitment.

**Courses** — six, in the user's own `HICT 2103` format, semester `2026-S1`, three per academic source.

**Commitments** — ~35 rows spread across three weeks, deliberately shaped to exercise every code path:

- **Today, scheduled:** a 09:15 standup (30m), a 15:00 client call (45m), and an **18:30 lecture**. The evening item is deliberate — under the current server-local date bucketing it renders on the wrong day, so it is the fixture that proves the Wave 1 timezone fix.
- **Today, ranked:** a mix of work tasks and one assignment due tonight.
- **A collision week, ~12 days out:** an MSc exam and a BSc CA within two days of each other, plus a work deliverable the same week. This is the case the week strip exists to reveal.
- **Realistic effort spread:** 6h assignments, 4h capstone work, 1h quizzes, 15m admin. Currently every row is 30m, which is what makes the load line meaningless.
- **Weight spread:** exams at 5, standups at 1.
- **Three overdue items** and **four with no deadline at all**, so the `urgency → 3` branch and the overdue grouping both render.
- The seven existing email-extracted tasks are left alone. They are real data and they should keep working beside the seeded rows.

---

## 3. Design language — correcting the record first

**`gmail-dashboard/DESIGN.md` is stale and must not be followed.** It describes a continental-timetable system: departure *yellow* `#FFCC00`, 2px "station hardware" radius, hard steel rules, split-flap motion.

`app/globals.css` — which is what actually ships — is a different system, and says so in its own header comment: *"Modern, soft, rounded system: indigo primary, warm amber accent, diffuse elevation shadows in place of hard rules."* `--departure: #4f46e5`, `--radius: 16px`, soft shadows, `--rule-highlight: transparent`.

The implemented system is the real one. Anyone reading DESIGN.md and writing 2px square badges would produce something that clashes with every existing screen.

**Wave 6 includes rewriting DESIGN.md's front-matter and prose to match `globals.css`.** Until then, `globals.css` is authoritative.

### Rules this redesign holds to

1. **Never colour alone.** Source is a colour *plus* a two-letter code plate (`WK` / `DS` / `SE`). This is the one rule worth carrying over from the old doc, and it is exactly what the bare dot violates today.
2. **Tabular figures on every quantity** (`.tabular`) — durations, counts, hours, countdowns. Already enforced globally; the new components must not opt out.
3. **Soft system, consistently.** `--radius` (16px) on cards and panels, `--radius-pill` on chips and badges. No new radius values.
4. **Signal red means consequence.** Overdue and over-capacity only. Not "this is academic", not "this is a quiz".
5. **Density over decoration.** The screen's problem is emptiness, not clutter. Rows should be compact enough that a real week fills the viewport.

---

## 4. Wave 1 — the correctness floor

These three land before any visual work. Seeded evening items will render on the wrong day without the first, and a dashboard you cannot act on is a report regardless of how it looks.

### 1.1 Timezone — `app/api/hub/summary/route.ts`

`dateKey()` uses `new Date(iso).toDateString()`, which is the *server's* local day. Vercel runs UTC; the user is Asia/Colombo (UTC+5:30). From 18:30 Colombo onward the server's "today" is the user's yesterday, so evening items silently vanish from **Scheduled today** and tomorrow's never appear.

Fix: bucket by the user's zone, not the server's.

```ts
// settings.timezone already exists and defaults to Asia/Colombo.
const dayKey = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(new Date(iso));
```

`en-CA` gives a sortable `YYYY-MM-DD`, which also removes the `new Date(dayA).getTime()` re-parse currently used to sort the **This week** groups. Read `timezone` from the `settings` row already being fetched in the same `Promise.all`; fall back to `Asia/Colombo`.

The same bug exists in `lib/format/relative-time.ts`'s `toDateString()` comparisons. Out of scope for this wave — the mail module's day labels are less load-bearing — but note it in the file so it is not mistaken for correct.

### 1.2 Completing from the Today screen

`Row` in `app/(hub)/page.tsx` renders no checkbox. Add one, with the optimistic pattern `app/(hub)/tasks/page.tsx` already uses (local state first, refetch on failure), plus:

- The item animates out rather than vanishing — a height/opacity collapse, `prefers-reduced-motion` respected.
- **Undo.** `components/board/undo-bar.tsx` already exists and is the established pattern for every reversible action in this codebase. It lives in the mail module's tree; lift it to a shared location or mount a hub instance. Undo issues `PATCH {status:'todo', completedAt:null}`.

### 1.3 `completed_at` is never written

`PATCH /api/action-items/:id` sets `status` and nothing else. The column exists and stays null forever, so Phase 4's completion history will have no data and cannot be backfilled.

Set it server-side, in the route rather than the client, so every writer gets it:

```ts
if (body?.status !== undefined) {
  update.status = body.status;
  update.completed_at = body.status === "done" ? new Date().toISOString() : null;
}
```

Clearing it on un-done is what makes undo correct.

---

## 5. Wave 2 — sources, courses, settings

The data the redesign needs, and the screens to manage it.

### API

| Route | Method | Purpose |
|---|---|---|
| `/api/sources` | `PATCH` *(new)* | Rename a source, change its colour and code. |
| `/api/courses` | `GET`, `POST` *(new file)* | List (filterable by `sourceId`, `isActive`), create. |
| `/api/courses/[id]` | `PATCH`, `DELETE` *(new file)* | Edit; mark inactive at semester end. |

`sources` gains a `code text` column for the two-letter plate — a small additive migration, `0017_source_code.sql`, backfilled from the first two letters of the name. `POST /api/sources` is still not needed: three sources, seeded once.

The `courses` table has been live since `0016` with **zero code references anywhere in `app/` or `lib/`**. This wave is what makes it real.

### `app/(hub)/settings/page.tsx` *(new)*

The hub has no settings screen at all, which is why the sources are still called "University A". Three sections, one screen:

- **Sources** — rename, recolour, set the two-letter code. Live preview of the plate.
- **Capacity** — `daily_capacity_minutes`, currently read by the summary route and writable by nothing, pinned at the 300 default.
- **Courses** — grouped by source; add, rename, toggle active.

Add it to `HUB_ROUTES` in `components/hub/hub-shell.tsx`.

### Course picker

`CreateTaskForm` in `app/(hub)/tasks/page.tsx` gains a course `<Select>` that appears only when the chosen source is `kind === 'academic'` — per the spec, and matching the nullable-everywhere-else shape of `course_id`.

---

## 6. Wave 3 — the redesigned Today screen

The main event. New components under `components/hub/`.

### Layout

```
┌─────────────────────────────────────────────────────────┬──────────┐
│  Saturday 20 September                      [+ Add ⌘K]  │          │
│  ▓▓▓▓▓▓▓▓▓░░░░░  4h 30m of 5h                           │  status  │
├─────────────────────────────────────────────────────────┤  strip   │
│  THE WEEK                                               │          │
│   ▁▃  ▅▂  ██  ▃▁  ▂▂  ▁   ▃▃    ← stacked by source     │  mail    │
│   Sa  Su  Mo  Tu  We  Th  Fr       capacity line        │  bot     │
├─────────────────────────────────────────────────────────┤  plans   │
│  OVERDUE · 3                                            │  notes   │
│  ▏ WK  Send the Q3 report                     +9d       │          │
├─────────────────────────────────────────────────────────┤          │
│  SCHEDULED TODAY                                        │          │
│  09:15  WK  Standup                            30m      │          │
│  15:00  WK  Client call — Acme                 45m      │          │
│  18:30  DS  HICT 2103 Lecture                   2h      │          │
├─────────────────────────────────────────────────────────┤          │
│  DO TODAY · 7                                           │          │
│  ☐  DS  HICT 2205  ML assignment 2      6h    due 6h    │          │
│  ☐  WK  Confirm lease renewal          30m    due 1d    │          │
├─────────────────────────────────────────────────────────┤          │
│  THIS WEEK                                              │          │
│  Mon 22 ─ ☐ SE  SENG 3104  Reading            1h        │          │
└─────────────────────────────────────────────────────────┴──────────┘
```

### `LoadRule`

Replaces the `3h 30m planned · capacity 5h` text line. A single horizontal bar, segmented by source in source colour, with a capacity marker. Over capacity, the overflow segment renders in `--signal` and the label reads "over by 1h 20m".

Why a bar: the number alone does not answer the question you actually have in the morning, which is *how much of today is already spoken for, and by which workstream*.

### `WeekStrip` — the collision view

Seven columns, today first. Each is a vertical stacked bar of estimated hours, segmented by source, with a horizontal capacity line drawn across all seven. Day labels and hour totals in tabular figures. A day over capacity draws its overflow in `--signal`.

This is the single highest-value element in the phase and the one thing no calendar or portal the user already owns can show them. A week where an MSc exam, a BSc CA and a work deliverable collide becomes a tall red column you cannot miss.

Per the existing chart conventions in `components/charts/`: flat fills, square corners on the bars themselves, tabular axis labels, `viewBox`-matched CSS `aspect-ratio` with default `preserveAspectRatio`, and a `Show data` table fallback. Clicking a column filters the list below to that day.

### `SourcePlate`

A pill carrying the two-letter code on the source's colour. Colour *plus* code, never colour alone — which is the concrete fix for "you cannot tell Work from University A at a glance". Academic rows additionally show the course code (`HICT 2205`) as plain tertiary ink beside it.

### `CommitmentRow`

One row component used by **Overdue**, **Do today** and **This week**:

`[checkbox] [SourcePlate] [course code?] [title] [type, if not 'task'] [effort pill] [due figure]`

- The due figure is right-aligned and tabular: blank when comfortable, `due 6h`, `+9d` in `--signal` when overdue.
- Rows are compact — target 36px — so a real week of commitments fills the screen instead of leaving 500px of white.
- Overdue rows carry a 2px left rule in `--signal`. Structure, not just red text.

### `AgendaRow`

For **Scheduled today**: time on the left in tabular figures, then plate, title, duration. Separate from `CommitmentRow` because a scheduled thing is not completed the way a task is — it has a slot, it is not owed.

### Demoting the module cards

The four cards currently hold the best real estate to display three zeros. They become a narrow right-hand **status strip**: one line each for Mail (`10 needs reply · 5 waiting`), Bot (`3 pushes / 7d`), Plans, Notes — each a link, none larger than a row. At `<lg` they move below the list rather than above it.

---

## 7. Wave 4 — capture in under ten seconds

The spec calls this existential and it is currently a six-control inline form on a secondary page. The hub has no command palette at all — `components/board/command-palette.tsx` is mounted by `AppShell`, which is mail-only.

`components/hub/quick-add.tsx` — a dialog on `⌘K` / `Ctrl+K`, reusing the existing `components/ui/command.tsx` and `dialog.tsx` primitives:

- Title input, autofocused. **Enter saves and closes.**
- Type as segmented buttons, not a dropdown — eight types, one click.
- Source as segmented buttons — there are three.
- Course select, appearing only for academic sources.
- Due date with presets: **Tonight · Tomorrow · Friday · Next week**, plus a datetime input for anything else.
- Weight and effort optional, defaulted, skippable. The form must be completable with a title and one Enter.

Mounted in `app/(hub)/layout.tsx` so every hub room has it.

A bot `/add` command — which is the genuinely better answer, because it works from a phone — is **Phase B3**. `assistant-brain.json` is read-only today (`/today`, `/urgent`, `/deadlines`, `/vip`, `/help`).

---

## 8. Wave 5 — `/tasks` as a real list

Currently a flat list with a single "show done" checkbox. Add, in the header bar:

- Filters: source, course, type, status. Multi-select, reflected in the URL so a filtered view is linkable.
- Sort: due date or priority score.
- Inline edit of weight, effort, due and source. `PATCH /api/action-items/:id` already accepts every one of these fields — the API is ahead of the UI here, so this is UI-only work.
- A "reschedule to today" action on overdue rows.

---

## 9. Wave 6 — the other rooms, and the stale doc

- **Plans, Notes, Bot** restyled to the same vocabulary: same row density, same header treatment, same `SourcePlate` where a source applies. They are currently three slightly different interpretations of the same layout.
- **Plans** gains a progress bar per plan (`taskCount`/`doneCount` are already derived and returned by `/api/plans`, and currently render as text).
- **`DESIGN.md` rewritten** to describe the system in `globals.css`: indigo `#4f46e5` primary, 16px radius, soft diffuse shadows, no split-flap. The document currently describes a product that does not exist, and it is the first thing anyone reads.

---

## 10. Judgment calls

**Seed the real database rather than build a mock mode.** A mock mode is a second code path that proves nothing about the real queries and has to be deleted later. Seeded rows with deterministic ids are throwaway content in a real system. Consequence: the demo data lives in the same Supabase project as real Gmail-extracted tasks, so `unseed_demo.sql` must be exact — hence the reserved UUID prefix.

**Keep both `priority` and `weight`.** They overlap and it is tempting to collapse them. `priority` (urgent/normal/low) is written by n8n's Action Extraction and read by the mail module; `weight` (1–5) is the user's own judgement and is what the priority score multiplies. Deleting either breaks a live writer.

**A week strip, not a calendar.** A calendar shows *when*; the strip shows *how much*. The user already has three calendars and the gap is not "where is my schedule" — it is "which week is going to hurt". A month grid would be more familiar and would answer the wrong question.

**Server-side `completed_at`, not client-side.** The bot and n8n may eventually close tasks too. Setting it in the route means every writer gets it without coordination.

**No new dependencies.** No date library, no charting library, no state manager. `Intl.DateTimeFormat` covers the timezone work, the strip is hand-authored SVG like every chart in `components/charts/`, and the existing provider/`useState` pattern is sufficient. The spec's "keep it boring" applies.

**Hub pages stay client components.** They fetch through API routes rather than server components, which deviates from the spec's §9 preference. That deviation is pre-existing and deliberate: n8n and the Telegram bot call the same routes, so the routes have to exist regardless. Converting the hub to server components would mean maintaining two access paths to the same data.

---

## 11. Verification

Runnable here:

- `npx tsc --noEmit`
- `npx eslint`
- `npx vitest run` — `lib/priority.test.ts` plus new cases for the timezone day-bucketing helper, which is pure and belongs under test.
- `node scripts/ci/check-migrations.mjs` — confirms `0017` is sequential and that the seed files are correctly *not* in `migrations/`.

Requires a live Supabase project (cannot be done from here):

- Apply `0015`, `0016`, `0017`. **README currently records `0015` as not yet applied live** — this must be resolved before the seed will load, since `plans` and `notes` will not exist.
- Run `seed_demo.sql`; confirm the hub renders all four sections.
- Confirm the 18:30 lecture appears under **Scheduled today** and not on tomorrow — the specific regression Wave 1.1 fixes.
- Confirm the collision week reads as a visibly taller, red-topped column in the strip.
- Complete an item from Today; confirm it animates out, `completed_at` is set, and undo restores both fields.
- Run `unseed_demo.sql`; confirm the seven email-extracted tasks and all real data survive untouched.

---

## 12. Out of scope

| Deferred to | What |
|---|---|
| **B3** | ICS feed ingestion from the two LMS portals and the work calendar — the real unlock, and the reason this phase seeds instead. |
| **B3** | Telegram `/add`, `/done` — capture from the phone. |
| **B4** | Recurrence. `tasks.recurrence_rule` stays reserved, unwritten and unread. |
| **B4** | Completion history and the 14-day workload projection. Wave 1.3 starts accumulating the data they need. |
| — | `lib/format/relative-time.ts`'s server-local date comparisons in the mail module. Noted, not fixed. |
