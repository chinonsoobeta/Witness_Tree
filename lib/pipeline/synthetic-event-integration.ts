import { PLACE_TYPES, type PlaceType } from "../places/types";
import { MATCHING_PARAMETERS, matchDetectedChange, type MatchingResult, type OfficialRecordCandidate } from "./matching";
import type { MethodParameterManifest } from "./method-manifest";
import { geometryForGridCells, sha256, stableJson, validateBatchMethodBinding, type BaselineBatchManifest, type BaselineBatchResult, type BaselineGrid, type BoundaryCrosswalkInput, type DetectedChangeGeometry } from "./national-baseline-batch";
import { PRECEDENCE_ORDER, resolvePrecedence, type PrecedenceEvent } from "./precedence";

const SHA256 = /^[a-f0-9]{64}$/;
const OFFICIAL_KINDS = ["fire", "recorded-harvest"] as const;
type OfficialKind = (typeof OFFICIAL_KINDS)[number];

export type SyntheticOfficialRecord = Readonly<{
  id: string;
  kind: OfficialKind;
  year: number;
  cellIndices: readonly number[];
  qualifyingRecordedHarvest?: boolean;
  sourceVersion: string;
}>;

export type SyntheticOfficialOverlay = Readonly<{
  schemaVersion: 1;
  overlayId: string;
  overlaySha256: string;
  productionEligible: false;
  records: readonly SyntheticOfficialRecord[];
}>;

export type IntegratedEvent = Readonly<{
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  eventId: string;
  kind: OfficialKind | "detected-change";
  evidence: "official-record" | "satellite-observation";
  year: number;
  sourceVersion: string;
  areaHectares: number;
  geometry: DetectedChangeGeometry;
  cellIndices: readonly number[];
  boundaryIntersections: readonly Readonly<{ boundaryId: string; geographyType: PlaceType; boundaryEdition: string; intersectedHectares: number }>[];
  matching: MatchingResult | null;
  matchedDetectedChangeIds: readonly string[];
  lineage: Readonly<{
    baselineBatchId: string;
    methodVersion: string;
    methodParameterSha256: string;
    dataVersion: string;
    boundaryEdition: string;
    boundaryCrosswalkSha256: string;
    officialOverlaySha256: string;
    sourcePatchChecksumSha256: string | null;
  }>;
}>;

export type IntegratedAggregate = Readonly<{
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  boundaryId: string;
  geographyType: PlaceType;
  province: string;
  boundaryEdition: string;
  timeRange: Readonly<{ fromYear: number; toYear: number }>;
  denominator: Readonly<{ kind: "forested-hectares"; hectares: number; referenceYear: number; forestDefinitionVersion: string }>;
  eventHectares: number;
  shareOfFirstYearForest: Readonly<{ kind: "figure"; percent: number }> | Readonly<{ kind: "unknown"; reason: string }>;
  winningEventIds: readonly string[];
  retainedEvidenceIds: readonly string[];
  methodVersion: string;
  methodParameterSha256: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
  lineage: Readonly<{
    baselineBatchId: string;
    landCoverSha256: string;
    boundaryId: string;
    boundaryEdition: string;
    boundaryCrosswalkSha256: string;
    officialOverlaySha256: string;
    methodParameterSha256: string;
    dataVersion: string;
    fromYear: number;
    toYear: number;
    firstYearForestedHectares: number;
    winningEventIds: readonly string[];
    retainedEvidenceIds: readonly string[];
  }>;
  lineageSha256: string;
}>;

export type SyntheticIntegrationResult = Readonly<{
  reviewStatus: "unapproved";
  productionEligible: false;
  events: readonly IntegratedEvent[];
  aggregates: readonly IntegratedAggregate[];
  precedence: ReturnType<typeof resolvePrecedence>;
}>;

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function intersectionCount(first: readonly number[], second: readonly number[]): number {
  const values = new Set(first);
  return second.reduce((count, value) => count + (values.has(value) ? 1 : 0), 0);
}

function validateAllGeographies(crosswalk: BoundaryCrosswalkInput): void {
  const present = new Set(crosswalk.boundaries.map((boundary) => boundary.geographyType));
  if (PLACE_TYPES.some((type) => !present.has(type)) || [...present].some((type) => !PLACE_TYPES.includes(type as PlaceType))) {
    throw new Error("Synthetic integration requires versioned boundaries for exactly all eight geography types.");
  }
}

function validateExecutableMethod(manifest: BaselineBatchManifest, method: MethodParameterManifest): void {
  validateBatchMethodBinding(manifest, method);
  const parameters = method.parameters;
  if (parameters.matching.minimumOverlapOfSmallerGeometry !== MATCHING_PARAMETERS.minimumOverlapOfSmallerGeometry ||
      parameters.matching.standardTemporalToleranceYears !== MATCHING_PARAMETERS.standardTemporalToleranceYears ||
      parameters.matching.historicalTemporalToleranceYears !== MATCHING_PARAMETERS.historicalTemporalToleranceYears ||
      parameters.matching.historicalYearExclusive !== MATCHING_PARAMETERS.historicalYearExclusive ||
      parameters.matching.multipleCandidateRule !== "highest-overlap-stable-input-order" ||
      stableJson(parameters.precedence) !== stableJson(PRECEDENCE_ORDER) ||
      parameters.aggregation.denominatorReference !== "first-year-of-range" ||
      parameters.aggregation.overlapPolicy !== "precedence-once-per-hectare-year" ||
      parameters.aggregation.areaUnit !== "hectare" ||
      parameters.aggregation.decimalPlaces !== 6 ||
      parameters.boundary.cellIntersection !== "fractional-area" ||
      parameters.boundary.gridAlignment !== "exact" ||
      parameters.boundary.snapToleranceMetres !== 0 ||
      parameters.boundary.boundaryEditionRequired !== true) {
    throw new Error("Synthetic integration requires the exact executable matching, precedence, aggregation, and boundary method parameters.");
  }
}

function validateIntegrationLineage(manifest: BaselineBatchManifest, grid: BaselineGrid, baseline: BaselineBatchResult, crosswalk: BoundaryCrosswalkInput): void {
  if (stableJson(crosswalk.grid) !== stableJson(grid)) throw new Error("Synthetic integration requires the exact baseline grid and forbids implicit reprojection.");
  const boundaryIds = new Set<string>();
  for (const boundary of crosswalk.boundaries) {
    if (!boundary.boundaryId.trim() || boundaryIds.has(boundary.boundaryId)) throw new Error("Synthetic integration boundaries require unique non-empty identity.");
    boundaryIds.add(boundary.boundaryId);
  }
  const pairs = new Set<string>();
  for (const row of crosswalk.intersections) {
    const pair = `${row.boundaryId}\0${row.cellIndex}`;
    if (!boundaryIds.has(row.boundaryId) || pairs.has(pair) || !Number.isSafeInteger(row.cellIndex) || row.cellIndex < 0 || row.cellIndex >= grid.width * grid.height || !Number.isFinite(row.cellFraction) || row.cellFraction <= 0 || row.cellFraction > 1) {
      throw new Error("Synthetic integration intersections require unique in-grid boundary-cell fractions in (0, 1].");
    }
    pairs.add(pair);
  }
  if (baseline.aggregates.some((row) => row.boundaryEdition !== crosswalk.boundaryEdition || row.methodVersion !== manifest.methodVersion || row.methodParameterSha256 !== manifest.methodParameterSha256 || row.dataVersion !== manifest.dataVersion || row.coverageGrade !== manifest.coverageGrade)) {
    throw new Error("Synthetic integration aggregate lineage must match the exact batch, method, data, coverage, and boundary edition.");
  }
  for (const event of baseline.detectedChange.flatMap((year) => year.events)) {
    if (event.productionEligible !== false || event.methodVersion !== manifest.methodVersion || event.methodParameterSha256 !== manifest.methodParameterSha256 || event.dataVersion !== manifest.dataVersion || event.coverageGrade !== manifest.coverageGrade || event.lineage.batchId !== manifest.batchId) {
      throw new Error("Synthetic integration detected-change lineage must match the exact non-production baseline batch.");
    }
  }
}

export function officialOverlaySha256(records: readonly SyntheticOfficialRecord[]): string {
  return sha256(stableJson({ records }));
}

function validateOverlay(overlay: SyntheticOfficialOverlay, cellCount: number, firstYear: number, lastYear: number): void {
  if (overlay.schemaVersion !== 1 || !overlay.overlayId.trim() || overlay.productionEligible !== false || !SHA256.test(overlay.overlaySha256) || overlay.overlaySha256 !== officialOverlaySha256(overlay.records)) {
    throw new Error("Synthetic official overlay requires exact identity, checksum, and non-production status.");
  }
  const ids = new Set<string>();
  for (const record of overlay.records) {
    if (!record.id.trim() || ids.has(record.id) || !OFFICIAL_KINDS.includes(record.kind) || !Number.isSafeInteger(record.year) || record.year < firstYear || record.year > lastYear || !record.sourceVersion.trim() || record.cellIndices.length === 0 || new Set(record.cellIndices).size !== record.cellIndices.length || record.cellIndices.some((cell) => !Number.isSafeInteger(cell) || cell < 0 || cell >= cellCount)) {
      throw new Error("Synthetic official records require unique identity, valid year, source version, and unique in-grid cells.");
    }
    if (record.kind === "recorded-harvest" && record.qualifyingRecordedHarvest !== true) throw new Error("Synthetic recorded harvest must be explicitly qualified before precedence.");
    if (record.kind === "fire" && record.qualifyingRecordedHarvest !== undefined) throw new Error("Fire records cannot carry a harvest qualification.");
    ids.add(record.id);
  }
}

function qualifyingRecordIds(matching: MatchingResult): ReadonlySet<string> {
  const ids = new Set<string>();
  if (matching.selectedMatch) ids.add(matching.selectedMatch.candidate.id);
  for (const rejected of matching.rejectedCandidates) if (rejected.reason === "lower-overlap-than-selected") ids.add(rejected.candidate.id);
  return ids;
}

function boundaryIntersections(crosswalk: BoundaryCrosswalkInput, cellIndices: readonly number[], pixelHectares: number): IntegratedEvent["boundaryIntersections"] {
  const cells = new Set(cellIndices);
  return Object.freeze([...crosswalk.boundaries].sort((a, b) => a.boundaryId.localeCompare(b.boundaryId)).flatMap((boundary) => {
    const intersectedHectares = round(crosswalk.intersections
      .filter((row) => row.boundaryId === boundary.boundaryId && cells.has(row.cellIndex))
      .reduce((sum, row) => sum + row.cellFraction * pixelHectares, 0));
    return intersectedHectares > 0 ? [Object.freeze({ boundaryId: boundary.boundaryId, geographyType: boundary.geographyType as PlaceType, boundaryEdition: crosswalk.boundaryEdition, intersectedHectares })] : [];
  }));
}

export function integrateSyntheticEvents(args: Readonly<{
  manifest: BaselineBatchManifest;
  method: MethodParameterManifest;
  grid: BaselineGrid;
  baseline: BaselineBatchResult;
  crosswalk: BoundaryCrosswalkInput;
  overlay: SyntheticOfficialOverlay;
  fromYear: number;
  toYear: number;
}>): SyntheticIntegrationResult {
  const { manifest, method, grid, baseline, crosswalk, overlay, fromYear, toYear } = args;
  if (!Number.isSafeInteger(fromYear) || !Number.isSafeInteger(toYear) || fromYear > toYear) throw new Error("Synthetic integration requires a valid inclusive year range.");
  if (crosswalk.boundaryEdition.trim() === "" || !SHA256.test(manifest.inputs.boundaryCrosswalk.sha256)) throw new Error("Synthetic integration requires a checksum-bound boundary edition.");
  validateExecutableMethod(manifest, method);
  validateAllGeographies(crosswalk);
  validateIntegrationLineage(manifest, grid, baseline, crosswalk);
  const maskYears = baseline.masks.map((mask) => mask.year);
  if (maskYears.length === 0) throw new Error("Synthetic integration requires baseline masks.");
  validateOverlay(overlay, grid.width * grid.height, Math.min(...maskYears), Math.max(...maskYears));
  const pixelHectares = Math.abs(grid.geotransform[1] * grid.geotransform[5]) / 10_000;
  const officialById = new Map(overlay.records.map((record) => [record.id, record]));
  const matchedChangesByOfficial = new Map<string, string[]>();
  const integratedEvents: IntegratedEvent[] = [];
  const precedenceEvents: PrecedenceEvent[] = [];
  const usedOfficialCells = new Set<string>();

  const detected = baseline.detectedChange.flatMap((year) => year.events);
  for (const event of detected) {
    const candidates: OfficialRecordCandidate[] = overlay.records.map((record) => ({
      id: record.id,
      eventYear: record.year,
      geometryHectares: round(record.cellIndices.length * pixelHectares),
      intersectionHectares: round(intersectionCount(event.cellIndices, record.cellIndices) * pixelHectares),
    }));
    const matching = matchDetectedChange({ id: event.eventId, observationYear: event.observationYear, geometryHectares: event.areaHectares }, candidates);
    const qualifying = qualifyingRecordIds(matching);
    for (const recordId of qualifying) {
      const list = matchedChangesByOfficial.get(recordId) ?? [];
      list.push(event.eventId);
      matchedChangesByOfficial.set(recordId, list);
    }
    integratedEvents.push(Object.freeze({
      status: "example", reviewStatus: "unapproved", productionEligible: false, eventId: event.eventId, kind: "detected-change", evidence: "satellite-observation", year: event.observationYear,
      sourceVersion: manifest.dataVersion, areaHectares: event.areaHectares, geometry: event.geometry, cellIndices: event.cellIndices, boundaryIntersections: boundaryIntersections(crosswalk, event.cellIndices, pixelHectares), matching, matchedDetectedChangeIds: Object.freeze([]),
      lineage: Object.freeze({ baselineBatchId: manifest.batchId, methodVersion: manifest.methodVersion, methodParameterSha256: manifest.methodParameterSha256, dataVersion: manifest.dataVersion, boundaryEdition: crosswalk.boundaryEdition, boundaryCrosswalkSha256: manifest.inputs.boundaryCrosswalk.sha256, officialOverlaySha256: overlay.overlaySha256, sourcePatchChecksumSha256: event.patchChecksumSha256 }),
    }));
    for (const cellIndex of event.cellIndices) {
      const covering = [...qualifying].map((id) => officialById.get(id)!).filter((record) => record.cellIndices.includes(cellIndex));
      if (covering.length === 0) {
        precedenceEvents.push({ id: `${event.eventId}:unmatched:${cellIndex}`, hectareYearId: `${event.observationYear}:${cellIndex}`, year: event.observationYear, hectares: pixelHectares, kind: "unmatched-detected-change" });
      } else {
        for (const record of covering) {
          usedOfficialCells.add(`${record.id}:${cellIndex}`);
          precedenceEvents.push({ id: `${record.id}:matched:${event.observationYear}:${cellIndex}`, hectareYearId: `${event.observationYear}:${cellIndex}`, year: event.observationYear, hectares: pixelHectares, kind: record.kind, ...(record.kind === "recorded-harvest" ? { qualifyingRecordedHarvest: true } : {}) });
        }
      }
    }
  }

  for (const record of overlay.records) {
    integratedEvents.push(Object.freeze({
      status: "example", reviewStatus: "unapproved", productionEligible: false, eventId: record.id, kind: record.kind, evidence: "official-record", year: record.year,
      sourceVersion: record.sourceVersion, areaHectares: round(record.cellIndices.length * pixelHectares), geometry: geometryForGridCells(grid, record.cellIndices), cellIndices: Object.freeze([...record.cellIndices].sort((a, b) => a - b)), boundaryIntersections: boundaryIntersections(crosswalk, record.cellIndices, pixelHectares), matching: null,
      matchedDetectedChangeIds: Object.freeze([...(matchedChangesByOfficial.get(record.id) ?? [])].sort()),
      lineage: Object.freeze({ baselineBatchId: manifest.batchId, methodVersion: manifest.methodVersion, methodParameterSha256: manifest.methodParameterSha256, dataVersion: manifest.dataVersion, boundaryEdition: crosswalk.boundaryEdition, boundaryCrosswalkSha256: manifest.inputs.boundaryCrosswalk.sha256, officialOverlaySha256: overlay.overlaySha256, sourcePatchChecksumSha256: null }),
    }));
    for (const cellIndex of record.cellIndices) {
      if (usedOfficialCells.has(`${record.id}:${cellIndex}`)) continue;
      precedenceEvents.push({ id: `${record.id}:official:${record.year}:${cellIndex}`, hectareYearId: `${record.year}:${cellIndex}`, year: record.year, hectares: pixelHectares, kind: record.kind, ...(record.kind === "recorded-harvest" ? { qualifyingRecordedHarvest: true } : {}) });
    }
  }

  const precedence = [...resolvePrecedence(precedenceEvents)].sort((a, b) => a.year - b.year || a.hectareYearId.localeCompare(b.hectareYearId));
  const aggregates: IntegratedAggregate[] = [];
  for (const boundary of [...crosswalk.boundaries].sort((a, b) => a.boundaryId.localeCompare(b.boundaryId))) {
    const denominator = baseline.aggregates.find((row) => row.boundaryId === boundary.boundaryId && row.year === fromYear);
    if (!denominator) throw new Error(`Boundary ${boundary.boundaryId} lacks its first-year forest denominator.`);
    const fractions = new Map(crosswalk.intersections.filter((row) => row.boundaryId === boundary.boundaryId).map((row) => [row.cellIndex, row.cellFraction]));
    const included = precedence.filter((resolution) => resolution.winner && resolution.year >= fromYear && resolution.year <= toYear && fractions.has(Number(resolution.hectareYearId.split(":").at(-1))));
    const hectares = round(included.reduce((sum, resolution) => sum + pixelHectares * (fractions.get(Number(resolution.hectareYearId.split(":").at(-1))) ?? 0), 0));
    const winningEventIds = Object.freeze(included.map((resolution) => resolution.winner!.id));
    const retainedEvidenceIds = Object.freeze(included.flatMap((resolution) => resolution.retainedEvidence.map((event) => event.id)));
    const lineage = Object.freeze({
      baselineBatchId: manifest.batchId,
      landCoverSha256: manifest.inputs.landCover.sha256,
      boundaryId: boundary.boundaryId,
      boundaryEdition: crosswalk.boundaryEdition,
      boundaryCrosswalkSha256: manifest.inputs.boundaryCrosswalk.sha256,
      officialOverlaySha256: overlay.overlaySha256,
      methodParameterSha256: manifest.methodParameterSha256,
      dataVersion: manifest.dataVersion,
      fromYear,
      toYear,
      firstYearForestedHectares: denominator.forestedHectares,
      winningEventIds,
      retainedEvidenceIds,
    });
    aggregates.push(Object.freeze({
      status: "example", reviewStatus: "unapproved", productionEligible: false, boundaryId: boundary.boundaryId, geographyType: boundary.geographyType as PlaceType, province: boundary.province, boundaryEdition: crosswalk.boundaryEdition,
      timeRange: Object.freeze({ fromYear, toYear }), denominator: Object.freeze({ kind: "forested-hectares", hectares: denominator.forestedHectares, referenceYear: fromYear, forestDefinitionVersion: manifest.forestDefinitionVersion }),
      eventHectares: hectares,
      shareOfFirstYearForest: denominator.forestedHectares > 0 ? Object.freeze({ kind: "figure", percent: round((hectares / denominator.forestedHectares) * 100) }) : Object.freeze({ kind: "unknown", reason: "The first-year forest denominator is zero; no rate is computed." }),
      winningEventIds, retainedEvidenceIds, methodVersion: manifest.methodVersion, methodParameterSha256: manifest.methodParameterSha256, dataVersion: manifest.dataVersion, coverageGrade: manifest.coverageGrade, lineage, lineageSha256: sha256(stableJson(lineage)),
    }));
  }
  return Object.freeze({ reviewStatus: "unapproved", productionEligible: false, events: Object.freeze(integratedEvents.sort((a, b) => a.year - b.year || a.eventId.localeCompare(b.eventId))), aggregates: Object.freeze(aggregates), precedence: Object.freeze(precedence) });
}
