// GET /api/hub/bot-workflow-detail?name=<workflow name> — per-workflow detail
// for the /bot page's "Live status" panel (BOT-WORKFLOW-DETAIL-PLAN.md).
// Fetched on demand when a workflow row is clicked, never preloaded for all
// four on page load.
//
// Modeled on a reference "Live Agent Map" panel, but scoped to what n8n's
// API actually exposes for a plain automation workflow — n8n has no concept
// of an "agent," a "handoff," or a compute cost, so those don't appear here.
// What's real and used: execution status/timing (list endpoint), and
// per-execution jsonSizeBytes + the failure error string (single-execution
// detail endpoint, includeData=true — confirmed live, NOT present on the
// list endpoint).
//
// Cost discipline: the list call is 1 request regardless of workflow. Detail
// calls (needed for size + error text, and, for Assistant Scheduler only,
// trigger classification) are bounded — see TRIGGER_DETAIL_SAMPLE /
// SIZE_SAMPLE below — not fired for all 20 runs on every workflow.
//
// Auth is enforced by middleware.ts (deny-by-default) before this handler
// ever runs — this route does not re-check the session cookie itself.
import { NextResponse } from "next/server";

const RUN_LIMIT = 20;
const SIZE_SAMPLE = 5; // non-Scheduler workflows: detail-fetch only the most recent N for an avg size, not all 20
const FETCH_TIMEOUT_MS = 8000;

// Assistant Scheduler (assistant-scheduler.json) bundles all four proactive
// triggers into one n8n workflow. The Urgent/VIP poll alone fires every 5
// minutes (~288/day) versus three daily crons — a flat "last 20 runs" for
// this workflow would be almost entirely poll noise and could hide a broken
// Morning Brief entirely. Real, verified live: each trigger's own node name
// appears as a key in `resultData.runData`, so which one fired is
// determinable per execution.
const SCHEDULER_WORKFLOW_NAME = "Assistant Scheduler";
const TRIGGER_NODE_LABELS: Record<string, string> = {
  "Morning Brief Trigger": "Morning Brief",
  "Deadline Nudge Trigger": "Deadline nudge",
  "Urgent/VIP Poll Trigger": "Urgent/VIP poll",
  "Evening Review Trigger": "Evening Review",
};

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
}

interface N8nWorkflowDefinition {
  nodes: { name: string; type: string }[];
  connections: Record<string, { main?: ({ node: string; type: string; index: number } | null)[][] }>;
}

interface N8nExecutionListItem {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  mode: string;
}

interface N8nExecutionDetail {
  jsonSizeBytes?: number;
  data?: {
    resultData?: {
      runData?: Record<string, unknown>;
      error?: { message?: string };
    };
  };
}

interface RunView {
  id: string;
  status: string;
  startedAt: string;
  durationMs: number | null;
  n8nUrl: string;
  trigger: string | null;
  error: string | null;
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function detectTrigger(detail: N8nExecutionDetail | null): string | null {
  const nodeNames = Object.keys(detail?.data?.resultData?.runData ?? {});
  for (const [nodeName, label] of Object.entries(TRIGGER_NODE_LABELS)) {
    if (nodeNames.includes(nodeName)) return label;
  }
  return null;
}

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ available: false, reason: "missing workflow name" });
  }

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

  const workflowsBody = await fetchJson<{ data: N8nWorkflow[] }>(`${base}/api/v1/workflows?limit=100`, headers);
  if (!workflowsBody) {
    return NextResponse.json({ available: false, reason: "n8n unreachable" });
  }

  // Same active-preferred match as bot-health (a duplicate inactive
  // leftover from a re-import is never the one worth reporting on).
  const matches = workflowsBody.data.filter((w) => w.name === name);
  const workflow = matches.find((w) => w.active) ?? matches[0];
  if (!workflow) {
    return NextResponse.json({ available: false, reason: "workflow not found in n8n" });
  }

  const [execListBody, definition] = await Promise.all([
    fetchJson<{ data: N8nExecutionListItem[] }>(`${base}/api/v1/executions?workflowId=${workflow.id}&limit=${RUN_LIMIT}`, headers),
    fetchJson<N8nWorkflowDefinition>(`${base}/api/v1/workflows/${workflow.id}`, headers),
  ]);
  if (!execListBody) {
    return NextResponse.json({ available: false, reason: "n8n unreachable" });
  }
  const executions = execListBody.data;

  const isScheduler = name === SCHEDULER_WORKFLOW_NAME;
  const failedIds = new Set(executions.filter((e) => e.status === "error").map((e) => e.id));
  // Everyone else: detail-fetch failures (for the error text) plus a small
  // recency sample (for an honest, labeled-as-sampled avg size). Scheduler:
  // detail-fetch everyone, since trigger classification needs it anyway —
  // the size average then covers the full window for free.
  const detailIds = isScheduler
    ? executions.map((e) => e.id)
    : [...new Set([...executions.slice(0, SIZE_SAMPLE).map((e) => e.id), ...failedIds])];

  const detailById = new Map<string, N8nExecutionDetail>();
  await Promise.all(
    detailIds.map(async (id) => {
      const detail = await fetchJson<N8nExecutionDetail>(`${base}/api/v1/executions/${id}?includeData=true`, headers);
      if (detail) detailById.set(id, detail);
    })
  );

  const durationsMs = executions
    .filter((e) => e.stoppedAt)
    .map((e) => new Date(e.stoppedAt!).getTime() - new Date(e.startedAt).getTime());
  const avgDurationMs = durationsMs.length > 0 ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length) : null;

  const sizesBytes = [...detailById.values()].map((d) => d.jsonSizeBytes).filter((v): v is number => typeof v === "number");
  const avgSizeBytes = sizesBytes.length > 0 ? Math.round(sizesBytes.reduce((a, b) => a + b, 0) / sizesBytes.length) : null;

  const successCount = executions.filter((e) => e.status === "success").length;
  const failureCount = failedIds.size;

  const runs: RunView[] = executions.slice(0, 15).map((e) => {
    const detail = detailById.get(e.id) ?? null;
    return {
      id: e.id,
      status: e.status,
      startedAt: e.startedAt,
      durationMs: e.stoppedAt ? new Date(e.stoppedAt).getTime() - new Date(e.startedAt).getTime() : null,
      n8nUrl: `${base}/workflow/${workflow.id}/executions/${e.id}`,
      trigger: isScheduler ? detectTrigger(detail) : null,
      error: e.status === "error" ? (detail?.data?.resultData?.error?.message ?? null) : null,
    };
  });

  // Assistant Scheduler only: counts per trigger, so a healthy-looking
  // "20/20 succeeded" doesn't hide a Morning Brief that silently never ran
  // today underneath 19 poll executions.
  let triggerBreakdown: { label: string; total: number; failures: number }[] | null = null;
  if (isScheduler) {
    const byTrigger = new Map<string, { total: number; failures: number }>();
    for (const e of executions) {
      const label = detectTrigger(detailById.get(e.id) ?? null) ?? "Unknown trigger";
      const bucket = byTrigger.get(label) ?? { total: 0, failures: 0 };
      bucket.total += 1;
      if (e.status === "error") bucket.failures += 1;
      byTrigger.set(label, bucket);
    }
    triggerBreakdown = [...byTrigger.entries()].map(([label, v]) => ({ label, ...v }));
  }

  return NextResponse.json({
    available: true,
    workflow: { name: workflow.name, id: workflow.id, active: workflow.active },
    metrics: {
      totalRuns: executions.length,
      successRatePct: executions.length > 0 ? Math.round((successCount / executions.length) * 100) : null,
      failureCount,
      avgDurationMs,
      avgSizeBytes,
      // Honest about whether the size average covers everything or a
      // recency sample — the UI must not present a sampled figure as if it
      // were the full-window truth.
      avgSizeSampled: !isScheduler,
    },
    triggerBreakdown,
    runs,
    // The real node graph, for rendering the workflow's actual internal
    // structure (not a simplified stand-in) alongside this metrics panel.
    // Trimmed to name/type/connections only — node `parameters` can contain
    // large amounts of data the canvas has no use for.
    structure: definition
      ? { nodes: definition.nodes.map((n) => ({ name: n.name, type: n.type })), connections: definition.connections }
      : null,
  });
}
