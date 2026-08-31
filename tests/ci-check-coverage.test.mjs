import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORIES,
  REGISTER_PATH,
  readRepositoryJson,
  validateCoverage,
} from "../scripts/check-ci-check-coverage.mjs";

const register = readRepositoryJson(REGISTER_PATH);
const packageDocument = readRepositoryJson("package.json");
const ci = readRepositoryJson(".github/workflows/ci.yml", false);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("every package check is either a direct CI step or a reviewed exclusion", () => {
  const result = validateCoverage(register, packageDocument, ci);
  assert.equal(result.total, result.ci + result.excluded);
  assert.ok(result.ci > 0);
  assert.ok(result.excluded > 0);
});

test("a new unwired and undeclared check fails closed", () => {
  const changed = clone(packageDocument);
  changed.scripts["check:unreviewed"] = "node scripts/check-unreviewed.mjs";
  assert.throws(() => validateCoverage(register, changed, ci), /missing reviewed exclusions.*check:unreviewed/);
});

test("a stale exclusion fails after its check is wired into CI", () => {
  const named = register.exclusions[0].check;
  assert.throws(
    () => validateCoverage(register, packageDocument, `${ci}\n      - run: npm run ${named}\n`),
    /registered exclusions that now run in CI/,
  );
});

test("the exclusion category set is closed", () => {
  const changed = clone(register);
  changed.exclusions[0].category = "convenient-to-skip";
  assert.throws(() => validateCoverage(changed, packageDocument, ci), /category must be one of/);
  assert.deepEqual([...CATEGORIES].sort(), ["data-root-bound", "environment-bound", "owner-invoked", "suite-covered"]);
});

test("every exclusion carries a specific non-empty reason", () => {
  const changed = clone(register);
  changed.exclusions[0].reason = "  ";
  assert.throws(() => validateCoverage(changed, packageDocument, ci), /reason is required/);
});

test("CI cannot name a check that package.json no longer exposes", () => {
  assert.throws(
    () => validateCoverage(register, packageDocument, `${ci}\n      - run: npm run check:missing-from-package\n`),
    /CI names checks missing from package.json.*check:missing-from-package/,
  );
});

test("the previously orphaned Postgres harness is reachable and honestly excluded", () => {
  assert.equal(packageDocument.scripts["check:postgres-tenant-isolation"], "node scripts/check-postgres-tenant-isolation.mjs");
  const entry = register.exclusions.find(({ check }) => check === "check:postgres-tenant-isolation");
  assert.equal(entry?.category, "environment-bound");
  assert.match(entry?.reason ?? "", /Postgres/);
});
