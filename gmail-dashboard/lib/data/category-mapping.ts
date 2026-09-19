// categories row -> Category mapper.
import "server-only";
import type { Category } from "@/lib/data/types";

export interface CategoryRow {
  id: string;
  key: string;
  label: string;
  number: number;
  merged_into: string | null;
}

export function mapCategoryRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    number: row.number,
    mergedInto: row.merged_into,
  };
}
