// Runs the tests CI cannot run, and records what they proved and against what.
//
// These 25 files need the owner's SSD. CI cannot mount it, so before this script
// existed they simply never ran anywhere and nothing noticed when a change made
// them stale. The receipt this writes is the bridge: the owner runs the suite on
// the machine that has the data, and scripts/check-data-root-test-currency.mjs
// then runs in CI against the receipt alone, failing whenever a pull request
// touches a file one of these tests depends on.
//
// The receipt records outcomes. It does not assert them: a failing test is
// written down as failing, because a receipt that only ever records passes is
// not evidence of anything.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { REQUIRES_DATA_ROOT, RECEIPT_PATH, RECEIPT_SCHEMA } from "./lib/data-root-bound-tests.mjs";
import { REPO_ROOT, computeGuardedPaths, digestOf, guardedFingerprint } from "./lib/guarded-paths.mjs";
import { resolveDataRoot } from "./data-root.mjs";


function git(...args) {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr?.trim()}`);
  return result.stdout.trim();
}

function runOne(name) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ["--test", path.join("tests", name)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return {
    test: name,
    reason: REQUIRES_DATA_ROOT.get(name),
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? null,
    durationMs: Date.now() - started,
  };
}

function main() {
  const dataRoot = resolveDataRoot();
  const names = [...REQUIRES_DATA_ROOT.keys()].sort();
  console.log(`Running ${names.length} data-root-bound test files against ${dataRoot}.`);

  const results = [];
  for (const name of names) {
    console.log(`\n--- ${name}`);
    const outcome = runOne(name);
    const guardedPaths = computeGuardedPaths(name);
    results.push({
      ...outcome,
      guardedPaths,
      guardedDigests: Object.fromEntries(guardedPaths.map((relative) => [relative, digestOf(relative)])),
      guardedFingerprint: guardedFingerprint(guardedPaths),
    });
  }

  const failed = results.filter((entry) => entry.status === "failed");
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA,
    // This receipt states what ran on the owner's machine at one commit. It is
    // not an admission, a release, or a production-eligibility record.
    status: "owner-local-test-run",
    published: false,
    productionEligible: false,
    isEdition: false,
    isSnapshot: false,
    runAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    commit: git("rev-parse", "HEAD"),
    workingTreeClean: git("status", "--porcelain").length === 0,
    dataRootPresent: true,
    node: process.version,
    counts: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
    },
    results,
  };

  writeFileSync(path.join(REPO_ROOT, RECEIPT_PATH), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\nWrote ${RECEIPT_PATH}: ${receipt.counts.passed} passed, ${receipt.counts.failed} failed.`);
  if (!receipt.workingTreeClean) {
    console.log("Working tree was dirty at run time; the receipt records that, and the currency gate will reject it.");
  }
  process.exit(failed.length === 0 && receipt.workingTreeClean ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
