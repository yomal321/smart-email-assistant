// Check for the bot's natural-language intent map.
//
// The mapping lives as a jsCode string inside assistant-brain.json's 'Detect
// slash command' node, so it is not reachable by vitest. This runs THAT exact
// string (no copy to drift out of sync) against a table of real phrasings,
// with the two n8n globals it touches stubbed.
//
// Usage: node scripts/ci/check-bot-intents.mjs

import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync("n8n/workflows/assistant-brain.json", "utf8"));
const node = workflow.nodes.find((n) => n.name === "Detect slash command");
if (!node) {
  console.error("assistant-brain.json: no 'Detect slash command' node — did it get renamed?");
  process.exit(1);
}

const detect = new Function("$", "$json", node.parameters.jsCode);

function run(text) {
  const $ = () => ({ first: () => ({ json: { chat_id: "42", text } }) });
  return detect($, { timezone: "Asia/Colombo" }).json;
}

// [message, expected command, expected rewritten text (optional)]
const CASES = [
  // slash commands still win outright
  ["/today", "/today"],
  ["/add call the bank tomorrow", "/add", "/add call the bank tomorrow"],
  ["/help", "/help"],

  // natural language reaching the same branches
  ["what's on today?", "/today"],
  ["whats my agenda", "/today"],
  ["anything urgent?", "/urgent"],
  ["any urgent emails I missed", "/urgent"],
  ["what's due", "/deadlines"],
  ["show me my deadlines", "/deadlines"],
  ["anything overdue?", "/deadlines"],
  ["how did I do this week", "/week"],
  ["any vip mail", "/vip"],
  ["hey", "/help"],
  ["what can you do", "/help"],

  // natural-language task capture, rewritten into the shape Parse /add wants
  ["remind me to call the bank tomorrow", "/add", "/add call the bank tomorrow"],
  ["add milk today", "/add", "/add milk today"],
  ["add a task to email Dilshan", "/add", "/add email Dilshan"],
  ["Please add a new todo called renew the domain", "/add", "/add renew the domain"],
  ["note down the wifi password?", "/add", "/add the wifi password"],

  // ordering: a capture verb beats a keyword that appears later in the same message
  ["add a task due tomorrow", "/add", "/add a task due tomorrow"],

  // natural-language task completion, rewritten into the shape Parse /done wants
  ["/done the report", "/done"],
  ["mark the report done", "/done", "/done the report"],
  ["mark the report as done", "/done", "/done the report"],
  ["I finished the report", "/done", "/done the report"],
  ["complete renew the domain", "/done", "/done renew the domain"],
  ["done with the report", "/done", "/done the report"],
  // "is" survives this layer -- Parse /done's STOPWORDS filter drops it, not this node
  ["the report is done", "/done", "/done the report is"],

  // natural-language snooze, rewritten into the shape Parse /snooze wants
  ["/snooze the report to tomorrow", "/snooze"],
  ["snooze the report to tomorrow", "/snooze", "/snooze the report to tomorrow"],
  ["postpone renew the domain to today", "/snooze", "/snooze renew the domain to today"],
  ["push back the report to tomorrow", "/snooze", "/snooze the report to tomorrow"],

  // genuine questions must still fall through to the free-text path
  ["what did Nuwan say about the invoice", null],
  ["summarise the thread with HR", null],
  ["", null],
];

const failures = [];
for (const [text, expectedCommand, expectedText] of CASES) {
  const got = run(text);
  if (got.command !== expectedCommand) {
    failures.push(`${JSON.stringify(text)} → command ${JSON.stringify(got.command)}, expected ${JSON.stringify(expectedCommand)}`);
    continue;
  }
  if (expectedText !== undefined && got.text !== expectedText) {
    failures.push(`${JSON.stringify(text)} → text ${JSON.stringify(got.text)}, expected ${JSON.stringify(expectedText)}`);
  }
  if (got.chat_id !== "42" || !got.timezone) {
    failures.push(`${JSON.stringify(text)} → lost chat_id/timezone: ${JSON.stringify(got)}`);
  }
}

if (failures.length > 0) {
  console.error(`Bot intent map: ${failures.length} of ${CASES.length} case(s) failed:\n`);
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`Bot intent map: ${CASES.length} cases OK.`);
