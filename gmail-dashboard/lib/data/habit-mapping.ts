// habits row -> Habit mapper (0021_life_layer.sql). One resource, one
// mapper — same convention as every other row/type pair in lib/data.
import "server-only";
import type { Habit, HabitCadence } from "@/lib/data/types";

export interface HabitRow {
  id: string;
  name: string;
  cadence: HabitCadence;
  archived_at: string | null;
  created_at: string;
}

export function mapHabitRowToHabit(row: HabitRow, loggedDays: string[]): Habit {
  return {
    id: row.id,
    name: row.name,
    cadence: row.cadence,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    loggedDays,
  };
}
