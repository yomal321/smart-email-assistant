// GET/POST /api/drafts — GET lists drafts (optionally filtered by status)
// for app/drafts/page.tsx (spec.md FR10/FR12, design.md "API Changes"); POST
// proxies draft generation to n8n's draft-generation.json webhook instead of
// inserting into `drafts` directly (spec FR9) — n8n owns the insert (auth,
// existence, and regeneration-cap checks all live there), this route only
// relays its response.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { mapDraftRowToDraft, type DraftRow } from "@/lib/data/draft-mapping";

// Mirrors DraftRow's field list exactly (lib/data/draft-mapping.ts) — never
// `select("*")`.
const DRAFT_COLUMNS =
  "id, email_id, draft_body, generated_body, tone, length, status, created_at, approved_at, edit_distance, custom_instruction";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const supabase = getSupabaseServerClient();
  let query = supabase.from("drafts").select(DRAFT_COLUMNS);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "failed to read drafts" }, { status: 500 });
  }

  const drafts = ((data ?? []) as unknown as DraftRow[]).map(mapDraftRowToDraft);
  return NextResponse.json(drafts);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messageId: unknown = body?.messageId;
  const tone: unknown = body?.tone;
  const length: unknown = body?.length;
  // Only meaningful when tone === "custom" — n8n's "Verify secret" node
  // validates, trims and bounds this itself, so it's forwarded as-is.
  const customInstruction: unknown = body?.customInstruction;

  let n8nRes: Response;
  try {
    n8nRes = await fetch(process.env.N8N_DRAFT_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-draft-webhook-secret": process.env.DRAFT_WEBHOOK_SECRET!,
      },
      body: JSON.stringify({ email_id: messageId, tone, length, custom_instruction: customInstruction }),
    });
  } catch {
    return NextResponse.json({ error: "failed to reach draft generation service" }, { status: 502 });
  }

  // n8n owns every failure mode here (401/404/429 cooldown/429 regen
  // cap/502) — pass its status and body through unchanged rather than
  // re-deriving them.
  if (n8nRes.status !== 200) {
    return NextResponse.json(await n8nRes.json(), { status: n8nRes.status });
  }

  const row = (await n8nRes.json()) as DraftRow;
  return NextResponse.json(mapDraftRowToDraft(row));
}
