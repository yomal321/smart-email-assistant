// POST /api/nudges — persists a nudge for the Nudge dialog on a commitment
// (spec.md FR16, design.md "API Changes"). Deliberately does NOT send
// anything: no Gmail credential is reachable from this route, so this
// endpoint's entire effect is inserting a row with sent_at left null
// (spec NFR4, Open Question 2 resolved as persist-only for this phase).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const commitmentId: unknown = body?.commitmentId;
  const nudgeBody: unknown = body?.body;

  if (typeof commitmentId !== "string" || commitmentId.trim().length === 0) {
    return NextResponse.json({ error: "commitmentId must be a non-empty string" }, { status: 400 });
  }
  if (typeof nudgeBody !== "string" || nudgeBody.trim().length === 0) {
    return NextResponse.json({ error: "body must be a non-empty string" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // A nudge always needs a real commitment to attach to (email_id is read
  // from it, not supplied by the caller) — unlike an update-by-id route,
  // there is genuinely nothing to write when the parent doesn't exist, so
  // this is a 404, not the silent no-op convention PATCH-by-id routes use.
  const { data: commitment, error: readError } = await supabase
    .from("commitments")
    .select("email_id")
    .eq("id", commitmentId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: "failed to read commitment" }, { status: 500 });
  }
  if (!commitment) {
    return NextResponse.json({ error: "commitment not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("nudges")
    .insert({
      commitment_id: commitmentId,
      email_id: commitment.email_id,
      body: nudgeBody,
      sent_at: null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create nudge" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
