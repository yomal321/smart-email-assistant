// GET /api/search?q= — backs the command palette's "Messages"/"Contacts"
// groups (components/board/command-palette.tsx), which today only ever show
// the first 6 rows of whatever's already loaded client-side, regardless of
// what's typed. Empty/whitespace `q` returns [] — the palette falls back to
// its existing first-6 behavior in that case (see command-palette.tsx).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SearchResult } from "@/lib/data/types";

const RESULTS_PER_TYPE = 8;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (q.length === 0) {
    return NextResponse.json([]);
  }

  const supabase = getSupabaseServerClient();

  // Two separate ilike queries, merged and de-duped client-side, rather than
  // a single `.or("name.ilike...,email.ilike...")` call — that would require
  // interpolating `q` directly into a PostgREST filter-syntax string, which
  // risks filter injection if `q` contains a comma or parenthesis.
  const [messagesRes, byNameRes, byEmailRes] = await Promise.all([
    supabase
      .from("emails")
      .select("id, subject, participants")
      .textSearch("search_vector", q, { type: "plain", config: "english" })
      .limit(RESULTS_PER_TYPE),
    supabase.from("contacts").select("id, name, email").ilike("name", `%${q}%`).limit(RESULTS_PER_TYPE),
    supabase.from("contacts").select("id, name, email").ilike("email", `%${q}%`).limit(RESULTS_PER_TYPE),
  ]);

  if (messagesRes.error || byNameRes.error || byEmailRes.error) {
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }

  const contactsById = new Map<string, { id: string; name: string | null; email: string }>();
  for (const row of [...(byNameRes.data ?? []), ...(byEmailRes.data ?? [])]) {
    contactsById.set(row.id, row);
  }
  const contactsRes = { data: [...contactsById.values()].slice(0, RESULTS_PER_TYPE) };

  const messageResults: SearchResult[] = (messagesRes.data ?? []).map((row) => {
    const participants = (row.participants ?? []) as { role: string; name: string | null; address: string }[];
    const from = participants.find((p) => p.role === "from");
    return {
      type: "message",
      id: row.id,
      title: row.subject ?? "(no subject)",
      subtitle: from ? from.name ?? from.address : "",
    };
  });

  const contactResults: SearchResult[] = (contactsRes.data ?? []).map((row) => ({
    type: "contact",
    id: row.id,
    title: row.name ?? row.email,
    subtitle: row.email,
  }));

  return NextResponse.json([...messageResults, ...contactResults]);
}
