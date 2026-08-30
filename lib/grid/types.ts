import type { LocalizedString } from "../domain/localized";

/**
 * The canonical VLCE2 raster grid, and the three hazards its type system refuses to
 * express. Nothing in this module opens a file, reprojects geometry, reads pixels, or
 * touches object storage. It records verified grid identity and rejects the operations
 * that would silently produce a false public number.
 */

export const RASTER_GRID_CRS_ID = "vlce2-lcc-nad83" as const;
export const BOUNDARY_CRS_ID = "statcan-lambert-nad83" as const;

export type RasterGridCrsId = typeof RASTER_GRID_CRS_ID;
export type BoundaryCrsId = typeof BOUNDARY_CRS_ID;
export type GeospatialCrsId = RasterGridCrsId | BoundaryCrsId;

export const RASTER_GRID_CRS_PROJ4 =
  "+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs";
export const BOUNDARY_CRS_PROJ4 =
  "+proj=lcc +lat_0=63.390675 +lon_0=-91.8666666666667 +lat_1=49 +lat_2=77 +x_0=6200000 +y_0=3000000 +datum=NAD83 +units=m +no_defs";

/** `[originX, pixelWidth, rowRotation, originY, columnRotation, pixelHeight]`. */
export type Geotransform = readonly [number, number, number, number, number, number];

export const LAND_COVER_CLASS_VALUES = [0, 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230] as const;

export type LandCoverClassValue = (typeof LAND_COVER_CLASS_VALUES)[number];

export const FIRST_COVERED_YEAR = 1984;
/** The staged series ends at 2022. Coverage past 2022 is Unknown and is never implied. */
export const LAST_COVERED_YEAR = 2022;
export const COVERED_YEAR_COUNT = 39;

/**
 * The one grid identity every VLCE2 year was verified to share. Any year that differs in
 * CRS, geotransform, or dimensions is not on this grid and cannot enter a comparison.
 */
export type CanonicalGrid = Readonly<{
  crsId: RasterGridCrsId;
  crsProj4: string;
  geotransform: Geotransform;
  width: number;
  height: number;
  pixelSizeMetres: number;
  bandCount: number;
  dataType: "Byte";
  noDataValue: number;
}>;

/**
 * A single VLCE2 year as read from its GeoTIFF header.
 *
 * `resampled` is typed `false` and has no other inhabitant. The cell values are
 * categorical class codes, so averaging or interpolating them fabricates classes that are
 * not in the source; a resampled categorical year therefore cannot be written down at all.
 */
export type RasterYearHeader = Readonly<{
  year: number;
  crsId: RasterGridCrsId;
  crsProj4: string;
  geotransform: Geotransform;
  width: number;
  height: number;
  bandCount: number;
  dataType: "Byte";
  noDataValue: number;
  resampled: false;
}>;

/**
 * A year proven to sit on the canonical grid. Only `assertGridConformance` produces one,
 * and only this type is admitted to a change comparison.
 */
export type ConformantRasterYear = RasterYearHeader &
  Readonly<{
    conformsToCanonicalGrid: true;
  }>;

export type GridDeviation = Readonly<{
  year: number;
  field: "crs" | "geotransform" | "dimensions" | "band" | "nodata" | "resampling";
  expected: string;
  observed: string;
  message: LocalizedString;
}>;

/**
 * The only reprojection this contract admits: boundary vectors move onto the raster grid.
 * `from` is pinned to the boundary CRS and `to` to the raster grid CRS, so the reverse
 * direction. Warping the categorical raster into the boundary CRS has no representable
 * value and cannot be requested.
 */
export type ReprojectionDirection = Readonly<{
  from: BoundaryCrsId;
  to: RasterGridCrsId;
}>;

/** A boundary vector layer as published: still in the boundary CRS, not yet grid aligned. */
export type BoundaryCrsVectorLayer = Readonly<{
  layerId: string;
  featureCount: number;
  crsId: BoundaryCrsId;
  crsProj4: string;
  reprojectedFrom: null;
}>;

/** A boundary vector layer that has been reprojected onto the raster grid CRS. */
export type GridAlignedVectorLayer = Readonly<{
  layerId: string;
  featureCount: number;
  crsId: RasterGridCrsId;
  crsProj4: string;
  reprojectedFrom: BoundaryCrsId;
  reprojection: ReprojectionDirection;
}>;

/**
 * A raster-to-vector intersection request. The vector side is typed
 * `GridAlignedVectorLayer`, so a layer still carrying the boundary CRS does not type-check
 * and the ~6,000 km disjoint overlay cannot be expressed.
 */
export type RasterVectorIntersection = Readonly<{
  year: number;
  layerId: string;
  crsId: RasterGridCrsId;
  featureCount: number;
  rasterResampled: false;
  vectorReprojectedFrom: BoundaryCrsId;
  /** Always false: this contract plans an intersection, it does not compute one. */
  intersectionComputed: false;
  limitation: LocalizedString;
  productionEligible: false;
}>;

export type ChangeComparison = Readonly<{
  fromYear: number;
  toYear: number;
  crsId: RasterGridCrsId;
  width: number;
  height: number;
  pixelSizeMetres: number;
  /** Always false: no pixels were read. */
  pixelsCompared: false;
  limitation: LocalizedString;
  productionEligible: false;
}>;

/** The `.tif.vat.dbf` sidecar as observed on disk, plus whatever rows it actually held. */
export type VatSidecar = Readonly<{
  year: number;
  byteLength: number;
  recordCount: number;
  counts: Readonly<Record<string, number>>;
}>;

/**
 * A per-class area is either read from a populated sidecar or explicitly Unknown with a
 * reason. There is no third state and no default: an empty sidecar never yields `0`,
 * because `0` would read as "no land of that class existed that year".
 */
export type ClassArea =
  | Readonly<{ kind: "known"; classValue: LandCoverClassValue; pixelCount: number; hectares: number }>
  | Readonly<{ kind: "unknown"; classValue: LandCoverClassValue; reason: LocalizedString }>;

/** A class list is either read from a populated sidecar or explicitly Unknown with a reason. */
export type ClassList =
  | Readonly<{ kind: "known"; year: number; classValues: readonly LandCoverClassValue[] }>
  | Readonly<{ kind: "unknown"; year: number; reason: LocalizedString }>;
