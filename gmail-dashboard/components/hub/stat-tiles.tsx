// Zone A — four numbers that answer the questions actually asked in the
// morning, before reading any list (personal-dashboard-spec §7 Zone A).
// Restyled onto the StatCard primitive (icon chip + huge number + progress
// bar) extracted from the two reference dashboards — see components/hub/
// primitives.tsx and DESIGN.md.
import { Gauge, TriangleAlert, Clock3, CalendarClock } from "lucide-react";
import { formatRelativeToNow } from "@/lib/format/relative-time";
import { StatCard } from "@/components/hub/primitives";

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
      <StatCard
        icon={Gauge}
        tone={loadPct > 100 ? "danger" : "primary"}
        label="Today's load"
        value={formatMinutes(stats.plannedMinutes)}
        sublabel={`of ${formatMinutes(stats.capacityMinutes)} capacity · ${loadPct}%`}
        progressPct={loadPct}
      />

      <StatCard
        icon={TriangleAlert}
        tone={stats.overdueCount > 0 ? "danger" : "neutral"}
        label="Overdue"
        value={stats.overdueCount}
        sublabel={stats.overdueCount > 0 ? "needs attention" : "all clear"}
        onClick={() => onFilter?.(stats.overdueCount > 0 ? "overdue" : null)}
        disabled={stats.overdueCount === 0}
      />

      <StatCard
        icon={Clock3}
        tone={stats.dueIn48hCount > 0 ? "warning" : "neutral"}
        label="Due in 48h"
        value={stats.dueIn48hCount}
        sublabel={stats.dueIn48hCount > 0 ? "coming up fast" : "nothing imminent"}
        onClick={() => onFilter?.(stats.dueIn48hCount > 0 ? "due48h" : null)}
        disabled={stats.dueIn48hCount === 0}
      />

      <StatCard
        icon={CalendarClock}
        tone="info"
        label="Next deadline"
        value={stats.nextDeadline ? formatRelativeToNow(stats.nextDeadline.dueAt) : "—"}
        sublabel={
          stats.nextDeadline ? (
            <span className="block truncate" title={stats.nextDeadline.text}>
              {stats.nextDeadline.text}
            </span>
          ) : (
            "Nothing scheduled"
          )
        }
      />
    </div>
  );
}
