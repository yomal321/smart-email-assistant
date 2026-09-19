// PATCH-by-key rename for a category (app/rules/page.tsx's "Rename" button).
// Not /api/categories/:id — a built-in platform with no override row yet
// has no id to PATCH (GET /api/categories returns `id: null` for it, see
// route.ts's merge logic), so this route upserts on the
// `unique (account_id, key)` constraint instead of requiring a row to
// already exist. Merge stays unimplemented (BACKEND-REQUIREMENTS.md §8.3 —
// merge semantics are an undecided product question).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapCategoryRowToCategory, type CategoryRow } from "@/lib/data/category-mapping";
import { PLATFORMS } from "@/lib/data/types";

const SELECT_COLUMNS = "id, key, label, number, merged_into";

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const key: unknown = body?.key;
  const label: unknown = body?.label;

  if (typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "key must be a non-empty string" }, { status: 400 });
  }
  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json({ error: "label must be a non-empty string" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  // Update first (preserves an existing row's own `number`, custom or
  // built-in-overridden); only insert a fresh row — using the built-in
  // platform's number, since a category with no row yet can only be one of
  // the 7 built-ins — when nothing existed to update.
  const { data: updated, error: updateError } = await supabase
    .from("categories")
    .update({ label })
    .eq("account_id", accountId)
    .eq("key", key)
    .select(SELECT_COLUMNS);

  if (updateError) {
    return NextResponse.json({ error: "failed to rename category" }, { status: 500 });
  }

  let data: Record<string, unknown> | undefined = updated?.[0];
  let error: { message: string } | null = null;

  if (!data) {
    const builtIn = PLATFORMS.find((p) => p.platform === key);
    if (!builtIn) {
      return NextResponse.json({ error: "unknown category key" }, { status: 404 });
    }
    const inserted = await supabase
      .from("categories")
      .insert({ account_id: accountId, key, label, number: builtIn.number })
      .select(SELECT_COLUMNS)
      .single();
    data = inserted.data ?? undefined;
    error = inserted.error;
  }

  if (error || !data) {
    return NextResponse.json({ error: "failed to rename category" }, { status: 500 });
  }

  const category = mapCategoryRowToCategory(data as unknown as CategoryRow);
  return NextResponse.json(category);
}
