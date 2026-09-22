// PATCH/DELETE /api/certifications/:id — edit and delete, backing
// app/(hub)/certifications/page.tsx. See PHASE-7-IMPLEMENTATION-PLAN.md
// Wave 4.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapCertificationRowToCertification, type CertificationRow } from "@/lib/data/certification-mapping";

const SELECT_COLUMNS = "id, plan_id, name, provider, status, exam_date, expiry_date, cost, notes, created_at, updated_at";
const STATUSES = ["planned", "studying", "scheduled", "passed", "failed", "expired"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const update: Record<string, unknown> = {};
  if (body?.name !== undefined) update.name = body.name;
  if (body?.provider !== undefined) update.provider = body.provider;
  if (body?.examDate !== undefined) update.exam_date = body.examDate;
  if (body?.expiryDate !== undefined) update.expiry_date = body.expiryDate;
  if (body?.cost !== undefined) update.cost = body.cost;
  if (body?.notes !== undefined) update.notes = body.notes;
  if (body?.planId !== undefined) update.plan_id = body.planId;
  if (body?.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "at least one recognized field is required" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("certifications")
    .update(update)
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "planId does not reference an existing plan" }, { status: 400 });
    }
    return NextResponse.json({ error: "failed to update certification" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "certification not found" }, { status: 404 });
  }

  const certification = mapCertificationRowToCertification(data as unknown as CertificationRow);
  return NextResponse.json({ certification });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  const { error } = await supabase.from("certifications").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "failed to delete certification" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
