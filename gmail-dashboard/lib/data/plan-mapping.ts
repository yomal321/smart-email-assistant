// plans row -> Plan mapper (spec.md FR1/FR5, design.md "API Changes"). One
// resource, one mapper — mirrors task-mapping.ts's convention rather than a
// shared "resource mapper" abstraction (design.md Key Decisions).
import "server-only";
import type { Plan, PlanCategory, PlanStatus } from "@/lib/data/types";

export interface PlanRow {
  id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  target_date: string | null;
  category: PlanCategory | null; // 0021_life_layer.sql
  created_at: string;
  updated_at: string;
}

// The subset of a `tasks` row needed to derive a plan's progress. Counts are
// computed here from the tasks actually assigned to the plan — there is no
// stored counter column to read instead (spec.md FR5).
export interface PlanTaskRow {
  status: string;
}

export function mapPlanRowToPlan(row: PlanRow, tasks: PlanTaskRow[]): Plan {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    targetDate: row.target_date,
    category: row.category,
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === "done").length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
