#!/usr/bin/env node
// Condition and recovery, v3: the v2 method with five treed years required
// instead of three, admitted by the owner on 2026-10-03. This checks the record
// of that run. Its arithmetic is re-derived from counts rather than trusted;
// with the data root attached, the record is rebuilt from the run output and
// must match byte for byte.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DECISION_HEADING, RECORD, WORKER, buildRecord, serialize } from "./build-phase4-condition-recovery-v3-record.mjs";
import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROVINCES = ["british-columbia", "alberta", "ontario", "quebec"];
const SETS = { A: [210, 220, 230], B: [81, 210, 220, 230] };
const DECADES = ["1985-1994", "1995-2004", "2005-2014", "2015-2022"];
const read = (path) => readFileSync(resolve(repoRoot, path));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = read(RECORD);
const record = JSON.parse(bytes);
const v2 = JSON.parse(read("data/phase4-condition-recovery-v2.json"));

assert.equal(record.schema, "witness-tree/phase4-condition-recovery-v3-evidence/1");
assert.equal(record.checkedBy, "scripts/check-phase4-condition-recovery-v3.mjs");
// Admitted and owner reviewed, as an event the decision record names. Still
// not a finding about NFI forest, and not a production-eligible product.
assert.deepEqual(record.claims, { admitted: true, released: true, ownerReviewed: true, productionEligible: false, nfiForestClaimed: false });
assert.ok(read(record.decision.record).toString("utf8").includes(DECISION_HEADING), "the owner decision this record relies on is gone");
assert.equal(record.decision.headlineSet, "A");

assert.equal(record.run.worker, WORKER);
assert.equal(sha256(read(WORKER)), record.run.workerSha256, "the worker changed after the recorded run");
assert.equal(record.run.confirmYears, 5);
assert.equal(record.run.firstYear, 1984);
assert.equal(record.run.lastYear, 2022);
assert.deepEqual(record.run.treedClassSets, SETS);
// Everything the rule does not touch is the v2 run's own evidence.
assert.deepEqual(record.sourceInputs, v2.sourceInputs);
assert.ok(record.notMeasured.some((line) => line.includes("five treed years")));

function checkTotals(t, label) {
  assert.equal(t.knownCells, t.maskCells - t.unknownCells, `${label}: known must be mask less unknown`);
  assert.equal(t.neverTreedCells + t.everTreedCells, t.knownCells, `${label}: known cells are not all accounted for`);
  assert.ok(t.lostCells <= t.everTreedCells, `${label}: more was lost than was ever treed`);
  const latest = t.latestLoss;
  assert.equal(latest.recoveredCells + latest.notRecoveredCells, t.lostCells, `${label}: latest-loss partition`);
  assert.ok(latest.unconfirmedCells <= latest.notRecoveredCells, `${label}: unconfirmed must sit inside not recovered`);
  assert.equal(t.anyLoss.recoveredCells + t.anyLoss.notRecoveredCells, t.lostCells, `${label}: any-loss partition`);
  assert.ok(t.anyLoss.recoveredCells >= latest.recoveredCells, `${label}: any-loss cannot recover less than latest-loss`);
  assert.deepEqual(Object.keys(t.byLatestLossDecade), DECADES, `${label}: decades`);
  const decades = Object.values(t.byLatestLossDecade);
  assert.equal(decades.reduce((n, d) => n + d.lostCells, 0), t.lostCells, `${label}: decades do not sum to lost`);
  assert.equal(decades.reduce((n, d) => n + d.recoveredCells, 0), latest.recoveredCells, `${label}: decades do not sum to recovered`);
}

for (const slug of PROVINCES) {
  for (const set of Object.keys(SETS)) {
    const t = record.provinces[slug][set];
    checkTotals(t, `${slug}.${set}`);
    const before = v2.provinces[slug][set];
    // The rule changes what counts as recovered, never what was lost or known.
    for (const field of ["maskCells", "unknownCells", "knownCells", "everTreedCells", "lostCells"]) {
      assert.equal(t[field], before[field], `${slug}.${set}.${field} differs from v2, which the rule cannot change`);
    }
    // Five treed years is a stricter test than three, so nothing recovers more.
    assert.ok(t.latestLoss.recoveredCells <= before.latestLoss.recoveredCells, `${slug}.${set}: more recovered under a stricter rule`);
  }
}

const dataRoot = resolveDataRoot();
const output = record.outputs.find((o) => o.slug === "condition-recovery-v3");
const rootPresent = existsSync(resolve(dataRoot, output.path));
if (rootPresent) {
  for (const o of record.outputs) {
    const path = resolve(dataRoot, o.path);
    assert.equal(statSync(path).size, o.byteLength, `${o.slug} byte length changed`);
    assert.equal(sha256(readFileSync(path)), o.sha256, `${o.slug} content changed`);
  }
  const rebuilt = buildRecord({
    v2,
    run: JSON.parse(readFileSync(resolve(dataRoot, output.path))),
    outputFiles: record.outputs,
    workerSha256: record.run.workerSha256,
  });
  assert.equal(serialize(rebuilt), bytes.toString("utf8"), "the record differs from a rebuild from the run output");
}

const four = record.fourProvinces.A;
console.log(
  `check-phase4-condition-recovery-v3: ok, admitted; ${(four.lostCells * 0.09 / 1e6).toFixed(2)}M ha lost and ` +
  `${(four.latestLossRecoveredCells / four.lostCells * 100).toFixed(1)}% treed again for five years after the latest loss` +
  (rootPresent ? ", rebuilt from the run output" : " (data root not mounted)"),
);
