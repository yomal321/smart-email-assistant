# Smart Gmail Assistant — The Departure Board

A prototype of an AI-assisted Gmail dashboard, designed and built around one idea: **your inbox is a station concourse, not a feed.** Every message is a scheduled departure with a platform (category), a time, and a delay figure — the board's whole job is to say what's late and what's boarding now.

Read [design-spec.md](design-spec.md) for the full design rationale, and [DESIGN.md](DESIGN.md) for the system as built (tokens, components, do's/don'ts). Product truth lives in [PRODUCT.md](PRODUCT.md).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). All data is mock fixture data (see `lib/data/fixtures/`) — there is no live Gmail connection or LLM call in this prototype.

## What's here

Ten modules, in the build order [PRODUCT.md](PRODUCT.md) records:

1. **Smart Inbox** (`/inbox`) + the Board Sheet email detail overlay
2. **Action items** (`/actions`) — list and Kanban views
3. **Overview** (`/`) — the balance band, priority queue, volume trend
4. **Drafts** (`/drafts`) — AI-generated replies, tone/length controls, approval history
5. **Follow-ups & commitments** (`/follow-ups`) — awaiting reply, promises made/received
6. **Contacts** (`/contacts`), **Analytics** (`/analytics`), **Rules** (`/rules`), **Settings** (`/settings`)
7. **Review queue** (`/review`) — anything the classifier couldn't parse confidently; never silently dropped

Cross-cutting: a command palette (`⌘K` / `/`), full keyboard triage (`J`/`K`/`E`/`R`/`S`/`D`, `?` for the shortcut sheet), undo on every destructive action, light/dark theme, comfortable/dense row density — all built to the design-spec's Operate-mode accessibility floor (WCAG 2.2 AA, nothing encoded by colour alone).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide icons · Archivo / Archivo Narrow (self-hosted via `next/font`).

## Project structure

```
app/                 routes (one folder per module)
components/station/  the "station vocabulary" — BoardRow, PlatformBadge, DelayFigure,
                      Flap, BalanceBand, PlatformRail, SyncClock, BoardSheet, …
components/board/     app-shell, providers, filter/selection/undo bars, command palette
components/charts/    the dataviz primitives used on Overview and Analytics
components/ui/        shadcn primitives, restyled to the design tokens
lib/data/             typed fixtures + the data-access layer (swap for a real backend here)
lib/format/           delay-figure and relative-time formatting
lib/keyboard/         the keyboard-shortcut registry (also powers the `?` help sheet)
```
