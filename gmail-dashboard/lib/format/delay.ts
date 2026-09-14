import type { Sla } from "@/lib/data";

export interface DelayDisplay {
  text: string | null;
  variant: "blank" | "approaching" | "overdue" | "overdue-long" | "snoozed";
  screenReaderText: string;
}

/** The delay column — design-spec.md §5.4. Blank is the majority state, and that is the whole design. */
export function formatDelay(sla: Sla, snoozedUntil: string | null): DelayDisplay {
  if (snoozedUntil) {
    const d = new Date(snoozedUntil);
    const day = d.toLocaleDateString(undefined, { weekday: "short" });
    return {
      text: `⌁ ${day}`,
      variant: "snoozed",
      screenReaderText: `Snoozed until ${d.toLocaleDateString()}`,
    };
  }

  if (sla.state === "overdue" && sla.overdueBy !== null) {
    const days = sla.overdueBy / 24;
    if (days >= 1) {
      const rounded = Math.floor(days);
      return {
        text: `+${rounded}d`,
        variant: days > 7 ? "overdue-long" : "overdue",
        screenReaderText: `${rounded} day${rounded === 1 ? "" : "s"} overdue. Target reply within ${sla.targetHours} hours.`,
      };
    }
    const hours = Math.floor(sla.overdueBy);
    return {
      text: `+${hours}h`,
      variant: "overdue",
      screenReaderText: `${hours} hour${hours === 1 ? "" : "s"} overdue. Target reply within ${sla.targetHours} hours.`,
    };
  }

  if (sla.state === "approaching") {
    const remaining = sla.targetHours - sla.elapsedHours;
    const days = remaining / 24;
    const text = days >= 1 ? `−${Math.floor(days)}d` : `−${Math.floor(remaining)}h`;
    return {
      text,
      variant: "approaching",
      screenReaderText: `Approaching its reply target — ${text.replace("−", "")} remaining.`,
    };
  }

  return { text: null, variant: "blank", screenReaderText: "On time." };
}
