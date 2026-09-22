// POST /api/habits/:id/toggle { day } — the one write that actually checks
// or unchecks a habit for a given day-key. If a habit_logs row exists for
// (habit_id, day) it's deleted (absence IS "not done" — see
// habit_logs' own comment in 0021_life_layer.sql); otherwise one is
// inserted. One route, one round trip — no separate mark-done/undo pair.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const day: unknown = body?.day;

  if (typeof day !== "string" || !DAY_KEY_PATTERN.test(day)) {
    return NextResponse.json({ error: "day must be a YYYY-MM-DD string" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: existing, error: readError } = await supabase
    .from("habit_logs")
    .select("id")
    .eq("habit_id", id)
    .eq("day", day)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "failed to read habit log" }, { status: 500 });
  }

  if (existing) {
    const { error } = await supabase.from("habit_logs").delete().eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: "failed to unlog habit" }, { status: 500 });
    }
    return NextResponse.json({ logged: false });
  }

  const { error } = await supabase.from("habit_logs").insert({ habit_id: id, day });
  if (error) {
    return NextResponse.json({ error: "failed to log habit" }, { status: 500 });
  }
  return NextResponse.json({ logged: true });
}
