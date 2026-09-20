// PATCH/DELETE /api/notes/:id — edit and delete a note, backing
// app/notes/page.tsx (spec.md FR2).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapNoteRowToNote, type NoteRow } from "@/lib/data/note-mapping";

const SELECT_COLUMNS = "id, title, body, created_at, updated_at";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.title !== undefined) update.title = body.title;
  if (body?.body !== undefined) update.body = body.body;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "at least one of title, body is required" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("notes").update(update).eq("id", id).select(SELECT_COLUMNS).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to update note" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "note not found" }, { status: 404 });
  }

  const note = mapNoteRowToNote(data as unknown as NoteRow);
  return NextResponse.json({ updated: note });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: "failed to delete note" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
