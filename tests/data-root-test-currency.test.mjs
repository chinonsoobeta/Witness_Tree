// Proves the currency gate would have caught #84.
//
// These tests run in CI: they read the repository only, never the data root.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { REQUIRES_DATA_ROOT, RECEIPT_PATH, RECEIPT_SCHEMA } from "../scripts/lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, guardedFingerprint } from "../scripts/lib/guarded-paths.mjs";
import { validateDataRootTestCurrency } from "../scripts/check-data-root-test-currency.mjs";

function receiptEntry(name, overrides = {}) {
  const guardedPaths = computeGuardedPaths(name);
  return {
    test: name,
    reason: REQUIRES_DATA_ROOT.get(name),
    status: "passed",
    exitCode: 0,
    durationMs: 1,
    guardedPaths,
    guardedDigests: Object.fromEntries(guardedPaths.map((relative) => [relative, digestOf(relative)])),
    guardedFingerprint: guardedFingerprint(guardedPaths),
    ...overrides,
  };
}

function currentReceipt(mutate = (receipt) => receipt) {
  return mutate({
    schemaVersion: RECEIPT_SCHEMA,
    status: "owner-local-test-run",
    published: false,
    productionEligible: false,
    isEdition: false,
    isSnapshot: false,
    runAt: "2026-08-30T00:00:00Z",
    commit: "0".repeat(40),
    workingTreeClean: true,
    dataRootPresent: true,
    node: process.version,
    counts: { total: REQUIRES_DATA_ROOT.size, passed: REQUIRES_DATA_ROOT.size, failed: 0 },
    results: [...REQUIRES_DATA_ROOT.keys()].sort().map((name) => receiptEntry(name)),
  });
}

test("every data-root-bound test file exists", () => {
  for (const name of REQUIRES_DATA_ROOT.keys()) {
    assert.ok(existsSync(path.join(REPO_ROOT, "tests", name)), `tests/${name} is listed but missing`);
  }
});

test("a synthetic receipt describing this exact tree is accepted", () => {
  assert.deepEqual(validateDataRootTestCurrency({ receipt: currentReceipt() }), []);
});

// The regression this whole mechanism exists for. #84 edited the NTEMS runner and
// the four execution authorizations; every one of those files must sit inside the
// guarded set of the only test that reads them.
test("the NTEMS readback test guards the runner and all four execution authorizations", () => {
  const guarded = computeGuardedPaths("phase1-ntems-readback-bytes.test.mjs");
  const required = [
    "scripts/run-phase1-ntems-transform.mjs",
    "scripts/verify-phase1-ntems-transform.mjs",
    "data/phase1-ntems-annual-land-cover-execution-authorization.json",
    "data/phase1-ntems-canopy-cover-execution-authorization.json",
    "data/phase1-ntems-canopy-height-execution-authorization.json",
    "data/phase1-ntems-forest-harvest-execution-authorization.json",
  ];
  for (const relative of required) assert.ok(guarded.includes(relative), `${relative} is not guarded`);
});

test("guarded paths are sorted, unique, and include the test itself", () => {
  for (const name of REQUIRES_DATA_ROOT.keys()) {
    const guarded = computeGuardedPaths(name);
    assert.deepEqual(guarded, [...new Set(guarded)].sort(), `${name} guarded paths are not sorted and unique`);
    assert.ok(guarded.includes(`tests/${name}`), `${name} does not guard itself`);
  }
});

test("a changed guarded file invalidates the receipt and names the file", () => {
  const target = "scripts/run-phase1-ntems-transform.mjs";
  const failures = validateDataRootTestCurrency({
    receipt: currentReceipt((receipt) => {
      const entry = receipt.results.find((item) => item.test === "phase1-ntems-readback-bytes.test.mjs");
      entry.guardedDigests[target] = "f".repeat(64);
      entry.guardedFingerprint = "f".repeat(64);
      return receipt;
    }),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /phase1-ntems-readback-bytes\.test\.mjs/);
  assert.match(failures[0], new RegExp(`changed: .*${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("a data-root-bound test absent from the receipt fails closed", () => {
  const failures = validateDataRootTestCurrency({
    receipt: currentReceipt((receipt) => {
      receipt.results = receipt.results.filter((item) => item.test !== "wildfire-derived-readback.test.mjs");
      return receipt;
    }),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /wildfire-derived-readback\.test\.mjs is data-root-bound but the receipt does not record a run/);
});

test("a recorded failure is reported as a failure, not as staleness", () => {
  const failures = validateDataRootTestCurrency({
    receipt: currentReceipt((receipt) => {
      const entry = receipt.results.find((item) => item.test === "wildfire-derived-readback.test.mjs");
      entry.status = "failed";
      entry.exitCode = 1;
      return receipt;
    }),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /recorded as failed \(exit 1\)/);
});

test("a receipt written against a dirty tree is refused", () => {
  const failures = validateDataRootTestCurrency({
    receipt: currentReceipt((receipt) => ({ ...receipt, workingTreeClean: false })),
  });
  assert.ok(failures.some((failure) => /dirty working tree/.test(failure)));
});

test("a receipt claiming publication or production eligibility is refused", () => {
  for (const claim of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    const failures = validateDataRootTestCurrency({
      receipt: currentReceipt((receipt) => ({ ...receipt, [claim]: true })),
    });
    assert.ok(failures.some((failure) => failure.includes(claim)), `${claim} was not refused`);
  }
});

test("a receipt naming a test that is no longer data-root-bound is refused", () => {
  const failures = validateDataRootTestCurrency({
    receipt: currentReceipt((receipt) => {
      receipt.results.push({ ...receipt.results[0], test: "retired-elsewhere.test.mjs" });
      return receipt;
    }),
  });
  assert.ok(failures.some((failure) => /retired-elsewhere\.test\.mjs, which is no longer data-root-bound/.test(failure)));
});

test("the committed receipt path is the one the runner writes", () => {
  assert.equal(RECEIPT_PATH, "data/data-root-test-run-receipt.json");
});
