import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { NTEMS_EVIDENCE, check, checkScope } from "../scripts/check-phase1-ntems-readback-bytes.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

test("every NTEMS scope is covered exactly once", () => {
  assert.equal(NTEMS_EVIDENCE.length, 4);
  const ids = NTEMS_EVIDENCE.map(({ specId }) => specId);
  assert.equal(new Set(ids).size, ids.length);
  for (const { specId, evidencePath } of NTEMS_EVIDENCE) {
    assert.match(specId, /^ntems-[a-z0-9-]+-v1$/);
    assert.ok(evidencePath.startsWith("data/") && evidencePath.endsWith(".json"));
  }
});

// A scope that has not been read back yet must be reported as such, never as
// verified. Passing on a missing evidence file is the defect this guards.
test("a scope with no committed evidence is reported, not silently passed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ntems-readback-bytes-"));
  try {
    mkdirSync(path.join(root, "data"), { recursive: true });
    const result = checkScope({ specId: "ntems-canopy-cover-v1", evidencePath: "data/absent.json" }, root);
    assert.equal(result.state, "no-committed-evidence");
    assert.equal(result.bytesRead, false);
    assert.equal(result.outputs, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown spec id is refused rather than silently verifying nothing", () => {
  assert.throws(() => check(REPO_ROOT, { specIds: ["ntems-not-a-scope-v1"] }), /no NTEMS scope matched/);
});

// The check must not be satisfiable by an evidence file alone. Its whole
// purpose is that a forged or drifted record fails, so the disagreement is
// reported as a contradiction rather than as a missing file.
//
// This runs against the real repository root, because the verifier resolves
// the execution authorization and specification relative to that root. The
// drifted copy is written into data/ under a unique dot-prefixed name and
// removed in finally, so no stray record can be picked up by another check.
test("a drifted digest in an otherwise valid record is a contradiction", () => {
  const relative = `data/.test-drifted-readback-${process.pid}.json`;
  const absolute = path.join(REPO_ROOT, relative);
  try {
    const source = path.join(REPO_ROOT, "data/ntems-forest-harvest-v1-readback-evidence-2026-08-30.json");
    const record = JSON.parse(readFileSync(source, "utf8"));
    record.outputs[0].outputSha256 = "0".repeat(64);
    writeFileSync(absolute, `${JSON.stringify(record, null, 2)}\n`);
    assert.throws(
      () => checkScope({ specId: "ntems-forest-harvest-v1", evidencePath: relative }, REPO_ROOT),
      /does not match the bytes on disk/,
    );
  } finally {
    rmSync(absolute, { force: true });
  }
});

test("the check makes no admission, release, or production claim", () => {
  const source = readFileSync(path.join(REPO_ROOT, "scripts/check-phase1-ntems-readback-bytes.mjs"), "utf8");
  assert.match(source, /admissionClaim: false/);
  assert.match(source, /productionAdmission: false/);
  assert.match(source, /productionEligible: false/);
  assert.doesNotMatch(source, /gdal_translate|ogr2ogr|writeFileSync|s3:|PutObject/);
});
