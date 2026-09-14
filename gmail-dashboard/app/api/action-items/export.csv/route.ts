// GET /api/action-items/export.csv — the same bounded list read as
// /api/action-items, rendered as CSV instead of JSON for the dashboard's
// export action (spec.md FR3/FR9, design.md "API Changes").
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapTaskRowToActionItem, type TaskRow } from "@/lib/data/task-mapping";
import type { ActionItem } from "@/lib/data/types";

// Mirrors TaskRow's field list exactly (lib/data/task-mapping.ts) — never
// `select("*")` (field-minimization convention).
const SELECT_COLUMNS =
  "id, email_id, task_text, deadline, status, owner_name, owner_email, priority, origin, confidence";

// task_text is free-form user/LLM text — quote any field containing a comma
// or quote, doubling internal quotes (RFC 4180).
function csvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function ownerLabel(owner: ActionItem["owner"]): string {
  return owner === "you" ? "you" : owner.name;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const supabase = getSupabaseServerClient();
  let query = supabase.from("tasks").select(SELECT_COLUMNS);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read action items" }, { status: 500 });
  }

  const items = ((data ?? []) as unknown as TaskRow[]).map(mapTaskRowToActionItem);

  const rows = items.map((item) =>
    [
      csvField(item.text),
      item.dueDate ?? "",
      item.priority,
      item.status,
      csvField(ownerLabel(item.owner)),
    ].join(",")
  );
  const csv = ["text,dueDate,priority,status,owner", ...rows].join("\n");

  return new NextResponse(csv, { headers: { "Content-Type": "text/csv" } });
}
