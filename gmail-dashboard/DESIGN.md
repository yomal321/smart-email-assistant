---
name: Personal Command Center
description: Smart Gmail Assistant — a soft, card-based operate-mode system shared by the hub (Today/Tasks/Plans/Notes/Bot) and the mail module, corrected here to match what actually ships in app/globals.css after the hub's 2026-09 redesign.
colors:
  ground: "#f5f6fa"
  surface: "#ffffff"
  surface-sunk: "#eef0f8"
  surface-raised: "#ffffff"
  ink: "#14152a"
  ink-secondary: "#565a72"
  ink-tertiary: "#82869f"
  ink-disabled: "#b7bbce"
  signal: "#e11d48"
  signal-field: "#fdeaef"
  departure: "#4f46e5"
  departure-ink: "#ffffff"
  departure-field: "#eeecfd"
  departure-field-ink: "#4338ca"
  cleared: "#059669"
  cleared-field: "#e7f7f1"
  accent-success: "#047857"
  accent-warning: "#b45309"
  rule: "#e6e8f2"
  rule-strong: "#d3d6e6"
  platform-1-needs-reply: "#f59e0b"
  platform-2-meeting: "#2563eb"
  platform-3-invoice: "#059669"
  platform-4-fyi: "#64748b"
  platform-5-newsletter: "#8b5cf6"
  platform-6-automated: "#94a3b8"
  platform-7-spam-ish: "#fb7185"
typography:
  display:
    fontFamily: "var(--font-sans)"
    fontSize: "2.25rem"
    fontWeight: 700
  heading:
    fontFamily: "var(--font-sans)"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-narrow)"
    fontSize: "0.65625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.departure}"
    textColor: "{colors.departure-ink}"
    rounded: "{rounded.md}"
  card-surface:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.xl}"
    shadow: "shadow-card"
    border: "1px solid {colors.rule}"
  status-pill:
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
---

## Overview — read this first

**This file was wrong for most of this project's life.** It described "The Departure Board" — a continental-station-timetable direction with departure-yellow (`#FFCC00`), 2px near-square corners, and Archivo — as if that were the shipping design. It was the *approved* direction at one point (the full rationale still lives in `design-spec.md` §1 and `.impeccable/surfaces/app.md`), but the codebase moved to a different system at some point without this file being updated, and no one caught the drift until the 2026-09 hub redesign. `app/globals.css`'s own header comment has said the truth the whole time: *"Modern, soft, rounded system: indigo primary, warm amber accent, diffuse elevation shadows in place of hard rules."*

**What's actually true, verified against the running code:**
- Primary is indigo `#4f46e5` (`--departure`), not yellow. Radius is 16–20px (`--radius`, `--radius-xl`), not 2px.
- The typeface is **Plus Jakarta Sans**, not Archivo — `app/fonts.ts` imports `Plus_Jakarta_Sans` for both the `archivo` and `archivoNarrow` exports (the variable *names* are a leftover from the old direction; renaming them touches every import site across the app, so they're left as-is here, documented rather than silently misleading).
- Shadows are soft and diffuse (`--shadow-card`), never the flat "steel rule" hairlines the old doc describes.
- The mail module's station vocabulary below — PlatformBadge, DelayFigure, split-flap, the platform rail — is still real, current code (`components/station/*`, `components/board/*`) and hasn't been touched by the hub redesign. It just runs on the indigo/rounded/shadow token set, not the yellow/square one this file used to claim.

Scope of the 2026-09 redesign: **the hub only** (`/`, `/tasks`, `/plans`, `/notes`, `/bot`) — matched to two reference dashboards the user supplied (an ops "Live Agent Map" and a practice-management dashboard). The mail module (`/mail/*`) is unchanged and is the next pass.

## Colors

Three rules, unchanged in spirit from the original direction, corrected in value:
1. **Colour never touches the text field** in dense list rows — sender, subject, task text stay achromatic ink. Colour lives on badges, plates, chips, and fills.
2. **Signal red (`--signal`) means consequence** — overdue, destructive, failed. Nothing else.
3. **Indigo (`--departure`) means "this requires you / this is primary"** — the active nav pill, primary buttons, focus rings, the "waiting on you" emphasis.

Every category, priority, and status signal is doubled: a colour paired with a code letter (`SourcePlate`), a word (`StatusPill`), or an icon (`IconChip`) — never colour alone. Verified by re-reading each new hub primitive in greyscale intent, not just by convention.

**`--accent-success` / `--accent-warning` exist because `--cleared` and `--platform-1` fail WCAG 4.5:1 as text/icon color on a white surface** (3.77:1 and 2.15:1 respectively, measured) — they were tuned for field/badge fills, not for drawing directly on `--surface-raised`. The two new tokens (`#047857`, `#b45309`) pass 4.5:1+ in both directions (as foreground and as a solid background with white/`--departure-ink` text) in both themes. `--cleared`/`--platform-1` keep their existing mail-module uses unchanged — fixing those in place is scoped to the mail-module pass, not done here.

Dark mode (`data-theme="dark"`) is a real second palette, not an inversion — see `app/globals.css`'s `:root[data-theme="dark"]` block for every paired value, including `--accent-success`/`--accent-warning`'s dark variants (already the same values as `--cleared`/`--platform-1`'s dark mode, which were already light enough to read on the dark surface — the failure is light-mode-only).

## Typography

One family, Plus Jakarta Sans, at two weight sets (`--font-sans` body/UI, `--font-narrow` for compressed uppercase labels — same font, just heavier weights available). Tabular numerals (`.tabular`) are mandatory on every quantity: stat-card values, progress percentages, dates, counts — enforced globally and inherited by `html`.

## Shapes & Elevation

Radius is generous everywhere: `10px` inputs, `14–16px` buttons and small controls, `20px` (`--radius-xl`, via `.card-surface`) on cards and panels, `999px` pills on badges and tab controls. This directly reverses the old doc's "near-zero radius, station hardware" rule — the actual system is soft by design.

Shadows are diffuse and layered (`--shadow-card`, `--shadow-sheet`, `--shadow-popover`), never a hard offset. `.card-surface` (white/dark-surface fill + `--shadow-card` + a 1px `--rule` border) is the one card treatment used everywhere — hub and mail both.

## Hub primitives (`components/hub/primitives.tsx`)

Extracted 2026-09 from two reference dashboards, matching the pattern language shared by both: tinted icon chips, big bold numbers on white cards, thin progress bars, solid-fill pill tabs, soft-tinted status badges.

- **`IconChip`** — a small rounded-square icon in one of six tones (`primary`/`danger`/`success`/`warning`/`info`/`neutral`), background auto-tinted from the tone colour via `color-mix()` rather than a hand-picked field colour per tone. No new tokens needed beyond the two accessibility fixes above.
- **`StatCard`** — the hero-metric pattern: icon chip, a huge bold tabular value, a muted sub-label, an optional `ProgressBar`. `compact` drops the icon for a denser metric-grid tile.
- **`ProgressBar`** — thin rounded track + tone fill, overflows into `danger` past 100% (the "over capacity" case every load meter in the hub needs).
- **`PillTabs`** — a segmented pill control, solid indigo active state. Deliberately not tone-configurable: `--departure`/`--departure-ink` is a co-varying pair built for exactly this (dark mode's `--departure` is a light pastel needing dark text, so `--departure-ink` flips too); the other tones have no matching "-ink" partner, so a generic `tone` prop would silently break in dark mode the moment someone used it for a non-primary tab. Scoped to the one verified-safe pairing.
- **`StatusPill`** — a soft-tinted badge, colour + word always paired, used for task/plan status everywhere in the hub.

All five read correctly in both themes — verified by computing actual WCAG contrast ratios for every tone against both a white and a dark card surface (`node` one-off scripts, not eyeballed) rather than assumed from the hex values looking "close enough."

## Mail module vocabulary (unchanged, still current)

**PlatformBadge** — an enamel-style plate: platform number + two-letter code, confidence encoded as the badge's own edge style (solid/faint/dashed). **PriorityAspect** — an authored SVG shape, never colour alone. **DelayFigure** — right-aligned tabular figure, blank when on time, `+3d` in signal red when overdue, animated via **Flap** (split-flap, fires only on a genuine value change, collapses to an instant swap under `prefers-reduced-motion`). **BalanceBand**, **BoardRow**, **BoardSheet**, **SyncClock**, **UndoBar**, **EmptyState**, and the flat-fill/square-corner **Charts** family are all still exactly as built — see `components/station/*`, `components/board/*`, `components/charts/*`. None of this changed in the hub redesign; it's documented here so the next pass has an accurate starting point instead of the old yellow/2px description.

## Do's and Don'ts

- **Do** keep every status/category/priority signal doubled (colour + code/word/icon) — this is the one rule that survived the whole redesign unchanged.
- **Do** compute real contrast ratios for any new tone before shipping it as text or an icon colour on a light or tinted surface — `--cleared`/`--platform-1` are the cautionary example.
- **Do** use `.card-surface` for any new panel — one elevation system, hub and mail both.
- **Don't** trust a stale `-ink`/tone pairing across themes without checking both directions (colour-on-surface and white-on-colour) — see `PillTabs`' deliberately narrow `tone` scope.
- **Don't** reach for `--cleared`/`--platform-1` as a text or icon colour in new hub code — use `--accent-success`/`--accent-warning` instead.
- **Don't** assume this file is current without cross-checking `app/globals.css` — that file is the ground truth; this one is a description of it that has drifted before and can drift again.
