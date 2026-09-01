// Runs every test excluded from portable CI and records what it proved.
//
// The 25 data-root-bound files need the owner's SSD, while three safety-runner
// files require macOS semantics. The owner runs this combined suite on the Mac
// with the data root attached. CI consumes only the resulting receipt and fails
// when a guarded repository dependency changes.
//
// The receipt records outcomes. It does not assert them: a failing test is
// written down as failing, because a receipt that only records passes is not
// evidence of anything.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  OWNER_BOUND_TEST_GROUPS,
  RECEIPT_PATH,
  RECEIPT_SCHEMA,
  ownerBoundTestInventory,
} from "./lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, guardedFingerprint } from "./lib/guarded-paths.mjs";
import { resolveDataRoot } from "./data-root.mjs";

function git(...args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr?.trim()}`);
  return result.stdout.trim();
}

function runOne(name, metadata) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ["--test", path.join("tests", name)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return {
    test: name,
    requirement: metadata.requirement,
    reason: metadata.reason,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? null,
    durationMs: Date.now() - started,
  };
}

function countsFor(results) {
  const byRequirement = Object.fromEntries(
    OWNER_BOUND_TEST_GROUPS.map(({ requirement }) => [requirement, { total: 0, passed: 0, failed: 0 }]),
  );
  for (const entry of results) {
    const group = byRequirement[entry.requirement];
    group.total += 1;
    group[entry.status] += 1;
  }
  const failed = results.filter((entry) => entry.status === "failed").length;
  return {
    total: results.length,
    passed: results.length - failed,
    failed,
    byRequirement,
  };
}

function main() {
  if (process.platform !== "darwin") {
    console.error("This owner-bound suite must run on macOS because three excluded tests exercise macOS-only safety runners.");
    process.exit(1);
  }

  const dataRoot = resolveDataRoot();
  const inventory = ownerBoundTestInventory();
  console.log(`Running ${inventory.size} owner-bound test files against ${dataRoot} on macOS.`);

  const results = [];
  for (const [name, metadata] of inventory) {
    console.log(`\n--- ${name}`);
    const outcome = runOne(name, metadata);
    const guardedPaths = computeGuardedPaths(name);
    results.push({
      ...outcome,
      guardedPaths,
      guardedDigests: Object.fromEntries(guardedPaths.map((relative) => [relative, digestOf(relative)])),
      guardedFingerprint: guardedFingerprint(guardedPaths),
    });
  }

  const counts = countsFor(results);
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    // This states what ran on the owner's machine at one commit. It is not an
    // admission, a release, or a production-eligibility record.
    status: "owner-local-test-run",
    published: false,
    productionEligible: false,
    isEdition: false,
    isSnapshot: false,
    runAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    commit: git("rev-parse", "HEAD"),
    workingTreeClean: git("status", "--porcelain").length === 0,
    platform: process.platform,
    dataRootPresent: true,
    node: process.version,
    counts,
    results,
  };

  writeFileSync(path.join(REPO_ROOT, RECEIPT_PATH), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\nWrote ${RECEIPT_PATH}: ${counts.passed} passed, ${counts.failed} failed.`);
  if (!receipt.workingTreeClean) {
    console.log("Working tree was dirty at run time; the receipt records that, and the currency gate will reject it.");
  }
  process.exit(counts.failed === 0 && receipt.workingTreeClean ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
