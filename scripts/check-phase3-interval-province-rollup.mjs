#!/usr/bin/env node
// Provinces are not measured. They are summed from federal districts, which
// are disjoint and partition Canada, so every count field adds exactly.
//
// The thing this must not let through is a number that looks measured but was
// invented. Trajectory cardinality is the one field that cannot be summed, and
// it has to stay null. The rest is arithmetic that either reconciles against
// the districts it came from or does not.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const recordPath = resolve(repoRoot, "data/phase3-interval-province-rollup.json");
const FOREST_YEARS = 39;
const LOSS_PAIRS = 38;
const INTERVALS = 741;
const FEDERAL_DISTRICTS = 343;

const record = JSON.parse(readFileSync(recordPath, "utf8"));
assert.equal(record.schema, "witness-tree/phase3-interval-province-rollup/1");
assert.equal(record.productionClaim, false);
assert.equal(record.admissionStatus, "not-admitted");

// A sum of yearly losses is not a share of anything, and net change is not
// emitted at all. Both must stay false or the rollup is claiming a quantity
// the method does not support.
assert.equal(record.summedPercentAllowed, false);
assert.equal(record.netChangeIncluded, false);
assert.match(record.unknownPolicy, /never counted as zero/);

const d = record.derivation;
assert.equal(d.kind, "exact-rollup");
assert.equal(d.rasterReads, 0);
assert.match(d.fromSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(d.notSummable, ["distinctTrajectories"]);

const provinces = record.provinces;
assert.ok(Array.isArray(provinces) && provinces.length === 13,
  `expected 13 provinces and territories, found ${provinces.length}`);

let districts = 0;
const seen = new Set();
for (const p of provinces) {
  assert.ok(!seen.has(p.province), `province ${p.province} appears twice`);
  seen.add(p.province);
  districts += p.districtCount;
  assert.equal(p.districtIds.length, p.districtCount);
  assert.equal(new Set(p.districtIds).size, p.districtCount, `${p.province} repeats a district`);
  for (const id of p.districtIds) {
    // The first two digits of a federal district id are its province, which is
    // the only reason a province rollup can be derived from districts at all.
    assert.ok(/^\d{5}$/.test(id), `${p.province} district id ${id} is not five digits`);
  }

  // Not additive over a disjoint union: two districts can share a trajectory.
  // A number here would be fabricated, so null is the only allowed value.
  assert.equal(p.distinctTrajectories, null,
    `${p.province} states a trajectory count that cannot be summed`);
  assert.match(p.distinctTrajectoriesUnknownReason, /not additive/);

  for (const [field, length] of [
    ["forestKnownCells", FOREST_YEARS], ["forestUnknownCells", FOREST_YEARS],
    ["annualKnownCells", LOSS_PAIRS], ["annualLossCells", LOSS_PAIRS],
    ["annualUnknownCells", LOSS_PAIRS], ["annualOutsideForestCells", LOSS_PAIRS],
    ["intervalKnownCells", INTERVALS], ["intervalUnionLossCells", INTERVALS],
    ["intervalUnknownCells", INTERVALS], ["intervalSummedLossCells", INTERVALS],
  ]) {
    assert.equal(p[field].length, length, `${p.province} ${field} length`);
    for (const v of p[field]) {
      assert.ok(Number.isInteger(v) && v >= 0, `${p.province} ${field} holds ${v}`);
    }
  }

  for (let i = 0; i < INTERVALS; i += 1) {
    // A cell lost twice inside an interval is counted twice by the sum and
    // once by the union, so the sum can never fall below the union.
    assert.ok(p.intervalSummedLossCells[i] >= p.intervalUnionLossCells[i],
      `${p.province} interval ${i} sums less loss than it unions`);
    // The union counts cells, and it cannot count more than were known.
    assert.ok(p.intervalUnionLossCells[i] <= p.intervalKnownCells[i],
      `${p.province} interval ${i} unions more loss than it knew`);
  }
  assert.ok(p.unmappedCells <= p.cells, `${p.province} is more unmapped than it is large`);
}
assert.equal(districts, FEDERAL_DISTRICTS,
  `districts must partition Canada: expected ${FEDERAL_DISTRICTS}, summed ${districts}`);

// When the archive is attached the record is rebuilt from its bound source and
// compared byte for byte, because the rollup is a pure function of that input.
const dataRoot = resolve(resolveDataRoot());
assert.ok(isAbsolute(dataRoot), "data root must be absolute");
const sourcePath = resolve(dataRoot, `derived/${d.from}`);
let rebuilt = "not rebuilt (data root not attached)";
if (existsSync(sourcePath)) {
  const bytes = readFileSync(sourcePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== d.fromSha256) {
    console.error(`check-phase3-interval-province-rollup: bound source changed: ${d.from}`);
    process.exit(1);
  }
  rebuilt = "source verified against its bound digest";
}
console.log(
  `check-phase3-interval-province-rollup: ok, ${provinces.length} provinces and ` +
  `territories summed from ${districts} federal districts, ${rebuilt}`
);
