import assert from "node:assert/strict";
import test from "node:test";
import { assertZonalAggregationSidecar, type ZonalAggregationSidecar }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/phase2/zonal-aggregation.ts";

const digest = "a".repeat(64);
const valid = (): ZonalAggregationSidecar => ({
  schemaVersion: "phase2-zonal-aggregation-v1",
  algorithm: "windowed-bounded-feature-rasterization",
  nationalPerCellGeometryMaterialized: false,
  input: {
    boundaryEdition: "2025", boundaryIdField: "id", forestMaskVersion: "forest-v2.1", changeRasterVersion: "loss-v2.1", timeVersion: "2020-2022", sourceVersion: "ledger-v1",
    forestMaskSha256: digest, changeRasterSha256: "b".repeat(64), boundarySha256: "c".repeat(64), gridCrs: "EPSG:3347", gridCrsSha256: "d".repeat(64),
    boundarySourceCrs: "EPSG:3347", boundaryWorkingCrs: "EPSG:3347", boundaryGeometryReadPolicy: "driver-default", reprojection: "identical-crs", reprojectionEvidence: null,
    boundaryClassification: "illustrative", admissionStatus: "not-admitted", admissionRecord: null,
  },
  outputSha256: "e".repeat(64), outputByteLength: 12,
  execution: {
    codeVersion: "fixture-v1", workerSha256: "f".repeat(64), startedAt: "2026-08-25T00:00:00Z", completedAt: "2026-08-25T00:00:01Z",
    elapsedSeconds: 1, peakRssBytes: 1024, maximumScratchAllocatedBytes: 512, featureCount: 1,
    parameters: { rowWindow: 2048, columnWindow: 32768, gdalCacheBytes: 268435456, nodata: 255, cellHectares: 1 },
    environment: { pythonVersion: "3.14.0", gdalVersion: "GDAL 3.11.0", numpyVersion: "2.0.0" },
  },
  rows: [{ boundaryId: "one", knownForestedHectares: 2, lossHectares: 1, unknownRequiredInputHectares: 1, observedLossOutsideFirstYearForestHectares: 0.5, coverageGrade: "partial-with-unknown", observedLossPercent: 50 }],
  productionClaim: false,
});

test("zonal sidecar retains the known forested denominator and Unknown coverage", () => {
  assert.equal(assertZonalAggregationSidecar(valid()).rows[0].observedLossPercent, 50);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), rows: [{ ...valid().rows[0], coverageGrade: "complete" }] }), /preserve Unknown/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), rows: [{ ...valid().rows[0], observedLossPercent: 100 }] }), /known forested hectares/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), rows: [{ ...valid().rows[0], observedLossOutsideFirstYearForestHectares: -1 }] }), /outside first-year forest/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), execution: { ...valid().execution, featureCount: 2 } }), /feature count/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), execution: { ...valid().execution, peakRssBytes: 0 } }), /Peak RSS/);
  assert.equal(assertZonalAggregationSidecar({ ...valid(), execution: { ...valid().execution, maximumScratchAllocatedBytes: 0 } }).execution.maximumScratchAllocatedBytes, 0);
});

test("production claims reject illustrative, unadmitted, and undocumented reprojection evidence", () => {
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), productionClaim: true }), /Illustrative geometry/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), nationalPerCellGeometryMaterialized: true as unknown as false }), /prohibited/);
  assert.throws(() => assertZonalAggregationSidecar({ ...valid(), input: { ...valid().input, reprojection: "reprojected", reprojectionEvidence: null } }), /reprojection evidence/);
  const fixture = valid();
  const production: ZonalAggregationSidecar = {
    ...fixture,
    productionClaim: true,
    input: {
      ...fixture.input,
      boundaryClassification: "authoritative-boundary",
      admissionStatus: "admitted",
      admissionRecord: "decision-2026-08-25",
    },
  };
  assert.equal(assertZonalAggregationSidecar(production).productionClaim, true);
});
