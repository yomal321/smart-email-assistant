import type { Priority } from "@/lib/data";
import { cn } from "@/lib/utils";

const LABELS: Record<Priority, string> = {
  urgent: "Urgent",
  normal: "Normal priority",
  low: "Low priority",
};

/** The priority signal — a shape, never colour alone. design-spec.md §2.1.5 */
export function PriorityAspect({ priority, className }: { priority: Priority; className?: string }) {
  const label = LABELS[priority];
  return (
    <svg
      viewBox="0 0 12 12"
      width={11}
      height={11}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {priority === "urgent" && (
        <path
          d="M6 1.8 L10.4 9.6 L1.6 9.6 Z"
          fill="var(--signal)"
          stroke="var(--signal)"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      )}
      {priority === "normal" && <rect x={0.5} y={4.6} width={11} height={2.8} rx={1.4} fill="var(--ink-tertiary)" />}
      {priority === "low" && (
        <circle cx={6} cy={6} r={3.8} fill="none" stroke="var(--ink-tertiary)" strokeWidth={1.8} opacity={0.6} />
      )}
    </svg>
  );
}
