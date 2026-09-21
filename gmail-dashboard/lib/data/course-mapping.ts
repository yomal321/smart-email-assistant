// courses row -> Course mapper (0016_life_load.sql). One resource, one
// mapper — same convention as source-mapping.ts.
import "server-only";
import type { Course } from "@/lib/data/types";

export interface CourseRow {
  id: string;
  source_id: string;
  code: string;
  name: string;
  semester: string | null;
  is_active: boolean;
}

export function mapCourseRowToCourse(row: CourseRow): Course {
  return {
    id: row.id,
    sourceId: row.source_id,
    code: row.code,
    name: row.name,
    semester: row.semester,
    isActive: row.is_active,
  };
}
