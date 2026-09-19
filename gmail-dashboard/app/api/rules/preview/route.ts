// POST /api/rules/preview — replaces app/rules/page.tsx's RuleBuilder fake
// preview count (`Math.round((value.length * 7 + field.length) % totalMessages)`)
// with a real query against `emails`, scoped to the last 30 days like the
// UI's own copy ("Would have matched N messages in the last 30 days") says.
//
// Only single conditions are translated (PHASE-4-IMPLEMENTATION-PLAN.md
// Wave 4/§7 judgment call #3) — the builder's own "+ and/or" button isn't
// wired to anything yet either, so a preview endpoint that only handles one
// condition at a time matches what the UI can actually construct today. A
// condition this mapping can't express returns `partial: true` and `count: 0`
// rather than guessing, so the UI can show an honest "not available" state
// instead of a number that looks equally confident as a real one.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { RuleCondition } from "@/lib/data/types";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const conditions: unknown = body?.conditions;

  if (!Array.isArray(conditions) || conditions.length !== 1) {
    return NextResponse.json({ count: 0, partial: true });
  }

  const condition = conditions[0] as RuleCondition;
  const { field, operator, value } = condition;
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  let query = supabase.from("emails").select("*", { count: "exact", head: true }).gt("received_at", since);

  switch (field) {
    case "Sender domain":
      // Approximate: substring match across the whole participants blob
      // rather than unnesting the jsonb array server-side — a real "domain
      // of the from-address" match would need a DB function this phase
      // doesn't add. Good enough for a preview count, not exact.
      query = query.ilike("participants::text", `%${value}%`);
      break;
    case "Subject":
      query = operator === "equals" ? query.eq("subject", value) : query.ilike("subject", `%${value}%`);
      break;
    case "Category":
      query = operator === "equals" ? query.eq("platform", value) : query.ilike("platform", `%${value}%`);
      break;
    case "Confidence": {
      const n = Number(value);
      if (Number.isNaN(n)) return NextResponse.json({ count: 0, partial: true });
      query = operator === "is above" ? query.gt("confidence", n) : query.lt("confidence", n);
      break;
    }
    case "Has attachment":
      query = query.neq("attachments", []);
      break;
    default:
      return NextResponse.json({ count: 0, partial: true });
  }

  const { count, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to preview rule" }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0, partial: false });
}
