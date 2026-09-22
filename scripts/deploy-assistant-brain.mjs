// One-off deploy helper: PUTs n8n/workflows/assistant-brain.json to the live
// "Assistant Brain" workflow via n8n's public API.
//
// The committed JSON always carries placeholder credential/workflow ids
// (REPLACE_WITH_SUPABASE_POSTGRES_CREDENTIAL_ID, an empty LLM Gateway
// workflowId) -- see docs/setup/assistant-bot-setup.md. This substitutes the
// real, already-live ids before pushing, same substitution the original
// import did by hand.
//
// Requires .env.n8n.local (N8N_BASE_URL, N8N_API_KEY) in the repo root.
//
// Usage: node scripts/deploy-assistant-brain.mjs

import { readFileSync } from "node:fs";

const ASSISTANT_BRAIN_WORKFLOW_ID = "ZspQipmQbwvQ6WF7"; // per docs/setup/assistant-bot-setup.md
const REAL_POSTGRES_CREDENTIAL = { id: "5JIQ0EMwvsNWFJ0h", name: "Supabase Postgres" };
const REAL_LLM_GATEWAY_WORKFLOW_ID = "gcGAXgjk0Qbi2HKs";

function loadEnvFile(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadEnvFile(".env.n8n.local");
if (!env.N8N_BASE_URL || !env.N8N_API_KEY) {
  console.error(".env.n8n.local must set N8N_BASE_URL and N8N_API_KEY.");
  process.exit(1);
}

const workflow = JSON.parse(readFileSync("n8n/workflows/assistant-brain.json", "utf8"));

let patchedCreds = 0;
for (const node of workflow.nodes) {
  if (node.type === "n8n-nodes-base.postgres") {
    node.credentials.postgres = REAL_POSTGRES_CREDENTIAL;
    patchedCreds += 1;
  }
  if (node.type === "n8n-nodes-base.executeWorkflow" && node.name === "Call LLM Gateway") {
    node.parameters.workflowId.value = REAL_LLM_GATEWAY_WORKFLOW_ID;
  }
}

const body = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings ?? {},
};

console.log(`Pushing ${workflow.nodes.length} nodes (${patchedCreds} Postgres credential refs patched) to ${ASSISTANT_BRAIN_WORKFLOW_ID}...`);

const res = await fetch(`${env.N8N_BASE_URL}/api/v1/workflows/${ASSISTANT_BRAIN_WORKFLOW_ID}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-N8N-API-KEY": env.N8N_API_KEY },
  body: JSON.stringify(body),
});

const resultText = await res.text();
if (!res.ok) {
  console.error(`n8n API returned HTTP ${res.status}:\n${resultText}`);
  process.exit(1);
}

const result = JSON.parse(resultText);
console.log(`Deployed. Live node count is now ${result.nodes?.length}. Workflow remains ${result.active ? "active" : "inactive"} (unchanged by this push).`);
