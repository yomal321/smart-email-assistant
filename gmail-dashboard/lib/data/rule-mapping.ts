// rules row -> Rule mapper. One resource, one mapper — mirrors
// task-mapping.ts's / commitment-mapping.ts's convention.
import "server-only";
import type { Rule, RuleCondition, RuleAction } from "@/lib/data/types";

export interface RuleRow {
  id: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  condition_summary: string;
  action_summary: string;
  daily_cap: number | null;
  confidence_floor: number | null;
}

// runCount30d is a count(*) against rule_runs scoped to the last 30 days —
// computed by the route (it needs its own query per rule), not stored on
// the row, so it's passed in rather than joined inside the mapper.
export function mapRuleRowToRule(row: RuleRow, runCount30d: number): Rule {
  return {
    id: row.id,
    enabled: row.enabled,
    conditionSummary: row.condition_summary,
    actionSummary: row.action_summary,
    runCount30d,
    conditions: row.conditions,
    actions: row.actions,
    dailyCap: row.daily_cap,
    confidenceFloor: row.confidence_floor,
  };
}
