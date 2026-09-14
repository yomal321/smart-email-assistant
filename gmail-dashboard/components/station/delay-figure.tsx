import type { Sla } from "@/lib/data";
import { formatDelay } from "@/lib/format/delay";
import { cn } from "@/lib/utils";
import { Flap } from "./flap";

/** The memorable moment — design-spec.md §5.4. Blank is the majority state. */
export function DelayFigure({
  sla,
  snoozedUntil,
  className,
}: {
  sla: Sla;
  snoozedUntil: string | null;
  className?: string;
}) {
  const d = formatDelay(sla, snoozedUntil);

  if (d.text === null) {
    return (
      <span className={cn("block w-16 shrink-0 text-right", className)} aria-label={d.screenReaderText} />
    );
  }

  return (
    <span
      className={cn(
        "block w-16 shrink-0 text-right text-sm font-bold tabular",
        d.variant === "overdue" && "text-signal",
        d.variant === "overdue-long" && "text-signal underline decoration-2 underline-offset-2",
        d.variant === "approaching" && "text-ink-tertiary",
        d.variant === "snoozed" && "text-ink-tertiary font-normal",
        className
      )}
      title={d.screenReaderText}
    >
      <Flap value={d.text} ariaLabelOverride={d.screenReaderText} />
    </span>
  );
}
