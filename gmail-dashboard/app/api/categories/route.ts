// GET/POST /api/categories — the category-management list on
// app/rules/page.tsx. A built-in platform (lib/data/types.ts's PLATFORMS)
// with no `categories` row override still returns its default label —
// this route merges the two rather than requiring a seed migration to
// invent seven account-specific rows.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapCategoryRowToCategory, type CategoryRow } from "@/lib/data/category-mapping";
import { PLATFORMS } from "@/lib/data/types";

// Mirrors CategoryRow's field list exactly — never `select("*")`.
const SELECT_COLUMNS = "id, key, label, number, merged_into";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("categories").select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to read categories" }, { status: 500 });
  }

  const overrides = new Map(
    ((data ?? []) as unknown as CategoryRow[]).map((row) => [row.key, mapCategoryRowToCategory(row)])
  );

  const categories = PLATFORMS.map((p) => {
    const override = overrides.get(p.platform);
    if (override) return override;
    return { id: null, key: p.platform, label: p.label, number: p.number, mergedInto: null };
  });

  // Custom categories (a key not among the 7 built-in platforms) appear too.
  const builtInKeys = new Set(PLATFORMS.map((p) => p.platform));
  for (const row of (data ?? []) as unknown as CategoryRow[]) {
    if (!builtInKeys.has(row.key as (typeof PLATFORMS)[number]["platform"])) {
      categories.push(mapCategoryRowToCategory(row));
    }
  }

  return NextResponse.json(categories);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const key: unknown = body?.key;
  const label: unknown = body?.label;
  const number: unknown = body?.number;

  if (typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "key must be a non-empty string" }, { status: 400 });
  }
  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json({ error: "label must be a non-empty string" }, { status: 400 });
  }
  if (typeof number !== "number") {
    return NextResponse.json({ error: "number must be a number" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({ account_id: accountId, key, label, number })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create category" }, { status: 500 });
  }

  const category = mapCategoryRowToCategory(data as unknown as CategoryRow);
  return NextResponse.json(category);
}
