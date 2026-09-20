// Zone C2 — exams/CAs/quizzes worth weight >= 4, kept separate from the
// daily priority queue on purpose: they're planned for over weeks, not
// worked on today, so mixing them into the daily list buries them
// (personal-dashboard-spec §7 C2).
import { SourcePlate } from "@/components/hub/source-plate";
import type { ActionItem, Source } from "@/lib/data/types";

const TYPE_LABEL: Record<string, string> = {
  exam: "Exam",
  ca: "Continuous assessment",
  quiz: "Quiz",
};

const HIGHLIGHT_WITHIN_DAYS = 14;

// Noon-UTC-anchored day diff, mirroring lib/day-key.ts's formatDayLabel —
// raw millisecond subtraction would put evening-due items in Asia/Colombo
// off by one.
function daysRemaining(dueAt: string, today: string): number {
  const dueNoonUtc = new Date(`${dueAt.slice(0, 10)}T12:00:00Z`).getTime();
  const todayNoonUtc = new Date(`${today}T12:00:00Z`).getTime();
  return Math.round((dueNoonUtc - todayNoonUtc) / (24 * 60 * 60 * 1000));
}

export function UpcomingAssessments({
  items,
  sourceById,
  today,
}: {
  items: ActionItem[];
  sourceById: Map<string, Source>;
  today: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-tertiary">No exams or major assessments on the horizon.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const remaining = daysRemaining(item.dueAt!, today);
        const overdue = remaining < 0;
        const highlighted = !overdue && remaining <= HIGHLIGHT_WITHIN_DAYS;
        const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;

        return (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${highlighted ? "border border-departure bg-departure-field" : "border border-transparent"}`}
          >
            {source && <SourcePlate source={source} />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{item.text}</p>
              <p className="text-xs text-ink-tertiary">{TYPE_LABEL[item.type] ?? item.type}</p>
            </div>
            <span className={`tabular shrink-0 text-xs font-medium ${overdue ? "text-signal" : "text-ink-secondary"}`}>
              {overdue ? `overdue ${Math.abs(remaining)}d` : remaining === 0 ? "today" : `in ${remaining}d`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
