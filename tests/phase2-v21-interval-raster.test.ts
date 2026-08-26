import assert from "node:assert/strict";
import test from "node:test";
import { aggregateWholeIntervalChange, assertIntervalRasterSidecar, INTERVAL_NODATA, type IntervalRasterInput }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/phase2/interval-raster.ts";

const annual = (fromYear: number, cells: readonly (0 | 1 | 255)[]): IntervalRasterInput => ({
  fromYear,
  toYear: fromYear + 1,
  width: 3,
  height: 1,
  gridId: "vlce2-lcc-nad83",
  cells,
});

test("an interval accumulates loss from every annual pair, not merely the endpoints", () => {
  const output = aggregateWholeIntervalChange(1984, 1988, [
    annual(1984, [0, 0, 0]),
    annual(1985, [0, 1, 0]),
    annual(1986, [0, 0, 0]),
    annual(1987, [0, 0, 0]),
  ]);
  assert.deepEqual(output.cells, [0, 1, 0]);
  assert.equal(output.semantics, "observed-loss-anywhere-in-whole-interval");
  assert.equal(output.productionEligible, false);
});

test("Unknown is retained when no annual observation shows loss", () => {
  const output = aggregateWholeIntervalChange(2020, 2022, [
    annual(2020, [INTERVAL_NODATA, INTERVAL_NODATA, 0]),
    annual(2021, [0, 1, 0]),
  ]);
  assert.deepEqual(output.cells, [INTERVAL_NODATA, 1, 0]);
});

test("a missing annual pair, a different grid, and invalid cells fail closed", () => {
  assert.throws(() => aggregateWholeIntervalChange(1984, 1988, [annual(1984, [0, 0, 0])]), /exactly one annual loss raster/);
  assert.throws(
    () => aggregateWholeIntervalChange(1984, 1986, [annual(1984, [0, 0, 0]), { ...annual(1985, [0, 0, 0]), gridId: "other-grid" }]),
    /exact raster grid identity/,
  );
  assert.throws(
    () => aggregateWholeIntervalChange(1984, 1985, [{ ...annual(1984, [2, 0, 0] as unknown as readonly (0 | 1 | 255)[]) }]),
    /must be 0, 1, or 255/,
  );
});

test("a future interval sidecar must bind all inputs, grid metadata, and a non-production output", () => {
  const digest = "a".repeat(64);
  const valid = assertIntervalRasterSidecar({
    fromYear: 2020, toYear: 2022,
    annualInputSha256: [{ fromYear: 2020, toYear: 2021, sha256: digest }, { fromYear: 2021, toYear: 2022, sha256: "b".repeat(64) }],
    outputSha256: "c".repeat(64), outputByteLength: 1, methodVersion: "v1", codeVersion: "abc123",
    gridId: "vlce2-lcc-nad83", crs: "WKT", geotransform: [0, 30, 0, 0, 0, -30], noDataValue: 255,
    coverage: "partial-with-unknown", elapsedSeconds: 0, peakRssBytes: 1024, productionEligible: false,
  });
  assert.equal(valid.productionEligible, false);
  assert.throws(() => assertIntervalRasterSidecar({ ...valid, annualInputSha256: valid.annualInputSha256.slice(0, 1) }), /bind every annual pair/);
  assert.throws(() => assertIntervalRasterSidecar({ ...valid, noDataValue: 0 as unknown as 255 }), /preserve nodata/);
  assert.throws(() => assertIntervalRasterSidecar({ ...valid, outputSha256: "not-a-digest" }), /SHA-256/);
  assert.throws(() => assertIntervalRasterSidecar({ ...valid, peakRssBytes: 0 }), /measured positive-integer peak RSS/);
});
