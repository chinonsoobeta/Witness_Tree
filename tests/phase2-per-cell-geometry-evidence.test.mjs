import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
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

test("the readback binds both the current geometry runner and the bytes used by the recorded run", () => {
  assert.notEqual(inputs.record.runner.sha256, inputs.record.runner.readbackBoundSha256, "the lint-only runner change must remain visible");

  const currentDrift = clone();
  currentDrift.runnerSha256 = "a".repeat(64);
  assert.throws(() => validatePerCellGeometryEvidence(currentDrift), /current geometry runner checksum drifted/);

  const historicalDrift = clone();
  historicalDrift.record.runner.readbackBoundSha256 = "b".repeat(64);
  assert.throws(() => validatePerCellGeometryEvidence(historicalDrift), /readback-bound geometry runner checksum drifted/);
});

test("the mapped-extent receipt matches the completed external verification", async (context) => {
  const root = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
  const descriptor = inputs.extentReceipt.verification;
  const file = path.join(root, descriptor.path.replace(/^\.\.\/Witness_Tree-data\//u, ""));
  if (!existsSync(file)) return context.skip("external Witness Tree data root is not attached");
  const bytes = await readFile(file);
  assert.equal(bytes.length, descriptor.byteLength);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), descriptor.sha256);
  const verification = JSON.parse(bytes);
  assert.equal(verification.schemaVersion, descriptor.schemaVersion);
  assert.equal(verification.extentInvariance.years.length, descriptor.verifiedYearCount);
  assert.equal(verification.extentInvariance.years.some((year) => year.differingCells !== 0), false);
});

test("incomplete mapped-extent verification fails the per-cell gate", () => {
  const args = clone();
  args.extentReceipt.verification.allDifferingCellsZero = false;
  assert.throws(() => validatePerCellGeometryEvidence(args));
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
const publishedRelease = () => {
  const intervals = record.intervals.map((entry, index) => ({
    interval: entry.interval,
    fileName: `${entry.interval}.pmtiles`,
    byteLength: index + 1,
    sha256: createHash("sha256").update(entry.interval).digest("hex"),
    patchCount: entry.patchCount,
    cellCount: entry.cellCount,
    harvestCells: entry.attribution.harvestCells,
    fireCells: entry.attribution.fireCells,
  }));
  const releaseId = createHash("sha256")
    .update(intervals.map((entry) => `${entry.interval}:${entry.sha256}`).join("\n"))
    .digest("hex");
  const base = `https://example.test/releases/${releaseId}/tiles`;
  return {
    ...release(),
    releaseId,
    base,
    coverageEvidence: structuredClone(inputs.extentReceipt),
    intervals: intervals.map((entry) => ({ ...entry, url: `${base}/${entry.fileName}` })),
    totals: { intervalCount: intervals.length, byteLength: intervals.reduce((sum, entry) => sum + entry.byteLength, 0) },
  };
};

test("the tile release record passes its own gate", () => {
  const checked = validatePerCellTileRelease(release(), record, inputs.extentReceipt);
  assert.equal(checked.countable, false);
  assert.equal(checked.expertReviewed, false);
  assert.equal(checked.productionEligible, false);
});

test("a release that claims to be countable fails the gate", () => {
  const args = release();
  args.countable = true;
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /not countable/);
});

test("a release that claims expert review fails the gate", () => {
  const args = release();
  args.expertReviewed = true;
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /not expert reviewed/);
});

test("an unpublished record may not carry a release id", (t) => {
  const args = release();
  // Skipped rather than passed once published, so a vacuous pass is never
  // mistaken for a check that ran.
  if (args.intervals.length > 0) return t.skip("the release is published");
  args.releaseId = "0".repeat(64);
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /must not carry a release id/);
});

test("a published release must cover every reconciled interval", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  args.intervals.pop();
  args.totals.intervalCount -= 1;
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /does not cover every interval/);
});

test("swapping an archive without changing the release id fails the gate", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  // The published path is the digest of the archives' digests, so serving
  // different bytes from the same path is exactly what this must catch.
  args.intervals[0].sha256 = "f".repeat(64);
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /not the digest of its archives/);
});

test("a release that restates an interval's counts fails the gate", (t) => {
  const args = release();
  if (args.intervals.length === 0) return t.skip("nothing is published yet");
  args.intervals[3].cellCount += 1;
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /cell count/);
});

test("a published release without exact mapped-extent evidence fails", () => {
  const args = publishedRelease();
  delete args.coverageEvidence;
  assert.throws(() => validatePerCellTileRelease(args, record, inputs.extentReceipt), /verified mapped extent/);
});
