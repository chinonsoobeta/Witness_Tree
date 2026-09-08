// Makes every executable checker file visible: it must be reached by a direct
// CI step or carry a reviewed reason in the closed exclusion register. A file
// omitted from package.json is never absent from this universe, and a package
// alias is not a route: a checker CI never runs still has to say why in
// writing, whether or not someone can invoke it by name.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REGISTER_PATH = "data/ci-check-coverage.json";
export const REGISTER_SCHEMA = "witness-tree/ci-check-coverage/2";
export const CATEGORIES = Object.freeze(new Set([
  "data-root-bound",
  "environment-bound",
  "owner-invoked",
  "suite-covered",
]));

const root = new URL("../", import.meta.url);
const EXPECTED_TOP_LEVEL_KEYS = ["exclusions", "schemaVersion", "status"];
const EXPECTED_ENTRY_KEYS = ["category", "check", "reason"];
const CHECK_PATH = /scripts\/(check-[A-Za-z0-9._-]+)/g;

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

export function readRepositoryJson(relativePath, parse = true) {
  const contents = readFileSync(new URL(relativePath, root), "utf8");
  return parse ? JSON.parse(contents) : contents;
}

export function repositoryCheckFiles() {
  return readdirSync(new URL("scripts/", root), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith("check-"))
    .map((entry) => `scripts/${entry.name}`)
    .sort();
}

function packageCheckCommands(packageDocument) {
  const scripts = packageDocument?.scripts;
  assert.ok(scripts && typeof scripts === "object" && !Array.isArray(scripts), "package scripts are required");
  return Object.entries(scripts)
    .filter(([name]) => name.startsWith("check:"))
    .map(([name, command]) => {
      assert.equal(typeof command, "string", `${name} command must be a string`);
      assert.ok(command.trim().length > 0, `${name} command must not be empty`);
      return [name, command];
    });
}

function referencedCheckFiles(command, availableSet, label) {
  const referenced = [];
  for (const match of String(command).matchAll(CHECK_PATH)) {
    const path = `scripts/${match[1]}`;
    assert.ok(availableSet.has(path), `${label} references a checker file missing from scripts/: ${path}`);
    referenced.push(path);
  }
  return referenced;
}

export function packageCheckFiles(packageDocument, availableFiles) {
  const availableSet = new Set(availableFiles);
  const files = new Set();
  for (const [name, command] of packageCheckCommands(packageDocument)) {
    for (const file of referencedCheckFiles(command, availableSet, name)) files.add(file);
  }
  return [...files].sort();
}

// Count executable workflow steps only. A name in a comment is documentation,
// not execution, and cannot satisfy this gate. A step's run: counts whether or
// not the step carries a name:, which moves the command onto its own line;
// matching only the "- run:" form let a checker run in CI while the register
// went on recording it as unreached.
export function ciPackageChecks(ciText) {
  const names = [];
  for (const line of String(ciText).split("\n")) {
    const match = line.match(/^\s*(?:-\s+)?run:\s+npm run (check:[A-Za-z0-9:_-]+)\s*$/);
    if (match) names.push(match[1]);
  }
  assert.equal(new Set(names).size, names.length, "CI runs the same package check more than once");
  return names.sort();
}

function ciRunCommands(ciText) {
  return String(ciText)
    .split("\n")
    .map((line) => line.match(/^\s*(?:-\s+)?run:\s+(.+)$/)?.[1])
    .filter((command) => command && command !== "|" && command !== ">");
}

export function ciCheckFiles(ciText, packageDocument, availableFiles) {
  const availableSet = new Set(availableFiles);
  const commands = new Map(packageCheckCommands(packageDocument));
  const packageNames = ciPackageChecks(ciText);
  const unknown = packageNames.filter((name) => !commands.has(name));
  assert.deepEqual(unknown, [], `CI names checks missing from package.json: ${unknown.join(", ")}`);

  const files = new Set();
  for (const name of packageNames) {
    for (const file of referencedCheckFiles(commands.get(name), availableSet, name)) files.add(file);
  }
  for (const [index, command] of ciRunCommands(ciText).entries()) {
    for (const file of referencedCheckFiles(command, availableSet, `CI run step ${index}`)) files.add(file);
  }
  return [...files].sort();
}

export function validateCoverage(document, packageDocument, ciText, availableFiles = repositoryCheckFiles()) {
  assert.ok(document && typeof document === "object" && !Array.isArray(document), "coverage register is required");
  exactKeys(document, EXPECTED_TOP_LEVEL_KEYS, "coverage register");
  assert.equal(document.schemaVersion, REGISTER_SCHEMA, "coverage register schema differs");
  assert.equal(document.status, "engineering-derived-inventory", "coverage register status differs");
  assert.ok(Array.isArray(document.exclusions), "coverage register exclusions are required");

  assert.ok(Array.isArray(availableFiles) && availableFiles.length > 0, "checker file inventory is required");
  assert.equal(new Set(availableFiles).size, availableFiles.length, "checker file inventory contains a duplicate");
  assert.deepEqual(availableFiles, [...availableFiles].sort(), "checker file inventory must be sorted");
  for (const file of availableFiles) assert.match(file, /^scripts\/check-[A-Za-z0-9._-]+$/, `invalid checker file path: ${file}`);

  const availableSet = new Set(availableFiles);
  const direct = ciCheckFiles(ciText, packageDocument, availableFiles);
  const directSet = new Set(direct);
  const named = packageCheckFiles(packageDocument, availableFiles).filter((file) => !directSet.has(file));

  const registered = [];
  for (const [index, entry] of document.exclusions.entries()) {
    assert.ok(entry && typeof entry === "object" && !Array.isArray(entry), `exclusion ${index} must be an object`);
    exactKeys(entry, EXPECTED_ENTRY_KEYS, `exclusion ${index}`);
    assert.ok(availableSet.has(entry.check), `${entry.check} is excluded but missing from scripts/`);
    assert.ok(CATEGORIES.has(entry.category), `${entry.check} category must be one of ${[...CATEGORIES].join(", ")}`);
    assert.ok(typeof entry.reason === "string" && entry.reason.trim().length > 0, `${entry.check} reason is required`);
    registered.push(entry.check);
  }
  assert.equal(new Set(registered).size, registered.length, "coverage register contains a duplicate check");
  assert.deepEqual(registered, [...registered].sort(), "coverage register exclusions must be sorted by checker file path");

  const required = availableFiles.filter((file) => !directSet.has(file));
  const registeredSet = new Set(registered);
  const missing = required.filter((file) => !registeredSet.has(file));
  const stale = registered.filter((file) => directSet.has(file));
  assert.deepEqual(missing, [], `missing reviewed exclusions: ${missing.join(", ")}`);
  assert.deepEqual(stale, [], `registered exclusions that are now CI-reached: ${stale.join(", ")}`);

  return { total: availableFiles.length, ci: direct.length, npmNamed: named.length, excluded: registered.length };
}

function main() {
  const result = validateCoverage(
    readRepositoryJson(REGISTER_PATH),
    readRepositoryJson("package.json"),
    readRepositoryJson(".github/workflows/ci.yml", false),
  );
  console.log(`${REGISTER_PATH}: ${result.total} checker files; ${result.ci} CI-reached; ${result.excluded} reviewed exclusions, of which ${result.npmNamed} are invocable by an npm name.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
