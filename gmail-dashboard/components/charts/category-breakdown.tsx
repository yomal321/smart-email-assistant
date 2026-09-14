"use client";

import * as React from "react";
import { PLATFORMS } from "@/lib/data";

// Fixture: 6 weeks × 7 platforms, roughly proportioned to the messages fixture.
const WEEKS = ["W1", "W2", "W3", "W4", "W5", "W6"];
const DATA: Record<string, number[]> = {
  "needs-reply": [4, 5, 3, 6, 4, 5],
  meeting: [3, 2, 4, 3, 2, 3],
  invoice: [2, 3, 2, 2, 3, 2],
  fyi: [6, 5, 7, 6, 8, 6],
  newsletter: [10, 12, 9, 11, 10, 13],
  automated: [8, 9, 10, 8, 9, 11],
  "spam-ish": [2, 1, 2, 1, 2, 1],
};

export function CategoryBreakdown() {
  const [showTable, setShowTable] = React.useState(false);
  const totals = WEEKS.map((_, wi) => PLATFORMS.reduce((sum, p) => sum + DATA[p.platform][wi], 0));
  const max = Math.max(...totals);

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

      {showTable ? (
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
              {WEEKS.map((w, wi) => (
                <tr key={w} className="rule-b">
                  <td className="text-ink">{w}</td>
                  {PLATFORMS.map((p) => (
                    <td key={p.platform} className="tabular text-ink">{DATA[p.platform][wi]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex h-28 items-end gap-3" role="img" aria-label="Stacked category breakdown by week">
            {WEEKS.map((w, wi) => (
              <div key={w} className="flex h-full flex-1 flex-col-reverse gap-px overflow-hidden rounded-t-sm">
                {PLATFORMS.map((p) => {
                  const v = DATA[p.platform][wi];
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
            {WEEKS.map((w) => (
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
