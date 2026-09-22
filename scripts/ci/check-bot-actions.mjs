// Check for the bot's /done and /snooze write path: word-extraction (Parse
// /done, Parse /snooze) and match resolution (Resolve /done match, Resolve
// /snooze match). Runs the real jsCode straight out of the workflow JSON
// (no copy to drift out of sync), with $() and $json stubbed.
//
// check-bot-intents.mjs covers routing INTO these nodes; this covers what
// happens once inside them -- which task gets matched, and the three
// zero/one/many outcomes that decide whether a write happens at all.
//
// Usage: node scripts/ci/check-bot-actions.mjs

import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync("n8n/workflows/assistant-brain.json", "utf8"));
const byName = Object.fromEntries(workflow.nodes.map((n) => [n.name, n]));

function getNode(name) {
  const node = byName[name];
  if (!node) throw new Error(`assistant-brain.json: no '${name}' node — did it get renamed?`);
  return node;
}

function runEachItem(name, input) {
  const fn = new Function("$json", "$", getNode(name).parameters.jsCode);
  return fn(input, () => ({})).json;
}

const failures = [];
function check(label, got, expected) {
  const gotStr = JSON.stringify(got);
  const expStr = JSON.stringify(expected);
  if (gotStr !== expStr) failures.push(`${label}\n    got:      ${gotStr}\n    expected: ${expStr}`);
}

// ---- Parse /done: word extraction + the vacuous-ILIKE-ALL guard ----
check(
  "Parse /done: strips filler, keeps content words",
  runEachItem("Parse /done", { text: "/done the report" }),
  { query: "the report", patterns: ["%report%"] },
);
check(
  "Parse /done: multi-word query keeps every significant word",
  runEachItem("Parse /done", { text: "/done renew the domain" }),
  { query: "renew the domain", patterns: ["%renew%", "%domain%"] },
);
check(
  "Parse /done: all-stopword remainder gets the no-match sentinel, not an empty array",
  runEachItem("Parse /done", { text: "/done the" }),
  { query: "the", patterns: ["\u0000__no_match__\u0000"] },
);
check(
  "Parse /done: truly empty remainder also gets the sentinel",
  runEachItem("Parse /done", { text: "/done" }),
  { query: "", patterns: ["\u0000__no_match__\u0000"] },
);

// ---- Parse /snooze: day-word extraction + the same guard ----
check(
  "Parse /snooze: extracts trailing day word, strips it from the query",
  runEachItem("Parse /snooze", { text: "/snooze the report to tomorrow", timezone: "Asia/Colombo" }),
  { query: "the report", patterns: ["%report%"], dueDate: isoTomorrow() },
);
check(
  "Parse /snooze: missing day word leaves dueDate null (must not silently default)",
  runEachItem("Parse /snooze", { text: "/snooze the report", timezone: "Asia/Colombo" }),
  { query: "the report", patterns: ["%report%"], dueDate: null },
);

function isoTomorrow() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ---- Resolve /done match / /snooze match: zero / one / many outcomes ----
function runResolve(name, refs) {
  const fn = new Function("$", getNode(name).parameters.jsCode);
  const $ = (ref) => refs[ref];
  return fn($).json;
}

const chatIdRef = { first: () => ({ json: { chat_id: "42" } }) };

check(
  "Resolve /done match: empty query asks for detail, never guesses",
  runResolve("Resolve /done match", {
    "Detect slash command": chatIdRef,
    "Parse /done": { first: () => ({ json: { query: "" } }) },
    "Match task (done)": { all: () => [] },
  }),
  { chat_id: "42", reply_text: 'Tell me which task -- include a few words from it, e.g. "mark renew the domain done".' },
);
check(
  "Resolve /done match: zero rows reports not-found, does not write",
  runResolve("Resolve /done match", {
    "Detect slash command": chatIdRef,
    "Parse /done": { first: () => ({ json: { query: "xyz" } }) },
    "Match task (done)": { all: () => [] },
  }),
  { chat_id: "42", reply_text: `Couldn't find an open task matching "xyz". Try /today to see what's open.` },
);
check(
  "Resolve /done match: multiple rows asks to narrow down, does not guess which one",
  runResolve("Resolve /done match", {
    "Detect slash command": chatIdRef,
    "Parse /done": { first: () => ({ json: { query: "report" } }) },
    "Match task (done)": { all: () => [{ json: { id: "1", task_text: "email report" } }, { json: { id: "2", task_text: "finish report" } }] },
  }),
  { chat_id: "42", reply_text: "That matches more than one open task:\n- email report\n- finish report\n\nTell me a bit more to narrow it down." },
);
check(
  "Resolve /done match: exactly one row resolves to a write",
  runResolve("Resolve /done match", {
    "Detect slash command": chatIdRef,
    "Parse /done": { first: () => ({ json: { query: "domain" } }) },
    "Match task (done)": { all: () => [{ json: { id: "9", task_text: "renew the domain" } }] },
  }),
  { chat_id: "42", taskId: "9", taskText: "renew the domain" },
);
check(
  "Resolve /snooze match: no due date is checked before match rows, never defaults silently",
  runResolve("Resolve /snooze match", {
    "Detect slash command": chatIdRef,
    "Parse /snooze": { first: () => ({ json: { query: "report", dueDate: null } }) },
    "Match task (snooze)": { all: () => [{ json: { id: "1", task_text: "report" } }] },
  }),
  { chat_id: "42", reply_text: 'Snooze to when? Add "to today" or "to tomorrow", e.g. "snooze the report to tomorrow".' },
);
check(
  "Resolve /snooze match: exactly one row resolves to a write with the due date carried through",
  runResolve("Resolve /snooze match", {
    "Detect slash command": chatIdRef,
    "Parse /snooze": { first: () => ({ json: { query: "domain", dueDate: "2026-09-23" } }) },
    "Match task (snooze)": { all: () => [{ json: { id: "9", task_text: "renew the domain" } }] },
  }),
  { chat_id: "42", taskId: "9", taskText: "renew the domain", dueDate: "2026-09-23" },
);

if (failures.length > 0) {
  console.error(`Bot action resolution: ${failures.length} case(s) failed:\n`);
  for (const line of failures) console.error(`  ${line}\n`);
  process.exit(1);
}

console.log("Bot action resolution: all cases OK.");
