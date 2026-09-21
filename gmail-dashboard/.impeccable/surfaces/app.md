---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

# Surface brief — Smart Gmail Assistant (application shell, all routes)

> **2026-09 status note:** the FORM/OWN-WORLD direction below (The Departure
> Board — yellow, 2px radius, Archivo) describes the mail module's original
> approved direction and is still accurate for `/mail/*`. It is **no longer
> accurate for the hub** (`/`, `/tasks`, `/plans`, `/notes`, `/bot`), which
> was redesigned against two user-supplied reference dashboards onto the
> soft indigo/rounded/shadow system `app/globals.css` actually ships (see
> `DESIGN.md`, rewritten the same day this note was added). This brief
> needs a real second surface pass — hub vs. mail as two documented worlds,
> or one reconciled world — not a quiet edit; flagging it here rather than
> guessing at the reconciliation.

## Scope and mode

Mode: **Operate.** The whole application — Overview, Smart Inbox, Email Detail, Action Items, Drafts, Follow-ups, Contacts, Analytics, Rules, Settings. One world across all ten; the Smart Inbox is the surface the world is designed around and every other route inherits from it.

## Audience, job, task

A solo knowledge worker — independent consultant, founder, account manager — with one personal Gmail account where their business happens. Job: in about five seconds, know which of today's mail can hurt them if ignored, then dispatch it without leaving the tool. Sessions are short and interrupted; usage is keyboard-forward; Gmail stays the system of record and the escape hatch.

## Content and constraints

Mock fixtures only, no live Gmail OAuth and no live LLM. Seven categories (Needs Reply / FYI / Meeting / Invoice / Newsletter / Automated / Spam-ish), three priorities, sentiment flags, confidence scores, action items, and commitments in both directions. Next.js App Router + TypeScript + Tailwind + shadcn/ui. Not a Google product: no Google marks, no Gmail brand imitation. WCAG 2.2 AA floor, full keyboard operability for the triage loop, nothing encoded by colour alone.

## Direction contract

**THESIS:** The inbox is a station concourse, not a feed. Every message is a scheduled departure carrying a platform, a time, and a delay figure, and the board's entire job is to say what is late and what is boarding now. It refuses the two arrangements this category always ships: the reverse-chronological three-pane list, and its predictable opposite, the warm calm serif productivity app.

**OWN-WORLD:** Bone paper ground (#F2F0EB) under near-black ink (#14161A), with a departure-yellow field (#FFCC00) owning whole regions rather than accenting them, signal red (#C8102E) reserved exclusively for lateness, and platform green (#1B7F4C) for cleared work. One grotesque throughout, tabular numerals everywhere a figure means a quantity. Components are station hardware: the platform rail, the timetable row, the flap, the enamel platform badge, the delay column, the Mondaine clock. Hairlines are steel rules, not CSS borders. Recognisable with all content removed by the rail-plus-ruled-rows-plus-right-aligned-delay-column structure alone.

**STORY:** The user arrives and reads the board the way they read a departure board — top row first, delay column second. They understand that the tool has already ranked their obligations and will show its reasoning. They believe it because every judgment carries a confidence figure and a correction path, and because nothing ever silently vanishes. They work the board top-down, and they leave with the late column empty.

**FIRST VIEWPORT:** Full-bleed board. Left: a 200px platform rail listing the seven categories as platform numbers with live counts, the active one lit. Centre: the queue as ruled timetable rows — sender and VIP mark, AI one-line summary as the row's body, an enamel platform badge, and a right-aligned tabular delay column reading `+3d` in signal red when overdue. Top band spans the full width: WAITING ON YOU set in a yellow field against WAITING ON THEM in bone, the two counts at display scale, the largest figures on the screen. Top-right, the station clock carries last-sync time. The primary action, **Triage**, sits at the head of the queue column where the eye lands after the balance — not floating, not in a corner.

**FORM:** The Departure Board — continental European station information design (SBB/DB timetable posters, split-flap boards, the Mondaine platform clock). Candidate 5 of 7 on my grounded list, assigned by the roll. Seed key `4216a3e4`.

**Raises** (each named for the hand it came from):
- *From Iridescent Cloud Edge:* colour never touches the text field. Category and priority live on the rail and the flap only; sender, subject, and summary stay achromatic ink so a dense board never becomes a carnival.
- *From Cyclorama Dawn:* every state is named and doubly encoded — each category carries a letter code, each priority a shape, alongside colour — and every board state is deep-linkable.
- *From Darkroom Safelight Bay:* commit is its own station. A drafted reply is staged against the original as a visible before-commit step, the way a test strip precedes the print — but reversible, because nothing here is fixer.
- *From Streaming Title Wall:* focus is the primary interaction. The focused row expands in place with its full AI reading while the board steps back around it, entirely keyboard-driven; the board never scrolls out from under you.
- *From Flash Scrawl Club Sleeve:* handled work leaves a trace. A triaged row records its handling on the board rather than silently vanishing, and the audit log is a first-class surface.

**Honest risk:** transit nostalgia. If the split-flap becomes decoration rather than the state change itself, it reads as a theme instead of a system.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Memorable moment

The delay column. A single right-aligned tabular figure per row, blank when a message is on time, `+3d` in signal red when it is not — so an inbox with nothing late reads as a column of whitespace, and the user learns to scan one column instead of reading rows.

## Unresolved

- Model vendor/version, retention durations, and pricing are deliberately undecided (PRODUCT.md) and must not be invented in UI copy.
- Third-party task integrations (Todoist/Notion/Jira) exist as affordances only; no credentials, no live sync.
