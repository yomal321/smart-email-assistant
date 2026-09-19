// CI guard for supabase/migrations.
//
// Two failure modes this catches before a PR merges:
//   1. Badly named or duplicated migrations — `supabase db push` applies files
//      in lexicographic order, so a missing zero-pad or a reused number makes
//      the order on a fresh database differ from the order already applied to
//      production.
//   2. Editing a migration that has already been merged to main. Supabase
//      records applied migrations by version; an edited file is never re-run,
//      so the change silently exists in dev and nowhere else.
//
// Usage: node scripts/ci/check-migrations.mjs [baseRef]
//        baseRef (optional) — when set, files changed against it are checked
//        for rule 2. Omitted on pushes to main, where there is no base.

import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MIGRATIONS_DIR = "supabase/migrations";
const NAME_PATTERN = /^(\d{4,})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

const errors = [];
const files = readdirSync(MIGRATIONS_DIR).sort();

if (files.length === 0) {
  errors.push(`${MIGRATIONS_DIR}/ is empty — expected at least one migration.`);
}

const versions = new Map();

for (const file of files) {
  const match = NAME_PATTERN.exec(file);
  if (!match) {
    errors.push(
      `${file}: name must be <zero-padded number>_<snake_case_description>.sql, e.g. 0013_add_labels.sql`,
    );
    continue;
  }

  const version = match[1];
  if (versions.has(version)) {
    errors.push(`${file}: version ${version} is already used by ${versions.get(version)}`);
    continue;
  }
  versions.set(version, file);
}

// Gaps are not fatal (a migration can be dropped before merge) but they hide
// a rebase that lost a file, so they are worth surfacing as a warning.
const ordered = [...versions.keys()].map(Number).sort((a, b) => a - b);
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i] !== ordered[i - 1] + 1) {
    console.warn(`::warning::migration numbering jumps from ${ordered[i - 1]} to ${ordered[i]}`);
  }
}

const baseRef = process.argv[2];
if (baseRef) {
  const diff = execFileSync(
    "git",
    ["diff", "--name-status", "--diff-filter=MDR", `${baseRef}...HEAD`, "--", MIGRATIONS_DIR],
    { encoding: "utf8" },
  ).trim();

  for (const line of diff ? diff.split("\n") : []) {
    const [status, path] = line.split("\t");
    const verb = status.startsWith("M") ? "modified" : status.startsWith("D") ? "deleted" : "renamed";
    errors.push(
      `${path}: ${verb}, but it is already merged. Applied migrations are never re-run — ` +
        `add a new migration that makes the change instead.`,
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  console.error(`\n${errors.length} migration problem(s) found.`);
  process.exit(1);
}

console.log(`${versions.size} migration(s) checked — naming, ordering and immutability OK.`);
