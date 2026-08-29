import assert from "node:assert/strict";
import test from "node:test";
import {
  readPerCellGeometryEvidence,
  validatePerCellGeometryEvidence,
} from "../scripts/check-phase2-per-cell-geometry-evidence.mjs";

const inputs = await readPerCellGeometryEvidence();
const clone = () => structuredClone(inputs);

test("the per-cell geometry readback reconciles with the component inventory", () => {
  const record = validatePerCellGeometryEvidence(clone());
  assert.equal(record.intervalCount, 38);
  assert.equal(record.totals.patchCount, 303_530_909);
  assert.equal(record.totals.cellCount, 1_384_027_417);
});

test("a patch that appears from nowhere fails the gate", () => {
  const args = clone();
  // Also move the totals and the summary, so what catches this is the
  // reconciliation against the inventory rather than an internal sum.
  args.record.intervals[0].patchCount += 1;
  args.record.totals.patchCount += 1;
  args.summary.patchCount += 1;
  assert.throws(() => validatePerCellGeometryEvidence(args), /patch count/);
});

test("a lost cell fails the gate", () => {
  const args = clone();
  args.record.intervals[17].cellCount -= 1;
  args.record.totals.cellCount -= 1;
  args.summary.cellCount -= 1;
  assert.throws(() => validatePerCellGeometryEvidence(args), /cell count/);
});

test("geometry derived from a different lineage file fails the gate", () => {
  const args = clone();
  args.record.intervals[3].source.sha256 = "a".repeat(64);
  assert.throws(() => validatePerCellGeometryEvidence(args), /lineage checksum/);
});

test("a store file whose size contradicts its record count fails the gate", () => {
  const args = clone();
  args.record.intervals[9].runs.byteLength += 12;
  assert.throws(() => validatePerCellGeometryEvidence(args), /run store size/);
});

test("the product cannot claim review, release, or production eligibility", () => {
  for (const field of ["released", "productionEligible", "expertReviewed"]) {
    const args = clone();
    args.record[field] = true;
    assert.throws(() => validatePerCellGeometryEvidence(args));
  }
});

test("attribution cannot exceed the cells there are to attribute", () => {
  const args = clone();
  args.record.intervals[5].attribution.harvestCells = args.record.intervals[5].cellCount + 1;
  assert.throws(() => validatePerCellGeometryEvidence(args), /harvest cells exceed/);
});

test("the missing 1984 disturbance coverage cannot be quietly filled in", () => {
  const args = clone();
  args.record.intervals[0].attribution.disturbanceYearsMissing = [];
  assert.throws(() => validatePerCellGeometryEvidence(args), /disturbance coverage/);
});

test("a summary bound to a different readback fails the gate", () => {
  const args = clone();
  args.summary.evidence.sha256 = "b".repeat(64);
  assert.throws(() => validatePerCellGeometryEvidence(args), /different readback/);
});

test("the record keeps saying that a zero is not an observation of absence", () => {
  const args = clone();
  args.record.disturbanceRecord.zeroMeaning = "no harvest occurred";
  assert.throws(() => validatePerCellGeometryEvidence(args));
});
