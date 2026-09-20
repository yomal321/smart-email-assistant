// GET /api/sources — the three life contexts (0016_life_load.sql), backing
// the hub's source badges and the "add task" source picker.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapSourceRowToSource, type SourceRow } from "@/lib/data/source-mapping";

const SELECT_COLUMNS = "id, name, kind, color, code";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("sources").select(SELECT_COLUMNS).order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "failed to read sources" }, { status: 500 });
  }

  const sources = ((data ?? []) as unknown as SourceRow[]).map(mapSourceRowToSource);
  return NextResponse.json(sources);
}
