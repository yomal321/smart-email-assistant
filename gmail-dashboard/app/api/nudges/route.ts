// POST /api/nudges — persists a nudge for the Nudge dialog, either on a
// commitment (spec.md FR16) or directly on an "awaiting reply" email, which
// has no commitment at all (getAwaitingReply and getCommitments are
// deliberately separate concepts — see spec.md Overview). `nudges.commitment_id`
// is nullable for exactly this reason. Deliberately does NOT send anything:
// no Gmail credential is reachable from this route, so this endpoint's
// entire effect is inserting a row with sent_at left null (spec NFR4, Open
// Question 2 resolved as persist-only for this phase).
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const commitmentId: unknown = body?.commitmentId;
  const emailId: unknown = body?.emailId;
  const nudgeBody: unknown = body?.body;

  const hasCommitmentId = typeof commitmentId === "string" && commitmentId.trim().length > 0;
  const hasEmailId = typeof emailId === "string" && emailId.trim().length > 0;

  if (!hasCommitmentId && !hasEmailId) {
    return NextResponse.json({ error: "either commitmentId or emailId is required" }, { status: 400 });
  }
  if (typeof nudgeBody !== "string" || nudgeBody.trim().length === 0) {
    return NextResponse.json({ error: "body must be a non-empty string" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // A nudge always needs a real parent to attach to — unlike an
  // update-by-id route, there is genuinely nothing to write when the parent
  // doesn't exist, so this is a 404, not the silent no-op convention
  // PATCH-by-id routes use.
  let resolvedEmailId: string;
  if (hasCommitmentId) {
    const { data: commitment, error: readError } = await supabase
      .from("commitments")
      .select("email_id")
      .eq("id", commitmentId as string)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: "failed to read commitment" }, { status: 500 });
    }
    if (!commitment) {
      return NextResponse.json({ error: "commitment not found" }, { status: 404 });
    }
    resolvedEmailId = commitment.email_id as string;
  } else {
    const { data: email, error: readError } = await supabase
      .from("emails")
      .select("id")
      .eq("id", emailId as string)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ error: "failed to read email" }, { status: 500 });
    }
    if (!email) {
      return NextResponse.json({ error: "email not found" }, { status: 404 });
    }
    resolvedEmailId = email.id as string;
  }

  const { data, error } = await supabase
    .from("nudges")
    .insert({
      commitment_id: hasCommitmentId ? commitmentId : null,
      email_id: resolvedEmailId,
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
