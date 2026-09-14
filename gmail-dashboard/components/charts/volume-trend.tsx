"use client";

import * as React from "react";

/**
 * Received vs handled, 14 days. Fixed-height CSS bars — sized in real
 * pixels, never scaled off a viewBox, so it can't balloon on a wide card.
 */
export function VolumeTrend({ data }: { data: { day: string; received: number; handled: number }[] }) {
  const [showTable, setShowTable] = React.useState(false);
  const max = Math.max(...data.map((d) => Math.max(d.received, d.handled)), 10);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          Volume trend · received vs handled, 14 days
        </h3>
        <div className="flex items-center gap-3 text-xs text-ink-tertiary">
          <Legend swatch="outline" label="Received" />
          <Legend swatch="fill" label="Handled" />
          <button onClick={() => setShowTable((s) => !s)} className="underline decoration-1 underline-offset-2 hover:text-ink">
            {showTable ? "Hide data" : "Show data"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-120 text-sm">
            <thead>
              <tr className="rule-b text-left text-ink-tertiary">
                <th className="py-1.5 font-normal">Day</th>
                <th className="py-1.5 font-normal tabular">Received</th>
                <th className="py-1.5 font-normal tabular">Handled</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day} className="rule-b">
                  <td className="py-1.5 text-ink">{d.day}</td>
                  <td className="py-1.5 tabular text-ink">{d.received}</td>
                  <td className="py-1.5 tabular text-ink">{d.handled}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="relative h-28" role="img" aria-label="Volume trend chart, received versus handled mail over 14 days">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-rule" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-end gap-0.75">
              {data.map((d) => (
                <div key={d.day} className="flex h-full flex-1 items-end justify-center gap-0.5">
                  <div
                    className="w-full rounded-t-sm bg-rule-strong"
                    style={{ height: `${Math.max(2, (d.received / max) * 100)}%` }}
                  />
                  <div
                    className="w-full rounded-t-sm bg-departure"
                    style={{ height: `${Math.max(2, (d.handled / max) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-rule-strong" />
          <div className="mt-1.5 flex">
            {data.map((d, i) => (
              <span key={d.day} className="flex-1 text-center text-[10px] tabular text-ink-tertiary">
                {i % 2 === 0 ? d.day.replace(/^\D+/, "") : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: "outline" | "fill"; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={
          swatch === "fill"
            ? { background: "var(--departure)" }
            : { background: "var(--rule-strong)" }
        }
      />
      {label}
    </span>
  );
}
