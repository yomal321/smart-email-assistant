// Zone B3 — one row per source, sized by outstanding effort across every
// open item (not just today's), so it's obvious when one degree has quietly
// accumulated twice the workload of everything else (personal-dashboard-spec
// §7 B3). Div/CSS bar per row, same track styling as load-rule.tsx, but one
// bar per source instead of one shared segmented bar — there's no shared
// "capacity" concept at all-time granularity, so no capacity notch here.
import { SourcePlate } from "@/components/hub/source-plate";
import type { Source } from "@/lib/data/types";

export interface SourceBreakdownRow {
  source: Source;
  openCount: number;
  totalEffortMinutes: number;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function SourceBreakdown({ rows }: { rows: SourceBreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-tertiary">Nothing outstanding.</p>;
  }

  const maxMinutes = Math.max(...rows.map((r) => r.totalEffortMinutes), 1);

  return (
    <div className="space-y-2.5">
      {rows.map(({ source, openCount, totalEffortMinutes }) => (
        <div key={source.id}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <SourcePlate source={source} />
              {source.name}
            </span>
            <span className="tabular shrink-0 text-ink-tertiary">
              {openCount} open · {formatMinutes(totalEffortMinutes)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-pill bg-surface-sunk">
            <div
              className="h-full rounded-pill"
              style={{ width: `${(totalEffortMinutes / maxMinutes) * 100}%`, background: source.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
