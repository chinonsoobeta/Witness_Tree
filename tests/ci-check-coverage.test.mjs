import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  CATEGORIES,
  REGISTER_PATH,
  packageCheckFiles,
  readRepositoryJson,
  repositoryCheckFiles,
  validateCoverage,
} from "../scripts/check-ci-check-coverage.mjs";
import { REQUIRES_DATA_ROOT, REQUIRES_MACOS_RUNNER } from "../scripts/lib/data-root-bound-tests.mjs";

const register = readRepositoryJson(REGISTER_PATH);
const packageDocument = readRepositoryJson("package.json");
const ci = readRepositoryJson(".github/workflows/ci.yml", false);
const wildfire = readRepositoryJson(".github/workflows/wildfire-refresh.yml", false);
const workflowNames = readdirSync(new URL("../.github/workflows/", import.meta.url))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();
const workflows = workflowNames.map((name) => [name, readRepositoryJson(`.github/workflows/${name}`, false)]);
const checkerFiles = repositoryCheckFiles();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withChecker(name) {
  return [...checkerFiles, `scripts/${name}`].sort();
}

function namedTest(entry) {
  return /tests\/([A-Za-z0-9._-]+\.test\.(?:mjs|ts|tsx))/.exec(entry.reason)?.[1];
}

test("every on-disk checker is CI-reached or a reviewed exclusion", () => {
  const result = validateCoverage(register, packageDocument, ci, checkerFiles);
  assert.deepEqual(result, { total: 210, ci: 106, npmNamed: 82, excluded: 104 });
  // An npm alias is a way to invoke a checker, not a reason CI skips it. Every one of
  // the 81 npm-named checkers still carries its own written exclusion.
  assert.equal(result.total, result.ci + result.excluded);
  assert.ok(result.npmNamed <= result.excluded);
  assert.ok(checkerFiles.includes("scripts/check-phase2-independent-comparison-evidence.mts"));
  assert.ok(checkerFiles.includes("scripts/check-phase2-method-parameters.mts"));
});

test("workflows use current action runtimes and preserve their concurrency policy", () => {
  assert.ok(ci.includes("concurrency:\n  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n  cancel-in-progress: true"));
  // A push to a pull request branch and the pull request itself carry different refs for the
  // same commit, so a concurrency group alone never collapsed them. The push trigger is
  // restricted to main so a pull request is verified exactly once.
  assert.ok(ci.includes("on:\n  push:\n    branches: [main]\n  pull_request:\n"));
  assert.ok(wildfire.includes("concurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: false"));
  assert.match(ci, /actions\/checkout@v7/);
  assert.match(ci, /actions\/setup-node@v7/);
  assert.match(ci, /actions\/upload-artifact@v7/);
  assert.match(ci, /if-no-files-found: error/);
  assert.match(wildfire, /actions\/checkout@v7/);
  assert.match(wildfire, /actions\/setup-node@v7/);
  // Every workflow on disk, not just the two named above: a third file added later
  // would otherwise ship a stale runtime and an uncapped schedule unnoticed.
  assert.ok(workflows.length >= 3);
  for (const [name, source] of workflows) {
    assert.doesNotMatch(source, /actions\/[A-Za-z0-9-]+@v[1-6]\b/, `${name} pins a superseded action major`);
    assert.match(source, /\nconcurrency:\n {2}group: /, `${name} declares no concurrency group`);
    assert.match(source, /^ +timeout-minutes: \d+$/m, `${name} declares no job timeout`);
  }
});

test("the dependency advisory gate blocks what ships and never hides the rest", () => {
  // The production tree is the blocking surface: an advisory reaching a shipped
  // dependency fails the branch at high. The build toolchain is audited too, but at
  // critical, because its advisories cannot reach a viewer of the site. The third
  // command is informational and must stay non-blocking so nothing is suppressed.
  assert.match(ci, /npm audit --omit=dev --audit-level=high/);
  assert.match(ci, /npm audit --audit-level=critical/);
  assert.match(ci, /npm audit \|\| true/);
  // The scoped gate is not a lowered threshold: production stays at high.
  assert.doesNotMatch(ci, /npm audit --omit=dev --audit-level=(critical|moderate|low|none)/);
});

test("a new on-disk checker that has no route fails closed", () => {
  assert.throws(
    () => validateCoverage(register, packageDocument, ci, withChecker("check-unreviewed.mjs")),
    /missing reviewed exclusions.*scripts\/check-unreviewed\.mjs/,
  );
});

test("only a direct CI step routes a new on-disk checker; an npm name does not", () => {
  const available = withChecker("check-routed.mjs");
  assert.doesNotThrow(() => validateCoverage(register, packageDocument, `${ci}\n      - run: node scripts/check-routed.mjs\n`, available));
  const named = clone(packageDocument);
  named.scripts["check:routed"] = "node scripts/check-routed.mjs";
  assert.throws(
    () => validateCoverage(register, named, ci, available),
    /missing reviewed exclusions.*scripts\/check-routed\.mjs/,
  );
});

test("a stale exclusion fails once its checker is wired into CI", () => {
  const path = register.exclusions[0].check;
  assert.throws(
    () => validateCoverage(register, packageDocument, `${ci}\n      - run: node ${path}\n`, checkerFiles),
    /registered exclusions that are now CI-reached/,
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
    assert.equal(REQUIRES_MACOS_RUNNER.has(testName), false, `${testName} is macOS-bound`);
    assert.match(readFileSync(new URL(`../tests/${testName}`, import.meta.url), "utf8"), new RegExp(entry.check.split("/").at(-1).replaceAll(".", "\\.")));
  }
});

// A reason that cites a test file is making a checkable claim about where that test can
// run. Reasons that cite a data root or an owner command instead are not weaker, they are
// about a different thing, so the assertion applies to the citation rather than demanding
// one. A cited test in the wrong exclusion set is the mislabeling this catches.
test("a cited test in an environment or data-root exclusion sits in the matching set", () => {
  for (const entry of register.exclusions.filter(({ category }) => category === "data-root-bound")) {
    const testName = namedTest(entry);
    if (testName) assert.equal(REQUIRES_DATA_ROOT.has(testName), true, `${entry.check} cites ${testName}, which is not data-root-bound`);
  }
  for (const entry of register.exclusions.filter(({ category }) => category === "environment-bound")) {
    const testName = namedTest(entry);
    if (testName) assert.equal(REQUIRES_MACOS_RUNNER.has(testName), true, `${entry.check} cites ${testName}, which is not macOS-bound`);
  }
});

test("the Postgres harness is reachable by name and still honestly excluded", () => {
  assert.equal(packageDocument.scripts["check:postgres-tenant-isolation"], "node scripts/check-postgres-tenant-isolation.mjs");
  assert.ok(packageCheckFiles(packageDocument, checkerFiles).includes("scripts/check-postgres-tenant-isolation.mjs"));
  const entry = register.exclusions.find(({ check }) => check === "scripts/check-postgres-tenant-isolation.mjs");
  assert.equal(entry?.category, "environment-bound");
  assert.match(entry?.reason ?? "", /Postgres/);
});
