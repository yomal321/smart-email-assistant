// GET /api/contacts — the bounded list read backing app/contacts/page.tsx
// (spec 011-followups-contacts-api). Every row maps through
// contact-mapping.ts's `mapContactRowToContact` so the aggregate/tone-history
// lookups live in exactly one place.
//
// `sort` and `groupByDomain` (app/contacts/page.tsx) are both already
// handled entirely client-side today — the page sorts its own copy of the
// array with `.sort()` and reshapes it into domain groups with `.reduce()`,
// neither of which reads anything from the network beyond the flat list.
// This route therefore ignores both query params rather than duplicating
// that logic server-side; it always returns the same flat, unsorted array
// (still a valid response if either param is present or absent).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapContactRowToContact, type ContactRow } from "@/lib/data/contact-mapping";

// Mirrors ContactRow's field list exactly (lib/data/contact-mapping.ts) —
// never `select("*")`.
const SELECT_COLUMNS = "id, account_id, name, email, domain, avatar_url, is_vip";

export async function GET() {
  const supabase = getSupabaseServerClient();

  // An account can only send mail as itself — every distinct `from` address
  // across every email this account sent (`is_from_user = true`) is the set
  // of addresses that identify the account owner, not a real contact. This
  // is a computed exclusion, not account-scoping: there's no
  // multi-tenant filter on the `contacts` query below (no such convention
  // exists anywhere else in this codebase's API routes).
  const { data: sentRows, error: sentError } = await supabase
    .from("emails")
    .select("participants")
    .eq("is_from_user", true);

  if (sentError) {
    return NextResponse.json({ error: "failed to read contacts" }, { status: 500 });
  }

  const ownerAddresses = new Set<string>();
  for (const row of sentRows ?? []) {
    const participants = (row.participants ?? []) as { role: string; address: string }[];
    for (const p of participants) {
      if (p.role === "from") ownerAddresses.add(p.address);
    }
  }

  const { data, error } = await supabase.from("contacts").select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to read contacts" }, { status: 500 });
  }

  const rows = ((data ?? []) as unknown as ContactRow[]).filter((row) => !ownerAddresses.has(row.email));
  const contacts = await Promise.all(rows.map(mapContactRowToContact));

  return NextResponse.json(contacts);
}
