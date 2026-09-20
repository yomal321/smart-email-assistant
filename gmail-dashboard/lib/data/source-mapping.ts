// sources row -> Source mapper (0016_life_load.sql). One resource, one
// mapper — same convention as every other row/type pair in lib/data.
import "server-only";
import type { Source } from "@/lib/data/types";

export interface SourceRow {
  id: string;
  name: string;
  kind: "work" | "academic";
  color: string;
  code: string; // 0017_source_code.sql
}

export function mapSourceRowToSource(row: SourceRow): Source {
  return { id: row.id, name: row.name, kind: row.kind, color: row.color, code: row.code };
}
