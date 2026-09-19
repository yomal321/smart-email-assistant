// GET/POST /api/rules — the rule list and builder-save backing
// app/rules/page.tsx (PHASE-4-IMPLEMENTATION-PLAN.md Wave 4). Rules do not
// *run* yet (Phase 5's Rule Engine) — this route only makes them a durable,
// queryable resource.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountId } from "@/lib/supabase/account";
import { mapRuleRowToRule, type RuleRow } from "@/lib/data/rule-mapping";
import type { RuleAction } from "@/lib/data/types";

// Mirrors RuleRow's field list exactly — never `select("*")`.
const SELECT_COLUMNS =
  "id, enabled, conditions, actions, condition_summary, action_summary, daily_cap, confidence_floor";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("rules").select(SELECT_COLUMNS);

  if (error) {
    return NextResponse.json({ error: "failed to read rules" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as RuleRow[];
  const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const rules = await Promise.all(
    rows.map(async (row) => {
      const { count } = await supabase
        .from("rule_runs")
        .select("*", { count: "exact", head: true })
        .eq("rule_id", row.id)
        .gt("ran_at", since);
      return mapRuleRowToRule(row, count ?? 0);
    })
  );

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const conditions: unknown = body?.conditions;
  const actions: unknown = body?.actions;
  const conditionSummary: unknown = body?.conditionSummary;
  const actionSummary: unknown = body?.actionSummary;
  const dailyCap: unknown = body?.dailyCap ?? null;
  const confidenceFloor: unknown = body?.confidenceFloor ?? null;

  if (!Array.isArray(conditions) || conditions.length === 0) {
    return NextResponse.json({ error: "conditions must be a non-empty array" }, { status: 400 });
  }
  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json({ error: "actions must be a non-empty array" }, { status: 400 });
  }
  if (typeof conditionSummary !== "string" || typeof actionSummary !== "string") {
    return NextResponse.json({ error: "conditionSummary and actionSummary must be strings" }, { status: 400 });
  }

  // BACKEND-REQUIREMENTS.md §5.2: confidence_floor is "required for
  // auto-reply rules" — a fact about this row's own `actions` content, so
  // it's enforced here rather than as an unconditional DB CHECK.
  const hasAutoReply = (actions as RuleAction[]).some((a) => a.type === "auto-reply");
  if (hasAutoReply && (confidenceFloor === null || typeof confidenceFloor !== "number")) {
    return NextResponse.json({ error: "confidenceFloor is required for auto-reply rules" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const accountId = await getAccountId(supabase);
  if (!accountId) {
    return NextResponse.json({ error: "no connected account" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("rules")
    .insert({
      account_id: accountId,
      enabled: true,
      conditions,
      actions,
      condition_summary: conditionSummary,
      action_summary: actionSummary,
      daily_cap: typeof dailyCap === "number" ? dailyCap : null,
      confidence_floor: typeof confidenceFloor === "number" ? confidenceFloor : null,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: "failed to create rule" }, { status: 500 });
  }

  const rule = mapRuleRowToRule(data as unknown as RuleRow, 0);
  return NextResponse.json(rule);
}
