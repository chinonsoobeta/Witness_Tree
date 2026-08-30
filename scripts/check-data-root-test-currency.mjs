// Fails when a data-root-bound test has been invalidated and not re-run.
//
// This is the half of the pair that CI can execute. It never touches the owner's
// SSD: it reads data/data-root-test-run-receipt.json, recomputes each test's
// guarded file set from the working tree, and compares fingerprints. If a pull
// request edits a file one of those tests depends on, the fingerprint moves, the
// receipt no longer describes the tree, and this fails.
//
// That is precisely the signal #84 did not produce. It changed the NTEMS runner
// and rewrote four owner-bound execution authorizations, every one of them inside
// the guarded set of phase1-ntems-readback-bytes.test.mjs, and merged green
// because that test needs the SSD and so ran nowhere.
//
// Clearing a failure means re-running the suite on the machine that has the data
// (`npm run test:data-root`), not editing the receipt. A receipt written by hand
// asserts an event that did not happen.
import { readFileSync } from "node:fs";
import path from "node:path";

import { REQUIRES_DATA_ROOT, RECEIPT_PATH, RECEIPT_SCHEMA } from "./lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, guardedFingerprint } from "./lib/guarded-paths.mjs";

// `receipt` is injectable so the tests can exercise every rejection path without
// writing over the real receipt, which records a run that actually happened.
export function validateDataRootTestCurrency({ receipt: supplied } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);

  let receipt = supplied;
  if (receipt === undefined) {
    try {
      receipt = JSON.parse(readFileSync(path.join(REPO_ROOT, RECEIPT_PATH), "utf8"));
    } catch (error) {
      return [`${RECEIPT_PATH} is missing or unreadable: ${error.message}. Run \`npm run test:data-root\` on the machine holding the data root.`];
    }
  }

  if (receipt.schemaVersion !== RECEIPT_SCHEMA) add(`receipt schemaVersion is ${receipt.schemaVersion}, expected ${RECEIPT_SCHEMA}.`);
  if (receipt.status !== "owner-local-test-run") add(`receipt status is ${receipt.status}, expected owner-local-test-run.`);
  for (const claim of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    if (receipt[claim] !== false) add(`receipt claims ${claim} is not false; a local test run publishes and admits nothing.`);
  }
  if (receipt.workingTreeClean !== true) add("receipt records a dirty working tree, so it does not describe any commit.");
  if (typeof receipt.commit !== "string" || !/^[0-9a-f]{40}$/.test(receipt.commit)) add("receipt does not record a full commit SHA-1.");
  if (!Array.isArray(receipt.results)) return [...failures, "receipt has no results array."];

  const byTest = new Map(receipt.results.map((entry) => [entry.test, entry]));
  const expected = [...REQUIRES_DATA_ROOT.keys()].sort();

  for (const stale of [...byTest.keys()].filter((name) => !REQUIRES_DATA_ROOT.has(name))) {
    add(`receipt records ${stale}, which is no longer data-root-bound. Re-run the suite so the receipt matches the exclusion list.`);
  }

  for (const name of expected) {
    const entry = byTest.get(name);
    if (!entry) {
      add(`${name} is data-root-bound but the receipt does not record a run of it. Run \`npm run test:data-root\`.`);
      continue;
    }
    if (entry.status !== "passed") {
      add(`${name} is recorded as ${entry.status} (exit ${entry.exitCode}). A recorded failure is a real failure, not a stale receipt.`);
    }

    let guardedPaths;
    try {
      guardedPaths = computeGuardedPaths(name);
    } catch (error) {
      add(`${name}: ${error.message}`);
      continue;
    }

    const current = guardedFingerprint(guardedPaths);
    if (current === entry.guardedFingerprint) continue;

    const recorded = entry.guardedDigests ?? {};
    const changed = guardedPaths.filter((relative) => recorded[relative] !== undefined && recorded[relative] !== digestOf(relative));
    const added = guardedPaths.filter((relative) => recorded[relative] === undefined);
    const removed = Object.keys(recorded).filter((relative) => !guardedPaths.includes(relative));
    const detail = [
      changed.length > 0 ? `changed: ${changed.join(", ")}` : null,
      added.length > 0 ? `newly guarded: ${added.join(", ")}` : null,
      removed.length > 0 ? `no longer guarded: ${removed.join(", ")}` : null,
    ].filter(Boolean).join("; ");
    add(`${name} last ran at ${receipt.commit.slice(0, 7)} against a different tree (${detail || "fingerprint differs"}). Re-run \`npm run test:data-root\` on the machine holding the data root.`);
  }

  return failures;
}

function main() {
  const failures = validateDataRootTestCurrency();
  if (failures.length > 0) {
    console.error("Data-root-bound tests are not current:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`All ${REQUIRES_DATA_ROOT.size} data-root-bound tests are recorded as passing against the current tree.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
