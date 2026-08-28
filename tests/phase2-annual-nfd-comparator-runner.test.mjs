import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeAnnualNfdFixture } from "./fixtures/phase2-annual-nfd-comparator-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const runner = path.join(root, "scripts/run-phase2-annual-nfd-comparator.mjs");

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeFixture(dir, fixture) {
  const annual = path.join(dir, "annual-output.json");
  const profile = path.join(dir, "nfd-profile.json");
  writeFileSync(annual, `${JSON.stringify(fixture.annualRows)}\n`, { mode: 0o600 });
  writeFileSync(profile, `${JSON.stringify(fixture.nfdProfile)}\n`, { mode: 0o600 });
  return { annual, profile };
}

function run(paths, extra = []) {
  return execFileSync(process.execPath, [runner,
    "--annual-output", paths.annual,
    "--nfd-profile", paths.profile,
    "--output", paths.output,
    "--sidecar", paths.sidecar,
    ...extra,
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function makePaths(dir) {
  return { output: path.join(dir, "comparison.json"), sidecar: path.join(dir, "comparison.provenance.json") };
}

test("CLI writes 152 provisional rows and a hash-bound provenance sidecar", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-nfd-runner-"));
  try {
    const paths = { ...writeFixture(dir, makeAnnualNfdFixture()), ...makePaths(dir) };
    const stdout = run(paths);
    const outputBytes = readFileSync(paths.output);
    const sidecarBytes = readFileSync(paths.sidecar);
    const rows = JSON.parse(outputBytes);
    const provenance = JSON.parse(sidecarBytes);
    assert.equal(rows.length, 152);
    assert.deepEqual(JSON.parse(stdout), {
      status: "provisional-local-nonproduction",
      rowCount: 152,
      output: { path: paths.output, byteLength: outputBytes.length, sha256: hash(outputBytes) },
      sidecar: { path: paths.sidecar, byteLength: sidecarBytes.length, sha256: hash(sidecarBytes) },
    });
    assert.equal(provenance.schemaVersion, "witness-tree/phase2-annual-nfd-provisional-comparison-run/1");
    assert.equal(provenance.status, "provisional-local-nonproduction");
    assert.equal(provenance.comparison.rowCount, 152);
    assert.equal(provenance.comparison.baselineRowsExcluded, 4);
    assert.equal(provenance.comparison.joinKey, "province:toYear");
    assert.deepEqual(provenance.claims, {
      provisional: true,
      nonLikeForLike: true,
      causalAttributionClaim: false,
      productAccuracyClaim: false,
      equivalenceClaim: false,
      likeForLikeClaim: false,
      admitted: false,
      released: false,
      productionEligible: false,
      admissionClaim: false,
      releaseClaim: false,
      publicationClaim: false,
    });
    for (const [key, input] of [["annualOutput", paths.annual], ["nfdProfile", paths.profile]]) {
      const bytes = readFileSync(input);
      assert.deepEqual(provenance.inputs[key], { path: input, byteLength: bytes.length, sha256: hash(bytes) });
    }
    assert.deepEqual(provenance.output, { path: paths.output, byteLength: outputBytes.length, sha256: hash(outputBytes) });
    assert.equal(provenance.publication, undefined);
    assert.equal(provenance.admission, undefined);
    assert.equal(provenance.release, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI refuses to overwrite either destination before creating the pair", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-nfd-no-overwrite-"));
  try {
    const paths = { ...writeFixture(dir, makeAnnualNfdFixture()), ...makePaths(dir) };
    writeFileSync(paths.output, "output sentinel\n");
    assert.throws(() => run(paths), /already exists|overwrite/);
    assert.equal(readFileSync(paths.output, "utf8"), "output sentinel\n");
    assert.equal(existsSync(paths.sidecar), false);

    rmSync(paths.output);
    writeFileSync(paths.sidecar, "sidecar sentinel\n");
    assert.throws(() => run(paths), /already exists|overwrite/);
    assert.equal(existsSync(paths.output), false);
    assert.equal(readFileSync(paths.sidecar, "utf8"), "sidecar sentinel\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI validates inputs before writing destinations and requires explicit paths", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "witness-tree-annual-nfd-invalid-"));
  try {
    const fixture = makeAnnualNfdFixture();
    fixture.annualRows[0].rowType = "annual";
    fixture.annualRows[0].toYear = 1984;
    const paths = { ...writeFixture(dir, fixture), ...makePaths(dir) };
    assert.throws(() => run(paths), /cannot label 1984 as annual loss|baseline marker/);
    assert.equal(existsSync(paths.output), false);
    assert.equal(existsSync(paths.sidecar), false);
    assert.throws(() => execFileSync(process.execPath, [runner, "--output", paths.output, "--sidecar", paths.sidecar], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /status 1|failed|required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

