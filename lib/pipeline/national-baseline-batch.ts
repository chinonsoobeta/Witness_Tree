import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;

export type BaselineGrid = Readonly<{
  crsId: string;
  linearUnit: "metre";
  geotransform: readonly [number, number, number, number, number, number];
  width: number;
  height: number;
  noDataValue: number;
}>;

export type LandCoverInput = Readonly<{
  schemaVersion: 1;
  grid: BaselineGrid;
  years: readonly Readonly<{ year: number; cells: readonly number[] }>[];
}>;

export type BoundaryCrosswalkInput = Readonly<{
  schemaVersion: 1;
  grid: BaselineGrid;
  boundaryEdition: string;
  boundaries: readonly Readonly<{ boundaryId: string; geographyType: string; province: string }>[];
  intersections: readonly Readonly<{ boundaryId: string; cellIndex: number; cellFraction: number }>[];
}>;

export type BaselineBatchManifest = Readonly<{
  schemaVersion: 1;
  batchId: string;
  methodVersion: string;
  forestDefinitionVersion: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
  productionEligible: false;
  forestClassValues: readonly number[];
  inputs: Readonly<{
    landCover: Readonly<{ path: string; sha256: string }>;
    boundaryCrosswalk: Readonly<{ path: string; sha256: string }>;
  }>;
}>;

export type ForestMaskYear = Readonly<{ year: number; cells: readonly (0 | 1 | 255)[] }>;

export type ForestAggregate = Readonly<{
  boundaryId: string;
  geographyType: string;
  province: string;
  boundaryEdition: string;
  year: number;
  forestedHectares: number;
  denominator: "forested-hectares";
  forestDefinitionVersion: string;
  methodVersion: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
}>;

export type BaselineBatchResult = Readonly<{
  masks: readonly ForestMaskYear[];
  aggregates: readonly ForestAggregate[];
}>;

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function validateGrid(grid: BaselineGrid, label: string): void {
  if (!grid.crsId.trim() || grid.linearUnit !== "metre" || !Number.isSafeInteger(grid.width) || grid.width <= 0 || !Number.isSafeInteger(grid.height) || grid.height <= 0) {
    throw new Error(`${label} requires a metre-based CRS and positive integer dimensions.`);
  }
  if (grid.geotransform.length !== 6) throw new Error(`${label} requires a six-value geotransform.`);
  grid.geotransform.forEach((value, index) => finite(value, `${label} geotransform ${index}`));
  finite(grid.noDataValue, `${label} nodata`);
  if (grid.geotransform[2] !== 0 || grid.geotransform[4] !== 0 || grid.geotransform[1] <= 0 || grid.geotransform[5] >= 0) {
    throw new Error(`${label} must be a north-up grid with positive x and negative y pixel size.`);
  }
}

function sameGrid(first: BaselineGrid, second: BaselineGrid): boolean {
  return first.crsId === second.crsId && first.linearUnit === second.linearUnit && first.width === second.width && first.height === second.height && first.noDataValue === second.noDataValue &&
    first.geotransform.every((value, index) => value === second.geotransform[index]);
}

export function validateBaselineManifest(manifest: BaselineBatchManifest): void {
  if (manifest.schemaVersion !== 1 || !manifest.batchId.trim() || !manifest.methodVersion.trim() || !manifest.forestDefinitionVersion.trim() || !manifest.dataVersion.trim()) {
    throw new Error("Baseline manifest requires versioned batch, method, forest definition, and data identity.");
  }
  if (manifest.coverageGrade !== "national-baseline" || manifest.productionEligible !== false) {
    throw new Error("This owner-independent batch is national-baseline and non-production only.");
  }
  if (manifest.forestClassValues.length === 0 || new Set(manifest.forestClassValues).size !== manifest.forestClassValues.length || manifest.forestClassValues.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("The method must provide a non-empty, unique integer forest-class crosswalk.");
  }
  for (const [name, input] of Object.entries(manifest.inputs)) {
    if (!input.path.trim() || input.path.startsWith("/") || input.path.split(/[\\/]/).includes("..") || !SHA256.test(input.sha256)) {
      throw new Error(`${name} input requires a safe relative path and lowercase SHA-256.`);
    }
  }
  if (Object.keys(manifest.inputs).length !== 2) throw new Error("Baseline manifest accepts exactly the land-cover and boundary-crosswalk inputs.");
}

export function validateBaselineInputs(landCover: LandCoverInput, crosswalk: BoundaryCrosswalkInput): void {
  if (landCover.schemaVersion !== 1 || crosswalk.schemaVersion !== 1) throw new Error("Baseline inputs require schema version 1.");
  validateGrid(landCover.grid, "Land-cover grid");
  validateGrid(crosswalk.grid, "Boundary crosswalk grid");
  if (!sameGrid(landCover.grid, crosswalk.grid)) throw new Error("Boundary intersections must use the exact land-cover grid; implicit reprojection is forbidden.");
  if (!crosswalk.boundaryEdition.trim() || crosswalk.boundaries.length === 0) throw new Error("Boundary crosswalk requires a versioned edition and boundaries.");

  const cellCount = landCover.grid.width * landCover.grid.height;
  const years = new Set<number>();
  for (const year of landCover.years) {
    if (!Number.isSafeInteger(year.year) || years.has(year.year) || year.cells.length !== cellCount) throw new Error("Land-cover years must be unique integers with one value per grid cell.");
    year.cells.forEach((value) => finite(value, `Land-cover ${year.year} cell`));
    years.add(year.year);
  }
  if (years.size === 0) throw new Error("Land-cover input requires at least one year.");
  const orderedYears = [...years].sort((a, b) => a - b);
  for (let index = 1; index < orderedYears.length; index += 1) {
    if (orderedYears[index] !== orderedYears[index - 1]! + 1) throw new Error("Land-cover input must be a continuous annual series with no missing year.");
  }

  const boundaryIds = new Set<string>();
  for (const boundary of crosswalk.boundaries) {
    if (!boundary.boundaryId.trim() || boundaryIds.has(boundary.boundaryId) || !boundary.geographyType.trim() || !boundary.province.trim()) throw new Error("Boundaries require unique IDs, geography types, and provinces.");
    boundaryIds.add(boundary.boundaryId);
  }
  const pairs = new Set<string>();
  for (const row of crosswalk.intersections) {
    finite(row.cellFraction, "Cell fraction");
    const pair = `${row.boundaryId}\0${row.cellIndex}`;
    if (!boundaryIds.has(row.boundaryId) || !Number.isSafeInteger(row.cellIndex) || row.cellIndex < 0 || row.cellIndex >= cellCount || row.cellFraction <= 0 || row.cellFraction > 1 || pairs.has(pair)) {
      throw new Error("Each boundary-cell intersection must be unique, in-grid, and have a fraction in (0, 1].");
    }
    pairs.add(pair);
  }
}

function roundHectares(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function runBaselineBatch(manifest: BaselineBatchManifest, landCover: LandCoverInput, crosswalk: BoundaryCrosswalkInput): BaselineBatchResult {
  validateBaselineManifest(manifest);
  validateBaselineInputs(landCover, crosswalk);

  const forestClasses = new Set(manifest.forestClassValues);
  if (forestClasses.has(landCover.grid.noDataValue)) throw new Error("The nodata value cannot be a forest class.");
  const pixelHectares = Math.abs(landCover.grid.geotransform[1] * landCover.grid.geotransform[5]) / 10_000;
  const rowsByBoundary = new Map<string, readonly Readonly<{ cellIndex: number; cellFraction: number }>[] >();
  for (const boundary of crosswalk.boundaries) {
    rowsByBoundary.set(boundary.boundaryId, crosswalk.intersections.filter((row) => row.boundaryId === boundary.boundaryId));
  }

  const masks = [...landCover.years].sort((a, b) => a.year - b.year).map((year) => Object.freeze({
    year: year.year,
    cells: Object.freeze(year.cells.map((value): 0 | 1 | 255 => value === landCover.grid.noDataValue ? 255 : forestClasses.has(value) ? 1 : 0)),
  }));
  const aggregates: ForestAggregate[] = [];
  for (const mask of masks) {
    for (const boundary of [...crosswalk.boundaries].sort((a, b) => a.boundaryId.localeCompare(b.boundaryId))) {
      const hectares = (rowsByBoundary.get(boundary.boundaryId) ?? []).reduce((sum, row) => sum + (mask.cells[row.cellIndex] === 1 ? row.cellFraction * pixelHectares : 0), 0);
      aggregates.push(Object.freeze({
        boundaryId: boundary.boundaryId,
        geographyType: boundary.geographyType,
        province: boundary.province,
        boundaryEdition: crosswalk.boundaryEdition,
        year: mask.year,
        forestedHectares: roundHectares(hectares),
        denominator: "forested-hectares",
        forestDefinitionVersion: manifest.forestDefinitionVersion,
        methodVersion: manifest.methodVersion,
        dataVersion: manifest.dataVersion,
        coverageGrade: manifest.coverageGrade,
      }));
    }
  }
  return Object.freeze({ masks: Object.freeze(masks), aggregates: Object.freeze(aggregates) });
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
