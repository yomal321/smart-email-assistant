# Architecture — Smart Email Assistant

C4 diagrams for **v1**, derived from [smart-email-assistant-proposal.md](../smart-email-assistant-proposal.md) and [.specclaw/changes/001-smart-email-assistant/proposal.md](../.specclaw/changes/001-smart-email-assistant/proposal.md).

Each diagram exists twice:

- **`.drawio`** — the editable source. Open in draw.io / diagrams.net.
- **`.md`** — the same diagram as Mermaid (renders inline on GitHub) plus the notes that explain it.

## Contents

| # | Diagram | draw.io | Notes |
|---|---|---|---|
| L1 | System Context — who uses it, what it talks to | [01-system-context.drawio](01-system-context.drawio) | [01-system-context.md](01-system-context.md) |
| L2 | Containers — the three deployable pieces | [02-container.drawio](02-container.drawio) | [02-container.md](02-container.md) |
| L3a | Components — inside the Automation Engine (n8n) | [03a-component-automation-engine.drawio](03a-component-automation-engine.drawio) | [03a-component-automation-engine.md](03a-component-automation-engine.md) |
| L3b | Components — inside the Web Dashboard (Next.js) | [03b-component-web-dashboard.drawio](03b-component-web-dashboard.drawio) | [03b-component-web-dashboard.md](03b-component-web-dashboard.md) |
| — | Data model (supporting view) | [04-data-model.drawio](04-data-model.drawio) | [04-data-model.md](04-data-model.md) |

There is no Level 4 (code) diagram. At this size the code is the code — a class diagram would go stale by the second commit.

## Opening the diagrams

**In VS Code** — install the *Draw.io Integration* extension (`hediet.vscode-drawio`), then click any `.drawio` file. It edits in place.

**In the browser** — [app.diagrams.net](https://app.diagrams.net) → *File ▸ Open From ▸ Device*.

**Exporting for a doc** — *File ▸ Export as ▸ PNG*, with **Transparent Background** off and **Zoom 200%** for a crisp image.

## Colour key

| Colour | Hex | Meaning |
|---|---|---|
| Dark blue | `#08427B` | Person |
| Blue | `#1168BD` | Our system (L1 only) |
| Mid blue | `#438DD5` | A container |
| Light blue | `#85BBF0` | A component |
| Steel blue | `#3C7FB1` | The LLM Gateway — highlighted deliberately |
| Grey | `#999999` | External system we do not own |

Line conventions: **solid arrow** = the source initiates. **Dashed arrow** = a pull/fetch back to a provider. **Thick steel-blue** = an AI call routed through the LLM Gateway.

## The two ideas the diagrams are built around

1. **Two normalisation points.** Provider differences die at the *Email Normaliser*; model differences die at the *LLM Gateway*. Everything between those two boxes is provider- and model-agnostic. That is what makes a Gmail-only or Gemini-only decision reversible later.
2. **One write path from the frontend.** The dashboard reads the database and calls exactly one n8n webhook — draft generation. It holds no provider credentials and makes no model calls. That keeps the trust boundary in a single container.

## Out of scope in v1, so absent from every diagram

Auto-send · multi-tenancy · mobile app · calendar integration · semantic/vector search · learned per-sender priority rules · the fallback model router.

The router is *designed* — it attaches at the LLM Gateway — but is not drawn, because it is not built.
