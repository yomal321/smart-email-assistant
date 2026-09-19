"use client";

// Phase 5: data now comes from GET /api/analytics/busiest-hours
// (app/analytics/page.tsx) instead of the synthetic cellValue() formula.
import * as React from "react";
import type { BusiestHoursResult } from "@/lib/data/use-analytics";

/** Single-hue sequential ramp — never a rainbow. design-spec.md §9.8 */
export function BusiestHoursHeatmap({ data }: { data: BusiestHoursResult }) {
  const { days, grid, max } = data;
  const [showTable, setShowTable] = React.useState(false);
  const hasAnyData = grid.some((row) => row.some((v) => v > 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Busiest hours
        </h3>
        <button onClick={() => setShowTable((s) => !s)} className="text-xs text-ink-tertiary underline decoration-1 underline-offset-2 hover:text-ink">
          {showTable ? "Hide data" : "Show data"}
        </button>
      </div>
      {!hasAnyData ? (
        <p className="py-8 text-center text-xs text-ink-tertiary">Not enough mail history yet to plot activity by hour.</p>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr>
                <th className="text-left font-normal text-ink-tertiary">Day \ Hour</th>
                {[...Array(24)].map((_, h) => (
                  <th key={h} className="font-normal tabular text-ink-tertiary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, di) => (
                <tr key={d}>
                  <td className="text-ink-tertiary">{d}</td>
                  {[...Array(24)].map((_, h) => (
                    <td key={h} className="tabular text-center text-ink">{grid[di][h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="inline-grid min-w-[560px] gap-[2px]" style={{ gridTemplateColumns: `32px repeat(24, 1fr)` }}>
            <div />
            {[...Array(24)].map((_, h) => (
              <div key={h} className="pb-1 text-center text-[9px] tabular text-ink-tertiary">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
            {days.map((d, di) => (
              <React.Fragment key={d}>
                <div className="flex items-center text-[10px] text-ink-tertiary">{d}</div>
                {[...Array(24)].map((_, h) => {
                  const v = grid[di][h];
                  const alpha = Math.min(1, v / max);
                  return (
                    <div
                      key={h}
                      title={`${d} ${h}:00 — ${v} messages`}
                      className="aspect-square rounded-md"
                      style={{ background: `color-mix(in oklab, var(--departure) ${Math.round(alpha * 90)}%, var(--surface-sunk))` }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
