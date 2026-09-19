// GET/POST /api/saved-views — backs the Smart Inbox filter bar's "Save
// view" affordance (BACKEND-REQUIREMENTS.md §5.3).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import type { SavedView } from "@/lib/data/types";

interface SavedViewRow {
  id: string;
  slug: string;
  label: string;
  filters: Record<string, unknown>;
}

const SELECT_COLUMNS = "id, slug, label, filters";

function mapRow(row: SavedViewRow): SavedView {
  return { id: row.id, slug: row.slug, label: row.label, filters: row.filters };
}

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("saved_views").select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to read saved views" }, { status: 500 });
  }

  const views = ((data ?? []) as unknown as SavedViewRow[]).map(mapRow);
  return NextResponse.json(views);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const slug: unknown = body?.slug;
  const label: unknown = body?.label;
  const filters: unknown = body?.filters;

  if (typeof slug !== "string" || slug.trim().length === 0) {
    return NextResponse.json({ error: "slug must be a non-empty string" }, { status: 400 });
  }
  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json({ error: "label must be a non-empty string" }, { status: 400 });
  }
  if (typeof filters !== "object" || filters === null) {
    return NextResponse.json({ error: "filters must be an object" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("saved_views")
    .upsert({ account_id: accountId, slug, label, filters }, { onConflict: "account_id,slug" })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to save view" }, { status: 500 });
  }

  return NextResponse.json(mapRow(data as unknown as SavedViewRow));
}
