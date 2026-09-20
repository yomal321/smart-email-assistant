// The headline insight the 14-day chart exists to surface, pulled to the top
// of the screen so it isn't missed below the fold (personal-dashboard-spec:
// "the most valuable panel in the app... shows you three weeks out that a
// work deliverable and exams from both universities land in the same week").
// Renders nothing when there's no collision — no "all clear" noise on a
// screen checked ten times a day.
//
// The icon + text carry the meaning, not the red background alone (colour
// is never the only signal — see components/station/priority-aspect.tsx for
// the same rule applied elsewhere in this codebase).
import { TriangleAlert } from "lucide-react";

export interface Collision {
  startDay: string;
  label: string;
  totalMinutes: number;
  capacityMinutes: number;
  deadlineCount: number;
  topItems: string[];
}

function hours(minutes: number): string {
  const h = minutes / 60;
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

export function CollisionAlert({ collision, onSelect }: { collision: Collision | null; onSelect?: (day: string) => void }) {
  if (!collision) return null;

  return (
    <button
      onClick={() => onSelect?.(collision.startDay)}
      className="flex w-full items-start gap-2.5 rounded-xl border border-signal bg-signal-field px-3.5 py-2.5 text-left transition-opacity hover:opacity-90"
    >
      <TriangleAlert size={16} className="mt-0.5 shrink-0 text-signal" aria-hidden="true" />
      <p className="text-sm text-ink">
        <span className="font-semibold">Heavy week ahead — {collision.label}.</span>{" "}
        <span className="tabular text-ink-secondary">
          {hours(collision.totalMinutes)} of work
          {collision.deadlineCount > 0 && `, ${collision.deadlineCount} major deadline${collision.deadlineCount === 1 ? "" : "s"}`}
        </span>
        {collision.topItems.length > 0 && <span className="text-ink-secondary"> · {collision.topItems.join(", ")}</span>}
      </p>
    </button>
  );
}
