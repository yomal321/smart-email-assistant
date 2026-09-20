// PATCH /api/sources/:id — rename a source, recolour it, or change its
// two-letter plate (Settings, spec.md "the user can name their own sources").
// No POST/DELETE: three sources seeded once by 0016_life_load.sql, renamed in
// place — adding or removing a life context is a bigger decision (courses,
// history, the priority weighting) than this screen is scoped to make.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapSourceRowToSource, type SourceRow } from "@/lib/data/source-mapping";

const SELECT_COLUMNS = "id, name, kind, color, code";
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};

  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body?.color !== undefined) {
    if (typeof body.color !== "string" || !HEX_COLOR.test(body.color)) {
      return NextResponse.json({ error: "color must be a hex string like #4f46e5" }, { status: 400 });
    }
    update.color = body.color;
  }
  if (body?.code !== undefined) {
    if (typeof body.code !== "string" || body.code.trim().length === 0 || body.code.trim().length > 3) {
      return NextResponse.json({ error: "code must be 1-3 characters" }, { status: 400 });
    }
    // Uppercased server-side so every plate renders consistently regardless
    // of what case the settings form was typed in.
    update.code = body.code.trim().toUpperCase();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "at least one of name, color, code is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("sources").update(update).eq("id", id).select(SELECT_COLUMNS).single();

  if (error) {
    return NextResponse.json({ error: "failed to update source" }, { status: 500 });
  }

  const source = mapSourceRowToSource(data as unknown as SourceRow);
  return NextResponse.json(source);
}
