// GET /api/contacts/:id — single-row read, mirroring
// messages/[id]/route.ts's `.maybeSingle()` + 404 convention.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapContactRowToContact, type ContactRow } from "@/lib/data/contact-mapping";

// Mirrors ContactRow's field list exactly (lib/data/contact-mapping.ts) —
// never `select("*")`.
const SELECT_COLUMNS = "id, account_id, name, email, domain, avatar_url, is_vip";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.from("contacts").select(SELECT_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "failed to read contact" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "contact not found" }, { status: 404 });
  }

  const contact = await mapContactRowToContact(data as unknown as ContactRow);
  return NextResponse.json(contact);
}
