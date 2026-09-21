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
import { IconChip } from "@/components/hub/primitives";

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
      className="card-surface flex w-full items-start gap-3 p-4 text-left transition-shadow hover:shadow-popover"
      style={{ background: "color-mix(in srgb, var(--signal) 6%, var(--surface-raised))" }}
    >
      <IconChip icon={TriangleAlert} tone="danger" />
      <p className="pt-0.5 text-sm text-ink">
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
