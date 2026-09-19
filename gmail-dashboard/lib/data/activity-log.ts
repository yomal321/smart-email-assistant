// Shared activity_log writer for the message mutation routes (archive/done/
// snooze). Best-effort: a logging failure never fails the mutation itself —
// the row update already succeeded by the time this is called, and an
// activity-log gap is far less costly than reporting the user's action
// failed when it didn't.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/data/types";

export async function logMessageAction(
  supabase: SupabaseClient,
  accountId: string,
  action: string,
  ids: string[],
  updated: Message[]
): Promise<void> {
  const target =
    updated.length === 1 && updated[0]
      ? `"${updated[0].subject}" from ${updated[0].sender.name}`
      : `${ids.length} messages`;

  await supabase.from("activity_log").insert({
    account_id: accountId,
    action,
    target,
    cause: "Manual, from the board",
    undoable: true,
    undo_payload: { table: "emails", action: "restore", ids },
  });
}
