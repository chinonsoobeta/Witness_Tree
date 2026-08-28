import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_NONPRODUCTION_RASTER_CELLS,
  rasterToChangeVector,
  type RasterToChangeVectorInput,
} from "../lib/phase4/raster-to-change-vector";

function raster(overrides: Partial<RasterToChangeVectorInput> = {}): RasterToChangeVectorInput {
  return {
    fromYear: 2020,
    toYear: 2021,
    width: 4,
    height: 3,
    gridId: "synthetic-grid",
    crs: "SYNTHETIC-CRS",
    linearUnit: "metre",
    geotransform: [100, 30, 0, 200, 0, -30],
    noDataValue: 255,
    cells: [1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 255],
    ...overrides,
  };
}

test("the default four-connected vectorization preserves metadata, stable patches, polygons, area, and year lineage", () => {
  const first = rasterToChangeVector(raster());
  const second = rasterToChangeVector(raster());

  assert.deepEqual(first, second);
  assert.equal(first.status, "computed-nonproduction");
  assert.equal(first.productionEligible, false);
  assert.equal(first.connectivity, 4);
  assert.equal(first.connectivityVersion, "4-connected-v1");
  assert.deepEqual(first.geotransform, [100, 30, 0, 200, 0, -30]);
  assert.equal(first.crs, "SYNTHETIC-CRS");
  assert.equal(first.linearUnit, "metre");
  assert.equal(first.noDataValue, 255);
  assert.equal(first.sourceRasterSha256, undefined);
  assert.deepEqual(first.patches.map((patch) => patch.cellIndices), [[0, 1, 5], [7], [10]]);
  assert.deepEqual(first.patches.map((patch) => patch.patchIndex), [0, 1, 2]);
  assert.equal(first.patches[0]?.geometry.type, "MultiPolygon");
  assert.equal(first.patches[0]?.geometry.coordinates.length, 3);
  assert.deepEqual(first.patches[0]?.geometry.coordinates[0]?.[0]?.[0], [100, 200]);
  assert.deepEqual(first.patches[0]?.geometry.coordinates[0]?.[0]?.at(-1), [100, 200]);
  assert.equal(first.patches[0]?.areaHectares, 0.27);
  assert.equal(first.patches[0]?.geometryHectares, 0.27);
  assert.equal(first.changedAreaHectares, 0.45);
  assert.equal(first.nodataCellCount, 1);
  assert.equal(first.unchangedCellCount, 6);
  assert.equal(first.patches[0]?.observationYear, 2021);
  assert.deepEqual(first.patches[0]?.lineage, {
    fromYear: 2020,
    toYear: 2021,
    observationYear: 2021,
    gridId: "synthetic-grid",
    sourceCellValue: 1,
  });
  assert.match(first.patches[0]?.id ?? "", /^detected-change-2021-[0-9a-f]{24}$/);
});

test("eight-connectivity is explicit and only changes component membership", () => {
  const output = rasterToChangeVector(raster(), { connectivity: 8 });
  assert.equal(output.connectivity, 8);
  assert.equal(output.connectivityVersion, "8-connected-v1");
  assert.deepEqual(output.patches.map((patch) => patch.cellIndices), [[0, 1, 5, 7, 10]]);
  assert.equal(output.patches[0]?.areaHectares, 0.45);
});

test("interval/year ambiguity, missing CRS, invalid nodata/cells, and unbounded input fail closed", () => {
  assert.throws(() => rasterToChangeVector(raster({ toYear: 2022 })), /adjacent annual interval|ambiguous observation-year lineage/);
  assert.throws(() => rasterToChangeVector(raster({ crs: "" })), /CRS/);
  assert.throws(() => rasterToChangeVector(raster({ crs: "EPSG:4326" })), /projected/);
  assert.throws(() => rasterToChangeVector(raster({ linearUnit: "degree" as "metre" })), /linear unit/);
  assert.throws(() => rasterToChangeVector(raster({ observationYear: 2020 })), /Observation year/);
  assert.throws(() => rasterToChangeVector(raster({ noDataValue: 1 })), /nodata/);
  assert.throws(() => rasterToChangeVector(raster({ cells: [2, ...raster().cells.slice(1)] })), /declared nodata/);
  assert.throws(
    () => rasterToChangeVector(raster({ width: MAX_NONPRODUCTION_RASTER_CELLS + 1, height: 1, cells: [] })),
    /bounded non-production limit/,
  );
});

test("a source raster checksum is copied into the output and every patch lineage", () => {
  const sourceRasterSha256 = "a".repeat(64);
  const output = rasterToChangeVector(raster({ sourceRasterSha256 }));
  assert.equal(output.sourceRasterSha256, sourceRasterSha256);
  assert.equal(output.patches[0]?.lineage.sourceRasterSha256, sourceRasterSha256);
});
