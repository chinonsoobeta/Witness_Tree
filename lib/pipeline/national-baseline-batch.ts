import { createHash } from "node:crypto";

import { validateMethodManifest, type MethodParameterManifest } from "./method-manifest";

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
  methodParameterSha256: string;
  forestDefinitionVersion: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
  productionEligible: false;
  forestClassValues: readonly number[];
  inputs: Readonly<{
    landCover: Readonly<{ path: string; sha256: string }>;
    boundaryCrosswalk: Readonly<{ path: string; sha256: string }>;
    methodParameters: Readonly<{ path: string; sha256: string }>;
  }>;
}>;

export type ForestMaskYear = Readonly<{ year: number; cells: readonly (0 | 1 | 255)[] }>;

export type DetectedChangeGeometry = Readonly<{
  type: "MultiPolygon";
  crsId: string;
  coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[];
}>;

export type DetectedChangeEvent = Readonly<{
  status: "example";
  eventId: string;
  category: "detected-change";
  evidence: "satellite-observation";
  observationYear: number;
  eventStart: string;
  eventEnd: string;
  geometry: DetectedChangeGeometry;
  areaHectares: number;
  cellIndices: readonly number[];
  lineage: Readonly<{
    batchId: string;
    fromYear: number;
    toYear: number;
    fromMaskSha256: string;
    toMaskSha256: string;
    fromMaskValue: 1;
    toMaskValue: 0;
  }>;
  methodVersion: string;
  methodParameterSha256: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
  patchChecksumSha256: string;
  productionEligible: false;
}>;

export type DetectedChangeYear = Readonly<{
  fromYear: number;
  toYear: number;
  events: readonly DetectedChangeEvent[];
  unresolvedNodataCellIndices: readonly number[];
}>;

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
  methodParameterSha256: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
}>;

export type BaselineBatchResult = Readonly<{
  masks: readonly ForestMaskYear[];
  aggregates: readonly ForestAggregate[];
  detectedChange: readonly DetectedChangeYear[];
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
  if (manifest.schemaVersion !== 1 || !manifest.batchId.trim() || !manifest.methodVersion.trim() || !SHA256.test(manifest.methodParameterSha256) || !manifest.forestDefinitionVersion.trim() || !manifest.dataVersion.trim()) {
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
  if (Object.keys(manifest.inputs).length !== 3) throw new Error("Baseline manifest accepts exactly the land-cover, boundary-crosswalk, and method-parameter inputs.");
}

export function validateBatchMethodBinding(manifest: BaselineBatchManifest, methodManifest: MethodParameterManifest): void {
  const identity = validateMethodManifest(methodManifest);
  const methodClasses = methodManifest.parameters.mask.forestClassValues;
  if (manifest.methodVersion !== identity.methodVersion || manifest.methodParameterSha256 !== identity.parameterSha256) {
    throw new Error("Baseline batch must bind the exact validated method version and parameter SHA-256.");
  }
  if (manifest.forestClassValues.length !== methodClasses.length || manifest.forestClassValues.some((value, index) => value !== methodClasses[index])) {
    throw new Error("Baseline forest classes must match the exact ordered method crosswalk.");
  }
  const vectorization = methodManifest.parameters.vectorization;
  if (vectorization.connectivity !== 4 || vectorization.minimumPatchPixels !== 1 || vectorization.simplifyToleranceMetres !== 0 || vectorization.dissolveAdjacentCells !== false) {
    throw new Error("The executable batch currently requires four-neighbour, one-pixel, unsimplified, non-dissolved patch parameters.");
  }
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

function coordinate(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cellPolygon(grid: BaselineGrid, cellIndex: number): readonly (readonly [number, number])[] {
  const row = Math.floor(cellIndex / grid.width);
  const column = cellIndex % grid.width;
  const [originX, pixelWidth, , originY, , pixelHeight] = grid.geotransform;
  const left = coordinate(originX + column * pixelWidth);
  const right = coordinate(left + pixelWidth);
  const top = coordinate(originY + row * pixelHeight);
  const bottom = coordinate(top + pixelHeight);
  return Object.freeze([
    Object.freeze([left, top] as const),
    Object.freeze([right, top] as const),
    Object.freeze([right, bottom] as const),
    Object.freeze([left, bottom] as const),
    Object.freeze([left, top] as const),
  ]);
}

export function geometryForGridCells(grid: BaselineGrid, cellIndices: readonly number[]): DetectedChangeGeometry {
  const geometry = Object.freeze({
    type: "MultiPolygon" as const,
    crsId: grid.crsId,
    coordinates: Object.freeze(cellIndices.map((cellIndex) => Object.freeze([cellPolygon(grid, cellIndex)]))),
  });
  validateDetectedChangeGeometry(geometry, cellIndices.length);
  return geometry;
}

function connectedPatches(lossCells: ReadonlySet<number>, width: number, height: number): readonly (readonly number[])[] {
  const remaining = new Set(lossCells);
  const patches: number[][] = [];
  while (remaining.size > 0) {
    let start = Number.POSITIVE_INFINITY;
    for (const cell of remaining) if (cell < start) start = cell;
    remaining.delete(start);
    const queue = [start];
    const patch: number[] = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor]!;
      patch.push(cell);
      const row = Math.floor(cell / width);
      const column = cell % width;
      const neighbours = [
        column > 0 ? cell - 1 : -1,
        column + 1 < width ? cell + 1 : -1,
        row > 0 ? cell - width : -1,
        row + 1 < height ? cell + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && remaining.delete(neighbour)) queue.push(neighbour);
      }
    }
    patches.push(patch.sort((a, b) => a - b));
  }
  return Object.freeze(patches.map((patch) => Object.freeze(patch)));
}

export function validateDetectedChangeGeometry(geometry: DetectedChangeGeometry, expectedCells: number): void {
  if (geometry.type !== "MultiPolygon" || !geometry.crsId.trim() || geometry.coordinates.length !== expectedCells || expectedCells <= 0) {
    throw new Error("Detected-change geometry requires one polygon per source mask cell.");
  }
  for (const polygon of geometry.coordinates) {
    if (polygon.length !== 1 || polygon[0]!.length !== 5) throw new Error("Detected-change geometry cell polygon is invalid.");
    const ring = polygon[0]!;
    if (ring.some((position) => position.length !== 2 || !position.every(Number.isFinite)) || ring[0]![0] !== ring[4]![0] || ring[0]![1] !== ring[4]![1]) {
      throw new Error("Detected-change geometry cell ring must be finite and closed.");
    }
    if (ring[0]![1] !== ring[1]![1] || ring[1]![0] !== ring[2]![0] || ring[2]![1] !== ring[3]![1] || ring[3]![0] !== ring[0]![0] || ring[0]![0] === ring[1]![0] || ring[1]![1] === ring[2]![1]) {
      throw new Error("Detected-change geometry cell ring must be a non-degenerate grid rectangle.");
    }
    const twiceArea = ring.slice(0, -1).reduce((sum, point, index) => {
      const next = ring[(index + 1) % 4]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0);
    if (!Number.isFinite(twiceArea) || twiceArea === 0) throw new Error("Detected-change geometry cell ring must have non-zero area.");
  }
}

export function buildDetectedChangeSpine(manifest: BaselineBatchManifest, methodManifest: MethodParameterManifest, grid: BaselineGrid, masks: readonly ForestMaskYear[]): readonly DetectedChangeYear[] {
  validateBaselineManifest(manifest);
  validateBatchMethodBinding(manifest, methodManifest);
  validateGrid(grid, "Detected-change grid");
  const cellCount = grid.width * grid.height;
  const ordered = [...masks].sort((a, b) => a.year - b.year);
  const seenYears = new Set<number>();
  for (const mask of ordered) {
    if (!Number.isSafeInteger(mask.year) || seenYears.has(mask.year) || mask.cells.length !== cellCount || mask.cells.some((value) => value !== 0 && value !== 1 && value !== 255)) {
      throw new Error("Detected-change masks require unique integer years and exactly one valid value per grid cell.");
    }
    seenYears.add(mask.year);
  }
  const pixelHectares = Math.abs(grid.geotransform[1] * grid.geotransform[5]) / 10_000;
  const result: DetectedChangeYear[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.year !== previous.year + 1) throw new Error("Detected-change masks must form a continuous annual series.");
    const lossCells = new Set<number>();
    const nodataCells: number[] = [];
    const fromMaskSha256 = sha256(stableJson(previous));
    const toMaskSha256 = sha256(stableJson(current));
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const from = previous.cells[cellIndex]!;
      const to = current.cells[cellIndex]!;
      if (from === 255 || to === 255) nodataCells.push(cellIndex);
      else if (from === 1 && to === 0) lossCells.add(cellIndex);
    }
    const events = connectedPatches(lossCells, grid.width, grid.height).map((cellIndices): DetectedChangeEvent => {
      const geometry = geometryForGridCells(grid, cellIndices);
      const core = {
        batchId: manifest.batchId,
        methodVersion: manifest.methodVersion,
        methodParameterSha256: manifest.methodParameterSha256,
        dataVersion: manifest.dataVersion,
        fromYear: previous.year,
        toYear: current.year,
        grid,
        cellIndices,
        geometry,
      };
      const patchChecksumSha256 = sha256(stableJson(core));
      return Object.freeze({
        status: "example",
        eventId: `detected-change-${current.year}-${patchChecksumSha256.slice(0, 24)}`,
        category: "detected-change",
        evidence: "satellite-observation",
        observationYear: current.year,
        eventStart: `${current.year}-01-01`,
        eventEnd: `${current.year}-12-31`,
        geometry,
        areaHectares: roundHectares(cellIndices.length * pixelHectares),
        cellIndices,
        lineage: Object.freeze({ batchId: manifest.batchId, fromYear: previous.year, toYear: current.year, fromMaskSha256, toMaskSha256, fromMaskValue: 1, toMaskValue: 0 }),
        methodVersion: manifest.methodVersion,
        methodParameterSha256: manifest.methodParameterSha256,
        dataVersion: manifest.dataVersion,
        coverageGrade: manifest.coverageGrade,
        patchChecksumSha256,
        productionEligible: false,
      });
    });
    result.push(Object.freeze({
      fromYear: previous.year,
      toYear: current.year,
      events: Object.freeze(events),
      unresolvedNodataCellIndices: Object.freeze(nodataCells),
    }));
  }
  return Object.freeze(result);
}

export function runBaselineBatch(manifest: BaselineBatchManifest, methodManifest: MethodParameterManifest, landCover: LandCoverInput, crosswalk: BoundaryCrosswalkInput): BaselineBatchResult {
  validateBaselineManifest(manifest);
  validateBatchMethodBinding(manifest, methodManifest);
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
        methodParameterSha256: manifest.methodParameterSha256,
        dataVersion: manifest.dataVersion,
        coverageGrade: manifest.coverageGrade,
      }));
    }
  }
  const frozenMasks = Object.freeze(masks);
  return Object.freeze({ masks: frozenMasks, aggregates: Object.freeze(aggregates), detectedChange: buildDetectedChangeSpine(manifest, methodManifest, landCover.grid, frozenMasks) });
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical pipeline inputs cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(",")}}`;
  }
  throw new Error("Canonical pipeline inputs must contain JSON values only.");
}

export function canonicalJson(value: unknown): string {
  return `${canonicalValue(value)}\n`;
}

export function boundaryCrosswalkSha256(crosswalk: BoundaryCrosswalkInput): string {
  return sha256(canonicalJson(crosswalk));
}
