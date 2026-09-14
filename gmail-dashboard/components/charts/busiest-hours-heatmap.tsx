"use client";

import * as React from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Deterministic fixture activity — heavier midweek mornings, quiet weekends.
function cellValue(day: number, hour: number): number {
  const weekday = day < 5;
  const workHour = hour >= 8 && hour <= 18;
  let base = weekday && workHour ? 6 : weekday ? 1 : 0.5;
  if (weekday && (hour === 9 || hour === 10 || hour === 14)) base += 3;
  if (day === 2 && hour === 10) base += 4; // Wednesday 10am spike
  return Math.round(base);
}

/** Single-hue sequential ramp — never a rainbow. design-spec.md §9.8 */
export function BusiestHoursHeatmap() {
  const [showTable, setShowTable] = React.useState(false);
  const max = 13;

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
      {showTable ? (
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
              {DAYS.map((d, di) => (
                <tr key={d}>
                  <td className="text-ink-tertiary">{d}</td>
                  {[...Array(24)].map((_, h) => (
                    <td key={h} className="tabular text-center text-ink">{cellValue(di, h)}</td>
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
            {DAYS.map((d, di) => (
              <React.Fragment key={d}>
                <div className="flex items-center text-[10px] text-ink-tertiary">{d}</div>
                {[...Array(24)].map((_, h) => {
                  const v = cellValue(di, h);
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
