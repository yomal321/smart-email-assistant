"use client";

import { useState, type ReactNode } from "react";

export interface ChartCardProps {
  /** Unique id for this card, used to key the view-toggle's ARIA group. */
  id: string;
  title: string;
  description?: string;
  /** Rendered when the "Chart" view is active. */
  chart: ReactNode;
  /**
   * Rendered when the "Table" view is active — the accessible twin of
   * `chart`, built from the same computed data (FR3). Every value the chart
   * shows (via hover/tooltip) must also be reachable here without hovering.
   */
  table: ReactNode;
}

/**
 * Shared card shell for a chart + its accessible table fallback. The toggle
 * is the chart's built-in accessibility twin, not a decorative tab — only
 * one view is mounted at a time, and both read the exact same computed data
 * so the numbers never disagree between chart and table.
 */
export function ChartCard({ id, title, description, chart, table }: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const regionId = `${id}-region`;

  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <div
          role="group"
          aria-label={`${title} view`}
          className="inline-flex shrink-0 rounded-md border border-border bg-muted/60 p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            aria-pressed={view === "chart"}
            aria-controls={regionId}
            onClick={() => setView("chart")}
            className={`rounded px-2.5 py-1 transition-colors ${
              view === "chart" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Chart
          </button>
          <button
            type="button"
            aria-pressed={view === "table"}
            aria-controls={regionId}
            onClick={() => setView("table")}
            className={`rounded px-2.5 py-1 transition-colors ${
              view === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Table
          </button>
        </div>
      </div>
      <div id={regionId} className="mt-3">
        {view === "chart" ? chart : table}
      </div>
    </section>
  );
}
