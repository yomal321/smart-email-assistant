// GET/POST /api/notes — the notes list (optionally full-text filtered) and
// quick-capture create, backing app/notes/page.tsx (spec.md FR2/FR9/FR10).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapNoteRowToNote, type NoteRow } from "@/lib/data/note-mapping";

// Mirrors NoteRow's field list exactly (lib/data/note-mapping.ts) — never
// `select("*")` (field-minimization convention, NFR6).
const SELECT_COLUMNS = "id, title, body, created_at, updated_at";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // An empty or whitespace-only q is no filter, not an error or an empty
  // result (spec.md Edge Cases).
  const q = (searchParams.get("q") ?? "").trim();

  const supabase = getSupabaseServerClient();
  let query = supabase.from("notes").select(SELECT_COLUMNS).order("created_at", { ascending: false });

  if (q.length > 0) {
    // Same generated search_vector + plain-text query shape /api/search
    // already uses against emails.search_vector.
    query = query.textSearch("search_vector", q, { type: "plain", config: "english" });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read notes" }, { status: 500 });
  }

  const notes = ((data ?? []) as unknown as NoteRow[]).map(mapNoteRowToNote);
  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const bodyText: unknown = body?.body;
  const title: unknown = body?.title ?? null;

  if (typeof bodyText !== "string" || bodyText.trim().length === 0) {
    return NextResponse.json({ error: "body must be a non-empty string" }, { status: 400 });
  }
  if (title !== null && typeof title !== "string") {
    return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("notes")
    .insert({ account_id: accountId, title, body: bodyText })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create note" }, { status: 500 });
  }

  const note = mapNoteRowToNote(data as unknown as NoteRow);
  return NextResponse.json(note);
}
