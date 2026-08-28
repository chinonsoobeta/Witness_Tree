import assert from "node:assert/strict";
import test from "node:test";

import { reportProvincialMatching } from "../lib/phase4/provincial-matching";
import { rasterToChangeVector } from "../lib/phase4/raster-to-change-vector";
import {
  PHASE4_SPATIAL_JOIN_CRS,
  rasterOutputToSpatialJoinChanges,
  spatialJoinRasterOutput,
  type SpatialJoinGeometry,
} from "../lib/phase4/spatial-join";

const ready = {
  sourceRightsVerified: true,
  sourceEvidenceAdmitted: true,
  sourceTransformationApproved: true,
  sourceReleaseApproved: true,
  changeGeometryMaterialized: true,
} as const;

const square = (west: number, south: number, east: number, north: number): SpatialJoinGeometry => ({
  type: "Polygon",
  crs: PHASE4_SPATIAL_JOIN_CRS,
  linearUnit: "metre",
  coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});

function vectorOutput() {
  return rasterToChangeVector({
    fromYear: 2020,
    toYear: 2021,
    width: 2,
    height: 1,
    gridId: "integration-grid",
    crs: PHASE4_SPATIAL_JOIN_CRS,
    linearUnit: "metre",
    geotransform: [0, 100, 0, 100, 0, -100],
    noDataValue: 255,
    cells: [1, 0],
    sourceRasterSha256: "a".repeat(64),
  });
}

function twoPatchVectorOutput() {
  return rasterToChangeVector({
    fromYear: 2020,
    toYear: 2021,
    width: 3,
    height: 1,
    gridId: "integration-grid",
    crs: PHASE4_SPATIAL_JOIN_CRS,
    linearUnit: "metre",
    geotransform: [0, 100, 0, 100, 0, -100],
    noDataValue: 255,
    cells: [1, 0, 1],
    sourceRasterSha256: "a".repeat(64),
  });
}

test("the raster output crosses the spatial seam with patch lineage intact", () => {
  const output = vectorOutput();
  const changes = rasterOutputToSpatialJoinChanges(output, "BC");
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.id, output.patches[0]?.id);
  assert.equal(changes[0]?.geometryHectares, 1);
  assert.deepEqual(changes[0]?.sourcePatch, {
    patchIndex: 0,
    patchChecksumSha256: output.patches[0]?.patchChecksumSha256,
    lineage: output.patches[0]?.lineage,
  });

  const candidateSets = spatialJoinRasterOutput(output, "BC", [{
    id: "official-cutblock",
    province: "BC",
    eventYear: 2021,
    geometry: square(0, 0, 100, 100),
  }]);
  assert.equal(candidateSets.length, 1);
  assert.equal(candidateSets[0]?.change.sourcePatch?.patchChecksumSha256, output.patches[0]?.patchChecksumSha256);
  assert.equal(candidateSets[0]?.candidates[0]?.intersectionHectares, 1);

  const report = reportProvincialMatching(ready, candidateSets);
  assert.deepEqual(report.counts, { assessedChanges: 1, matchedChanges: 1, unmatchedChanges: 0 });
  assert.equal(report.matchRate, 1);
  assert.equal(report.nonMatchRate, 0);
  assert.deepEqual(report.nonMatchReasonDistribution, {});
  assert.equal(report.productionEligible, false);
});

test("the seam rejects production labels and tampered raster accounting", () => {
  const output = vectorOutput();
  assert.throws(
    () => rasterOutputToSpatialJoinChanges({ ...output, productionEligible: true } as never, "BC"),
    /computed-nonproduction/,
  );
  assert.throws(
    () => rasterOutputToSpatialJoinChanges({ ...output, changedCellCount: 0 } as never, "BC"),
    /cell accounting/,
  );
  assert.throws(
    () => rasterOutputToSpatialJoinChanges({ ...output, patches: [{ ...output.patches[0]!, patchIndex: 1 }] } as never, "BC"),
    /canonical zero-based/,
  );
  assert.throws(
    () => rasterOutputToSpatialJoinChanges({ ...output, patches: [{ ...output.patches[0]!, cellIndices: [1] }] } as never, "BC"),
    /patch checksum/,
  );
  assert.throws(
    () => rasterOutputToSpatialJoinChanges({ ...output, patches: [{ ...output.patches[0]!, lineage: { ...output.patches[0]!.lineage, sourceRasterSha256: "b".repeat(64) } }] } as never, "BC"),
    /does not match the raster output/,
  );
});

test("the raster seam canonicalizes patch-array order by patch index", () => {
  const output = twoPatchVectorOutput();
  const reversed = { ...output, patches: [...output.patches].reverse() };
  assert.deepEqual(rasterOutputToSpatialJoinChanges(reversed, "QC"), rasterOutputToSpatialJoinChanges(output, "QC"));
});

test("matching reports are invariant to input order and use a stable tie-break", () => {
  const base = [
    {
      change: { id: "change-b", province: "QC" as const, observationYear: 2020, geometryHectares: 10 },
      candidates: [],
    },
    {
      change: { id: "change-a", province: "QC" as const, observationYear: 2020, geometryHectares: 10 },
      candidates: [
        { id: "event-z", eventYear: 2020, geometryHectares: 10, intersectionHectares: 5 },
        { id: "event-a", eventYear: 2020, geometryHectares: 10, intersectionHectares: 5 },
      ],
    },
  ];
  const first = reportProvincialMatching(ready, base);
  const second = reportProvincialMatching(ready, [...base].reverse().map((set) => ({
    ...set,
    candidates: [...set.candidates].reverse(),
  })));
  assert.deepEqual(second, first);
  assert.deepEqual(first.nonMatchReasonDistribution, { "no-official-record-candidates": 1 });
});

test("malformed candidate geometry blocks reporting without using numeric zero", () => {
  const report = reportProvincialMatching(ready, [{
    change: { id: "change", province: "BC", observationYear: 2020, geometryHectares: 10 },
    candidates: [{ id: "event", eventYear: 2020, geometryHectares: 5, intersectionHectares: 6 }],
  }]);
  assert.equal(report.status, "blocked");
  assert.equal(report.counts, null);
  assert.equal(report.matchRate, null);
  assert.equal(report.nonMatchRate, null);
  assert.equal(report.nonMatchReasonDistribution, null);
  assert.match(report.blockers.join(" "), /cannot exceed/);
});
