// POST /api/undo/:actionId — reverses one activity_log entry, keyed by the
// log row's own id. Distinct from the ephemeral 8-second undo bar
// (board-provider.tsx's `pushUndo`/`runUndo`), which already calls
// POST /api/messages/restore directly from an in-memory closure and needs
// nothing here — this route is for undoing something from the *persistent*
// Activity log (Settings page), after that closure is long gone (e.g. a
// page reload).
//
// Only archive/done/snooze currently write an undoable log entry (see
// lib/data/activity-log.ts) — rule/category/settings changes log as
// undoable: false for now (PHASE-4-IMPLEMENTATION-PLAN.md Wave 4). A second
// undo attempt on the same row 404s instead of double-applying, because the
// first undo flips `undoable` to false.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface UndoPayload {
  table: "emails";
  action: "restore";
  ids: string[];
}

export async function POST(_request: Request, context: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await context.params;
  const supabase = getSupabaseServerClient();

  const { data: entry, error: readError } = await supabase
    .from("activity_log")
    .select("id, undoable, undo_payload")
    .eq("id", actionId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "failed to read activity log entry" }, { status: 500 });
  }
  if (!entry || !entry.undoable || !entry.undo_payload) {
    return NextResponse.json({ error: "nothing to undo for this action" }, { status: 404 });
  }

  const payload = entry.undo_payload as UndoPayload;
  if (payload.table !== "emails" || payload.action !== "restore" || !Array.isArray(payload.ids)) {
    return NextResponse.json({ error: "unsupported undo payload" }, { status: 500 });
  }

  const { error: restoreError } = await supabase
    .from("emails")
    .update({ status: "open", handled_at: null, handled_action: null, snoozed_until: null })
    .in("id", payload.ids);

  if (restoreError) {
    return NextResponse.json({ error: "failed to undo action" }, { status: 500 });
  }

  await supabase.from("activity_log").update({ undoable: false }).eq("id", actionId);

  return NextResponse.json({ ok: true });
}
