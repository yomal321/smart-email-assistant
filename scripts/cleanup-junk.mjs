// Runner for POST /api/settings/cleanup.
//
// Dry run (default — deletes nothing, prints what would go):
//   node scripts/cleanup-junk.mjs
//
// Execute:
//   node scripts/cleanup-junk.mjs --execute
//
// Optional age filter, applied on top of the junk rule:
//   node scripts/cleanup-junk.mjs --older-than 30
//
// Needs the dashboard running (npm run dev) and DASHBOARD_LOGIN_SECRET in
// gmail-dashboard/.env.local. Point it elsewhere with BASE_URL=... to run
// against a deployed instance.
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const execute = process.argv.includes("--execute");
const ageFlag = process.argv.indexOf("--older-than");
const olderThanDays = ageFlag !== -1 ? Number(process.argv[ageFlag + 1]) : null;

const env = Object.fromEntries(
  readFileSync("gmail-dashboard/.env.local", "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const password = env.DASHBOARD_LOGIN_SECRET;
if (!password) {
  console.error("DASHBOARD_LOGIN_SECRET not found in gmail-dashboard/.env.local");
  process.exit(1);
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password }),
});
if (!login.ok) {
  console.error(`login failed: ${login.status} ${await login.text()}`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? []).join("; ");

const res = await fetch(`${BASE}/api/settings/cleanup`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    dryRun: !execute,
    ...(execute ? { confirm: "CLEANUP" } : {}),
    ...(olderThanDays ? { olderThanDays } : {}),
  }),
});

const out = await res.json();
if (!res.ok) {
  console.error(`cleanup failed: ${res.status}`, out);
  process.exit(1);
}

if (out.dryRun) {
  console.log(`DRY RUN — nothing deleted.\n`);
  console.log(`would delete: ${out.wouldDelete}`);
  console.log(`kept (have extracted work): ${out.skippedBecauseTheyHaveWork}\n`);
  console.log("by sender domain:");
  for (const [d, n] of Object.entries(out.bySenderDomain).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${d}`);
  }
  console.log(`\nRe-run with --execute to delete.`);
} else {
  console.log(`Deleted ${out.deleted} emails. Kept ${out.kept} that had extracted work.`);
}
