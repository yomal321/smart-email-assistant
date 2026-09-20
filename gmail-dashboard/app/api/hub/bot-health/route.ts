// GET /api/hub/bot-health — real execution status for the bot's four n8n
// workflows, via n8n's own public API (BOT-PAGE-PLAN.md option C1). This is
// the one thing on the /bot page that is an actual health check rather than
// an inference from Supabase traces — everything else on this page (the
// activity log, the stats) can only ever say "here's what got logged," not
// "is it currently working."
//
// N8N_API_KEY already existed in .env.local, unused by any other route.
// The n8n base URL is derived from N8N_DRAFT_WEBHOOK_URL's origin rather
// than a new env var — both point at the same instance.
//
// Server-only: this key must never reach the browser. The route degrades to
// `{ available: false }` rather than a 500 on any failure (missing env,
// unreachable host, disabled Public API) — a health check that itself
// throws is worse than useless, and per this project's convention, an
// unknown status is shown honestly as unknown, never faked as "up."
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";

const TARGET_WORKFLOWS = ["Assistant Scheduler", "Assistant Brain", "Telegram Adapter", "Telegram Send"] as const;
const FETCH_TIMEOUT_MS = 8000;

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

interface N8nExecution {
  status: "success" | "error" | "running" | "waiting" | "canceled" | string;
  startedAt: string;
  stoppedAt: string | null;
}

interface WorkflowHealth {
  name: string;
  found: boolean;
  active: boolean | null;
  lastExecutionAt: string | null;
  lastStatus: string | null;
}

export async function GET() {
  const webhookUrl = process.env.N8N_DRAFT_WEBHOOK_URL;
  const apiKey = process.env.N8N_API_KEY;

  if (!webhookUrl || !apiKey) {
    return NextResponse.json({ available: false, reason: "not configured" });
  }

  let base: string;
  try {
    base = new URL(webhookUrl).origin;
  } catch {
    return NextResponse.json({ available: false, reason: "not configured" });
  }

  const headers = { "X-N8N-API-KEY": apiKey };

  try {
    const workflowsRes = await fetch(`${base}/api/v1/workflows?limit=100`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!workflowsRes.ok) {
      return NextResponse.json({ available: false, reason: `n8n returned ${workflowsRes.status}` });
    }
    const workflowsBody = (await workflowsRes.json()) as { data: N8nWorkflow[] };

    const workflows: WorkflowHealth[] = await Promise.all(
      TARGET_WORKFLOWS.map(async (name) => {
        // Prefer an active match — n8n allows two workflows to share a name
        // (confirmed live: this project has an inactive duplicate "Email
        // Normaliser" alongside the real one from an earlier re-import),
        // and the inactive leftover is never the one worth reporting on.
        const matches = workflowsBody.data.filter((w) => w.name === name);
        const match = matches.find((w) => w.active) ?? matches[0];
        if (!match) {
          return { name, found: false, active: null, lastExecutionAt: null, lastStatus: null };
        }

        try {
          const execRes = await fetch(`${base}/api/v1/executions?workflowId=${match.id}&limit=1`, {
            headers,
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!execRes.ok) {
            return { name, found: true, active: match.active, lastExecutionAt: null, lastStatus: null };
          }
          const execBody = (await execRes.json()) as { data: N8nExecution[] };
          const last = execBody.data[0];
          return {
            name,
            found: true,
            active: match.active,
            lastExecutionAt: last?.stoppedAt ?? last?.startedAt ?? null,
            lastStatus: last?.status ?? null,
          };
        } catch {
          // A per-workflow execution lookup failing (timeout, transient
          // error) shouldn't blank out the other three that succeeded.
          return { name, found: true, active: match.active, lastExecutionAt: null, lastStatus: null };
        }
      })
    );

    return NextResponse.json({ available: true, workflows });
  } catch {
    return NextResponse.json({ available: false, reason: "n8n unreachable" });
  }
}
