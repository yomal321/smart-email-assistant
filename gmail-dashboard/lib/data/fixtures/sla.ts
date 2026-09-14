import { NOW } from "../now";
import type { Sla, SlaState } from "../types";

/** Computes SLA state deterministically from a fixed receivedAt against the fixture's frozen NOW. */
export function buildSla(receivedAtIso: string, targetHours: number): Sla {
  const elapsedHours = (NOW.getTime() - new Date(receivedAtIso).getTime()) / 3_600_000;
  let state: SlaState = "ontime";
  let overdueBy: number | null = null;
  if (elapsedHours >= targetHours) {
    state = "overdue";
    overdueBy = elapsedHours - targetHours;
  } else if (elapsedHours >= targetHours * 0.75) {
    state = "approaching";
  }
  return { targetHours, elapsedHours, state, overdueBy };
}
