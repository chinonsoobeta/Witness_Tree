import { BASELINE_FIRST_YEAR } from "../ingestion/schema";
import type { OfficialRecordCandidate } from "../pipeline/matching";
import type { ProvincialCandidateSet, ProvincialChange } from "./provincial-matching";
import {
  computeChangePatchChecksum,
  MAX_NONPRODUCTION_RASTER_CELLS,
  RASTER_TO_CHANGE_VECTOR_METHOD_VERSION,
  RASTER_TO_CHANGE_VECTOR_SCHEMA,
  type ChangePatchBinding,
  type Geotransform,
  type RasterToChangeVectorOutput,
} from "./raster-to-change-vector";

/**
 * The preferred working CRS for this local adapter. EPSG:3347 is metre based,
 * which makes the planar area calculation below expressible in hectares. The
 * adapter does not reproject: every input in one run must carry the same
 * explicit CRS, and geographic degree CRSs are refused.
 */
export const PHASE4_SPATIAL_JOIN_CRS = "EPSG:3347" as const;
export const PHASE4_SPATIAL_JOIN_LAST_YEAR = 2026 as const;

export type Phase4SpatialJoinCrs = typeof PHASE4_SPATIAL_JOIN_CRS;
export type Phase4SpatialJoinProvince = "BC" | "QC";
export type SpatialJoinPosition = readonly [number, number];
export type SpatialJoinRing = readonly SpatialJoinPosition[];
/** Shape metadata mirrors the existing records GeoJSON type; runtime validation accepts only polygons. */
export type SpatialJoinGeoJSON = Readonly<{
  type: "Point" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
}>;

/** A projected, polygonal geometry accepted by the pure local adapter. */
export type SpatialJoinGeometry = Readonly<
  | (SpatialJoinGeoJSON & { crs: string; linearUnit: "metre"; areaHectares?: number })
  /** Existing record geometries carry the CRS and shape separately. */
  | { crs: string; normalized: SpatialJoinGeoJSON; areaHectares?: number; linearUnit: "metre" }
>;

/** A materialized Phase 2 change patch prepared for local matching only. */
export type ChangeGeometryInput = Readonly<{
  id: string;
  province: Phase4SpatialJoinProvince;
  observationYear: number;
  geometry: SpatialJoinGeometry;
  /** Optional source-declared area; when present it must agree with the geometry. */
  geometryHectares?: number;
  /** Alias accepted from the raster-to-change-vector output. */
  areaHectares?: number;
  /** Optional immutable patch identity retained across the raster/join seam. */
  sourcePatch?: ChangePatchBinding;
}>;

/** A transformed provincial event geometry prepared for local matching only. */
export type TransformedOfficialEventGeometry = Readonly<{
  id: string;
  province: Phase4SpatialJoinProvince;
  eventYear: number;
  geometry: SpatialJoinGeometry;
  /** Optional source-declared area; when present it must agree with the geometry. */
  geometryHectares?: number;
  /** Alias accepted from transformed record geometry metadata. */
  areaHectares?: number;
}>;

type Point = [number, number];
type Triangle = readonly [Point, Point, Point];
type ValidatedGeometry = Readonly<{
  parts: readonly (readonly Point[])[];
  areaHectares: number;
  declaredAreaHectares?: number;
}>;

const HECTARES_PER_SQUARE_METRE = 10_000;
const GEOMETRY_EPSILON = 1e-9;
const AREA_EPSILON_SQUARE_METRES = 1e-7;
const SHA256 = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireProvince(value: unknown, label: string): Phase4SpatialJoinProvince {
  if (value !== "BC" && value !== "QC") throw new Error(`${label} must be BC or QC.`);
  return value;
}

function requireYear(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < BASELINE_FIRST_YEAR || value > PHASE4_SPATIAL_JOIN_LAST_YEAR) {
    throw new Error(`${label} must be an integer year from ${BASELINE_FIRST_YEAR} through ${PHASE4_SPATIAL_JOIN_LAST_YEAR}.`);
  }
  return value;
}

function validateSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lower-case SHA-256 digest.`);
}

function validatePatchBinding(value: unknown, label: string, observationYear: number): asserts value is ChangePatchBinding | undefined {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const patchIndex = value.patchIndex;
  if (typeof patchIndex !== "number" || !Number.isSafeInteger(patchIndex) || patchIndex < 0) throw new Error(`${label} patchIndex must be a non-negative integer.`);
  validateSha256(value.patchChecksumSha256, `${label} patchChecksumSha256`);
  if (!isRecord(value.lineage)) throw new Error(`${label} lineage is required.`);
  const fromYear = requireYear(value.lineage.fromYear, `${label} lineage fromYear`);
  const toYear = requireYear(value.lineage.toYear, `${label} lineage toYear`);
  const lineageObservationYear = requireYear(value.lineage.observationYear, `${label} lineage observationYear`);
  if (toYear !== fromYear + 1 || lineageObservationYear !== observationYear || lineageObservationYear !== toYear) {
    throw new Error(`${label} lineage must describe the same adjacent annual interval as the change.`);
  }
  requireText(value.lineage.gridId, `${label} lineage gridId`);
  if (value.lineage.sourceCellValue !== 1) throw new Error(`${label} lineage sourceCellValue must be 1.`);
  if (value.lineage.sourceRasterSha256 !== undefined) validateSha256(value.lineage.sourceRasterSha256, `${label} lineage sourceRasterSha256`);
}

function cross(first: Point, second: Point, third: Point): number {
  return (second[0] - first[0]) * (third[1] - first[1]) - (second[1] - first[1]) * (third[0] - first[0]);
}

function signedRingAreaSquareMetres(ring: readonly Point[]): number {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  if (Math.abs(cross(start, end, point)) > GEOMETRY_EPSILON) return false;
  return point[0] >= Math.min(start[0], end[0]) - GEOMETRY_EPSILON
    && point[0] <= Math.max(start[0], end[0]) + GEOMETRY_EPSILON
    && point[1] >= Math.min(start[1], end[1]) - GEOMETRY_EPSILON
    && point[1] <= Math.max(start[1], end[1]) + GEOMETRY_EPSILON;
}

function segmentsIntersect(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point): boolean {
  const firstOrientation = cross(firstStart, firstEnd, secondStart);
  const secondOrientation = cross(firstStart, firstEnd, secondEnd);
  const thirdOrientation = cross(secondStart, secondEnd, firstStart);
  const fourthOrientation = cross(secondStart, secondEnd, firstEnd);

  if ((firstOrientation > GEOMETRY_EPSILON && secondOrientation < -GEOMETRY_EPSILON
    || firstOrientation < -GEOMETRY_EPSILON && secondOrientation > GEOMETRY_EPSILON)
    && (thirdOrientation > GEOMETRY_EPSILON && fourthOrientation < -GEOMETRY_EPSILON
      || thirdOrientation < -GEOMETRY_EPSILON && fourthOrientation > GEOMETRY_EPSILON)) {
    return true;
  }

  return Math.abs(firstOrientation) <= GEOMETRY_EPSILON && pointOnSegment(secondStart, firstStart, firstEnd)
    || Math.abs(secondOrientation) <= GEOMETRY_EPSILON && pointOnSegment(secondEnd, firstStart, firstEnd)
    || Math.abs(thirdOrientation) <= GEOMETRY_EPSILON && pointOnSegment(firstStart, secondStart, secondEnd)
    || Math.abs(fourthOrientation) <= GEOMETRY_EPSILON && pointOnSegment(firstEnd, secondStart, secondEnd);
}

function assertSimpleRing(ring: readonly Point[], label: string): void {
  if (ring.length < 3 || Math.abs(signedRingAreaSquareMetres(ring)) <= AREA_EPSILON_SQUARE_METRES) {
    throw new Error(`${label} must enclose a non-zero area.`);
  }

  for (let first = 0; first < ring.length; first += 1) {
    const firstStart = ring[first]!;
    const firstEnd = ring[(first + 1) % ring.length]!;
    for (let second = first + 1; second < ring.length; second += 1) {
      const adjacent = second === first + 1 || (first === 0 && second === ring.length - 1);
      if (adjacent) continue;
      if (segmentsIntersect(firstStart, firstEnd, ring[second]!, ring[(second + 1) % ring.length]!)) {
        throw new Error(`${label} contains a self-intersection.`);
      }
    }
  }
}

function stripCollinearVertices(ring: readonly Point[]): Point[] {
  const result = ring.map(([x, y]) => [x, y] as Point);
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index + result.length - 1) % result.length]!;
      const current = result[index]!;
      const next = result[(index + 1) % result.length]!;
      if (Math.abs(cross(previous, current, next)) <= GEOMETRY_EPSILON && pointOnSegment(current, previous, next)) {
        result.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

function parseRing(value: unknown, label: string): Point[] {
  if (!Array.isArray(value) || value.length < 4) throw new Error(`${label} must contain at least four positions.`);
  const positions = value.map((position, index): Point => {
    if (!Array.isArray(position) || position.length !== 2 || position.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate))) {
      throw new Error(`${label} position ${index} must contain two finite coordinates.`);
    }
    return [position[0] as number, position[1] as number];
  });

  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error(`${label} must be closed.`);
  }
  const unclosed = positions.slice(0, -1);
  for (let index = 0; index < unclosed.length; index += 1) {
    const current = unclosed[index]!;
    const next = unclosed[(index + 1) % unclosed.length]!;
    if (current[0] === next[0] && current[1] === next[1]) {
      throw new Error(`${label} contains duplicate consecutive positions.`);
    }
  }
  const normalized = stripCollinearVertices(unclosed);
  assertSimpleRing(normalized, label);
  return signedRingAreaSquareMetres(normalized) < 0 ? normalized.reverse() : normalized;
}

function validateGeometry(value: unknown, label: string, expectedCrs?: string): ValidatedGeometry {
  if (!isRecord(value) || typeof value.crs !== "string" || !value.crs.trim()) {
    throw new Error(`${label} must declare a non-empty CRS; reprojection is not performed.`);
  }
  const crs = value.crs;
  if (expectedCrs !== undefined && crs !== expectedCrs) {
    throw new Error(`${label} CRS ${crs} does not match the run CRS ${expectedCrs}; reprojection is not performed.`);
  }
  if (/^(?:EPSG:)?4326$/i.test(crs.trim()) || /\b(?:longlat|latlong)\b/i.test(crs)) {
    throw new Error(`${label} must use a projected metre CRS so planar area can be expressed in hectares.`);
  }
  if (value.linearUnit !== "metre") throw new Error(`${label} linear unit must be explicitly declared as metre.`);

  const shape = isRecord(value.normalized) ? value.normalized : value;
  if (shape.type !== "Polygon" && shape.type !== "MultiPolygon") throw new Error(`${label} must be a Polygon or MultiPolygon.`);

  const parts: Point[][] = [];
  if (shape.type === "Polygon") {
    if (!Array.isArray(shape.coordinates) || shape.coordinates.length !== 1) {
      throw new Error(`${label} must have exactly one exterior ring; interior rings are refused.`);
    }
    parts.push(parseRing(shape.coordinates[0], `${label} exterior ring`));
  } else {
    if (!Array.isArray(shape.coordinates) || shape.coordinates.length === 0) throw new Error(`${label} must have at least one polygon.`);
    shape.coordinates.forEach((polygon, index) => {
      if (!Array.isArray(polygon) || polygon.length !== 1) {
        throw new Error(`${label} polygon ${index} must have exactly one exterior ring; interior rings are refused.`);
      }
      parts.push(parseRing(polygon[0], `${label} polygon ${index} exterior ring`));
    });
  }

  const areaSquareMetres = parts.reduce((total, part) => total + Math.abs(signedRingAreaSquareMetres(part)), 0);
  if (!Number.isFinite(areaSquareMetres) || areaSquareMetres <= AREA_EPSILON_SQUARE_METRES) throw new Error(`${label} must have a positive finite area.`);
  for (let first = 0; first < parts.length; first += 1) {
    for (let second = first + 1; second < parts.length; second += 1) {
      if (intersectionAreaSquareMetres([parts[first]!], [parts[second]!]) > AREA_EPSILON_SQUARE_METRES) {
        throw new Error(`${label} contains overlapping multipolygon parts.`);
      }
    }
  }
  return Object.freeze({
    parts: Object.freeze(parts.map((part) => Object.freeze(part))),
    areaHectares: areaSquareMetres / HECTARES_PER_SQUARE_METRE,
    ...("areaHectares" in value ? { declaredAreaHectares: value.areaHectares as number | undefined } : {}),
  });
}

function declaredArea(values: readonly unknown[], computedAreaHectares: number, label: string): number {
  const declared = values.filter((value) => value !== undefined);
  if (declared.length === 0) return computedAreaHectares;
  if (declared.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  const numbers = declared as number[];
  const tolerance = Math.max(1e-9, computedAreaHectares * 1e-9);
  if (numbers.some((value) => Math.abs(value - computedAreaHectares) > tolerance) || numbers.some((value) => Math.abs(value - numbers[0]!) > tolerance)) {
    throw new Error(`${label} does not agree with the projected geometry area.`);
  }
  return computedAreaHectares;
}

function bbox(points: readonly Point[]): Readonly<{ minX: number; minY: number; maxX: number; maxY: number }> {
  return points.reduce(
    (box, [x, y]) => ({ minX: Math.min(box.minX, x), minY: Math.min(box.minY, y), maxX: Math.max(box.maxX, x), maxY: Math.max(box.maxY, y) }),
    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  );
}

function bboxesOverlap(first: ReturnType<typeof bbox>, second: ReturnType<typeof bbox>): boolean {
  return first.minX <= second.maxX + GEOMETRY_EPSILON && first.maxX + GEOMETRY_EPSILON >= second.minX
    && first.minY <= second.maxY + GEOMETRY_EPSILON && first.maxY + GEOMETRY_EPSILON >= second.minY;
}

function pointInTriangle(point: Point, triangle: Triangle): boolean {
  const first = cross(triangle[0], triangle[1], point);
  const second = cross(triangle[1], triangle[2], point);
  const third = cross(triangle[2], triangle[0], point);
  return first >= -GEOMETRY_EPSILON && second >= -GEOMETRY_EPSILON && third >= -GEOMETRY_EPSILON;
}

function triangulate(ring: readonly Point[]): Triangle[] {
  const remaining = ring.map(([x, y]) => [x, y] as Point);
  const triangles: Triangle[] = [];
  let guard = 0;
  while (remaining.length > 3) {
    let earFound = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const previous = remaining[(index + remaining.length - 1) % remaining.length]!;
      const current = remaining[index]!;
      const next = remaining[(index + 1) % remaining.length]!;
      if (cross(previous, current, next) <= GEOMETRY_EPSILON) continue;
      const triangle: Triangle = [previous, current, next];
      if (remaining.some((candidate, candidateIndex) => {
        if (candidateIndex === index || candidateIndex === (index + remaining.length - 1) % remaining.length || candidateIndex === (index + 1) % remaining.length) return false;
        return pointInTriangle(candidate, triangle);
      })) continue;
      triangles.push(triangle);
      remaining.splice(index, 1);
      earFound = true;
      break;
    }
    guard += 1;
    if (!earFound || guard > ring.length * ring.length) throw new Error("A valid polygon could not be triangulated safely.");
  }
  triangles.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  return triangles;
}

function lineIntersection(start: Point, end: Point, clipStart: Point, clipEnd: Point): Point {
  const direction: Point = [end[0] - start[0], end[1] - start[1]];
  const edge: Point = [clipEnd[0] - clipStart[0], clipEnd[1] - clipStart[1]];
  const denominator = direction[0] * edge[1] - direction[1] * edge[0];
  if (Math.abs(denominator) <= GEOMETRY_EPSILON) return [end[0], end[1]];
  const fromClipStart: Point = [clipStart[0] - start[0], clipStart[1] - start[1]];
  const factor = (fromClipStart[0] * edge[1] - fromClipStart[1] * edge[0]) / denominator;
  return [start[0] + factor * direction[0], start[1] + factor * direction[1]];
}

function clipTriangle(subject: Triangle, clip: Triangle): Point[] {
  let output = subject.map(([x, y]) => [x, y] as Point);
  for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
    if (output.length === 0) break;
    const clipStart = clip[edgeIndex]!;
    const clipEnd = clip[(edgeIndex + 1) % clip.length]!;
    const input = output;
    output = [];
    for (let pointIndex = 0; pointIndex < input.length; pointIndex += 1) {
      const previous = input[(pointIndex + input.length - 1) % input.length]!;
      const current = input[pointIndex]!;
      const previousInside = cross(clipStart, clipEnd, previous) >= -GEOMETRY_EPSILON;
      const currentInside = cross(clipStart, clipEnd, current) >= -GEOMETRY_EPSILON;
      if (currentInside !== previousInside) output.push(lineIntersection(previous, current, clipStart, clipEnd));
      if (currentInside) output.push([current[0], current[1]]);
    }
  }
  return output;
}

function polygonAreaSquareMetres(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  return Math.abs(signedRingAreaSquareMetres(points));
}

function intersectionAreaSquareMetres(
  firstParts: readonly (readonly Point[])[],
  secondParts: readonly (readonly Point[])[],
): number {
  let areaSquareMetres = 0;
  const firstTriangles = firstParts.flatMap(triangulate);
  const secondTriangles = secondParts.flatMap(triangulate);
  const firstBboxes = firstTriangles.map(bbox);
  const secondBboxes = secondTriangles.map(bbox);
  for (let firstIndex = 0; firstIndex < firstTriangles.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < secondTriangles.length; secondIndex += 1) {
      if (!bboxesOverlap(firstBboxes[firstIndex]!, secondBboxes[secondIndex]!)) continue;
      areaSquareMetres += polygonAreaSquareMetres(clipTriangle(firstTriangles[firstIndex]!, secondTriangles[secondIndex]!));
    }
  }
  return areaSquareMetres;
}

function intersectionHectares(first: ValidatedGeometry, second: ValidatedGeometry): number {
  const areaSquareMetres = intersectionAreaSquareMetres(first.parts, second.parts);
  if (areaSquareMetres <= AREA_EPSILON_SQUARE_METRES) return 0;
  return Math.min(areaSquareMetres / HECTARES_PER_SQUARE_METRE, first.areaHectares, second.areaHectares);
}

function compareIdentity(first: { id: string }, second: { id: string }): number {
  return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

function assertUniqueIds<T extends { id: string }>(values: readonly T[], label: string): void {
  const seen = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value.id)) throw new Error(`${label} contains duplicate identifier ${value.id}.`);
    seen.add(value.id);
  });
}

type ValidatedChange = Readonly<ChangeGeometryInput & { geometryData: ValidatedGeometry; geometryHectares: number }>;
type ValidatedEvent = Readonly<TransformedOfficialEventGeometry & { geometryData: ValidatedGeometry; geometryHectares: number }>;

function validateChange(input: ChangeGeometryInput, index: number, expectedCrs?: string): ValidatedChange {
  const label = `Change ${index}`;
  const id = requireText(input?.id, `${label} id`);
  const province = requireProvince(input?.province, `${label} province`);
  const observationYear = requireYear(input?.observationYear, `${label} observationYear`);
  const geometryData = validateGeometry(input?.geometry, `${label} geometry`, expectedCrs);
  const geometryHectares = declaredArea([input?.geometryHectares, input?.areaHectares, geometryData.declaredAreaHectares], geometryData.areaHectares, `${label} geometryHectares`);
  validatePatchBinding(input?.sourcePatch, `${label} sourcePatch`, observationYear);
  return Object.freeze({ ...input, id, province, observationYear, geometryData, geometryHectares });
}

function validateEvent(input: TransformedOfficialEventGeometry, index: number, expectedCrs?: string): ValidatedEvent {
  const label = `Official event ${index}`;
  const id = requireText(input?.id, `${label} id`);
  const province = requireProvince(input?.province, `${label} province`);
  const eventYear = requireYear(input?.eventYear, `${label} eventYear`);
  const geometryData = validateGeometry(input?.geometry, `${label} geometry`, expectedCrs);
  const geometryHectares = declaredArea([input?.geometryHectares, input?.areaHectares, geometryData.declaredAreaHectares], geometryData.areaHectares, `${label} geometryHectares`);
  return Object.freeze({ ...input, id, province, eventYear, geometryData, geometryHectares });
}

/**
 * Computes local spatial candidates for the existing Phase 4 matching policy.
 *
 * This is a pure, deterministic, non-production adapter. It performs no
 * reprojection, source admission, publication, or production upgrade. Every
 * input is validated before a result is returned; unsupported CRS, malformed
 * geometry, invalid years/provinces, duplicate IDs, and inconsistent declared
 * areas fail closed with an error.
 *
 * Candidate sets and their members are sorted by stable IDs, so source input
 * order cannot alter downstream matching or its audit inputs. Only positive
 * polygon-area intersections become candidates; temporal filtering remains in
 * `matchDetectedChange`.
 */
export function spatialJoinOfficialEvents(
  changes: readonly ChangeGeometryInput[],
  officialEvents: readonly TransformedOfficialEventGeometry[],
): readonly ProvincialCandidateSet[] {
  if (!Array.isArray(changes) || !Array.isArray(officialEvents)) throw new Error("Spatial-join inputs must be arrays.");
  const expectedCrs = [...changes, ...officialEvents].map((input) => {
    const geometry = isRecord(input) && isRecord(input.geometry) ? input.geometry : undefined;
    return geometry && typeof geometry.crs === "string" && geometry.crs.trim() ? geometry.crs : undefined;
  }).find((crs): crs is string => crs !== undefined);
  const validatedChanges = changes.map((input, index) => validateChange(input, index, expectedCrs));
  const validatedEvents = officialEvents.map((input, index) => validateEvent(input, index, expectedCrs));
  assertUniqueIds(validatedChanges, "Changes");
  assertUniqueIds(validatedEvents, "Official events");

  const sortedChanges = [...validatedChanges].sort(compareIdentity);
  const sortedEvents = [...validatedEvents].sort(compareIdentity);
  const result = sortedChanges.map((change): ProvincialCandidateSet => {
    const candidates: OfficialRecordCandidate[] = [];
    for (const event of sortedEvents) {
      if (event.province !== change.province) continue;
      const intersectionHectares = intersectionHectaresFor(change.geometryData, event.geometryData);
      if (intersectionHectares <= 0) continue;
      candidates.push(Object.freeze({
        id: event.id,
        eventYear: event.eventYear,
        geometryHectares: event.geometryHectares,
        intersectionHectares,
      }));
    }
    candidates.sort(compareIdentity);
    const provincialChange: ProvincialChange = Object.freeze({
      id: change.id,
      province: change.province,
      observationYear: change.observationYear,
      geometryHectares: change.geometryHectares,
      ...(change.sourcePatch === undefined ? {} : { sourcePatch: change.sourcePatch }),
    });
    return Object.freeze({ change: provincialChange, candidates: Object.freeze(candidates) });
  });
  return Object.freeze(result);
}

// Kept separate from the public adapter to make the geometry calculation easy
// to audit and to avoid naming a local variable the same as this function.
function intersectionHectaresFor(first: ValidatedGeometry, second: ValidatedGeometry): number {
  return intersectionHectares(first, second);
}

function approximatelyEqual(first: number, second: number): boolean {
  return Math.abs(first - second) <= Math.max(1e-12, Math.max(Math.abs(first), Math.abs(second)) * 1e-9);
}

function validateRasterGeotransform(value: unknown): asserts value is Geotransform {
  if (!Array.isArray(value) || value.length !== 6 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error("Raster-to-vector output requires a finite six-number geotransform.");
  }
  const [, pixelWidth, rowRotation, , columnRotation, pixelHeight] = value;
  if (Math.abs(pixelWidth * pixelHeight - rowRotation * columnRotation) <= AREA_EPSILON_SQUARE_METRES) {
    throw new Error("Raster-to-vector output geotransform must describe positive-area cells.");
  }
}

function expectedRasterCellPolygon(output: RasterToChangeVectorOutput, cellIndex: number): readonly (readonly [number, number])[] {
  const [originX, pixelWidth, rowRotation, originY, columnRotation, pixelHeight] = output.geotransform;
  const row = Math.floor(cellIndex / output.width);
  const column = cellIndex % output.width;
  const points = [
    [originX + column * pixelWidth + row * rowRotation, originY + column * columnRotation + row * pixelHeight],
    [originX + (column + 1) * pixelWidth + row * rowRotation, originY + (column + 1) * columnRotation + row * pixelHeight],
    [originX + (column + 1) * pixelWidth + (row + 1) * rowRotation, originY + (column + 1) * columnRotation + (row + 1) * pixelHeight],
    [originX + column * pixelWidth + (row + 1) * rowRotation, originY + column * columnRotation + (row + 1) * pixelHeight],
  ] as [number, number][];
  if (points.some((point) => !point.every(Number.isFinite))) throw new Error("Raster-to-vector output geotransform produces a non-finite cell coordinate.");
  points.push(points[0]!);
  return points;
}

function samePosition(first: unknown, second: readonly [number, number]): boolean {
  return Array.isArray(first) && first.length === 2 && first[0] === second[0] && first[1] === second[1];
}

function assertRasterVectorOutput(candidate: unknown): asserts candidate is RasterToChangeVectorOutput {
  if (!isRecord(candidate) || candidate.schemaVersion !== RASTER_TO_CHANGE_VECTOR_SCHEMA
    || candidate.status !== "computed-nonproduction" || candidate.productionEligible !== false || candidate.released !== false) {
    throw new Error("Only an explicitly computed-nonproduction raster-to-vector output can enter the provincial spatial join.");
  }
  const output = candidate as Partial<RasterToChangeVectorOutput>;
  const fromYear = output.fromYear;
  const toYear = output.toYear;
  const observationYear = output.observationYear;
  if (typeof fromYear !== "number" || typeof toYear !== "number" || typeof observationYear !== "number"
    || !Number.isSafeInteger(fromYear) || !Number.isSafeInteger(toYear)
    || toYear !== fromYear + 1 || !Number.isSafeInteger(observationYear) || observationYear !== toYear) {
    throw new Error("Raster-to-vector output has invalid adjacent-year lineage.");
  }
  requireText(output.gridId, "Raster-to-vector output gridId");
  requireText(output.crs, "Raster-to-vector output CRS");
  requireYear(fromYear, "Raster-to-vector output fromYear");
  requireYear(toYear, "Raster-to-vector output toYear");
  requireYear(observationYear, "Raster-to-vector output observationYear");
  if (output.linearUnit !== "metre") throw new Error("Raster-to-vector output linear unit must be metre.");
  if (output.methodVersion !== RASTER_TO_CHANGE_VECTOR_METHOD_VERSION
    || (output.connectivity !== 4 && output.connectivity !== 8)
    || output.connectivityVersion !== `${output.connectivity}-connected-v1`
    || output.geometryPolicy !== "one-unsimplified-cell-polygon-per-change-cell") {
    throw new Error("Raster-to-vector output method metadata is not supported by the spatial join.");
  }
  if (typeof output.width !== "number" || typeof output.height !== "number"
    || !Number.isSafeInteger(output.width) || output.width < 1 || !Number.isSafeInteger(output.height) || output.height < 1) {
    throw new Error("Raster-to-vector output dimensions must be positive safe integers.");
  }
  const cellCount = output.width * output.height;
  if (!Number.isSafeInteger(cellCount) || cellCount < 1) throw new Error("Raster-to-vector output dimensions are invalid.");
  if (cellCount > MAX_NONPRODUCTION_RASTER_CELLS) throw new Error("Raster-to-vector output exceeds the bounded non-production cell limit.");
  validateRasterGeotransform(output.geotransform);
  if (typeof output.cellAreaHectares !== "number" || !Number.isFinite(output.cellAreaHectares) || output.cellAreaHectares <= 0) throw new Error("Raster-to-vector output cell area must be positive.");
  const [, pixelWidth, rowRotation, , columnRotation, pixelHeight] = output.geotransform;
  const computedCellArea = Math.abs(pixelWidth * pixelHeight - rowRotation * columnRotation) / HECTARES_PER_SQUARE_METRE;
  if (!Number.isFinite(computedCellArea) || !approximatelyEqual(output.cellAreaHectares, computedCellArea)) {
    throw new Error("Raster-to-vector output cell area does not match its geotransform.");
  }
  if (typeof output.noDataValue !== "number" || !Number.isSafeInteger(output.noDataValue) || output.noDataValue === 0 || output.noDataValue === 1) throw new Error("Raster-to-vector output nodata value is invalid.");
  if (!Array.isArray(output.patches)) throw new Error("Raster-to-vector output patches must be an array.");
  const changedCellCount = output.changedCellCount;
  const nodataCellCount = output.nodataCellCount;
  const unchangedCellCount = output.unchangedCellCount;
  if (typeof changedCellCount !== "number" || !Number.isSafeInteger(changedCellCount) || changedCellCount < 0
    || typeof nodataCellCount !== "number" || !Number.isSafeInteger(nodataCellCount) || nodataCellCount < 0
    || typeof unchangedCellCount !== "number" || !Number.isSafeInteger(unchangedCellCount) || unchangedCellCount < 0
    || changedCellCount + nodataCellCount + unchangedCellCount !== cellCount) {
    throw new Error("Raster-to-vector output cell accounting is inconsistent.");
  }
  if (typeof output.changedAreaHectares !== "number" || !Number.isFinite(output.changedAreaHectares) || output.changedAreaHectares < 0) {
    throw new Error("Raster-to-vector output changed area is invalid.");
  }
  if (output.sourceRasterSha256 !== undefined) validateSha256(output.sourceRasterSha256, "Raster-to-vector output sourceRasterSha256");
}

function validateRasterPatch(
  patch: unknown,
  position: number,
  output: RasterToChangeVectorOutput,
  seenCells: Set<number>,
): asserts patch is RasterToChangeVectorOutput["patches"][number] {
  const label = `Raster patch ${position}`;
  if (!isRecord(patch)) throw new Error(`${label} must be an object.`);
  const rasterPatch = patch as unknown as RasterToChangeVectorOutput["patches"][number];
  if (!Number.isSafeInteger(rasterPatch.patchIndex) || rasterPatch.patchIndex < 0) throw new Error(`${label} patchIndex must be a non-negative integer.`);
  if (!validId(rasterPatch.id)) throw new Error(`${label} id must be a non-empty string.`);
  if (!Number.isSafeInteger(rasterPatch.observationYear) || rasterPatch.observationYear !== output.observationYear
    || rasterPatch.fromYear !== output.fromYear || rasterPatch.toYear !== output.toYear) {
    throw new Error(`${label} year lineage does not match its raster output.`);
  }
  if (rasterPatch.cellCount !== (Array.isArray(rasterPatch.cellIndices) ? rasterPatch.cellIndices.length : -1)
    || !Number.isSafeInteger(rasterPatch.cellCount) || rasterPatch.cellCount < 1) throw new Error(`${label} cellCount is invalid.`);
  if (!Array.isArray(rasterPatch.cellIndices)) throw new Error(`${label} cellIndices must be an array.`);
  const localCells = new Set<number>();
  let previousCell = -1;
  for (const cell of rasterPatch.cellIndices) {
    if (!Number.isSafeInteger(cell) || cell < 0 || cell >= output.width * output.height || cell <= previousCell || localCells.has(cell) || seenCells.has(cell)) {
      throw new Error(`${label} contains a duplicate or out-of-range cell index.`);
    }
    localCells.add(cell);
    seenCells.add(cell);
    previousCell = cell;
  }
  if (!Number.isFinite(rasterPatch.areaHectares) || rasterPatch.areaHectares <= 0 || rasterPatch.geometryHectares !== rasterPatch.areaHectares
    || !approximatelyEqual(rasterPatch.areaHectares, rasterPatch.cellCount * output.cellAreaHectares)) {
    throw new Error(`${label} area does not agree with its cell count and raster cell area.`);
  }
  validateSha256(rasterPatch.patchChecksumSha256, `${label} patchChecksumSha256`);
  const expectedChecksum = computeChangePatchChecksum({
    connectivity: output.connectivity,
    connectivityVersion: output.connectivityVersion,
    fromYear: output.fromYear,
    toYear: output.toYear,
    observationYear: output.observationYear,
    width: output.width,
    height: output.height,
    gridId: output.gridId,
    crs: output.crs,
    linearUnit: output.linearUnit,
    geotransform: output.geotransform,
    noDataValue: output.noDataValue,
    cellIndices: rasterPatch.cellIndices,
    ...(output.sourceRasterSha256 === undefined ? {} : { sourceRasterSha256: output.sourceRasterSha256 }),
  });
  if (rasterPatch.patchChecksumSha256 !== expectedChecksum) throw new Error(`${label} patch checksum does not match its metadata and cell indices.`);
  if (!isRecord(rasterPatch.lineage) || rasterPatch.lineage.fromYear !== output.fromYear || rasterPatch.lineage.toYear !== output.toYear
    || rasterPatch.lineage.observationYear !== output.observationYear || rasterPatch.lineage.gridId !== output.gridId
    || rasterPatch.lineage.sourceCellValue !== 1) {
    throw new Error(`${label} lineage does not match its raster output.`);
  }
  if (rasterPatch.lineage.sourceRasterSha256 !== undefined) validateSha256(rasterPatch.lineage.sourceRasterSha256, `${label} lineage sourceRasterSha256`);
  if (output.sourceRasterSha256 === undefined && rasterPatch.lineage.sourceRasterSha256 !== undefined) {
    throw new Error(`${label} lineage sourceRasterSha256 is not bound by the raster output.`);
  }
  if (output.sourceRasterSha256 !== undefined && rasterPatch.lineage.sourceRasterSha256 !== output.sourceRasterSha256) {
    throw new Error(`${label} lineage sourceRasterSha256 does not match the raster output.`);
  }
  if (!isRecord(rasterPatch.geometry) || rasterPatch.geometry.type !== "MultiPolygon" || rasterPatch.geometry.crs !== output.crs || rasterPatch.geometry.linearUnit !== "metre") {
    throw new Error(`${label} geometry metadata does not match its raster output.`);
  }
  if (!Array.isArray(rasterPatch.geometry.coordinates) || rasterPatch.geometry.coordinates.length !== rasterPatch.cellCount) {
    throw new Error(`${label} geometry must carry exactly one cell polygon per changed cell.`);
  }
  rasterPatch.geometry.coordinates.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length !== 1 || !Array.isArray(polygon[0])) {
      throw new Error(`${label} geometry cell ${polygonIndex} must contain exactly one ring.`);
    }
    const ring = polygon[0];
    const expected = expectedRasterCellPolygon(output, rasterPatch.cellIndices[polygonIndex]!);
    if (ring.length !== expected.length || ring.some((position, positionIndex) => !samePosition(position, expected[positionIndex]!))) {
      throw new Error(`${label} geometry cell ${polygonIndex} does not match its raster cell and geotransform.`);
    }
  });
}

/**
 * Adapts a vectorizer result into the input contract consumed by the spatial
 * join.  The adapter carries each patch checksum and lineage, while refusing
 * production-labelled or internally inconsistent output.  It does not read
 * files, assign source rights, or make a production admission decision.
 */
export function rasterOutputToSpatialJoinChanges(
  output: RasterToChangeVectorOutput,
  province: Phase4SpatialJoinProvince,
): readonly ChangeGeometryInput[] {
  assertRasterVectorOutput(output);
  const normalizedProvince = requireProvince(province, "Raster output province");
  const seenPatchIds = new Set<string>();
  const seenPatchChecksums = new Set<string>();
  const seenCells = new Set<number>();
  const patches = [...output.patches];
  patches.forEach((patch, index) => {
    validateRasterPatch(patch, index, output, seenCells);
    if (seenPatchIds.has(patch.id) || seenPatchChecksums.has(patch.patchChecksumSha256)) {
      throw new Error("Raster-to-vector output contains duplicate patch identity.");
    }
    seenPatchIds.add(patch.id);
    seenPatchChecksums.add(patch.patchChecksumSha256);
  });
  const orderedPatches = patches.sort((left, right) => left.patchIndex - right.patchIndex);
  orderedPatches.forEach((patch, index) => {
    if (patch.patchIndex !== index) throw new Error("Raster-to-vector output patch indices must be contiguous and canonical zero-based positions.");
  });
  const changedCellCount = orderedPatches.reduce((total, patch) => total + patch.cellCount, 0);
  if (output.changedCellCount !== changedCellCount || !Number.isSafeInteger(output.changedCellCount) || output.changedCellCount < 0) {
    throw new Error("Raster-to-vector output changed-cell count does not match its patches.");
  }
  if (!Number.isFinite(output.changedAreaHectares) || !approximatelyEqual(
    output.changedAreaHectares,
    orderedPatches.reduce((total, patch) => total + patch.areaHectares, 0),
  )) {
    throw new Error("Raster-to-vector output changed area does not match its patches.");
  }

  return Object.freeze(orderedPatches.map((patch) => Object.freeze({
    id: patch.id,
    province: normalizedProvince,
    observationYear: patch.observationYear,
    geometry: patch.geometry,
    geometryHectares: patch.geometryHectares,
    sourcePatch: Object.freeze({
      patchIndex: patch.patchIndex,
      patchChecksumSha256: patch.patchChecksumSha256,
      lineage: patch.lineage,
    }),
  })));
}

/** Runs the pure spatial seam for one non-production raster output. */
export function spatialJoinRasterOutput(
  output: RasterToChangeVectorOutput,
  province: Phase4SpatialJoinProvince,
  officialEvents: readonly TransformedOfficialEventGeometry[],
): readonly ProvincialCandidateSet[] {
  return spatialJoinOfficialEvents(rasterOutputToSpatialJoinChanges(output, province), officialEvents);
}
