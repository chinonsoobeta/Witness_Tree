import assert from "node:assert/strict";
import test from "node:test";
import {
  assertGridConformance,
  compareChangeBetweenYears,
  classAreaFromVat,
  declareReprojectedToGrid,
  planRasterVectorIntersection,
  requireClassArea,
  BOUNDARY_CRS_ID,
  BOUNDARY_CRS_PROJ4,
  RASTER_GRID_CRS_ID,
  RASTER_GRID_CRS_PROJ4,
} from "@/lib/grid";
import type {
  BoundaryCrsVectorLayer,
  ClassArea,
  ConformantRasterYear,
  RasterYearHeader,
  ReprojectionDirection,
  VatSidecar,
} from "@/lib/grid";

/**
 * Compile-time proof that the three geospatial hazards cannot be written down.
 *
 * Each `@ts-expect-error` below is load-bearing: deleting one makes `tsc --noEmit` report
 * an unused expect-error directive, and deleting the directive plus keeping the line makes
 * `tsc` report the underlying hazard.
 */

const conformant2022: ConformantRasterYear = assertGridConformance({
  year: 2022,
  crsId: RASTER_GRID_CRS_ID,
  crsProj4: RASTER_GRID_CRS_PROJ4,
  geotransform: [-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0],
  width: 193936,
  height: 128340,
  bandCount: 1,
  dataType: "Byte",
  noDataValue: 255,
  resampled: false,
});

const conformant1984: ConformantRasterYear = assertGridConformance({ ...conformant2022, year: 1984 });

const boundaryLayer: BoundaryCrsVectorLayer = {
  layerId: "FED_CA_2023_EN",
  featureCount: 343,
  crsId: BOUNDARY_CRS_ID,
  crsProj4: BOUNDARY_CRS_PROJ4,
  reprojectedFrom: null,
};

const gridAligned = declareReprojectedToGrid(boundaryLayer);

// Hazard (a): the intersection is expressible only once the vector side declares it has
// been reprojected onto the raster grid CRS.
const intersection = planRasterVectorIntersection(conformant2022, gridAligned);

test("a boundary-CRS vector layer cannot be intersected at runtime", () => {
  assert.throws(() => {
    // @ts-expect-error A boundary-CRS vector layer has not been reprojected onto the raster grid and cannot be intersected.
    planRasterVectorIntersection(conformant2022, boundaryLayer);
  }, /has not been reprojected to the VLCE2 grid coordinate reference system/);
});

// @ts-expect-error The only admitted direction moves vectors onto the raster grid; the raster is never reprojected into the boundary CRS.
const reversedDirection: ReprojectionDirection = { from: RASTER_GRID_CRS_ID, to: BOUNDARY_CRS_ID };

// @ts-expect-error The VLCE2 cells are categorical class codes, so a resampled raster year has no representable value.
const resampledYear: RasterYearHeader = { ...conformant2022, resampled: true };

// @ts-expect-error An intersection plan never computes an intersection and is never production eligible.
const computedIntersection: { intersectionComputed: true } = intersection;

// Hazard (b): a class area from the empty 1991 sidecar is Unknown, so it has no number to read.
const emptyVat1991: VatSidecar = { year: 1991, byteLength: 98, recordCount: 0, counts: {} };
const area1991: ClassArea = classAreaFromVat(emptyVat1991, 210);

// @ts-expect-error An Unknown class area carries no hectares; it must not be read as a number, and never as 0.
const fabricatedHectares: number = area1991.hectares;

// @ts-expect-error A class area is Unknown or known; there is no zero-filled third state.
const zeroFilled: ClassArea = { kind: "empty", classValue: 210, hectares: 0 };

// Hazard (c): only a year proven to sit on the canonical grid enters a change comparison.
const comparison = compareChangeBetweenYears(conformant1984, conformant2022);

test("an unchecked raster year cannot enter a change comparison at runtime", () => {
  assert.throws(() => {
    // @ts-expect-error A raster year that was never checked against the canonical grid cannot enter a change comparison.
    compareChangeBetweenYears(conformant1984, {
      year: 2021,
      crsId: RASTER_GRID_CRS_ID,
      crsProj4: RASTER_GRID_CRS_PROJ4,
      geotransform: [-2660910.524, 30.0, 0.0, 2998848.1105, 0.0, -30.0],
      width: 193936,
      height: 128340,
      bandCount: 1,
      dataType: "Byte",
      noDataValue: 255,
      resampled: false,
    });
  }, /has not been checked against the canonical VLCE2 grid/);
});

// @ts-expect-error A grid-identity comparison reads no pixels and is never production eligible.
const pixelsCompared: { pixelsCompared: true } = comparison;

void intersection;
void reversedDirection;
void resampledYear;
void computedIntersection;
void requireClassArea;
void fabricatedHectares;
void zeroFilled;
void comparison;
void pixelsCompared;
