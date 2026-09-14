---
name: The Departure Board
description: Smart Gmail Assistant — an inbox rendered as a continental station departure board, where every message is a scheduled arrival with a platform, a time, and a delay figure.
colors:
  ground: "#F2F0EB"
  surface: "#FAF9F6"
  surface-sunk: "#E9E6DF"
  surface-raised: "#FFFFFF"
  ink: "#14161A"
  ink-secondary: "#4A4F57"
  ink-tertiary: "#6E747E"
  ink-disabled: "#A0A5AD"
  signal: "#C8102E"
  signal-field: "#FBE8EA"
  departure: "#FFCC00"
  departure-ink: "#14161A"
  departure-field: "#FFF4CC"
  cleared: "#1B7F4C"
  cleared-field: "#E4F2EA"
  rule: "#D8D4CB"
  rule-strong: "#B8B3A8"
  platform-1-needs-reply: "#FFCC00"
  platform-2-meeting: "#1B5FA8"
  platform-3-invoice: "#1B7F4C"
  platform-4-fyi: "#5B6470"
  platform-5-newsletter: "#8C8578"
  platform-6-automated: "#3A3F47"
  platform-7-spam-ish: "#7A3B2E"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo Narrow, Archivo, ui-sans-serif, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
rounded:
  none: "2px"
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
    rounded: "{rounded.none}"
  button-secondary:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  platform-badge:
    rounded: "{rounded.none}"
    typography: "{typography.label}"
  tone-pill:
    rounded: "{rounded.pill}"
    typography: "{typography.label}"
---

## Overview

**The Departure Board** rejects the reverse-chronological three-pane mail client that every AI-inbox tool ships. Instead, the inbox is a station concourse: every message is a scheduled departure carrying a platform (category), a time, and a delay figure. The board's whole job is to say what is late and what is boarding now.

Direction: continental European station information design — SBB/DB timetable posters, split-flap boards, the Mondaine platform clock. Seed key `4216a3e4`, mode Operate, code-led. Full rationale, all seven challengers weighed, and the raises this direction earned live in [design-spec.md](design-spec.md) §1 and [.impeccable/surfaces/app.md](.impeccable/surfaces/app.md).

The memorable moment is the **delay column**: one right-aligned tabular figure per row, blank when on time, `+3d` in signal red when overdue. A clear inbox reads as a column of whitespace.

Stack: Next.js App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons, Archivo + Archivo Narrow (self-hosted via `next/font/google`, no runtime CDN).

## Colors

**Strategy: Restrained board, Committed balance.** The board itself is Restrained — colour never touches the text field; sender, subject, and AI summary stay achromatic ink on bone. The Overview's balance band is the one Committed surface, where departure yellow owns a full-width region.

Three inviolable rules:
1. **Colour never touches the text field.** Category and priority live on the rail and badge only.
2. **Signal red means consequence** — overdue, urgent, failed sync, destructive confirmations. Nothing else.
3. **Departure yellow means "this requires you"** — primary actions, selection, focus ring, the Needs Reply platform, the waiting-on-you field.

Each of the seven platforms (categories) is an enamel colour **plus** a two-letter code (`NR`, `MT`, `IV`, `FY`, `NL`, `AU`, `SP`) — never colour alone. Priority is a drawn SVG shape (filled triangle / bar / hollow circle), not a colour. Confidence is encoded as the platform badge's edge style (solid ≥85, faint 70–84, dashed 50–69, routes to Review Queue below 50) — state as line form, verified to survive full greyscale rendering.

Dark mode is the illuminated concourse board at night (`data-theme="dark"`), not a simple inversion — near-black ground, lifted signal red (`#FF4D63`) for dark-ground contrast, departure yellow warmed slightly (`#FFD11A`).

## Typography

One family throughout: **Archivo**, an information-design grotesque built for small-size, high-density printing — literally the timetable-poster problem. **Archivo Narrow** carries the platform rail, column heads, and platform/tone codes (`font-narrow`), matching how real destination boards set their compressed labels.

Fixed rem scale (no fluid/clamp sizing — product UI is viewed at consistent DPI): display 3.5rem/700 reserved solely for the two balance-band counts (the largest figures in the product); headings 1.0625–1.5rem/600–650; body 0.9375rem/400; row text 0.875rem; labels 0.6875rem/700, uppercase, tracked +0.08em.

**Tabular numerals are mandatory** (`font-variant-numeric: tabular-nums`) on every quantity: the delay column, counts, confidence, chart axes, currency. This is enforced globally via `.tabular` and inherited by `html`.

Prose and message bodies clamp to a 68ch measure (`.measure`); board rows and data tables run full width — the deliberate exception that makes the board work.

## Layout

Shell: a 56px concourse bar (search, sync clock, density/theme toggles, account) over a flex row of platform rail + main content. The rail is 216px full at ≥1024px (`lg:`), collapses to a 56px icon rail with tooltips at 768–1023px (`md:`), and becomes an off-canvas Sheet drawer below 768px, triggered from a hamburger button in the concourse bar.

**The board row reflows structurally, not just visually, below 900px** (`min-[900px]:` breakpoint): the single-line desktop row (aspect · sender · summary · tone · badge · counts · time · delay) becomes two stacked lines — line 1 carries aspect, sender, platform badge, and the delay figure; line 2 carries the AI summary. Per-row hover actions (archive/snooze/done/star/open-in-Gmail) are desktop-only (`min-[900px]:group-hover:flex` etc.) since there is no hover state on touch. The delay column and the AI summary are the two pieces of information that survive at every width down to 320px; everything else moves into the Board Sheet.

**The Board Sheet replaces a third pane.** Rather than a classic filters/list/detail three-pane layout, the focused row's full detail expands as an absolutely-positioned overlay across the board column only (rail and any standing panel stay visible), with a 35%-opacity scrim dimming the rows behind it. This keeps the AI's reasoning at a readable 68ch measure at every viewport instead of squeezing it into a 300–400px pane. The sheet's own header uses `flex-wrap` with the close button pulled out of flow (`absolute`) so long sender names and subjects wrap onto a second line on narrow screens instead of truncating to near-nothing.

Minimum 16px side gutter maintained via padding on the board wrapper, never a shorthand that would zero the sides.

## Elevation & Depth

Elevation is rare — the board is flat by design. Two levels only, both a real offset + soft blur, never a zero-offset "glow":

```
--shadow-sheet:   0 8px 24px -6px rgba(20,22,26,.18), 0 2px 6px -2px rgba(20,22,26,.12)
--shadow-popover: 0 4px 12px -3px rgba(20,22,26,.16), 0 1px 3px rgba(20,22,26,.10)
```

Dark mode raises the alpha and adds a 1px `--rule` edge, since shadow alone doesn't separate surfaces on a near-black ground.

Separators are **steel rules**, not flat CSS borders — a 1px line plus a 1px highlight beneath it (`.rule-b`), reading as a rolled steel edge catching light. `--rule-strong` marks section/table-head boundaries.

## Shapes

Radius is near-zero everywhere: `2px` on inputs, buttons, badges, panels, cards — station hardware is not rounded. The one exception is `999px` (pill) on tone pills and count chips, the only rounded elements in the system.

Icons: Lucide at 1.5px stroke throughout (16px in rows/buttons, 20px in rail/toolbars). Station-specific vocabulary with no library equivalent — priority aspects, the platform badge, the split-flap character cell, the Mondaine clock face, confidence-edge styling — is authored SVG at the same 1.5px stroke weight.

## Components

- **PlatformBadge** — a 76×20px enamel plate: platform number in an inset block + two-letter code. Confidence is the badge's own edge (solid/faint/dashed), never a separate colour.
- **PriorityAspect** — 10px authored SVG shape (filled triangle / bar / hollow circle), placed left of the sender name. Never colour alone.
- **DelayFigure** — the memorable moment. 64px, right-aligned, tabular, blank when on time. Uses `Flap` to animate only on a genuine value change.
- **Flap** — the one authored motion moment. Per-character `rotateX` split-flap, 180ms with a 12ms stagger, firing only when its underlying value changed (never on load, navigation, or filter). `prefers-reduced-motion` collapses it to an instant swap via the global reduced-motion rule.
- **BalanceBand** — the Committed colour surface. Two full-width fields (`WAITING ON YOU` in departure yellow, `WAITING ON THEM` in bone), each a `<Link>`, carrying the two largest figures in the product (`display` token).
- **BoardRow** — the core list item; see Layout for its two-line mobile reflow.
- **BoardSheet** — the detail overlay; see Layout.
- **SyncClock** — an authored SVG Mondaine clock. Its second hand sweeps during `syncing` and holds at 12 the moment a sync completes — the pause is the confirmation, not decoration.
- **UndoBar** — a bottom-anchored ink-on-bone bar, 8-second auto-dismiss with a draining progress rule, pausable on hover/focus. Every destructive action routes through it.
- **EmptyState** — centred, ≤44ch, one heading + one sentence + one action, no illustration, no icon over 24px. Each one names *why* it's empty and what would change it (see [board/empty-state.tsx](components/board/empty-state.tsx) call sites).
- **Charts** (`components/charts/*`) — flat fills, square corners, ruled gridlines, tabular axis labels, a `Show data` table fallback on every chart. Each chart SVG sets its CSS `aspect-ratio` to exactly match its own `viewBox` ratio and omits `preserveAspectRatio="none"` — text and bars must scale uniformly, or axis labels render as illegible non-uniformly-stretched glyphs (a real bug hit and fixed during this build). Platforms 4/5/6 (Fyi/Newsletter/Automated), being close neutrals, additionally carry a pattern fill (diagonal hatch / dot / cross-hatch) so category is never colour-only in a chart either.

## Do's and Don'ts

- **Do** keep the delay column present, right-aligned, and non-collapsing at every width down to 320px — it is the one thing a user should be able to scan without reading a row.
- **Do** encode every category, priority, tone, and confidence signal in at least two channels (colour + code / shape / edge style / word) — verified by rendering the board in greyscale.
- **Do** animate the split-flap only on a genuine value change. A flap firing on page load or on a filter change is a defect, not a flourish — it breaks the rule that made the motion meaningful in the first place.
- **Do** give every SVG chart a `viewBox`-matched CSS `aspect-ratio` and default `preserveAspectRatio`. Never pair `preserveAspectRatio="none"` with a viewBox whose aspect differs from the rendered box — it stretches text non-uniformly into illegible glyphs.
- **Don't** let colour alone carry meaning anywhere — category, priority, tone, confidence, and chart series all require a non-colour channel too.
- **Don't** round station hardware. `2px` radius is the system default; reaching for a soft `rounded-lg`/`rounded-xl` card is the category default this system explicitly refuses.
- **Don't** silently drop a message the classifier can't parse. Route it to the Review Queue with its failure reason intact — the queue is always visible in the rail, even at zero.
- **Don't** reintroduce a three-pane list/detail layout. The Board Sheet overlay (full reasoning at a 68ch measure, board dimmed behind it) is the considered replacement; see [design-spec.md](design-spec.md) §3.3 for why.
