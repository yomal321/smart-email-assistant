// CI guard for n8n/workflows.
//
// The workflow JSON is exported from the n8n editor and committed by hand, so
// the usual ways it breaks are a truncated export, a renamed node that left a
// dangling connection, or a credential pasted inline instead of read from
// $env. None of those are visible in review of a 2000-line JSON diff.
//
// Usage: node scripts/ci/check-n8n-workflows.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = "n8n/workflows";

// Prefixes of real credential formats. Deliberately narrow — an n8n export is
// full of expression strings, and a noisy scanner gets ignored.
const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/, "OpenAI-style API key"],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}/, "Anthropic API key"],
  [/\bAIza[A-Za-z0-9_-]{30,}/, "Google API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT (Supabase key?)"],
];

const errors = [];
const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".json")).sort();

if (files.length === 0) {
  errors.push(`${WORKFLOWS_DIR}/ contains no .json workflow exports.`);
}

for (const file of files) {
  const path = join(WORKFLOWS_DIR, file);
  const raw = readFileSync(path, "utf8");

  let workflow;
  try {
    workflow = JSON.parse(raw);
  } catch (error) {
    errors.push(`${path}: not valid JSON — ${error.message}`);
    continue;
  }

  for (const [pattern, label] of SECRET_PATTERNS) {
    const hit = pattern.exec(raw);
    if (hit) {
      // Print only the prefix; the whole point is not to copy the secret into
      // a public CI log.
      errors.push(`${path}: looks like a hardcoded ${label} ("${hit[0].slice(0, 8)}…"). Read it from $env instead.`);
    }
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push(`${path}: missing a non-empty "nodes" array — incomplete export?`);
    continue;
  }
  if (typeof workflow.connections !== "object" || workflow.connections === null) {
    errors.push(`${path}: missing a "connections" object — incomplete export?`);
    continue;
  }

  const names = new Set();
  for (const node of workflow.nodes) {
    if (!node.name || !node.type) {
      errors.push(`${path}: a node is missing "name" or "type".`);
      continue;
    }
    // n8n addresses nodes by name in connections and expressions, so a
    // duplicate name silently reroutes a branch.
    if (names.has(node.name)) errors.push(`${path}: duplicate node name "${node.name}".`);
    names.add(node.name);
  }

  // Every endpoint named in connections must still exist, in both directions.
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    if (!names.has(source)) {
      errors.push(`${path}: connections reference unknown source node "${source}".`);
    }
    for (const branches of Object.values(outputs ?? {})) {
      for (const branch of branches ?? []) {
        for (const target of branch ?? []) {
          if (!names.has(target.node)) {
            errors.push(`${path}: "${source}" connects to unknown node "${target.node}".`);
          }
        }
      }
    }
  }

  console.log(`${path}: ${workflow.nodes.length} nodes, OK`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  console.error(`\n${errors.length} workflow problem(s) found.`);
  process.exit(1);
}

console.log(`\n${files.length} n8n workflow(s) checked.`);
