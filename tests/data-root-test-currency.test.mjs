// Proves the currency gate would have caught #84.
//
// These tests run in CI: they read the repository only, never the data root.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { REQUIRES_DATA_ROOT, RECEIPT_PATH, RECEIPT_SCHEMA } from "../scripts/lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, extraGuardedReasons, guardedFingerprint } from "../scripts/lib/guarded-paths.mjs";
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

// The blind spot #84 exploited, generalized. A record the test reads can bind a
// further repository file by { path, sha256 }; nothing imports that file and no
// module names it, so an import-and-literal closure misses it. A scan on
// 2026-08-30 found this shape in 7 of the 25 data-root-bound tests, including
// the NTEMS runner that was previously covered by a hand-written exception.
//
// This asserts the closure is complete: no guarded record may bind a repository
// file that the closure does not already contain. It fails if someone narrows
// the derivation, and it needs no maintenance when records gain new bindings.
test("no data-root-bound test leaves an evidence-bound repository file unguarded", () => {
  const SHA256 = /^[0-9a-f]{64}$/;

  function* bindings(node) {
    if (Array.isArray(node)) {
      for (const value of node) yield* bindings(value);
      return;
    }
    if (!node || typeof node !== "object") return;
    const named = node.path ?? node.file ?? node.relativePath;
    const digest = node.sha256 ?? node.digest ?? node.hash;
    if (typeof named === "string" && typeof digest === "string" && SHA256.test(digest)) yield named;
    for (const value of Object.values(node)) yield* bindings(value);
  }

  const unguarded = [];
  for (const name of REQUIRES_DATA_ROOT.keys()) {
    const guarded = computeGuardedPaths(name);
    const set = new Set(guarded);
    for (const relative of guarded.filter((entry) => entry.startsWith("data/") && entry.endsWith(".json"))) {
      let record;
      try {
        record = JSON.parse(readFileSync(path.join(REPO_ROOT, relative), "utf8"));
      } catch {
        continue;
      }
      for (const named of bindings(record)) {
        const clean = named.replace(/^\.\//, "");
        if (path.isAbsolute(clean) || clean.split("/").includes("..")) continue;
        if (!existsSync(path.join(REPO_ROOT, clean))) continue;
        if (!statSync(path.join(REPO_ROOT, clean)).isFile()) continue;
        if (set.has(clean)) continue;
        unguarded.push(`${name}: ${relative} binds ${clean}, which is not guarded`);
      }
    }
  }

  assert.deepEqual(unguarded, []);
});

// The hand-written exception list is meant to stay empty. An entry is not
// forbidden, but it must name a real file and state why the derivation cannot
// reach it, because a list like this is what falls behind the code it guards.
test("every hand-written guarded-path exception names a real file and states a reason", () => {
  for (const name of REQUIRES_DATA_ROOT.keys()) {
    for (const [relative, reason] of Object.entries(extraGuardedReasons(name))) {
      assert.ok(existsSync(path.join(REPO_ROOT, relative)), `${name} exception names a missing file: ${relative}`);
      assert.ok(typeof reason === "string" && reason.length > 40, `${name} exception for ${relative} has no stated reason`);
    }
  }
});
