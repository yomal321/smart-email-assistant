"use client";

// Phase 5: data now comes from GET /api/analytics/categories
// (app/analytics/page.tsx) instead of a hardcoded 6-week fixture DATA map.
import * as React from "react";
import { PLATFORMS } from "@/lib/data";
import type { CategoryBreakdownResult } from "@/lib/data/use-analytics";

export function CategoryBreakdown({ data }: { data: CategoryBreakdownResult }) {
  const { weeks, series } = data;
  const [showTable, setShowTable] = React.useState(false);
  const totals = weeks.map((_, wi) => PLATFORMS.reduce((sum, p) => sum + (series[p.platform]?.[wi] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const hasAnyData = totals.some((t) => t > 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Category breakdown over time
        </h3>
        <button onClick={() => setShowTable((s) => !s)} className="text-xs text-ink-tertiary underline decoration-1 underline-offset-2 hover:text-ink">
          {showTable ? "Hide data" : "Show data"}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-secondary">
        {PLATFORMS.map((p) => (
          <span key={p.platform} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--platform-${p.number})` }} />
            {p.label}
          </span>
        ))}
      </div>

      {!hasAnyData ? (
        <p className="py-8 text-center text-xs text-ink-tertiary">Not enough mail history yet for this window.</p>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-105 text-xs">
            <thead>
              <tr className="rule-b text-left text-ink-tertiary">
                <th className="font-normal">Week</th>
                {PLATFORMS.map((p) => (
                  <th key={p.platform} className="font-normal tabular">{p.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, wi) => (
                <tr key={w} className="rule-b">
                  <td className="text-ink">{w}</td>
                  {PLATFORMS.map((p) => (
                    <td key={p.platform} className="tabular text-ink">{series[p.platform]?.[wi] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex h-28 items-end gap-3" role="img" aria-label="Stacked category breakdown by week">
            {weeks.map((w, wi) => (
              <div key={w} className="flex h-full flex-1 flex-col-reverse gap-px overflow-hidden rounded-t-sm">
                {PLATFORMS.map((p) => {
                  const v = series[p.platform]?.[wi] ?? 0;
                  return (
                    <div
                      key={p.platform}
                      style={{ height: `${(v / max) * 100}%`, background: `var(--platform-${p.number})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="border-t border-rule-strong" />
          <div className="mt-1.5 flex gap-3">
            {weeks.map((w) => (
              <span key={w} className="flex-1 text-center text-[10px] tabular text-ink-tertiary">
                {w}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
