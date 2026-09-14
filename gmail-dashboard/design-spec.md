# Smart Gmail Assistant — Design Specification

**The Departure Board**

This is the build contract for the prototype. It specifies the visual system, layout, components, interaction, and states precisely enough to build from without further design decisions. It is written for the engineer building the prototype.

> **On the filename.** This is `design-spec.md`, the pre-build contract. `DESIGN.md` — the durable rulebook describing the system *as built* — is written at the finish, from the shipped code. On a case-insensitive filesystem the two names would collide, hence the distinct name. Read this to build; read `DESIGN.md` afterwards to extend.

Companion documents: [PRODUCT.md](PRODUCT.md) (product truth), [smart-gmail-assistant-dashboard.md](smart-gmail-assistant-dashboard.md) (feature scope), [.impeccable/surfaces/app.md](.impeccable/surfaces/app.md) (direction contract).

---

## 1. The idea

**Your inbox is a station concourse, not a feed.**

Every message is a scheduled departure carrying a platform, a time, and a delay figure. The board's entire job is to tell you what is late and what is boarding now.

This refuses the two arrangements the category always ships: the reverse-chronological three-pane mail list with a violet accent, and its predictable opposite, the warm calm serif productivity app. Continental station information design — the SBB and DB timetable posters, the split-flap board, the Mondaine platform clock — is a 90-year-old, field-proven answer to exactly this problem: *rank many time-sensitive obligations for a stranger in five seconds, under bad light, from across a room.* That is the product's brief, already solved.

**The memorable moment is the delay column.** One right-aligned tabular figure per row. Blank when a message is on time, `+3d` in signal red when it is not. An inbox with nothing late reads as a column of whitespace, and the user learns to scan one column instead of reading rows.

### What this does not become

The world is **structural and material**, never a costume:

- **Copy stays plain.** Rows are not "services", archiving is not "cancelling", the audit log is not the "working timetable." Operate mode means the tool disappears into the task; renaming standard functions for flavour is the opposite. The one place station language is allowed is where it is genuinely clearer than the alternative — the empty board reads *"Board clear."*
- **No skeuomorphism.** No photographic metal, no drop-shadowed plastic, no textured paper images, no CRT scanlines. The world is carried by structure, colour discipline, typographic rhythm, and one mechanical motion.
- **The flap is a mechanism, not a theme.** It animates only when a value actually changed. See §5.5.

---

## 2. Foundations

### 2.1 Colour

**Strategy: Restrained board, Committed balance.** The inbox board is Restrained — the text field is achromatic ink on bone, and colour is confined to the rail and the platform badge. The Overview's balance band is the one Committed surface, where departure yellow owns a whole region at page scale. This split is a deliberate design rule, not an inconsistency: *colour never touches the text field* (§2.1.3).

**Light is the default, from the use scene:** a solo consultant at a laptop in a daylit office or home office, between meetings, window not maximised. That is a daylight scene, and a bone-paper board is what belongs in it. Dark mode is not an inversion — it is the illuminated concourse board at night, where the board glows and the surround falls away.

#### 2.1.1 Tokens — light

```css
:root {
  /* Ground */
  --ground:          #F2F0EB;  /* bone paper — app background */
  --surface:         #FAF9F6;  /* board field — rows, panels */
  --surface-sunk:    #E9E6DF;  /* rail, toolbars, second neutral layer */
  --surface-raised:  #FFFFFF;  /* sheet, popover, dialog */

  /* Ink */
  --ink:             #14161A;  /* primary text */
  --ink-secondary:   #4A4F57;  /* summaries, meta — 7.4:1 on --surface */
  --ink-tertiary:    #6E747E;  /* labels, timestamps — 4.6:1 on --surface */
  --ink-disabled:    #A0A5AD;  /* non-text only */

  /* Signal */
  --signal:          #C8102E;  /* consequence: overdue, urgent, failed, destructive */
  --signal-field:    #FBE8EA;  /* signal on a field */
  --departure:       #FFCC00;  /* departure yellow — action, selection, focus */
  --departure-ink:   #14161A;  /* the only text colour legal on --departure */
  --departure-field: #FFF4CC;  /* yellow at field strength */
  --cleared:         #1B7F4C;  /* done, sent, synced, positive delta */
  --cleared-field:   #E4F2EA;

  /* Steel rules (see §2.4) */
  --rule:            #D8D4CB;
  --rule-highlight:  rgba(255, 255, 255, 0.70);
  --rule-strong:     #B8B3A8;  /* section and table-head rules */
}
```

#### 2.1.2 Tokens — dark (the night board)

```css
:root[data-theme="dark"] {
  --ground:          #0E0F12;
  --surface:         #16181C;
  --surface-sunk:    #101215;
  --surface-raised:  #1E2126;

  --ink:             #F0EEE8;
  --ink-secondary:   #B4B8BF;  /* 8.1:1 on --surface */
  --ink-tertiary:    #878C95;  /* 4.9:1 on --surface */
  --ink-disabled:    #565B63;

  --signal:          #FF4D63;  /* lifted for dark-ground contrast — 5.2:1 */
  --signal-field:    #2C1418;
  --departure:       #FFD11A;
  --departure-ink:   #14161A;
  --departure-field: #2E2608;
  --cleared:         #3FBF7F;
  --cleared-field:   #0F2A1C;

  --rule:            #2A2D33;
  --rule-highlight:  rgba(255, 255, 255, 0.06);
  --rule-strong:     #3A3E46;
}
```

Bind with `data-theme` on `<html>`, defaulting from `prefers-color-scheme`, with an explicit user override persisted to `localStorage`. Wrap every storage read/write in `try/catch` and render correctly when it throws.

#### 2.1.3 The colour law

Three rules, enforced everywhere:

1. **Colour never touches the text field.** Sender, subject, summary, and body are always `--ink` / `--ink-secondary`. Category and priority live on the rail and the platform badge only. A dense board must never become a carnival.
2. **Signal red means consequence.** Overdue, urgent, failed sync, and destructive confirmations — nothing else. Never for a category, never for a chart series, never for decoration. *(This widens the direction contract's "reserved exclusively for lateness" deliberately: overdue and urgent are the same message to the user — "this will hurt you" — and one colour for one meaning makes the board scannable in a way two would not.)*
3. **Departure yellow means "this requires you."** Primary actions, current selection, focus ring, the Needs Reply platform, and the Waiting-on-you field. Never decorative.

#### 2.1.4 Platform palette (the seven categories)

Each category is a platform with a number, a two-letter code, and an enamel badge colour. **The code is not optional** — it ships alongside the colour on every badge, so nothing is encoded by colour alone.

| P | Category | Code | Enamel (light) | Enamel (dark) | Badge text |
|---|---|---|---|---|---|
| 1 | Needs Reply | `NR` | `#FFCC00` | `#FFD11A` | `--departure-ink` |
| 2 | Meeting | `MT` | `#1B5FA8` | `#4A93DB` | `#FFFFFF` / `#0E0F12` |
| 3 | Invoice | `IV` | `#1B7F4C` | `#3FBF7F` | `#FFFFFF` / `#0E0F12` |
| 4 | FYI | `FY` | `#5B6470` | `#8A929D` | `#FFFFFF` / `#0E0F12` |
| 5 | Newsletter | `NL` | `#8C8578` | `#ADA697` | `#FFFFFF` / `#0E0F12` |
| 6 | Automated | `AU` | `#3A3F47` | `#666D77` | `#FFFFFF` / `#0E0F12` |
| 7 | Spam-ish | `SP` | `#7A3B2E` | `#B06A58` | `#FFFFFF` / `#0E0F12` |

Every enamel/text pairing above clears 4.5:1. Verify after any change.

**In charts**, platforms 4/5/6 are three close neutrals and will not separate by hue. They carry a pattern fill in addition — P4 diagonal hatch (45°, 2px), P5 dot (2px, 5px pitch), P6 cross-hatch — the doubly-encoded rule applied to data. See §9.8.

#### 2.1.5 Priority — signal aspects

Priority is a **shape**, drawn as authored SVG, 10px, sitting immediately left of the sender name.

| Priority | Aspect | Fill | `aria-label` |
|---|---|---|---|
| Urgent | Filled triangle, apex up | `--signal` | "Urgent" |
| Normal | Horizontal bar, 10×3 | `--ink-tertiary` | "Normal priority" |
| Low | Hollow circle, 1.5px stroke | `--ink-tertiary` at 60% | "Low priority" |

#### 2.1.6 Tone

Tone renders **only when non-neutral** — the restraint is the point. A compact uppercase pill at the row's right, before the delay column.

- `TENSE` — `--signal-field` ground, `--signal` text, 1px `--signal` rule
- `WARM` — `--cleared-field` ground, `--cleared` text, 1px `--cleared` rule
- Neutral — nothing rendered

Each carries a tooltip naming the evidence: *"Tense — short sentences, a repeated request, and 'as I mentioned again'."*

### 2.2 Typography

**One family: [Archivo](https://fonts.google.com/specimen/Archivo)** (Omnibus-Type, SIL OFL), self-hosted as woff2. Archivo is an information-design grotesque drawn for high-performance printing at small sizes across a wide width range — literally the timetable-poster problem. **Archivo Narrow** carries the platform rail and dense column heads, which is what real timetable posters do with destination columns.

Self-host; do not link Google's CDN. Ship `Archivo[wdth,wght].woff2` (variable) and `ArchivoNarrow[wght].woff2`, `font-display: swap`, preloaded.

```css
--font-sans:   "Archivo", ui-sans-serif, system-ui, sans-serif;
--font-narrow: "Archivo Narrow", "Archivo", ui-sans-serif, sans-serif;
```

**Tabular numerals are mandatory** on every figure that means a quantity — delay column, counts, confidence, times, currency, chart axes:

```css
font-variant-numeric: tabular-nums lining-nums;
font-feature-settings: "tnum" 1, "lnum" 1;
```

#### Scale — fixed rem, ratio ≈1.2

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `board` | 3.5rem / 1.0 | 700 | −0.03em | The two balance counts. Nothing else. |
| `figure` | 2.25rem / 1.05 | 700 | −0.02em | Summary-strip and KPI figures |
| `h1` | 1.5rem / 1.25 | 650 | −0.015em | Route title |
| `h2` | 1.25rem / 1.3 | 650 | −0.01em | Section head |
| `h3` | 1.0625rem / 1.4 | 600 | 0 | Panel head |
| `body` | 0.9375rem / 1.55 | 400 | 0 | Prose, message body |
| `row` | 0.875rem / 1.45 | 400 | 0 | AI summary in a board row |
| `row-name` | 0.875rem / 1.45 | 600 | 0 | Sender name |
| `meta` | 0.8125rem / 1.4 | 450 | 0 | Timestamps, counts, secondary labels |
| `code` | 0.6875rem / 1 | 700 | 0.08em | Platform codes, column heads — ALL CAPS, Narrow |

Display ceiling 3.5rem, tracking floor −0.04em, both respected. No fluid/clamp sizing: users view product UI at a consistent DPI, and a heading that shrinks inside a panel looks worse, not better.

**Measure.** Prose and message bodies clamp to **68ch**. Board rows and tables may run to full width — dense tabular data is the exception to the measure rule and is why the board works. AI summaries clamp to **one line** in a row (`text-overflow: ellipsis`); the full text lives in the sheet.

**Headings balance:** `text-wrap: balance` on `h1`–`h3`, `text-wrap: pretty` on prose.

### 2.3 Space and grid

4px base. Tokens: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48 16=64`.

**Vertical rhythm rule:** more space above a heading than below it — `margin-top: 32px; margin-bottom: 12px` on `h2`, `24/8` on `h3`. Tight groups, generous separation between them.

**Row heights.** Comfortable `56px`, dense `44px` (user preference, persisted). Below 900px rows go two-line at `72px`. Touch targets never below 44px on coarse pointers.

**Board column grid** — 12 columns, 16px gutter, and the board row is a fixed subgrid so every row aligns down the page:

```
[aspect 16px] [sender 200px] [summary 1fr] [tone auto] [badge 76px] [meta 92px] [delay 64px]
```

The delay column is `64px`, right-aligned, and **never collapses at any breakpoint.** It is the memorable moment; everything else gives way first.

### 2.4 Steel rules, not CSS borders

A separator in this world is a rolled steel edge catching light — a 1px rule with a 1px highlight beneath it:

```css
.rule-b {
  border-bottom: 1px solid var(--rule);
  box-shadow: 0 1px 0 var(--rule-highlight);
}
```

Used on every row separator, table head, and section divider. `--rule-strong` for section boundaries and table heads. In dark mode the highlight is a 6% white, which reads as the board's edge glow.

**Radius is near-zero.** `--radius: 2px` on inputs, buttons, badges, and panels. `--radius-pill: 999px` on tone pills and count chips only. Station hardware is not rounded; soft-shadowed rounded rectangles are the category default this world refuses.

### 2.5 Depth

Elevation is rare — the board is flat. Two levels only, both with a real offset and a soft blur:

```css
--shadow-sheet:   0 8px 24px -6px rgba(20, 22, 26, 0.18), 0 2px 6px -2px rgba(20, 22, 26, 0.12);
--shadow-popover: 0 4px 12px -3px rgba(20, 22, 26, 0.16), 0 1px 3px rgba(20, 22, 26, 0.10);
```

Dark mode raises the alpha to `0.55` / `0.40` and adds a `1px solid var(--rule)` edge, because shadow alone does not separate surfaces on a dark ground.

No zero-offset coloured halos. No hard offset block shadows — this world is not neobrutalist.

### 2.6 Motion

**One authored moment: the split-flap** (§5.5). Everything else is functional and fast.

| Transition | Duration | Easing |
|---|---|---|
| Hover, focus, small state | 120ms | `cubic-bezier(.2,0,.2,1)` |
| Sheet open / close | 220ms | `cubic-bezier(.16,1,.3,1)` (exponential out) |
| Row enter / exit | 180ms | `cubic-bezier(.2,0,.2,1)` |
| Undo bar in / out | 200ms | `cubic-bezier(.16,1,.3,1)` |
| Split-flap, per character | 180ms, 12ms stagger | `cubic-bezier(.33,0,.15,1)` |

All motion begins from an already-visible default — nothing fades in from nothing on load. **No page-load choreography.** The board is present on first paint; the user came to work, not to watch it arrive.

`@media (prefers-reduced-motion: reduce)`: flaps become a 120ms crossfade, the sheet becomes an instant swap with a 90ms opacity settle, the clock hand goes static. Nothing is removed — only the movement.

### 2.7 Icons

**Lucide**, 1.5px stroke, 16px in rows and buttons, 20px in the rail and toolbars. One stroke weight throughout, no filled variants mixed in.

**Authored SVG** for the station vocabulary, which has no library equivalent: the three priority aspects, the platform badge, the flap character cell, the clock face, and the confidence gauge. Draw these at 1.5px to match Lucide exactly.

No emoji, no Unicode glyphs standing in for icons anywhere — including in empty states and the command palette.

### 2.8 Browser surfaces

The parts you did not draw still carry the design. All of these are themed:

```css
::selection        { background: var(--departure); color: var(--departure-ink); }
:root              { caret-color: var(--signal); accent-color: var(--departure); }
:focus-visible     { outline: 2px solid var(--departure); outline-offset: 2px;
                     box-shadow: inset 0 0 0 1px var(--ink); }
:root              { scrollbar-color: var(--ink-tertiary) var(--surface-sunk);
                     scrollbar-width: thin; }
a                  { text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
```

WebKit scrollbars: 10px wide, square thumb (`--radius: 0`), no rounding — steel, not plastic. The focus ring pairs yellow with an inset ink line so it survives on both the bone ground and a yellow field.

---

## 3. Layout

### 3.1 The shell

```
┌──────────────────────────────────────────────────────────────────────┐
│  CONCOURSE BAR    search · sync clock · theme · account         56px │
├─────────┬──────────────────────────────────────┬─────────────────────┤
│         │                                      │                     │
│ PLATFORM│         BOARD                        │  STANDING BOARD     │
│  RAIL   │         max-width 1100px             │  280px, ≥1600 only  │
│  216px  │                                      │                     │
│         │                                      │                     │
└─────────┴──────────────────────────────────────┴─────────────────────┘
```

- **Concourse bar** — 56px, `--surface-sunk`, bottom steel rule. Global search (⌘K hint), sync clock, density toggle, theme toggle, account.
- **Platform rail** — 216px, `--surface-sunk`, right steel rule. Routes on top, the seven platforms below with live counts.
- **Board** — `--ground`, content `max-width: 1100px`, centred when the standing board is absent.
- **Standing board** — 280px, `--surface-sunk`, ≥1600px only. Persistent: the balance counts, today's late items, sync state. Below 1600 its content folds into the board's top band.

### 3.2 Breakpoints

| Width | Rail | Board | Sheet | Rows |
|---|---|---|---|---|
| ≥1600 | 216px full | centred, standing board right | overlays board column | 56px |
| 1280–1599 | 216px full | full remaining width | overlays board column | 56px |
| 900–1279 | 56px icons, labels on hover/focus | full remaining | overlays board column | 56px |
| 600–899 | off-canvas drawer | full width | full-screen | 72px, two-line |
| <600 | off-canvas drawer | full width, 12px gutters | full-screen | 72px, two-line |

Responsive behaviour is **structural** — the rail collapses, the row reflows to two lines, the standing board folds. Type sizes never change across breakpoints.

**Below 900px the row reflows** but never drops information:

```
line 1:  ▲  Marcus Reed              [NR]   +3d
line 2:  Asking for the revised SOW before Thursday's call
```

The delay column survives. The summary survives. Meta moves into the sheet.

**Minimum side gutter 16px at every width.** Set once on the board wrapper with `padding-inline`, never a `padding` shorthand that could zero the sides.

### 3.3 Why there is no third pane

The source spec asks for a three-pane inbox: filters, list, detail. **This deviates deliberately**, and the information architecture is fully preserved.

The classic three-pane mail layout is precisely the arrangement the thesis refuses — it is what every mail client ships, and at a 420px detail pane it forces the AI's reasoning (summary, thread timeline, entities, action items, suggested reply, why-prioritised, sender history) into a column too narrow to read. The product's whole value is that reasoning; giving it the worst column on the screen is a structural mistake.

Instead: **the Board Sheet** (§5.7). The focused row expands in place over the board column. The board behind it dims and locks, the row's own header pins to the top of the sheet, and the rows immediately above and below stay visible as dimmed ruled edges — so the user can always see they are at position 3 of 18. `Esc` collapses to exactly the prior scroll position.

This keeps every piece of information the spec asked for, gives the reasoning a readable measure, preserves the sense of place in the queue, and works identically at every width.

*Deliberately omitted:* an optional two-up mode at very wide widths. One mechanism is better than two configurable ones in a prototype.

---

## 4. Filters, not a filter pane

The rail carries the seven platforms with live counts — that is the primary filter and it is always visible. Everything else lives in a **filter bar** directly above the board, one ruled row:

```
[ Priority ▾ ] [ Sender ▾ ] [ Date ▾ ] [ ☐ Has action items ] [ ☐ Unanswered ]     18 of 214    [ Save view ]
```

Active filters render as removable chips on a second line, each with its value and an `×`. The result count is always shown and always tabular. Saved views appear in the rail beneath the platforms, each with its own count.

---

## 5. The station vocabulary

Eight signature components. Everything else in the app is a shadcn/ui primitive restyled to these tokens — same button shape, same form-control vocabulary, same icon style, everywhere.

### 5.1 Platform rail — `<PlatformRail />`

```
  BOARD
  ▸ Overview              6
  ▸ Inbox               214
  ▸ Action items         31
  ▸ Drafts                8
  ▸ Follow-ups           12
  ▸ Contacts
  ▸ Analytics
  ─────────────────────────
  PLATFORMS
  1  NEEDS REPLY         18
  2  MEETING              6
  3  INVOICE              3
  4  FYI                 41
  5  NEWSLETTER          97
  6  AUTOMATED           44
  7  SPAM-ISH             5
  ─────────────────────────
  SAVED VIEWS
  Client · needs reply    7
  This week's invoices    3
  ─────────────────────────
  ⚠ REVIEW QUEUE          4
  ─────────────────────────
  ▸ Rules
  ▸ Settings
```

- Section heads in `code` token (Archivo Narrow, caps, tracked), `--ink-tertiary`.
- Platform rows: a 20×20 enamel square carrying the platform number, then the name, then a right-aligned tabular count.
- **Active platform**: 3px `--departure` left edge, `--surface` ground, `--ink` at weight 600. *(A 3px edge on an active nav item is the one place a thick left edge is legitimate — it is a selection indicator on a rail, not decoration on a card.)*
- **Review queue** always renders, always in `--signal` when non-zero, even at zero — Product Principle 3: never silently drop mail.
- Collapsed (56px): enamel squares only, name and count in a popover on hover or focus.

### 5.2 Timetable row — `<BoardRow />`

The single most important component. Used unchanged in Overview's priority queue, the Inbox board, search results, and saved views.

```
 ▲  Marcus Reed  ★    Asking for the revised SOW before Thursday's call   TENSE  [1 NR]  2 ✓ 1 📎  14:22   +3d
 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
 ▬  Stripe            Invoice INV-2291 for £4,200 is due in 6 days               [3 IV]        09:04
```

Left to right: priority aspect · sender name (600) with VIP star if flagged · **AI one-line summary** (this replaces the preview snippet entirely, per spec) · tone pill if non-neutral · platform badge · action-item and attachment counts · time · **delay figure**.

- Unread: sender name at 700 and a 3px `--ink` square in the aspect gutter. Not bold body text — that would put emphasis in the text field.
- Hover: `--surface-raised` ground, 120ms. Row actions fade in over the meta column.
- Focus (keyboard): the full focus ring from §2.8, and the row scrolls into view with 64px of lead so the user is never reading at the viewport edge.
- Selected (bulk): `--departure-field` ground, checkbox in the aspect gutter.
- Handled: the row stays on the board for the session, at 55% opacity with a `--cleared` check in the aspect gutter and a small caps trace — `ARCHIVED 14:31 · UNDO`. *Handled work leaves a trace; it does not vanish.*

**Row actions** (hover, or `.` on a focused row): Archive · Snooze · Mark done · Change platform · Star · Open in Gmail. Icon-only, 28px targets, each with an accessible name and a tooltip carrying its keyboard shortcut.

### 5.3 Platform badge — `<PlatformBadge />`

A 76×20 enamel plate: the platform number in a darker inset block, then the two-letter code, tracked caps. 2px radius.

**Confidence is encoded in the badge edge** — the emission-rail discipline of state-as-line-form:

| Confidence | Edge | Meaning |
|---|---|---|
| ≥ 85 | Solid 1px | Confident |
| 70–84 | Solid 1px, 70% opacity enamel | Probable |
| 50–69 | **Dashed 1px** (3,2) | Uncertain — check it |
| < 50 | — | Never reaches the board; routes to the Review Queue |

The numeric confidence renders in the sheet, never in the row. `aria-label` on every badge: *"Platform 1, Needs Reply, 62% confidence, uncertain."*

### 5.4 Delay column — `<DelayFigure />`

The memorable moment. 64px, right-aligned, `tabular-nums`, 0.875rem, weight 700.

| State | Renders | Colour |
|---|---|---|
| On time | *(nothing)* | — |
| Approaching SLA (≥75% elapsed) | `−4h` | `--ink-tertiary` |
| Overdue | `+3d` | `--signal` |
| Overdue > 7d | `+12d` | `--signal`, with a 2px `--signal` underline |
| Snoozed | `⌁ Tue` | `--ink-tertiary` |

Blank is the majority state, and that is the whole design. A clear board is a column of whitespace.

Every figure carries a title and screen-reader text: *"3 days overdue. Target reply within 24 hours."*

### 5.5 Split-flap — `<Flap />`

**The one authored motion moment, and it is a mechanism, not a theme.**

Rules, non-negotiable:

1. A flap animates **only when its underlying value actually changed** — category reassigned, priority changed, a message arriving onto the board, a status going to done, a count incrementing.
2. **Never on initial load. Never on route navigation. Never on filter change.** If the board is merely re-rendering, nothing flips.
3. Applies to **short tokens only**: platform codes, delay figures, and counts. Maximum 6 characters. Never to a sentence, a name, or a summary.
4. 180ms per character, 12ms stagger, `cubic-bezier(.33,0,.15,1)`.
5. Implemented as a 2-layer CSS `rotateX` on a character cell with `transform-origin: center bottom` and a 1px `--rule` split line across the middle. No library.
6. `prefers-reduced-motion`: 120ms crossfade, no rotation.
7. Announce the change once via `aria-live="polite"` on the row, not per character.

When these rules hold, the flip carries meaning: *something about this message changed.* Break any one of them and it becomes decoration — which is the direction's named risk.

### 5.6 Balance band — `<BalanceBand />`

The Committed colour moment. Full-width, two fields, no gap between them, a steel rule below.

```
┌──────────────────────────────────┬──────────────────────────────────┐
│  WAITING ON YOU                  │  WAITING ON THEM                 │
│                                  │                                  │
│  18                              │  12                              │
│  6 overdue · 12 within SLA       │  4 over a week · 8 recent        │
└──────────────────────────────────┴──────────────────────────────────┘
   --departure field, --ink text      --surface field, --ink text
```

- Left field: `--departure` ground, `--departure-ink` text. Right field: `--surface`.
- Counts in the `board` token — 3.5rem, 700. **These are the largest figures anywhere in the product**, and nothing else may use this token.
- Labels in `code` token above the figure. The breakdown line in `meta`, `--ink-secondary` on bone, and on the yellow field tinted from the yellow's own hue (`#5C4A00`) rather than grey — grey on yellow is the tell of an untuned palette.
- Both fields are buttons: each navigates to the corresponding filtered board.

This is **not** the hero-metric template. There is no icon, no accent stripe, no supporting stat cluster, no card. It is two coloured fields carrying one number each, and the yellow field owns a region of the page rather than accenting one.

### 5.7 Board sheet — `<BoardSheet />`

The email detail. Opens over the board column; the board dims to 35% and locks scroll.

```
┌────────────────────────────────────────────────────────────┐
│ ▲ Marcus Reed ★  ·  Revised SOW  ·  [1 NR]  ·  +3d      × │  ← pinned header, steel rule below
├────────────────────────────────────────────────────────────┤
│                                                            │
│  SUMMARY                                                   │
│  Marcus is asking for the revised SOW before Thursday's    │
│  10am call and has flagged the £4,200 line item twice.     │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ WHY THIS IS ON PLATFORM 1        confidence  86      │  │  ← yellow-field notice
│  │ · Marcus Reed is a VIP sender                        │  │
│  │ · A direct question is awaiting an answer            │  │
│  │ · A deadline is named: Thursday 10:00                │  │
│  │                            Wrong platform? Reassign  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  THREAD · 14 messages                        [ show all ]  │
│  ├ Mar 3  You      Sent the first SOW draft                │
│  ├ Mar 5  Marcus   Asked for the £4,200 line to be split   │
│  └ Mar 9  Marcus   Chasing, names Thursday 10:00           │
│                                                            │
│  EXTRACTED                                                 │
│  Dates  Thu 12 Mar 10:00 · Fri 13 Mar (invoice due)        │
│  Amounts  £4,200 · £1,150                                  │
│  People  Marcus Reed · Ana Silva                           │
│  Links  2   Attachments  1 (SOW-v2.pdf, 240 KB)            │
│                                                            │
│  ACTION ITEMS · 2                              [ + add ]   │
│  ☐ Send revised SOW          you      Thu 12 Mar   ▲       │
│  ☐ Split the £4,200 line     you      Thu 12 Mar   ▬       │
│                                                            │
│  SUGGESTED REPLY          [formal|friendly|brief|firm]  ↻  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Hi Marcus, — editable textarea, 68ch measure —       │  │
│  └──────────────────────────────────────────────────────┘  │
│  [ Review and send ]   [ Save as draft ]   [ Discard ]     │
│                                                            │
│  SENDER                                                    │
│  Marcus Reed · reed@northgate.co · VIP                     │
│  47 messages   your avg reply 6h   last contact 4d ago     │
│  3 open threads                                            │
│                                                            │
│  [ Open in Gmail ↗ ]                                       │
└────────────────────────────────────────────────────────────┘
```

- Prose at 68ch. Section heads in `code` token, `--ink-tertiary`, with 32px above and 12px below.
- **The "why" notice is a `--departure-field` panel with a 1px `--departure` rule.** It is the explainability moment — the thing that separates this from a black box — and it gets the only coloured field in the sheet. `Reassign` opens an inline platform picker; choosing a new platform **flips the badge** (a real value change) and records a correction.
- Thread timeline condensed to 3 entries with `show all`; each entry is date · author · one-line gist.
- `Esc` closes to the prior scroll position. `J`/`K` move to the previous/next message **with the sheet still open**, so the user can work the queue without collapsing.

### 5.8 Station clock — `<SyncClock />`

Top-right of the concourse bar. A 24px authored SVG clock face with a `--signal` second hand.

The real Mondaine station clock sweeps its second hand in 58.5 seconds, then **pauses at 12** waiting for the minute pulse. That stop-to-go pause is the mechanism, and here it means something: the hand sweeps through the sync interval and **holds at 12 the moment a sync completes.** The pause is the confirmation.

| State | Rendering | Label |
|---|---|---|
| Synced | Hand held at 12, face `--ink` | `Synced 14:22` |
| Syncing | Hand sweeping, face `--ink` | `Syncing · 34 queued` |
| Failed | Face `--signal`, hand stopped where it fell | `Sync failed · Retry` |
| Offline | Face `--ink-disabled`, hand hidden | `Offline · last synced 09:41` |

Click opens a popover: last sync, queue depth, failed item count with a link to the Review Queue, and a manual **Resync**. Reduced motion: hand static, state carried by the label and face colour alone.

---

## 6. Interaction

### 6.1 Keyboard

The triage loop is fully keyboard-operable. This is a **core interaction path**, not an accessibility accommodation — it is how the product is meant to be used.

| Key | Action |
|---|---|
| `J` / `↓` | Next row |
| `K` / `↑` | Previous row |
| `Enter` | Open the board sheet |
| `Esc` | Close sheet / clear selection / close palette |
| `E` | Archive |
| `R` | Reply (opens sheet at the draft) |
| `S` | Snooze (opens the snooze picker) |
| `D` | Mark done |
| `X` | Toggle selection |
| `⇧J` / `⇧K` | Extend selection |
| `1`–`7` | Reassign to platform *n* (flips the badge) |
| `!` | Toggle VIP on the sender |
| `U` | Undo the last action |
| `G` then `I`/`A`/`D`/`F`/`O` | Go to Inbox / Action items / Drafts / Follow-ups / Overview |
| `⌘K` / `Ctrl K` | Command palette |
| `/` | Focus search |
| `?` | Shortcut sheet |

A persistent `?` affordance sits in the concourse bar. Shortcuts appear in every row-action tooltip, so the keyboard map is learnable from the UI rather than from documentation.

### 6.2 Command palette — `⌘K`

Centred dialog, 560px, `--surface-raised`, `--shadow-sheet`. Uses `<dialog>` or the popover API so it escapes every `overflow` ancestor.

Grouped results, each group headed in the `code` token: **Actions** (archive, snooze, reassign, triage all, resync) · **Go to** (routes, platforms, saved views) · **Messages** (live search over summaries) · **Action items** · **Contacts**.

Each row shows its shortcut right-aligned. Fuzzy match, arrows to move, `Enter` to run. Empty query shows the five most recent actions.

### 6.3 Global search — `/`

Searches **AI summaries, action items, and contacts** — not just subject and body, which is the point. Results render as board rows grouped by type, with the matched span marked using `<mark>` themed to `--departure-field` (never a raw browser yellow).

### 6.4 Undo

**Every destructive action is reversible**, per Product Principle 4.

An undo bar rises from the bottom of the board column — `--ink` ground, `--ground` text, 44px, 200ms — reading `Archived · Marcus Reed` with an `Undo (U)` button and a thin `--departure` progress rule draining across the bottom over 8 seconds. It never covers the delay column or the last row.

Consecutive actions collapse into one bar: `3 archived · Undo`. Hovering or focusing the bar pauses the drain. Bulk actions get 15 seconds.

### 6.5 The commit station

Borrowed discipline: a draft is staged against the original before it commits — **but reversible, because nothing here is fixer.**

`Review and send` does not send. It opens a two-column commit view inside the sheet: the original message at left, the final draft at right, both at full measure, with a diff marking what the user edited against what the AI generated. The only actions are `Send` and `Back to editing`. After sending: an 8-second undo window, then the send is recorded in the activity log with the diff attached — which is what feeds prompt tuning over time.

---

## 7. States

Every interactive component ships **default, hover, focus, active, disabled, loading, error**. No component ships with half of these.

### 7.1 Loading

**Skeletons, never spinners in content.** Board skeleton: 8 rows at the current row height, each a steel-ruled row with grey blocks at the real column positions and widths (sender 140px, summary 60% with a varied jitter per row, badge 76px). The blocks pulse 1.4s between `--rule` and `--surface-sunk`. The delay column stays empty in the skeleton, as it usually is in reality.

Spinners are permitted only inside a button that is mid-action, at 14px, in the button's own foreground colour.

### 7.2 Empty

Empty states teach the interface. Each is a centred block at 44ch: a one-line heading in `h2`, one sentence of `body` in `--ink-secondary`, and one primary action. No illustration, no emoji, no icon larger than 24px.

| Surface | Heading | Body | Action |
|---|---|---|---|
| Board, all handled | **Board clear.** | Nothing is waiting on you. 12 messages are waiting on other people. | View waiting on them |
| Board, filtered to nothing | **No departures match.** | Three filters are active. Clearing the date range would show 41 messages. | Clear date range |
| Action items | **No open action items.** | Items appear here as they are found in your mail. The last scan was at 14:22. | Scan now |
| Drafts | **No drafts waiting.** | Drafts appear here when a message is classified Needs Reply and a reply is generated. | Go to Needs Reply |
| Follow-ups | **Nothing outstanding.** | You have no unanswered sent mail and no promises coming due. | — |
| Review queue | **Nothing needs review.** | Messages the classifier is unsure about land here rather than being dropped. | — |
| First run | **Connect a mailbox to start.** | Nothing is read or classified until you connect an account. | Connect Gmail |

Note the pattern: each empty state names *why* it is empty and what would change it. "Nothing here" is never enough.

### 7.3 Error

Errors name the problem and the recovery, in the product's own language.

- **Sync failed** — a full-width band above the board: `--signal-field` ground, 1px `--signal` rule, `--signal` icon, ink text. *"Sync failed at 14:22 — Gmail rate limit reached. Retrying automatically at 14:37."* with `Retry now`. Never a toast; sync failure must persist until resolved.
- **Classification failed** — the message routes to the Review Queue with its raw subject and sender intact and a reason: *"Could not read this message — the body is an image with no text."* Actions: `Classify manually` · `Open in Gmail`.
- **Draft generation failed** — inline in the sheet, replacing the textarea: *"Could not generate a reply — the thread is longer than the model can read. Try replying to the last message only."* with `Retry` and `Write manually`.
- **Field validation** — 1px `--signal` rule on the input, message below in `--signal` at `meta`, `aria-describedby` wired, `aria-invalid="true"`.

### 7.4 The review queue

Its own route, reached from the rail, always visible even at zero. Messages with confidence < 50 or a parse failure. Each row shows the raw sender and subject, the failure reason, and a manual platform picker. **Nothing is ever silently dropped** — this route is the product's proof of that.

---

## 8. Accessibility

WCAG 2.2 AA is the floor.

- **Nothing encoded by colour alone.** Every category carries its two-letter code, every priority its shape, every tone its word, every confidence band its edge style. Verify by rendering the board in greyscale — it must remain fully readable.
- **Contrast:** body and placeholder ≥4.5:1, large text ≥3:1, UI component boundaries ≥3:1. On the yellow field, secondary text is tinted from the yellow's own hue, never grey.
- **Focus:** visible on every interactive element, never removed. The board's roving tabindex puts one row in the tab order; `J`/`K` move focus within it.
- **Semantics:** the board is `role="grid"` with `aria-rowcount`; each row is `role="row"` with an accessible name composed as *"Marcus Reed, Needs Reply, urgent, 3 days overdue, Asking for the revised SOW."* The sheet is a `<dialog>` with a focus trap, labelled by the subject, returning focus to its originating row on close.
- **Live regions:** `aria-live="polite"` for sync state, undo announcements, and result counts. `aria-live="assertive"` reserved for errors.
- **Motion:** `prefers-reduced-motion` honoured throughout, per §2.6.
- **Targets:** 44×44 minimum on coarse pointers; 28px permitted for row actions on fine pointers, where the whole row is also clickable.
- **Zoom:** usable to 200% without horizontal scroll. Only the board's table region may scroll horizontally, inside its own `overflow-x: auto`.

---

## 9. Screens

All ten modules, in the build order PRODUCT.md records.

### 9.1 Smart Inbox — `/inbox` *(build 1)*

Rail + filter bar + board + sheet. The board is `<BoardRow />` repeated, virtualised above 200 rows. Sort defaults to priority score, not date — a sort control offers Priority · Date · Delay · Sender, and **Priority is the default because the entire thesis is that the tool ranks for you**.

Bulk: `X` or checkbox selects; a selection bar replaces the filter bar showing `4 selected` and the bulk actions (archive, snooze, mark done, reassign, star), with `Esc` to clear.

### 9.2 Email detail — the board sheet *(build 1)*

Specified in full at §5.7.

### 9.3 Action items — `/actions` *(build 2)*

Two views, toggled in the filter bar, state in the URL.

- **List** — a ruled table: checkbox · text · source message (opens the sheet) · owner · due date (tabular, `--signal` when overdue) · priority aspect · status. Grouped by `Overdue` / `Due this week` / `Later` / `No date`, each group headed in the `code` token with a count.
- **Kanban** — three columns (To do / In progress / Done), each a ruled panel with a tabular count in its head. Cards are compact: text, source, due, owner. Drag with a keyboard equivalent (`⇧←` / `⇧→` moves a focused card between columns) — drag is never the only way.

Manual add is an inline row at the top of the list, not a modal. Export opens a popover offering Todoist · Notion · Jira · CSV; the first three are affordances only in the prototype and say so plainly: *"Not connected — connect in Settings."*

### 9.4 Overview — `/` *(build 3)*

Top to bottom:

1. **Balance band** (§5.6).
2. **Summary strip** — one continuous ruled row, five columns, each a tabular figure in the `figure` token over a `code`-token label: Unread · Overdue · Open action items · Processed today · Time saved. **Not six cards** — one board, column-ruled, which is what a concourse summary looks like and what this world requires.
3. **Today's priority queue** — 5–10 `<BoardRow />`, each with its reason as a `meta` line beneath the summary: *"VIP sender · deadline named."*
4. **Volume trend** — received vs handled, 14 days. Two bars per day: received as a 1px `--ink-tertiary` outline, handled as a solid `--ink` fill. Square corners, flat fills, no gradient, no area, no rounding. Ruled baseline and gridlines every 10 in `--rule`. Tabular axis labels. Hover gives a value tooltip; the whole chart has a `<table>` fallback for screen readers.
5. **Quick actions** — a ruled footer strip: `Triage new mail` (primary, `--departure`) · `Review drafts` · `Clear low-priority`.

### 9.5 Drafts — `/drafts` *(build 4)*

A queue of drafts. Each opens the side-by-side commit view (§6.5) directly — original left, draft right, both at full measure.

Tone as a 4-segment control (formal / friendly / brief / firm), length as a 3-segment control (brief / standard / detailed). Regenerate is a 16px Lucide `refresh-cw` beside the tone control, and shows a 14px in-button spinner while working.

Snippets live in a right-hand popover, inserted at the caret. Approval history is a ruled table: date · message · what was edited (a word-level diff) · time to approve. This table is the prompt-tuning signal; label it as such.

### 9.6 Follow-ups — `/follow-ups` *(build 5)*

Three ruled sections, each headed in the `code` token with a count, each row a `<BoardRow />` variant where the delay column carries days elapsed:

- **Awaiting reply** — sent with no response. Delay = days since sent.
- **You promised** — commitments detected in the user's own sent mail, quoted verbatim with the sentence that triggered detection, plus a confidence badge. Delay = days to or past the due date.
- **Promised to you** — commitments others made. Same treatment.

Each row offers `Nudge` — which opens the commit view pre-loaded with a generated follow-up, never sending directly.

### 9.7 Contacts — `/contacts` *(build 6)*

A ranked ruled table: avatar · name · domain · messages · your avg reply time (tabular) · last contact · open threads · VIP toggle. Sortable by any column, grouped optionally by domain with a company sub-head.

A contact row opens a sheet: the four figures as a compact strip, tone history as a 12-month strip of small squares (warm / neutral / tense — each with its word on hover), and open threads as board rows.

### 9.8 Analytics — `/analytics` *(build 6)*

Chart rules, applied to all of them:

- Flat fills, square corners, ruled baselines and gridlines in `--rule`, tabular axis labels, no gradients, no shadows, no 3D, no rounded bars.
- Categorical series use the platform enamel palette **plus the pattern fills from §2.1.4** for platforms 4/5/6, so the seven categories separate in greyscale and for colourblind readers.
- Every chart has a `<table>` fallback and a `Show data` toggle that reveals it inline.
- Direct labelling in preference to a legend wherever the chart has room.

Charts: volume by day (grouped bars) · volume by hour (bars) · category over time (stacked area, flat fills) · response-time distribution (histogram, `--signal` target line) · **busiest-hours heatmap** (7×24 grid, single-hue sequential ramp from `--surface` to `--ink`, never a rainbow, each cell labelled on hover).

AI performance gets its own ruled section: classification accuracy, draft acceptance rate, edit rate, and estimated time saved. **Every figure here carries a footnote — "Prototype figures from fixture data, not measured results."** PRODUCT.md forbids presenting these as real, and the UI must say so where they are shown.

### 9.9 Rules — `/rules` *(build 6)*

A ruled list of rules, each a single row: condition summary · action summary · enabled toggle · run count · edit.

The builder is an inline ruled form, not a modal and not a drag-drop canvas: `IF [field ▾] [operator ▾] [value]` with `+ and` / `+ or`, then `THEN [action ▾] [target ▾]`. A live preview shows *"Would have matched 23 messages in the last 30 days"* with a link to see them — which is the difference between a rule builder you trust and one you guess at.

Category management (rename, merge, create) and priority weighting sliders sit in their own sections. Auto-reply rules carry a mandatory daily cap and a required confidence floor, both surfaced in the rule row, because an auto-reply is the one irreversible action in the product.

### 9.10 Settings — `/settings` *(build 6)*

Plain ruled sections, one column, 68ch: Accounts (connection, sync status, last sync, manual resync) · AI (model, temperature, summary length, signature, writing-style samples) · Notifications (digest schedule) · **Privacy** (exclusion rules for mail that never goes to the model, retention period, purge — with a typed confirmation on purge) · Working hours and timezone · Appearance (theme, density) · **Activity log** (a ruled table of every automatic action: timestamp, action, target, rule or model that caused it, and undo where still possible).

The activity log is a first-class surface with its own anchor, not a footnote — *handled work leaves a trace.*

---

## 10. Data shapes

These types are the contract between the fixture layer and the views. Views import only from `lib/data/*`; swapping fixtures for a real Gmail + LLM backend must not require touching a component.

```ts
export type Platform =
  | 'needs-reply' | 'meeting' | 'invoice'
  | 'fyi' | 'newsletter' | 'automated' | 'spam-ish';

export type Priority = 'urgent' | 'normal' | 'low';
export type Tone     = 'tense' | 'neutral' | 'warm';

export interface Message {
  id: string;
  threadId: string;
  gmailUrl: string;              // deeplink — required on every message
  sender: Contact;
  recipients: Contact[];
  subject: string;
  receivedAt: string;            // ISO 8601
  isUnread: boolean;
  isStarred: boolean;
  attachments: Attachment[];

  ai: {
    summary: string;             // one line — replaces the preview snippet
    tldr: string | null;         // long threads only
    platform: Platform;
    confidence: number;          // 0–100; < 50 routes to the review queue
    priority: Priority;
    priorityScore: number;       // 0–100, drives the default sort
    reasons: string[];           // the "why this was prioritised" bullets
    tone: Tone;
    toneEvidence: string | null;
    entities: Entities;
    actionItemIds: string[];
    processedAt: string;
    modelRun: string;            // for the activity log
  } | null;                      // null while queued or on parse failure

  sla: {
    targetHours: number;
    elapsedHours: number;
    state: 'ontime' | 'approaching' | 'overdue';
    overdueBy: number | null;    // hours; drives the delay column
  };

  status: 'open' | 'archived' | 'snoozed' | 'done';
  snoozedUntil: string | null;
  handledAt: string | null;      // the row's on-board trace
}

export interface Entities {
  dates:   { text: string; iso: string }[];
  amounts: { text: string; value: number; currency: string }[];
  people:  { name: string; email: string | null }[];
  links:   { url: string; label: string }[];
  addresses: string[];
}

export interface ActionItem {
  id: string;
  text: string;
  sourceMessageId: string;
  owner: 'you' | { name: string; email: string };
  dueDate: string | null;
  priority: Priority;
  status: 'todo' | 'in-progress' | 'done';
  origin: 'extracted' | 'manual';
  confidence: number | null;     // null when manual
}

export interface Draft {
  id: string;
  messageId: string;
  body: string;                  // current, possibly user-edited
  generatedBody: string;         // original, for the commit-view diff
  tone: 'formal' | 'friendly' | 'brief' | 'firm';
  length: 'brief' | 'standard' | 'detailed';
  status: 'pending' | 'approved' | 'sent' | 'discarded';
  generatedAt: string;
  approvedAt: string | null;
  editDistance: number | null;   // feeds the approval-history table
}

export interface Commitment {
  id: string;
  direction: 'you-promised' | 'promised-to-you';
  text: string;                  // verbatim quote
  triggerSentence: string;       // the sentence detection fired on
  sourceMessageId: string;
  counterparty: Contact;
  dueDate: string | null;
  status: 'open' | 'met' | 'missed';
  confidence: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  domain: string;
  avatarUrl: string | null;      // fall back to initials, never a generic glyph
  isVip: boolean;
  messageCount: number;
  yourAvgReplyHours: number | null;
  lastContactAt: string;
  openThreadIds: string[];
  toneHistory: { month: string; tone: Tone }[];
}

export interface SyncState {
  status: 'synced' | 'syncing' | 'failed' | 'offline';
  lastSyncAt: string;
  queueDepth: number;
  failedCount: number;
  nextRetryAt: string | null;
  error: { code: string; message: string } | null;
}
```

**Fixture requirements.** The fixtures must exercise the design, not flatter it: at least 40 messages spanning all seven platforms, at least 6 overdue (so the delay column has something to say), 4 in the review queue below 50 confidence, 3 in the 50–69 dashed band, 2 tense and 1 warm, one thread of 14+ messages, one sender with no avatar, one 90-character subject, one sender name long enough to truncate, and one message whose AI block is `null`. Ship a second fixture set representing a fully cleared board so the empty states are reachable.

---

## 11. Build

### 11.1 Stack

Next.js App Router · TypeScript · Tailwind CSS · shadcn/ui · Lucide. Tokens from §2 declared as CSS custom properties in `globals.css` and mapped into `tailwind.config.ts`, so a token is changed in exactly one place. shadcn primitives are restyled to these tokens on install — no component ships with its default radius, shadow, or palette.

### 11.2 Structure

```
app/
  layout.tsx              shell: concourse bar, rail, theme boot
  page.tsx                Overview
  inbox/page.tsx          Smart Inbox
  actions/page.tsx        Action items
  drafts/page.tsx         Drafts
  follow-ups/page.tsx     Follow-ups
  contacts/page.tsx       Contacts
  analytics/page.tsx      Analytics
  rules/page.tsx          Rules
  settings/page.tsx       Settings
  review/page.tsx         Review queue
components/
  station/                BoardRow · PlatformBadge · DelayFigure · Flap
                          BalanceBand · BoardSheet · PlatformRail · SyncClock
                          PriorityAspect · TonePill · ConfidenceEdge
  board/                  BoardTable · FilterBar · SelectionBar · UndoBar
  charts/                 the §9.8 primitives
  ui/                     shadcn, restyled
lib/
  data/                   fixtures + the typed access layer
  keyboard/               shortcut registry, roving tabindex
  format/                 delay, duration, relative time — all tabular
styles/globals.css        tokens, steel rules, browser surfaces
```

### 11.3 Order

Follow PRODUCT.md: **Inbox + sheet → Action items → Overview → Drafts → Follow-ups → Analytics, Contacts, Rules, Settings.** Sections 1–4 are the product; ship them complete before starting the rest. Build the station vocabulary (§5) first — every screen consumes it, and building it twice is the main way this design degrades.

### 11.4 Verify before calling it done

Run these as one batched pass over the finished build, desktop and mobile together, not as separate trips:

- Body and placeholder text ≥4.5:1 in **both** themes; the yellow field checked specifically.
- Board rendered in greyscale remains fully readable.
- Every component has all seven states.
- Real copy at every breakpoint, nothing overflowing; the 90-character subject and the long sender name both handled.
- Full keyboard pass: reach and operate every action without a pointer.
- `prefers-reduced-motion` on: no flips, no sheet slide, static clock, everything still legible and complete.
- Flap fires only on genuine value changes — load the board, navigate, filter, and confirm nothing flips; then reassign a platform and confirm it does.
- Text selection, caret, focus ring, scrollbars, and tabular figures all themed — no browser defaults left showing.
- The delay column present and right-aligned at every width down to 320px.

### 11.5 Must not be invented

PRODUCT.md records these as undecided. The UI must not fabricate them:

- Pricing, plans, or licensing.
- The model vendor or version — Settings shows a picker over fixture options, labelled as such.
- Data retention durations — the control exists, the default reads `Not set`.
- Any accuracy, acceptance-rate, or time-saved figure presented as measured. Every such figure carries the fixture footnote from §9.8.
- Third-party integration state. Todoist / Notion / Jira read `Not connected`.
- Google branding of any kind. This connects to Gmail; it is not a Google product.

---

*Direction: The Departure Board · seed `4216a3e4` · mode Operate · code-led.*
*The build ends with the finish review, the verdict, and `DESIGN.md` written from the shipped world.*
