import assert from "node:assert/strict";
import test from "node:test";
import {
  readPerCellGeometryEvidence,
  readPerCellTileRelease,
  validatePerCellGeometryEvidence,
  validatePerCellTileRelease,
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

const releaseInputs = await readPerCellTileRelease();
const record = validatePerCellGeometryEvidence(clone());
const release = () => structuredClone(releaseInputs);

test("the tile release record passes its own gate", () => {
  const checked = validatePerCellTileRelease(release(), record);
  assert.equal(checked.countable, false);
  assert.equal(checked.expertReviewed, false);
  assert.equal(checked.productionEligible, false);
});

test("a release that claims to be countable fails the gate", () => {
  const args = release();
  args.countable = true;
  assert.throws(() => validatePerCellTileRelease(args, record), /not countable/);
});

test("a release that claims expert review fails the gate", () => {
  const args = release();
  args.expertReviewed = true;
  assert.throws(() => validatePerCellTileRelease(args, record), /not expert reviewed/);
});

test("an unpublished record may not carry a release id", (t) => {
  const args = release();
  // Skipped rather than passed once published, so a vacuous pass is never
  // mistaken for a check that ran.
  if (args.intervals.length > 0) return t.skip("the release is published");
  args.releaseId = "0".repeat(64);
  assert.throws(() => validatePerCellTileRelease(args, record), /must not carry a release id/);
});

test("a published release must cover every reconciled interval", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  args.intervals.pop();
  args.totals.intervalCount -= 1;
  assert.throws(() => validatePerCellTileRelease(args, record), /does not cover every interval/);
});

test("swapping an archive without changing the release id fails the gate", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  // The published path is the digest of the archives' digests, so serving
  // different bytes from the same path is exactly what this must catch.
  args.intervals[0].sha256 = "f".repeat(64);
  assert.throws(() => validatePerCellTileRelease(args, record), /not the digest of its archives/);
});

test("a release that restates an interval's counts fails the gate", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  args.intervals[3].cellCount += 1;
  assert.throws(() => validatePerCellTileRelease(args, record), /cell count/);
});
