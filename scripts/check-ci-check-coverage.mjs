// Makes every package-level check visible: it must either be a direct CI step
// or carry a reviewed reason in the closed exclusion register. An absent CI
// line is never treated as evidence that a check passed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REGISTER_PATH = "data/ci-check-coverage.json";
export const REGISTER_SCHEMA = "witness-tree/ci-check-coverage/1";
export const CATEGORIES = Object.freeze(new Set([
  "data-root-bound",
  "environment-bound",
  "owner-invoked",
  "suite-covered",
]));

const root = new URL("../", import.meta.url);
const EXPECTED_TOP_LEVEL_KEYS = ["exclusions", "schemaVersion", "status"];
const EXPECTED_ENTRY_KEYS = ["category", "check", "reason"];

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

export function readRepositoryJson(relativePath, parse = true) {
  const contents = readFileSync(new URL(relativePath, root), "utf8");
  return parse ? JSON.parse(contents) : contents;
}

export function packageChecks(packageDocument) {
  const scripts = packageDocument?.scripts;
  assert.ok(scripts && typeof scripts === "object" && !Array.isArray(scripts), "package scripts are required");
  const checks = Object.entries(scripts)
    .filter(([name]) => name.startsWith("check:"))
    .map(([name, command]) => {
      assert.equal(typeof command, "string", `${name} command must be a string`);
      assert.ok(command.trim().length > 0, `${name} command must not be empty`);
      return name;
    });
  assert.equal(new Set(checks).size, checks.length, "package check names contain a duplicate");
  return checks.sort();
}

// Count executable workflow steps only. A name in a comment is documentation,
// not execution, and cannot satisfy this gate.
export function ciChecks(ciText) {
  const names = [];
  for (const line of String(ciText).split("\n")) {
    const match = line.match(/^\s*-\s+run:\s+npm run (check:[A-Za-z0-9:_-]+)\s*$/);
    if (match) names.push(match[1]);
  }
  assert.equal(new Set(names).size, names.length, "CI runs the same package check more than once");
  return names.sort();
}

export function validateCoverage(document, packageDocument, ciText) {
  assert.ok(document && typeof document === "object" && !Array.isArray(document), "coverage register is required");
  exactKeys(document, EXPECTED_TOP_LEVEL_KEYS, "coverage register");
  assert.equal(document.schemaVersion, REGISTER_SCHEMA, "coverage register schema differs");
  assert.equal(document.status, "engineering-derived-inventory", "coverage register status differs");
  assert.ok(Array.isArray(document.exclusions), "coverage register exclusions are required");

  const available = packageChecks(packageDocument);
  const availableSet = new Set(available);
  const wired = ciChecks(ciText);
  const wiredSet = new Set(wired);
  const unknownWired = wired.filter((name) => !availableSet.has(name));
  assert.deepEqual(unknownWired, [], `CI names checks missing from package.json: ${unknownWired.join(", ")}`);

  const registered = [];
  for (const [index, entry] of document.exclusions.entries()) {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry), `exclusion ${index} must be an object`);
    exactKeys(entry, EXPECTED_ENTRY_KEYS, `exclusion ${index}`);
    assert.ok(availableSet.has(entry.check), `${entry.check} is excluded but missing from package.json`);
    assert.ok(CATEGORIES.has(entry.category), `${entry.check} category must be one of ${[...CATEGORIES].join(", ")}`);
    assert.ok(typeof entry.reason === "string" && entry.reason.trim().length > 0, `${entry.check} reason is required`);
    registered.push(entry.check);
  }
  assert.equal(new Set(registered).size, registered.length, "coverage register contains a duplicate check");
  assert.deepEqual(registered, [...registered].sort(), "coverage register exclusions must be sorted by check name");

  const required = available.filter((name) => !wiredSet.has(name));
  const registeredSet = new Set(registered);
  const missing = required.filter((name) => !registeredSet.has(name));
  const stale = registered.filter((name) => wiredSet.has(name));
  assert.deepEqual(missing, [], `missing reviewed exclusions: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `registered exclusions that now run in CI: ${stale.join(", ")}`);

  return { total: available.length, ci: wired.length, excluded: registered.length };
}

function main() {
  const result = validateCoverage(
    readRepositoryJson(REGISTER_PATH),
    readRepositoryJson("package.json"),
    readRepositoryJson(".github/workflows/ci.yml", false),
  );
  console.log(`${REGISTER_PATH}: ${result.total} package checks; ${result.ci} direct CI steps; ${result.excluded} reviewed exclusions.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
