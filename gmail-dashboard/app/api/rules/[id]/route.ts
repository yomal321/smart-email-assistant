// PATCH/DELETE /api/rules/:id — toggle-only PATCH, matching app/rules/page.tsx's
// current UI (a Switch per rule; the pencil-icon edit affordance has no open
// editor to wire yet). An unknown id affects zero rows — a silent no-op, same
// convention as contacts/[id]/vip and action-items/[id].
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const enabled: unknown = body?.enabled;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("rules").update({ enabled }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: "failed to update rule" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("rules").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "failed to delete rule" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
