"use client";

// Workflow detail panel — opens when a row in the /bot page's "Live status"
// card is clicked (BOT-WORKFLOW-DETAIL-PLAN.md). Fetches
// GET /api/hub/bot-workflow-detail on open, fresh every time (no cached
// state between opens, so the numbers are never stale from a previous
// visit).
//
// Scoped to what n8n's API actually exposes for a plain automation workflow
// — no compute cost, no "handoffs," no coordination-anomaly badges. See the
// plan doc for why those reference-panel fields don't have a real
// equivalent here.
import * as React from "react";
import { ExternalLink, TriangleAlert, Workflow } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StatCard, StatusPill, type Tone } from "@/components/hub/primitives";
import { WorkflowCanvas, computeCanvasWidth, type WorkflowStructure } from "@/components/hub/workflow-canvas";
import { formatFullDateTime, formatRelativeToNow } from "@/lib/format/relative-time";

interface WorkflowDetailRun {
  id: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  n8nUrl: string;
  trigger: string | null;
  error: string | null;
}

interface WorkflowDetailData {
  available: true;
  workflow: { name: string; id: string; active: boolean };
  metrics: {
    totalRuns: number;
    successRatePct: number | null;
    failureCount: number;
    avgDurationMs: number | null;
    avgSizeBytes: number | null;
    avgSizeSampled: boolean;
  };
  triggerBreakdown: { label: string; total: number; failures: number }[] | null;
  runs: WorkflowDetailRun[];
  structure: WorkflowStructure | null;
}

type WorkflowDetailResponse = WorkflowDetailData | { available: false; reason?: string };

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusTone(status: string): Tone {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  return "neutral";
}

export function WorkflowDetailSheet({ workflowName, onClose }: { workflowName: string | null; onClose: () => void }) {
  // Keyed to the workflow it was fetched for, not just "the last response" —
  // switching from one workflow to another must not flash the previous
  // one's data while the new fetch is in flight. `loading`/`body` below are
  // derived from this at render time rather than tracked as their own
  // state, so the effect's only setState call is inside `.then()` (a
  // microtask, not synchronous within the effect body).
  const [fetched, setFetched] = React.useState<{ forWorkflow: string; body: WorkflowDetailResponse } | null>(null);

  // Same keyed-to-the-workflow pattern as `fetched` above, for the same
  // reason: switching workflows should land back on the collapsed default
  // (the diagram is opt-in, not the first thing shown) rather than carrying
  // over whatever the previous workflow had toggled, and deriving this at
  // render time keeps it a plain useState with no reset effect needed.
  const [diagramToggle, setDiagramToggle] = React.useState<{ forWorkflow: string; shown: boolean } | null>(null);
  const showWorkflow = diagramToggle?.forWorkflow === workflowName && diagramToggle.shown;

  React.useEffect(() => {
    if (!workflowName) return;
    const controller = new AbortController();
    fetch(`/api/hub/bot-workflow-detail?name=${encodeURIComponent(workflowName)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setFetched({ forWorkflow: workflowName, body }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [workflowName]);

  const data = fetched?.forWorkflow === workflowName ? fetched.body : null;
  const loading = workflowName !== null && data === null;

  // Sized to the real content, not one fixed guess — a 3-node workflow and
  // a 40-node one shouldn't open to the same width. SIDEBAR_AND_CHROME
  // covers the metrics column (w-80, 320px) + inter-column gap + the
  // canvas panel's own border/padding + the sheet's outer padding. Only
  // matters while the diagram is actually shown — collapsed, the sheet is
  // just the metrics/runs column and stays at the standard width.
  const SIDEBAR_AND_CHROME = 420;
  const MIN_SHEET_WIDTH = 720;
  const canvasContentWidth = showWorkflow && data?.available && data.structure ? computeCanvasWidth(data.structure) : 0;
  const sheetWidth = showWorkflow ? Math.max(canvasContentWidth + SIDEBAR_AND_CHROME, MIN_SHEET_WIDTH) : MIN_SHEET_WIDTH;

  return (
    <Sheet open={workflowName !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Inline style, not a Tailwind width class: the default shadcn Sheet
          width (data-[side=right]:sm:max-w-sm) is set via an attribute-
          selector variant, which has higher CSS specificity than a plain
          className override and wins regardless of source order — confirmed
          live, cost a full render pass with an invisibly-narrow canvas
          before being caught. An inline style always wins over any class
          for the same property, so this sidesteps that fight entirely
          rather than needing to keep matching the component's own variant
          prefix by hand. maxWidth caps it on small viewports without
          needing a window.innerWidth read. */}
      <SheetContent className="flex w-full flex-col" style={{ width: sheetWidth, maxWidth: "95vw" }}>
        <SheetHeader className="shrink-0">
          <SheetTitle>{workflowName ?? "Workflow"}</SheetTitle>
          <SheetDescription>The real node graph and recent executions, both pulled live from n8n.</SheetDescription>
        </SheetHeader>

        {loading && <p className="px-4 text-sm text-ink-secondary">Loading…</p>}

        {!loading && data && !data.available && (
          <p className="px-4 text-sm text-ink-secondary">
            Unavailable{data.reason ? ` (${data.reason})` : ""} — try again in a moment.
          </p>
        )}

        {!loading && data && data.available && (
          <>
            {/* Status + the diagram opt-in live together above the columns
                below, so the toggle reads as "reveal a different view" of
                this one workflow rather than living buried in the sidebar. */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-rule px-4 pb-3">
              <StatusPill tone={data.workflow.active ? "success" : "neutral"}>
                {data.workflow.active ? "Active in n8n" : "Inactive in n8n"}
              </StatusPill>
              {data.structure && (
                <button
                  onClick={() => setDiagramToggle({ forWorkflow: workflowName!, shown: !showWorkflow })}
                  aria-pressed={showWorkflow}
                  className="flex items-center gap-1.5 rounded-lg border border-rule px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunk"
                >
                  <Workflow size={13} />
                  {showWorkflow ? "Hide workflow diagram" : "Show workflow diagram"}
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4 pt-4 lg:flex-row">
              {/* Left: the actual workflow — real nodes, real connections.
                  Its own scroll region (both axes: a wide multi-layer flow
                  needs horizontal scroll, a tall one needs vertical), separate
                  from the metrics column's scroll so neither fights the other.
                  Opt-in via the toggle above — collapsed by default so opening
                  a workflow's detail doesn't front-load a diagram most checks
                  never need. A dot-grid background (n8n/Figma's own signal for
                  "this is a diagram surface") fills the full pane rather than
                  just hugging the node boxes, so a small workflow doesn't read
                  as mostly blank white space. */}
              {showWorkflow && (
                <div
                  className="min-w-0 flex-1 overflow-auto rounded-lg border border-rule p-3"
                  style={{
                    background: "var(--surface-sunk)",
                    backgroundImage: "radial-gradient(var(--rule-strong) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                    backgroundAttachment: "local",
                  }}
                >
                  {data.structure ? (
                    <WorkflowCanvas structure={data.structure} />
                  ) : (
                    <p className="text-sm text-ink-tertiary">Node graph unavailable right now.</p>
                  )}
                </div>
              )}

              {/* Right: the metrics/runs sidebar this panel already had.
                  Fills the whole width when the diagram is collapsed
                  (the common case) instead of sitting narrow with empty
                  space beside it. */}
              <div className={`w-full shrink-0 space-y-4 overflow-y-auto ${showWorkflow ? "lg:w-80" : ""}`}>
                <div className={`grid gap-3 ${showWorkflow ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                <StatCard compact label="Runs" value={data.metrics.totalRuns} sublabel="last window" />
                <StatCard
                  compact
                  label="Success rate"
                  value={data.metrics.successRatePct !== null ? `${data.metrics.successRatePct}%` : "—"}
                  tone={data.metrics.failureCount > 0 ? "danger" : "success"}
                  sublabel={`${data.metrics.failureCount} failure${data.metrics.failureCount === 1 ? "" : "s"}`}
                />
                <StatCard compact label="Avg duration" value={formatMs(data.metrics.avgDurationMs)} sublabel="per run" />
                <StatCard
                  compact
                  label="Avg size"
                  value={formatBytes(data.metrics.avgSizeBytes)}
                  sublabel={data.metrics.avgSizeSampled ? "sampled, last 5" : "full window"}
                />
              </div>

              {data.triggerBreakdown && (
                <div>
                  <p className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                    By trigger — this window
                  </p>
                  <p className="mb-2 text-xs text-ink-tertiary">
                    This workflow runs on four different schedules; a flat run count is mostly the 5-minute poll. Split
                    by trigger so a daily job that silently stopped firing doesn&apos;t hide underneath it.
                  </p>
                  <div className="space-y-1.5 rounded-lg bg-surface-sunk p-2">
                    {data.triggerBreakdown.map((t) => (
                      <div key={t.label} className="flex items-center justify-between text-xs">
                        <span className="text-ink-secondary">{t.label}</span>
                        <span className="tabular flex items-center gap-1.5">
                          <span className="font-medium text-ink">{t.total} run{t.total === 1 ? "" : "s"}</span>
                          {t.failures > 0 && (
                            <span className="flex items-center gap-0.5 text-signal">
                              <TriangleAlert size={11} /> {t.failures}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
                  Recent runs
                </p>
                <div className="space-y-1">
                  {data.runs.map((run) => (
                    <a
                      key={run.id}
                      href={run.n8nUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-surface-sunk"
                      title="Open this execution in n8n"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
                          {run.trigger && <span className="truncate text-ink-secondary">{run.trigger}</span>}
                        </span>
                        <span className="tabular flex shrink-0 items-center gap-1 text-ink-tertiary">
                          {formatRelativeToNow(run.startedAt)}
                          <ExternalLink size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-ink-tertiary">
                        <span title={formatFullDateTime(run.startedAt)}>{formatFullDateTime(run.startedAt)}</span>
                        <span className="tabular">{formatMs(run.durationMs)}</span>
                      </div>
                      {run.error && (
                        <p className="mt-0.5 truncate rounded bg-signal-field px-1.5 py-1 text-signal" title={run.error}>
                          {run.error}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
