// GET/POST /api/certifications — the cert list and create, backing
// app/(hub)/certifications/page.tsx. See PHASE-7-IMPLEMENTATION-PLAN.md
// Wave 4. Prep work is a Plan (category='career'), linked via plan_id —
// this table only holds cert-specific facts.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapCertificationRowToCertification, type CertificationRow } from "@/lib/data/certification-mapping";

const SELECT_COLUMNS = "id, plan_id, name, provider, status, exam_date, expiry_date, cost, notes, created_at, updated_at";
const STATUSES = ["planned", "studying", "scheduled", "passed", "failed", "expired"];

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("certifications").select(SELECT_COLUMNS).order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "failed to read certifications" }, { status: 500 });
  }

  const certifications = ((data ?? []) as unknown as CertificationRow[]).map(mapCertificationRowToCertification);
  return NextResponse.json(certifications);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name: unknown = body?.name;
  const provider: unknown = body?.provider ?? null;
  const examDate: unknown = body?.examDate ?? null;
  const cost: unknown = body?.cost ?? null;
  const planId: unknown = body?.planId ?? null;
  const status: unknown = body?.status;

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }
  if (status !== undefined && !STATUSES.includes(status as string)) {
    return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (provider !== null && typeof provider !== "string") {
    return NextResponse.json({ error: "provider must be a string or null" }, { status: 400 });
  }
  if (examDate !== null && typeof examDate !== "string") {
    return NextResponse.json({ error: "examDate must be a string or null" }, { status: 400 });
  }
  if (cost !== null && typeof cost !== "number") {
    return NextResponse.json({ error: "cost must be a number or null" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("certifications")
    .insert({
      account_id: accountId,
      name,
      provider,
      exam_date: examDate,
      cost,
      plan_id: planId,
      ...(status !== undefined ? { status } : {}),
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "planId does not reference an existing plan" }, { status: 400 });
    }
    return NextResponse.json({ error: "failed to create certification" }, { status: 500 });
  }

  const certification = mapCertificationRowToCertification(data as unknown as CertificationRow);
  return NextResponse.json(certification);
}
