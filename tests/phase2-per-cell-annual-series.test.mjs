import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPerCellAnnualSeries, validatePerCellAnnualSeries } from "../scripts/check-phase2-per-cell-annual-series.mjs";

const readbackBytes = readFileSync(new URL("../data/phase2-per-cell-geometry-readback.json", import.meta.url));
const readback = JSON.parse(readbackBytes);
const series = () => JSON.parse(readFileSync(new URL("../data/phase2-per-cell-annual-series.json", import.meta.url), "utf8"));
const tiles = () => JSON.parse(readFileSync(new URL("../data/phase2-per-cell-tile-release.json", import.meta.url), "utf8"));
const validate = (next, tileRelease = tiles()) => validatePerCellAnnualSeries(next, readback, readbackBytes, tileRelease);

test("the annual series counts all 38 intervals from the exact cell inventory", () => {
  const result = checkPerCellAnnualSeries();
  assert.equal(result.intervals, 38);
  assert.equal(result.hectares, 124562467.53);

  const record = series();
  assert.equal(record.intervals[0].interval, "1984-1985");
  assert.equal(record.intervals.at(-1).interval, "2021-2022");
  assert.equal(record.totals.cellCount, readback.totals.cellCount);
});

test("hectares must be the exact cell count times the exact cell area", () => {
  /*
   * The figure is only trustworthy because it is arithmetic rather than a
   * measurement of a drawn polygon. An edited hectare value, or a redefined
   * cell, restates every number on the site derived from this series.
   */
  const inflated = series();
  inflated.intervals[0].hectares += 1000;
  assert.throws(() => validate(inflated), /not the cell count times the cell area/);

  const recell = series();
  recell.cellHectares = 0.9;
  assert.throws(() => validate(recell), /0\.09 ha/);
});

test("the cause split can never exceed the loss it splits", () => {
  // Editing the split alone is caught before it can over-attribute, because
  // every figure is bound back to the readback it came from.
  const tampered = series();
  tampered.intervals[0].harvestCells = tampered.intervals[0].cellCount;
  assert.throws(() => validate(tampered), /harvest hectares drifted|harvest cells drifted/);

  /*
   * The invariant itself needs a pair that agrees with itself and is still
   * wrong, which is what a bad upstream attribution run would produce: the
   * readback and the series both say the two causes account for more cells
   * than were ever detected. That is the arithmetic this gate exists to stop.
   */
  const badReadback = structuredClone(readback);
  const source = badReadback.intervals[0];
  source.attribution.harvestCells = source.cellCount;
  source.attribution.fireCells = 1;
  const badBytes = Buffer.from(JSON.stringify(badReadback));

  const consistent = series();
  const entry = consistent.intervals[0];
  entry.harvestCells = source.cellCount;
  entry.harvestHectares = Number((entry.harvestCells * 0.09).toFixed(2));
  entry.fireCells = 1;
  entry.fireHectares = 0.09;
  entry.unattributedCells = entry.cellCount - entry.harvestCells - entry.fireCells;
  consistent.source.sha256 = createHash("sha256").update(badBytes).digest("hex");
  consistent.source.byteLength = badBytes.byteLength;

  assert.throws(
    () => validatePerCellAnnualSeries(consistent, badReadback, badBytes, tiles()),
    /attributes more cells than it detected/,
  );
});

test("the series may not claim completeness, review, or ground truth", () => {
  for (const claim of ["complete", "expertReviewed", "groundTruthed"]) {
    const boasting = series();
    boasting.claims[claim] = true;
    assert.throws(() => validate(boasting), /claims drifted/);
  }
});

test("the drawing layer must stay uncountable while the series is countable", () => {
  /*
   * These two artifacts describe the same loss and disagree about whether they
   * may be totalled, for a real reason: the tiler drops the smallest patches.
   * The failure this guards is the pair being brought into agreement by
   * promoting the tiles rather than by leaving the inventory to do the counting.
   */
  const countableTiles = { ...tiles(), countable: true };
  assert.throws(() => validate(series(), countableTiles), /tiles drop small patches and cannot be totalled/);

  const reviewedTiles = { ...tiles(), expertReviewed: true };
  assert.throws(() => validate(series(), reviewedTiles), /claims a review that did not happen/);
});

test("the series must stay bound to the readback it counted", () => {
  const unbound = series();
  unbound.source.sha256 = "0".repeat(64);
  assert.throws(() => validate(unbound), /bound readback digest drifted/);
});
