// DELETE /api/saved-views/:id — an unknown id affects zero rows, a silent
// no-op, same convention as contacts/[id]/vip and action-items/[id].
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("saved_views").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "failed to delete saved view" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
