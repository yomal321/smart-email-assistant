// Zone A — four numbers that answer the questions actually asked in the
// morning, before reading any list (personal-dashboard-spec §7 Zone A).
// Div/CSS idiom, same track/pill classes as load-rule.tsx's bar, not the
// whole component — this tile only needs a single unsegmented bar.
import { TriangleAlert } from "lucide-react";
import { formatRelativeToNow } from "@/lib/format/relative-time";

export interface HubStats {
  plannedMinutes: number;
  capacityMinutes: number;
  overdueCount: number;
  dueIn48hCount: number;
  nextDeadline: { itemId: string; text: string; dueAt: string; sourceId: string | null } | null;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function StatTiles({
  stats,
  onFilter,
}: {
  stats: HubStats;
  onFilter?: (filter: "overdue" | "due48h" | null) => void;
}) {
  const loadPct = stats.capacityMinutes > 0 ? Math.round((stats.plannedMinutes / stats.capacityMinutes) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="card-surface px-3.5 py-3">
        <p className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Today&apos;s load</p>
        <p className="tabular mt-1 text-lg font-semibold text-ink">
          {formatMinutes(stats.plannedMinutes)} <span className="text-sm font-normal text-ink-tertiary">/ {formatMinutes(stats.capacityMinutes)}</span>
        </p>
        <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunk">
          <div
            className={`h-full rounded-pill ${loadPct > 100 ? "bg-signal" : "bg-departure"}`}
            style={{ width: `${Math.min(100, loadPct)}%` }}
          />
        </div>
        <p className="tabular mt-1 text-xs text-ink-tertiary">{loadPct}%</p>
      </div>

      <button
        onClick={() => onFilter?.(stats.overdueCount > 0 ? "overdue" : null)}
        disabled={stats.overdueCount === 0}
        className="card-surface px-3.5 py-3 text-left disabled:cursor-default"
      >
        <p className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Overdue</p>
        <p className={`tabular mt-1 flex items-center gap-1.5 text-lg font-semibold ${stats.overdueCount > 0 ? "text-signal" : "text-ink"}`}>
          {stats.overdueCount > 0 && <TriangleAlert size={15} aria-hidden="true" />}
          {stats.overdueCount}
        </p>
      </button>

      <button
        onClick={() => onFilter?.(stats.dueIn48hCount > 0 ? "due48h" : null)}
        disabled={stats.dueIn48hCount === 0}
        className="card-surface px-3.5 py-3 text-left disabled:cursor-default"
      >
        <p className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Due in 48h</p>
        <p className="tabular mt-1 text-lg font-semibold text-ink">{stats.dueIn48hCount}</p>
      </button>

      <div className="card-surface px-3.5 py-3">
        <p className="font-narrow text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">Next deadline</p>
        {stats.nextDeadline ? (
          <>
            <p className="mt-1 truncate text-sm font-semibold text-ink" title={stats.nextDeadline.text}>
              {stats.nextDeadline.text}
            </p>
            <p className="tabular text-xs text-ink-tertiary">{formatRelativeToNow(stats.nextDeadline.dueAt)}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-tertiary">Nothing scheduled</p>
        )}
      </div>
    </div>
  );
}
