import { CANADIAN_JURISDICTION_CODES, COVERAGE_GRADES, type CoverageGrade } from "../domain";
import { percentageOfForest } from "../domain/forest";
import { localized } from "../domain/localized";
import type { CoverageFeature, CoverageGeometry, CoveragePointQuery, CoverageResult, CoverageShare, ForestAggregate, ForestAggregateInput, LinearRing, Position }
from "./types.ts";

const currentYear = () => new Date().getUTCFullYear();
const validGrade = (grade: unknown): grade is CoverageGrade => COVERAGE_GRADES.includes(grade as CoverageGrade);
const validYear = (year: unknown): year is number => typeof year === "number" && Number.isInteger(year) && year >= 1984 && year <= currentYear();

function validPosition(position: unknown): position is Position {
  return Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)
    && Math.abs(position[0]!) <= 180 && Math.abs(position[1]!) <= 90;
}

function validateRing(ring: unknown): asserts ring is LinearRing {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(validPosition)) throw new Error("Coverage geometry requires finite longitude/latitude rings.");
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error("Coverage geometry rings must be closed.");
}

function validateGeometry(geometry: CoverageGeometry): void {
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : undefined;
  if (!polygons?.length) throw new Error("Coverage geometry must be a Polygon or MultiPolygon.");
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) throw new Error("Coverage geometry requires an outer ring.");
    polygon.forEach(validateRing);
  }
}

function pointOnSegment(point: Position, start: Position, end: Position): boolean {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  return Math.abs(cross) < 1e-12 && x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
}

function pointInRing(point: Position, ring: LinearRing): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]!;
    const prior = ring[previous]!;
    if (pointOnSegment(point, prior, current)) return true;
    const intersects = (current[1] > point[1]) !== (prior[1] > point[1])
      && point[0] < (prior[0] - current[0]) * (point[1] - current[1]) / (prior[1] - current[1]) + current[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function geometryContainsPoint(geometry: CoverageGeometry, point: Position): boolean {
  validateGeometry(geometry);
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInRing(point, polygon[0]!) && !polygon.slice(1).some((hole) => pointInRing(point, hole)));
}

export function validateCoverageFeature(feature: CoverageFeature): CoverageFeature {
  if (!feature?.id?.trim() || !feature.boundaryEdition?.trim() || !validYear(feature.startYear) || !validYear(feature.endYear) || feature.startYear > feature.endYear || !validGrade(feature.grade) || (feature.priority !== undefined && !Number.isFinite(feature.priority))) {
    throw new Error("Coverage feature has invalid identity, edition, period, grade, or priority.");
  }
  validateGeometry(feature.geometry);
  return feature;
}

export function resolveCoverage(query: CoveragePointQuery): CoverageResult {
  if (!CANADIAN_JURISDICTION_CODES.includes(query.province)) throw new Error("A supported Canadian province or territory is required.");
  if (!query.boundaryEdition.trim()) throw new Error("A boundary edition is required.");
  if (!Number.isFinite(query.longitude) || query.longitude < -180 || query.longitude > 180) throw new Error("Longitude must be finite and between -180 and 180.");
  if (!Number.isFinite(query.latitude) || query.latitude < -90 || query.latitude > 90) throw new Error("Latitude must be finite and between -90 and 90.");
  if (!validYear(query.year)) throw new Error("Year must be an integer within the record period.");
  const features = (query.features ?? []).map(validateCoverageFeature);
  if (query.province === "QC" && query.latitude >= 52) return { grade: "national-baseline", boundaryEdition: query.boundaryEdition, year: query.year };
  if (query.year < 2000) return { grade: "extended-record-sparse-official-matching", boundaryEdition: query.boundaryEdition, year: query.year };
  const matching = features
    .filter((feature) => feature.boundaryEdition === query.boundaryEdition && query.year >= feature.startYear && query.year <= feature.endYear && geometryContainsPoint(feature.geometry, [query.longitude, query.latitude]))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id))[0];
  return { grade: matching?.grade ?? "national-baseline", boundaryEdition: query.boundaryEdition, year: query.year };
}

export function aggregateDetectedChange(input: ForestAggregateInput): ForestAggregate {
  const { from, to } = input.timeRange;
  if (!validYear(from) || !validYear(to) || from > to) throw new Error("A valid aggregate time range is required.");
  if (!Number.isFinite(input.detectedChangeHectares) || !validGrade(input.coverageGrade)) throw new Error("Finite hectares and a registered coverage grade are required.");
  if (!(["period-contemporaneous", "current-applied-to-historic"] as const).includes(input.boundaryApplication)) throw new Error("A boundary-application basis is required.");
  if (input.detectedChangeHectares < 0) throw new Error("Hectares must be non-negative.");
  const boundaryEdition = input.denominator?.boundaryEdition ?? "unknown";
  if (!input.denominator || input.denominator.hectares === 0 || input.coverageGrade === "not-applicable" || input.coverageGrade === "extended-record-sparse-official-matching") {
    return { kind: "unknown", reason: localized("No sufficient forested-hectare denominator is available for this coverage.", "Aucun dénominateur suffisant en hectares forestiers n’est disponible pour cette couverture."), boundaryEdition, coverageGrade: input.coverageGrade, timeRange: input.timeRange, boundaryApplication: input.boundaryApplication };
  }
  if (input.denominator.referenceYear !== from) throw new Error("The denominator reference year must equal the first year of the requested range.");
  if (input.detectedChangeHectares > input.denominator.hectares) throw new Error("Detected change cannot exceed forested hectares.");
  return { kind: "figure", value: percentageOfForest(input.detectedChangeHectares, input.denominator), unit: "%", denominator: input.denominator, coverageGrade: input.coverageGrade, timeRange: input.timeRange, boundaryApplication: input.boundaryApplication };
}

export function coverageShares(shares: readonly CoverageShare[]): Readonly<Record<CoverageGrade, number>> {
  if (shares.some((item) => !Number.isFinite(item.forestedHectares) || item.forestedHectares < 0 || !validGrade(item.grade))) throw new Error("Coverage shares require registered grades and finite, non-negative forested hectares.");
  const total = shares.reduce((sum, item) => sum + item.forestedHectares, 0);
  if (total <= 0) throw new Error("Coverage shares require positive forested hectares.");
  const result = {} as Record<CoverageGrade, number>;
  for (const share of shares) result[share.grade] = (result[share.grade] ?? 0) + share.forestedHectares / total;
  const sum = Object.values(result).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-12) throw new Error("Coverage shares must sum to one.");
  return result;
}
