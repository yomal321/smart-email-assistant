// POST /api/sync/resync — "Resync now" (Settings page and command palette).
// Proxies to gmail-renewal-recovery.json's new webhook trigger (PHASE-4-
// IMPLEMENTATION-PLAN.md Wave 2) the same way POST /api/drafts proxies
// draft-generation.json — n8n owns the outcome, this route relays it.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";

export async function POST() {
  let n8nRes: Response;
  try {
    n8nRes = await fetch(process.env.N8N_RESYNC_WEBHOOK_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-resync-webhook-secret": process.env.RESYNC_WEBHOOK_SECRET!,
      },
      body: "{}",
    });
  } catch {
    return NextResponse.json({ error: "failed to reach resync service" }, { status: 502 });
  }

  if (n8nRes.status !== 200) {
    return NextResponse.json(await n8nRes.json(), { status: n8nRes.status });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (accountId) {
    await supabase.from("activity_log").insert({
      account_id: accountId,
      action: "Resync triggered",
      target: "Gmail account",
      cause: "Manual, from Settings/command palette",
      undoable: false,
    });
  }

  return NextResponse.json(await n8nRes.json());
}
