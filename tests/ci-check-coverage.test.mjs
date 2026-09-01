import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CATEGORIES,
  REGISTER_PATH,
  packageCheckFiles,
  readRepositoryJson,
  repositoryCheckFiles,
  validateCoverage,
} from "../scripts/check-ci-check-coverage.mjs";
import { REQUIRES_DATA_ROOT } from "../scripts/lib/data-root-bound-tests.mjs";

const register = readRepositoryJson(REGISTER_PATH);
const packageDocument = readRepositoryJson("package.json");
const ci = readRepositoryJson(".github/workflows/ci.yml", false);
const checkerFiles = repositoryCheckFiles();
const runCiTests = readRepositoryJson("scripts/run-ci-tests.mjs", false);
const macosExcluded = new Set([...runCiTests.matchAll(/^\s*\["([^"]+\.test\.(?:mjs|ts|tsx))",/gm)].map((match) => match[1]));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withChecker(name) {
  return [...checkerFiles, `scripts/${name}`].sort();
}

function namedTest(entry) {
  return /tests\/([A-Za-z0-9._-]+\.test\.(?:mjs|ts|tsx))/.exec(entry.reason)?.[1];
}

test("every on-disk checker is CI-reached, npm-named, or a reviewed exclusion", () => {
  const result = validateCoverage(register, packageDocument, ci, checkerFiles);
  assert.deepEqual(result, { total: 201, ci: 97, npmNamed: 82, excluded: 22 });
  assert.equal(result.total, result.ci + result.npmNamed + result.excluded);
  assert.ok(checkerFiles.includes("scripts/check-phase2-independent-comparison-evidence.mts"));
  assert.ok(checkerFiles.includes("scripts/check-phase2-method-parameters.mts"));
});

test("a new on-disk checker that has no route fails closed", () => {
  assert.throws(
    () => validateCoverage(register, packageDocument, ci, withChecker("check-unreviewed.mjs")),
    /missing reviewed exclusions.*scripts\/check-unreviewed\.mjs/,
  );
});

test("an npm name or direct CI step can route a new on-disk checker", () => {
  const available = withChecker("check-routed.mjs");
  const named = clone(packageDocument);
  named.scripts["check:routed"] = "node scripts/check-routed.mjs";
  assert.doesNotThrow(() => validateCoverage(register, named, ci, available));
  assert.doesNotThrow(() => validateCoverage(register, packageDocument, `${ci}\n      - run: node scripts/check-routed.mjs\n`, available));
});

test("a stale exclusion fails after its checker gains an npm route", () => {
  const changed = clone(packageDocument);
  const path = register.exclusions[0].check;
  changed.scripts["check:new-route"] = `node ${path}`;
  assert.throws(
    () => validateCoverage(register, changed, ci, checkerFiles),
    /registered exclusions that are now CI-reached or npm-named/,
  );
});

test("the exclusion category set is closed", () => {
  const changed = clone(register);
  changed.exclusions[0].category = "convenient-to-skip";
  assert.throws(() => validateCoverage(changed, packageDocument, ci, checkerFiles), /category must be one of/);
  assert.deepEqual([...CATEGORIES].sort(), ["data-root-bound", "environment-bound", "owner-invoked", "suite-covered"]);
});

test("every exclusion carries a specific non-empty reason", () => {
  const changed = clone(register);
  changed.exclusions[0].reason = "  ";
  assert.throws(() => validateCoverage(changed, packageDocument, ci, checkerFiles), /reason is required/);
});

test("CI cannot name a package check that package.json does not expose", () => {
  assert.throws(
    () => validateCoverage(register, packageDocument, `${ci}\n      - run: npm run check:missing-from-package\n`, checkerFiles),
    /CI names checks missing from package.json.*check:missing-from-package/,
  );
});

test("suite-covered exclusions name a portable test that imports the checker", () => {
  for (const entry of register.exclusions.filter(({ category }) => category === "suite-covered")) {
    const testName = namedTest(entry);
    assert.ok(testName, `${entry.check} must name its suite test`);
    assert.equal(REQUIRES_DATA_ROOT.has(testName), false, `${testName} is data-root-bound`);
    assert.equal(macosExcluded.has(testName), false, `${testName} is macOS-bound`);
    assert.match(readFileSync(new URL(`../tests/${testName}`, import.meta.url), "utf8"), new RegExp(entry.check.split("/").at(-1).replaceAll(".", "\\.")));
  }
});

test("environment and data-root exclusions name tests in the matching exclusion set", () => {
  for (const entry of register.exclusions.filter(({ category }) => category === "data-root-bound")) {
    const testName = namedTest(entry);
    assert.equal(REQUIRES_DATA_ROOT.has(testName), true, `${entry.check} must name its data-root-bound test`);
  }
  for (const entry of register.exclusions.filter(({ category }) => category === "environment-bound")) {
    const testName = namedTest(entry);
    assert.equal(macosExcluded.has(testName), true, `${entry.check} must name its macOS-bound test`);
  }
});

test("the Postgres checker remains reachable through its npm name", () => {
  assert.equal(packageDocument.scripts["check:postgres-tenant-isolation"], "node scripts/check-postgres-tenant-isolation.mjs");
  assert.ok(packageCheckFiles(packageDocument, checkerFiles).includes("scripts/check-postgres-tenant-isolation.mjs"));
  assert.equal(register.exclusions.some(({ check }) => check === "scripts/check-postgres-tenant-isolation.mjs"), false);
});
