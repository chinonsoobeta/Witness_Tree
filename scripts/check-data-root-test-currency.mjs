// Fails when an owner-bound test has been invalidated and not re-run.
//
// This is the half of the pair that CI can execute. It never touches the owner's
// SSD or AWS account: it reads data/data-root-test-run-receipt.json, recomputes
// each excluded test's guarded file set from the working tree, and compares
// fingerprints. A pull request that edits a dependency makes the receipt stale.
//
// Clearing a failure means re-running the suite on the owner's Mac, with the data
// root attached (`npm run test:data-root`), not editing the receipt. A receipt
// written by hand asserts an event that did not happen.
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  OWNER_BOUND_TEST_GROUPS,
  RECEIPT_PATH,
  RECEIPT_SCHEMA,
  ownerBoundTestInventory,
} from "./lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, guardedFingerprint } from "./lib/guarded-paths.mjs";

const RERUN = "Run `npm run test:data-root` on the owner's Mac with the data root attached.";

function countsFor(results) {
  const byRequirement = Object.fromEntries(
    OWNER_BOUND_TEST_GROUPS.map(({ requirement }) => [requirement, { total: 0, passed: 0, failed: 0 }]),
  );
  let passed = 0;
  let failed = 0;
  for (const entry of results) {
    if (entry?.status === "passed") passed += 1;
    if (entry?.status === "failed") failed += 1;
    const group = byRequirement[entry?.requirement];
    if (!group) continue;
    group.total += 1;
    if (entry.status === "passed") group.passed += 1;
    if (entry.status === "failed") group.failed += 1;
  }
  return { total: results.length, passed, failed, byRequirement };
}

function validateCounts(actual, expected, add) {
  if (!actual || typeof actual !== "object") {
    add("receipt has no counts object.");
    return;
  }
  for (const field of ["total", "passed", "failed"]) {
    if (actual[field] !== expected[field]) add(`receipt counts.${field} is ${actual[field]}, expected ${expected[field]}.`);
  }
  if (!actual.byRequirement || typeof actual.byRequirement !== "object") {
    add("receipt counts has no byRequirement object.");
    return;
  }
  for (const { requirement } of OWNER_BOUND_TEST_GROUPS) {
    const actualGroup = actual.byRequirement[requirement];
    if (!actualGroup || typeof actualGroup !== "object") {
      add(`receipt counts.byRequirement has no ${requirement} object.`);
      continue;
    }
    for (const field of ["total", "passed", "failed"]) {
      if (actualGroup[field] !== expected.byRequirement[requirement][field]) {
        add(`receipt counts.byRequirement.${requirement}.${field} is ${actualGroup[field]}, expected ${expected.byRequirement[requirement][field]}.`);
      }
    }
  }
}

// `receipt` is injectable so tests can exercise every rejection path without
// writing over the canonical receipt, which records a run that actually happened.
export function validateDataRootTestCurrency({ receipt: supplied } = {}) {
  const failures = [];
  const add = (message) => failures.push(message);
  const inventory = ownerBoundTestInventory();

  let receipt = supplied;
  if (receipt === undefined) {
    try {
      receipt = JSON.parse(readFileSync(path.join(REPO_ROOT, RECEIPT_PATH), "utf8"));
    } catch (error) {
      return [`${RECEIPT_PATH} is missing or unreadable: ${error.message}. ${RERUN}`];
    }
  }

  if (!receipt || typeof receipt !== "object") return [`receipt is not an object. ${RERUN}`];
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) add(`receipt schemaVersion is ${receipt.schemaVersion}, expected ${RECEIPT_SCHEMA}.`);
  if (receipt.status !== "owner-local-test-run") add(`receipt status is ${receipt.status}, expected owner-local-test-run.`);
  for (const claim of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    if (receipt[claim] !== false) add(`receipt claims ${claim} is not false; a local test run publishes and admits nothing.`);
  }
  if (receipt.workingTreeClean !== true) add("receipt records a dirty working tree, so it does not describe any commit.");
  if (typeof receipt.commit !== "string" || !/^[0-9a-f]{40}$/.test(receipt.commit)) add("receipt does not record a full commit SHA-1.");
  if (receipt.platform !== "darwin") add(`receipt platform is ${receipt.platform}, expected darwin for the macOS-bound tests.`);
  if (receipt.dataRootPresent !== true) add("receipt does not record that the owner data root was present.");
  if (!Array.isArray(receipt.results)) return [...failures, "receipt has no results array."];

  validateCounts(receipt.counts, countsFor(receipt.results), add);

  const byTest = new Map();
  for (const entry of receipt.results) {
    if (!entry || typeof entry.test !== "string") {
      add("receipt contains a result without a test name.");
      continue;
    }
    if (byTest.has(entry.test)) {
      add(`receipt records ${entry.test} more than once.`);
      continue;
    }
    byTest.set(entry.test, entry);
  }

  for (const stale of [...byTest.keys()].filter((name) => !inventory.has(name))) {
    add(`receipt records ${stale}, which is no longer owner-bound. Re-run the suite so the receipt matches the exclusion inventory.`);
  }

  for (const [name, metadata] of inventory) {
    const entry = byTest.get(name);
    if (!entry) {
      add(`${name} is owner-bound (${metadata.requirement}) but the receipt does not record a run of it. ${RERUN}`);
      continue;
    }
    if (entry.requirement !== metadata.requirement) {
      add(`${name} records requirement ${entry.requirement}, expected ${metadata.requirement}.`);
    }
    if (entry.reason !== metadata.reason) {
      add(`${name} records a reason that does not match the exclusion inventory.`);
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

    const recordedPaths = Array.isArray(entry.guardedPaths) ? entry.guardedPaths : [];
    const recorded = entry.guardedDigests && typeof entry.guardedDigests === "object" ? entry.guardedDigests : {};
    const changed = guardedPaths.filter((relative) => recorded[relative] !== undefined && recorded[relative] !== digestOf(relative));
    const added = guardedPaths.filter((relative) => recorded[relative] === undefined);
    const removed = Object.keys(recorded).filter((relative) => !guardedPaths.includes(relative));
    const pathListDiffers = JSON.stringify(recordedPaths) !== JSON.stringify(guardedPaths);
    const fingerprintDiffers = entry.guardedFingerprint !== guardedFingerprint(guardedPaths);
    if (!pathListDiffers && !fingerprintDiffers && changed.length === 0 && added.length === 0 && removed.length === 0) continue;

    const detail = [
      changed.length > 0 ? `changed: ${changed.join(", ")}` : null,
      added.length > 0 ? `newly guarded: ${added.join(", ")}` : null,
      removed.length > 0 ? `no longer guarded: ${removed.join(", ")}` : null,
      pathListDiffers && changed.length === 0 && added.length === 0 && removed.length === 0 ? "guarded path list differs" : null,
    ].filter(Boolean).join("; ");
    const commit = typeof receipt.commit === "string" ? receipt.commit.slice(0, 7) : "unknown commit";
    add(`${name} last ran at ${commit} against a different tree (${detail || "fingerprint differs"}). ${RERUN}`);
  }

  return failures;
}

function main() {
  const failures = validateDataRootTestCurrency();
  if (failures.length > 0) {
    console.error("Owner-bound tests are not current:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`All ${ownerBoundTestInventory().size} owner-bound tests are recorded as passing against the current tree.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
