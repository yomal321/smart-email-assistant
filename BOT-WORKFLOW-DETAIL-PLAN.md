# Workflow Detail Panel — Plan

Trigger: clicking a workflow row in the `/bot` page's "Live status — the four
bot workflows in n8n" card (`HealthCard`, `app/(hub)/bot/page.tsx`) opens a
detail view for that one workflow, modeled on the reference "Live Agent Map"
screenshot's right-hand panel — a metrics grid, a status badge, and a list of
recent runs.

**Status:** plan only, nothing built.

---

## 1. The constraint that shapes everything else

The reference panel is from a purpose-built multi-agent observability
platform: it knows about *agents*, *handoffs*, *coordination anomalies*, and
a per-call *compute cost*. Our four workflows are plain n8n automations
(`assistant-scheduler`, `assistant-brain`, `telegram-adapter`,
`telegram-send`) — n8n has no concept of an "agent," a "handoff," or a
dollar cost per run, and this project's whole approach to `/bot` so far has
been **never fabricate what can't be shown** (the reason the health card
exists at all, instead of a fake "online" dot). So this plan is explicit
about which reference fields map to something real, and which don't exist
here at all.

**Verified live against your actual n8n instance** (not assumed from docs):

| Field | Source | Real? |
|---|---|---|
| Execution status, start/stop time | `GET /api/v1/executions?workflowId=X` | Yes — already used by `bot-health` |
| Execution duration | `stoppedAt - startedAt` | Yes — derived |
| Success rate, failure count | Computed over a window of executions | Yes — derived |
| Response/payload size | `jsonSizeBytes` on `GET /api/v1/executions/{id}` | **Yes, confirmed live** — this is the honest analog to the reference's "Avg context in 12.4 KB," not a fabrication |
| A failed run's error | `data.resultData.error` on a single execution's detail | Yes, when present |
| "Invocations," "Compute cost," "Coordination anomalies," any agent-to-agent handoff | Nothing in n8n exposes these for a plain workflow | **No — not built** |

## 2. What the panel shows

Opens as a **Sheet** (`components/ui/sheet.tsx`, already in the project — no
new dependency), sliding from the right, matching the reference's side-panel
placement more closely than a centered modal would.

**Header:** workflow name, active/inactive pill, overall status pill (reusing
the same `success`/`danger`/`neutral` tone logic the health card already
computes).

**Metrics grid** — `StatCard` in `compact` mode, 2×2 (not 2×3 — we have four
honest numbers, not six):
- **Runs (last 20)** — count of executions fetched
- **Success rate** — successful / total in that window
- **Avg duration** — mean `stoppedAt - startedAt`
- **Avg response size** — mean `jsonSizeBytes`, formatted (KB)

**Recent runs list** — the honest counterpart to the reference's "Live
handoffs" table: last ~15 executions, each row showing a status pill,
relative time, and duration. A failed row expands (or shows inline) the
real error string from that execution's detail, when n8n has one — this is
the actual, truthful version of "coordination anomalies," not a renamed
fabrication.

**Not included, on purpose:** compute cost, context-loss/anomaly badges,
per-node handoff diagrams, an "Open Agent Detail" external link (there is no
"agent detail" page to open — n8n's own execution log is the closest real
equivalent, and could be a plain external link to the n8n UI if you want
one, see §5).

## 3. Data flow

New route: `GET /api/hub/bot-workflow-detail?name=<workflow name>`

- Server-only, same pattern as `bot-health`: reads `N8N_API_KEY` +
  `N8N_DRAFT_WEBHOOK_URL`'s origin, never touches the browser.
- Looks up the workflow by name (same active-preferred-match logic
  `bot-health` already has, to handle the duplicate-name case confirmed
  live during that build).
- Fetches the last 20 executions for that workflow id.
- For any of those with `status === 'error'`, fetches that one execution's
  detail (`includeData=true`) to pull the real error message — bounded to
  failures only, so a healthy workflow costs exactly 1 extra n8n call, not
  20.
- Computes the aggregates in §2 and returns `{ workflow, metrics, runs }`.
- Same degrade-honestly behavior as `bot-health`: `{ available: false,
  reason }` on any failure, never a fabricated success.

Fetched **on demand**, only when a row is clicked — not preloaded for all
four workflows on page load, so the main `/bot` page stays as fast as it is
today.

## 4. Interaction

- Click a workflow row in `HealthCard` → `Sheet` opens, `open=true`,
  `selectedWorkflow=<name>`.
- Panel shows a loading state, then the fetched detail.
- Closing (X, overlay click, Esc) clears `selectedWorkflow` — no state kept
  between opens, always a fresh fetch, so the numbers are never stale from
  a previous visit.
- Existing row layout gets `cursor-pointer` + `hover:bg-surface-sunk`, plus
  the row becomes a `<button>` for keyboard access, matching how the rest of
  this codebase handles a clickable list row (e.g. `StatCard`'s own
  button/div split).

## 5. Open question — the CTA

The reference ends its panel with a solid "Open Agent Detail" button. We
have no equivalent page to send you to *inside* this dashboard. Real options:
- **Link out to n8n's own execution list** for that workflow (`{n8n
  base}/workflow/{id}/executions`) — genuinely useful, one click to the
  real source of truth, no new page to build.
- **Omit the button entirely** — the panel already shows what n8n's API
  can tell us; a button to "see more" implies a destination that doesn't
  exist.

Recommend the n8n link — cheap, honest, and it's the one thing in this
whole panel where "go look at the real system" is a genuine upgrade over
what we can show inline.

## 6. Build order, if you approve this

1. `GET /api/hub/bot-workflow-detail` route.
2. `WorkflowDetailSheet` component (metrics grid + runs list + error
   expansion).
3. Wire the click handler onto `HealthCard`'s rows.
4. Verify against your real n8n instance the same way the health card was —
   screenshot, not just typecheck.
