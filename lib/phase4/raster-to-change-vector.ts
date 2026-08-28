import { createHash } from "node:crypto";

/**
 * A deliberately small, local contract for turning a binary annual change
 * raster into patch-shaped detected changes.  It does not read files,
 * reproject, resample, dissolve, or claim production eligibility.
 *
 * A whole-interval raster cannot be used here.  Its value of 1 says that a
 * change occurred somewhere between two snapshots, but does not say which
 * observation year owns the change.  This contract therefore accepts exactly
 * one adjacent annual pair and carries the pair's end year as the
 * observation year.
 */

export const RASTER_TO_CHANGE_VECTOR_SCHEMA = "witness-tree/phase4-raster-to-change-vector/1" as const;
export const RASTER_TO_CHANGE_VECTOR_METHOD_VERSION = "phase4-raster-to-change-vector-v1" as const;
export const DEFAULT_PATCH_CONNECTIVITY = 4 as const;

/**
 * One 1024 x 1024 window is a useful upper bound for a pure local fixture and
 * prevents this implementation from being mistaken for a national executor.
 */
export const MAX_NONPRODUCTION_RASTER_CELLS = 1024 * 1024;

export type PatchConnectivity = 4 | 8;
export type ConnectivityVersion = "4-connected-v1" | "8-connected-v1";
export type Geotransform = readonly [number, number, number, number, number, number];
type Position = readonly [number, number];
type LinearRing = readonly Position[];
type PolygonCoordinates = readonly LinearRing[];
type MultiPolygonCoordinates = readonly PolygonCoordinates[];

export type RasterToChangeVectorInput = Readonly<{
  /** The annual pair represented by this raster. `toYear` must equal `fromYear + 1`. */
  fromYear: number;
  toYear: number;
  /** Optional explicit lineage; when supplied it must equal `toYear`. */
  observationYear?: number;
  width: number;
  height: number;
  gridId: string;
  /** Full CRS text/identifier. It is required; no CRS is guessed. */
  crs: string;
  /** Required because affine area is converted from square metres to hectares. */
  linearUnit: "metre";
  geotransform: Geotransform;
  noDataValue: number;
  /** 0 means no observed change, 1 means observed change, nodata stays unknown. */
  cells: readonly number[];
  /** Optional source identity carried into patch lineage when available. */
  sourceRasterSha256?: string;
}>;

export type CellPolygonGeometry = Readonly<{
  type: "MultiPolygon";
  /** One unsimplified cell polygon per changed cell, in canonical cell order. */
  coordinates: MultiPolygonCoordinates;
  crs: string;
  linearUnit: "metre";
}>;

export type ChangePatchLineage = Readonly<{
  fromYear: number;
  toYear: number;
  observationYear: number;
  gridId: string;
  sourceCellValue: 1;
  sourceRasterSha256?: string;
}>;

export type ChangePatch = Readonly<{
  id: string;
  /** Stable zero-based order: ascending first cell index (row-major). */
  patchIndex: number;
  observationYear: number;
  fromYear: number;
  toYear: number;
  cellIndices: readonly number[];
  geometry: CellPolygonGeometry;
  cellCount: number;
  areaHectares: number;
  /** Alias matching the existing DetectedChange contract. */
  geometryHectares: number;
  patchChecksumSha256: string;
  lineage: ChangePatchLineage;
}>;

/** The small, auditable part of a patch carried across the spatial-join seam. */
export type ChangePatchBinding = Readonly<Pick<ChangePatch, "patchIndex" | "patchChecksumSha256" | "lineage">>;

export type RasterToChangeVectorOutput = Readonly<{
  schemaVersion: typeof RASTER_TO_CHANGE_VECTOR_SCHEMA;
  status: "computed-nonproduction";
  productionEligible: false;
  released: false;
  methodVersion: typeof RASTER_TO_CHANGE_VECTOR_METHOD_VERSION;
  connectivity: PatchConnectivity;
  connectivityVersion: ConnectivityVersion;
  geometryPolicy: "one-unsimplified-cell-polygon-per-change-cell";
  fromYear: number;
  toYear: number;
  observationYear: number;
  width: number;
  height: number;
  gridId: string;
  crs: string;
  linearUnit: "metre";
  geotransform: Geotransform;
  noDataValue: number;
  sourceRasterSha256?: string;
  cellAreaHectares: number;
  changedCellCount: number;
  nodataCellCount: number;
  unchangedCellCount: number;
  changedAreaHectares: number;
  patches: readonly ChangePatch[];
}>;

export type RasterToChangeVectorOptions = Readonly<{
  connectivity?: PatchConnectivity;
}>;

export type ChangePatchChecksumInput = Readonly<{
  connectivity: PatchConnectivity;
  connectivityVersion: ConnectivityVersion;
  fromYear: number;
  toYear: number;
  observationYear: number;
  width: number;
  height: number;
  gridId: string;
  crs: string;
  linearUnit: "metre";
  geotransform: Geotransform;
  noDataValue: number;
  cellIndices: readonly number[];
  sourceRasterSha256?: string;
}>;

type NormalizedInput = RasterToChangeVectorInput & Readonly<{ observationYear: number }>;

const SHA256 = /^[a-f0-9]{64}$/;

function requireInteger(value: unknown, label: string, minimum = 1): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function requireFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function connectivityVersion(connectivity: PatchConnectivity): ConnectivityVersion {
  return connectivity === 4 ? "4-connected-v1" : "8-connected-v1";
}

function validateSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lower-case SHA-256 digest.`);
  }
}

function validateGeotransform(value: unknown): asserts value is Geotransform {
  if (!Array.isArray(value) || value.length !== 6 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error("A raster-to-vector input requires a six-number geotransform.");
  }
  const [pixelWidth, rowRotation, columnRotation, pixelHeight] = [value[1], value[2], value[4], value[5]];
  if (Math.abs(pixelWidth * pixelHeight - rowRotation * columnRotation) === 0) {
    throw new Error("A raster-to-vector geotransform must describe cells with positive area.");
  }
}

/**
 * Validates and normalizes metadata before any cell work.  In particular, it
 * rejects a multi-year interval instead of assigning its changes an invented
 * observation year.
 */
export function assertRasterToChangeVectorInput(candidate: unknown): NormalizedInput {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("A raster-to-vector input object is required.");
  }
  const input = candidate as Partial<RasterToChangeVectorInput>;
  requireInteger(input.fromYear, "Raster fromYear");
  requireInteger(input.toYear, "Raster toYear");
  if (input.toYear !== input.fromYear + 1) {
    throw new Error("Raster-to-vector input must describe one adjacent annual interval; a multi-year interval has ambiguous observation-year lineage.");
  }
  if (input.observationYear !== undefined) {
    requireInteger(input.observationYear, "Observation year");
    if (input.observationYear !== input.toYear) {
      throw new Error("Observation year must equal the end year of the adjacent annual interval.");
    }
  }

  requireInteger(input.width, "Raster width");
  requireInteger(input.height, "Raster height");
  const cellCount = input.width * input.height;
  if (!Number.isSafeInteger(cellCount) || cellCount <= 0) throw new Error("Raster dimensions produce an invalid cell count.");
  if (cellCount > MAX_NONPRODUCTION_RASTER_CELLS) {
    throw new Error(`Raster exceeds the bounded non-production limit of ${MAX_NONPRODUCTION_RASTER_CELLS} cells.`);
  }

  requireText(input.gridId, "Raster grid identity");
  requireText(input.crs, "Raster CRS");
  if (/^(?:EPSG:)?4326$/i.test(input.crs.trim()) || /\b(?:longlat|latlong)\b/i.test(input.crs)) {
    throw new Error("Raster CRS must be projected before metre-based hectare area is computed.");
  }
  if (input.linearUnit !== "metre") throw new Error("Raster linear unit must be explicitly declared as metre before hectare area is computed.");
  validateGeotransform(input.geotransform);
  requireFinite(input.noDataValue, "Raster nodata value");
  if (!Number.isSafeInteger(input.noDataValue) || input.noDataValue === 0 || input.noDataValue === 1) {
    throw new Error("Raster nodata value must be an integer distinct from 0 and 1.");
  }
  if (!Array.isArray(input.cells) || input.cells.length !== cellCount) {
    throw new Error("Raster cell count does not match its dimensions.");
  }
  for (const [index, value] of input.cells.entries()) {
    if (value !== 0 && value !== 1 && value !== input.noDataValue) {
      throw new Error(`Raster cell ${index} must be 0, 1, or the declared nodata value ${input.noDataValue}.`);
    }
  }
  if (input.sourceRasterSha256 !== undefined) validateSha256(input.sourceRasterSha256, "Source raster SHA-256");

  return Object.freeze({
    ...input,
    fromYear: input.fromYear,
    toYear: input.toYear,
    observationYear: input.observationYear ?? input.toYear,
    width: input.width,
    height: input.height,
    gridId: input.gridId,
    crs: input.crs,
    geotransform: Object.freeze([...input.geotransform]) as Geotransform,
    cells: Object.freeze([...input.cells]),
  }) as NormalizedInput;
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Patch identity cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.some((key) => record[key] === undefined)) throw new Error("Patch identity cannot contain undefined values.");
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`).join(",")}}`;
  }
  throw new Error("Patch identity must contain JSON values only.");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(`${canonicalValue(value)}\n`).digest("hex");
}

/** Computes the canonical identity used by every generated change patch. */
export function computeChangePatchChecksum(input: ChangePatchChecksumInput): string {
  return sha256({
    schemaVersion: RASTER_TO_CHANGE_VECTOR_SCHEMA,
    methodVersion: RASTER_TO_CHANGE_VECTOR_METHOD_VERSION,
    connectivity: input.connectivity,
    connectivityVersion: input.connectivityVersion,
    fromYear: input.fromYear,
    toYear: input.toYear,
    observationYear: input.observationYear,
    width: input.width,
    height: input.height,
    gridId: input.gridId,
    crs: input.crs,
    linearUnit: input.linearUnit,
    geotransform: input.geotransform,
    noDataValue: input.noDataValue,
    cellIndices: input.cellIndices,
    ...(input.sourceRasterSha256 === undefined ? {} : { sourceRasterSha256: input.sourceRasterSha256 }),
  });
}

function gridPoint(input: NormalizedInput, column: number, row: number): [number, number] {
  const [originX, pixelWidth, rowRotation, originY, columnRotation, pixelHeight] = input.geotransform;
  const point: [number, number] = [
    originX + column * pixelWidth + row * rowRotation,
    originY + column * columnRotation + row * pixelHeight,
  ];
  if (!point.every(Number.isFinite)) throw new Error("Raster geotransform produces a non-finite cell coordinate.");
  return point;
}

function cellPolygon(input: NormalizedInput, cellIndex: number): readonly (readonly [number, number])[] {
  const row = Math.floor(cellIndex / input.width);
  const column = cellIndex % input.width;
  const corners = [
    gridPoint(input, column, row),
    gridPoint(input, column + 1, row),
    gridPoint(input, column + 1, row + 1),
    gridPoint(input, column, row + 1),
  ] as [number, number][];
  corners.push(corners[0]!);
  return Object.freeze(corners.map((point) => Object.freeze(point) as readonly [number, number]));
}

function patchGeometry(input: NormalizedInput, cells: readonly number[]): CellPolygonGeometry {
  const polygons: MultiPolygonCoordinates = cells.map((cell) => Object.freeze([cellPolygon(input, cell)]));
  return Object.freeze({
    type: "MultiPolygon" as const,
    coordinates: Object.freeze(polygons),
    crs: input.crs,
    linearUnit: input.linearUnit,
  });
}

function neighbourIndices(cell: number, input: NormalizedInput, connectivity: PatchConnectivity): readonly number[] {
  const row = Math.floor(cell / input.width);
  const column = cell % input.width;
  const offsets = connectivity === 4
    ? [[-1, 0], [0, -1], [0, 1], [1, 0]]
    : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  return offsets
    .map(([rowOffset, columnOffset]) => [row + rowOffset, column + columnOffset] as const)
    .filter(([nextRow, nextColumn]) => nextRow >= 0 && nextRow < input.height && nextColumn >= 0 && nextColumn < input.width)
    .map(([nextRow, nextColumn]) => nextRow * input.width + nextColumn);
}

function cellAreaHectares(input: NormalizedInput): number {
  const [, pixelWidth, rowRotation, , columnRotation, pixelHeight] = input.geotransform;
  const squareMetres = Math.abs(pixelWidth * pixelHeight - rowRotation * columnRotation);
  const hectares = squareMetres / 10_000;
  if (!Number.isFinite(hectares) || hectares <= 0) throw new Error("Raster cells must have a finite positive area.");
  return hectares;
}

function areaForCells(cellCount: number, areaPerCell: number): number {
  // Keep the published hectare value deterministic and readable while retaining
  // sub-millimetre precision for the tiny synthetic grids this contract admits.
  const rawArea = cellCount * areaPerCell;
  if (!Number.isFinite(rawArea)) throw new Error("Raster changed area exceeds the finite numeric reporting range.");
  const roundedArea = Math.round(rawArea * 1_000_000_000_000) / 1_000_000_000_000;
  if (!Number.isFinite(roundedArea)) throw new Error("Raster changed area exceeds the finite numeric reporting range.");
  // Do not round a positive area down to numeric zero; that would make a
  // supplied positive geometry indistinguishable from an absent result.
  return roundedArea === 0 && rawArea > 0 ? rawArea : roundedArea;
}

function buildComponent(seed: number, changed: ReadonlySet<number>, visited: Set<number>, input: NormalizedInput, connectivity: PatchConnectivity): readonly number[] {
  const stack = [seed];
  const component: number[] = [];
  visited.add(seed);
  while (stack.length > 0) {
    const cell = stack.pop()!;
    component.push(cell);
    for (const neighbour of neighbourIndices(cell, input, connectivity)) {
      if (changed.has(neighbour) && !visited.has(neighbour)) {
        visited.add(neighbour);
        stack.push(neighbour);
      }
    }
  }
  component.sort((left, right) => left - right);
  return Object.freeze(component);
}

/**
 * Vectorizes changed cells into deterministic, unsimplified cell polygons.
 * Every output is explicitly local/non-production.  The function is pure with
 * respect to its input: it only reads the supplied metadata and cell values.
 */
export function rasterToChangeVector(
  candidate: RasterToChangeVectorInput,
  options: PatchConnectivity | RasterToChangeVectorOptions = DEFAULT_PATCH_CONNECTIVITY,
): RasterToChangeVectorOutput {
  const connectivity = typeof options === "number"
    ? options
    : options && typeof options === "object"
      ? options.connectivity ?? DEFAULT_PATCH_CONNECTIVITY
      : Number.NaN;
  if (connectivity !== 4 && connectivity !== 8) throw new Error("Patch connectivity must be 4 or 8.");
  const input = assertRasterToChangeVectorInput(candidate);
  const changedCells = input.cells.reduce<number[]>((indices, value, index) => {
    if (value === 1) indices.push(index);
    return indices;
  }, []);
  const changed = new Set(changedCells);
  const visited = new Set<number>();
  const components: (readonly number[])[] = [];
  for (const seed of changedCells) {
    if (!visited.has(seed)) components.push(buildComponent(seed, changed, visited, input, connectivity));
  }
  // `changedCells` is scanned in row-major order, so this is already stable;
  // sort explicitly to keep that promise obvious if the scan changes later.
  components.sort((left, right) => left[0]! - right[0]!);

  const areaPerCell = cellAreaHectares(input);
  const version = connectivityVersion(connectivity);
  const patches = components.map((cells, patchIndex) => {
    const checksumInput: ChangePatchChecksumInput = {
      connectivity,
      connectivityVersion: version,
      fromYear: input.fromYear,
      toYear: input.toYear,
      observationYear: input.observationYear,
      width: input.width,
      height: input.height,
      gridId: input.gridId,
      crs: input.crs,
      linearUnit: input.linearUnit,
      geotransform: input.geotransform,
      noDataValue: input.noDataValue,
      cellIndices: cells,
      ...(input.sourceRasterSha256 === undefined ? {} : { sourceRasterSha256: input.sourceRasterSha256 }),
    };
    const patchChecksumSha256 = computeChangePatchChecksum(checksumInput);
    const areaHectares = areaForCells(cells.length, areaPerCell);
    const lineage: ChangePatchLineage = Object.freeze({
      fromYear: input.fromYear,
      toYear: input.toYear,
      observationYear: input.observationYear,
      gridId: input.gridId,
      sourceCellValue: 1,
      ...(input.sourceRasterSha256 === undefined ? {} : { sourceRasterSha256: input.sourceRasterSha256 }),
    });
    return Object.freeze({
      id: `detected-change-${input.observationYear}-${patchChecksumSha256.slice(0, 24)}`,
      patchIndex,
      observationYear: input.observationYear,
      fromYear: input.fromYear,
      toYear: input.toYear,
      cellIndices: cells,
      geometry: patchGeometry(input, cells),
      cellCount: cells.length,
      areaHectares,
      geometryHectares: areaHectares,
      patchChecksumSha256,
      lineage,
    });
  });

  const nodataCellCount = input.cells.reduce((count, value) => count + (value === input.noDataValue ? 1 : 0), 0);
  const unchangedCellCount = input.cells.length - changedCells.length - nodataCellCount;
  const changedAreaHectares = areaForCells(changedCells.length, areaPerCell);
  return Object.freeze({
    schemaVersion: RASTER_TO_CHANGE_VECTOR_SCHEMA,
    status: "computed-nonproduction" as const,
    productionEligible: false as const,
    released: false as const,
    methodVersion: RASTER_TO_CHANGE_VECTOR_METHOD_VERSION,
    connectivity,
    connectivityVersion: version,
    geometryPolicy: "one-unsimplified-cell-polygon-per-change-cell" as const,
    fromYear: input.fromYear,
    toYear: input.toYear,
    observationYear: input.observationYear,
    width: input.width,
    height: input.height,
    gridId: input.gridId,
    crs: input.crs,
    linearUnit: input.linearUnit,
    geotransform: input.geotransform,
    noDataValue: input.noDataValue,
    ...(input.sourceRasterSha256 === undefined ? {} : { sourceRasterSha256: input.sourceRasterSha256 }),
    cellAreaHectares: areaPerCell,
    changedCellCount: changedCells.length,
    nodataCellCount,
    unchangedCellCount,
    changedAreaHectares,
    patches: Object.freeze(patches),
  });
}

/** Name used by callers that describe this operation as vectorization. */
export const vectorizeChangeRaster = rasterToChangeVector;
