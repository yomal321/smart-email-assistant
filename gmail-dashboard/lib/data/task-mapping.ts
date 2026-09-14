// tasks row -> ActionItem mapper (spec FR3, design.md "API Changes" / Key
// Decision 5). One resource, one mapper — mirrors message-mapping.ts's
// convention rather than a shared "resource mapper" abstraction (ActionItem
// and Draft have no structural overlap worth generalizing over).
import "server-only";
import type { ActionItem, Priority } from "@/lib/data/types";

// The subset of a `tasks` row (post-migration-0009 shape) this mapper needs.
export interface TaskRow {
  id: string;
  email_id: string | null;
  task_text: string;
  deadline: string | null;
  status: string;
  owner_name: string | null;
  owner_email: string | null;
  priority: Priority;
  origin: "extracted" | "manual";
  confidence: number | null;
}

// 'open' only appears on rows written before migration 0009 (0003's original
// default) — every row written after it is todo/in-progress/done/dismissed
// (spec Edge Cases). No writer produces 'open' after 0009.
function mapStatus(status: string): ActionItem["status"] {
  if (status === "open") return "todo";
  return status as ActionItem["status"];
}

export function mapTaskRowToActionItem(row: TaskRow): ActionItem {
  return {
    id: row.id,
    text: row.task_text,
    // Manual items (origin='manual') have email_id=null (migration 0009) —
    // ActionItem.sourceMessageId is a required string, so an empty string
    // stands in, matching action-items-provider.tsx's existing addManual
    // convention of sourceMessageId: "".
    sourceMessageId: row.email_id ?? "",
    owner:
      row.owner_name || row.owner_email
        ? { name: row.owner_name ?? row.owner_email ?? "", email: row.owner_email ?? "" }
        : "you",
    dueDate: row.deadline,
    priority: row.priority,
    status: mapStatus(row.status),
    origin: row.origin,
    confidence: row.confidence,
  };
}
