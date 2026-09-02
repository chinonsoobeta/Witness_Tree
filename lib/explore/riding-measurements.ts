import source from "@/data/phase2-riding-map-measurements.json";
import type { RidingBoundaryMeasurement } from "./boundary-readout";

const CLAIMS = {
  admitted: false,
  released: false,
  productionEligible: false,
  externalAction: false,
} as const;

const EXPECTED_COUNTS = {
  CA: 343,
  BC: 93,
  AB: 87,
  ON: 124,
  QC: 127,
} as const;

type SourceMeasurement = Readonly<{
  overlay: unknown;
  jurisdiction: unknown;
  boundaryId: unknown;
  fromYear: unknown;
  toYear: unknown;
  knownForestedHectares: unknown;
  knownObservedLossHectares: unknown;
  lossHectares: unknown;
  observedLossPercent: unknown;
  unknownRequiredInputHectares: unknown;
  unmappedByProductExtentHectares: unknown;
  districtHectares: unknown;
  coverageGrade: unknown;
  evidence: unknown;
  claims: unknown;
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactClaims = (value: unknown) =>
  object(value) &&
  Object.keys(value).length === 4 &&
  Object.entries(CLAIMS).every(([key, expected]) => value[key] === expected);

const nonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const nullableNonNegative = (value: unknown): value is number | null =>
  value === null || nonNegative(value);

/**
 * Fails closed before checked-in local riding results reach the client map.
 * The converter has already bound the source files; this adapter validates the
 * public join contract and the incomplete-coverage null semantics again.
 */
export function parseRidingMapMeasurements(value: unknown): readonly RidingBoundaryMeasurement[] {
  if (!object(value) ||
    value.schemaVersion !== "witness-tree/phase2-riding-map-measurements/1" ||
    value.status !== "local-nonproduction-executed" ||
    !exactClaims(value.claims) ||
    !object(value.context) ||
    !object(value.context.interval) ||
    value.context.interval.fromYear !== 2021 ||
    value.context.interval.toYear !== 2022 ||
    !Array.isArray(value.sources) ||
    value.sources.length !== 5 ||
    !Array.isArray(value.measurements) ||
    value.measurements.length !== 774) {
    throw new Error("Riding map measurements have an invalid release envelope.");
  }

  const counts = new Map<string, number>();
  const identities = new Set<string>();
  const result = value.measurements.map((candidate, index) => {
    if (!object(candidate)) throw new Error(`Riding map measurement ${index} is not an object.`);
    const row = candidate as SourceMeasurement;
    const jurisdiction = row.jurisdiction;
    const overlay = row.overlay;
    const boundaryId = row.boundaryId;
    const expectedOverlay = jurisdiction === "CA" ? "federal-ridings" : "provincial-ridings";
    if (typeof jurisdiction !== "string" || !(jurisdiction in EXPECTED_COUNTS) ||
      typeof overlay !== "string" || overlay !== expectedOverlay ||
      typeof boundaryId !== "string" || boundaryId.trim() === "" ||
      row.fromYear !== 2021 || row.toYear !== 2022 ||
      !nonNegative(row.knownForestedHectares) ||
      !nonNegative(row.knownObservedLossHectares) ||
      !nullableNonNegative(row.lossHectares) ||
      !nullableNonNegative(row.observedLossPercent) ||
      !nonNegative(row.unknownRequiredInputHectares) ||
      !nonNegative(row.unmappedByProductExtentHectares) ||
      !nonNegative(row.districtHectares) ||
      !["complete", "partial-with-unknown", "none-mapped"].includes(String(row.coverageGrade)) ||
      row.evidence !== "satellite-observation" || !exactClaims(row.claims)) {
      throw new Error(`Riding map measurement ${index} has an invalid contract.`);
    }
    const complete = row.coverageGrade === "complete";
    if (complete !== (row.unknownRequiredInputHectares === 0) ||
      complete !== (row.lossHectares !== null) ||
      complete !== (row.observedLossPercent !== null)) {
      throw new Error(`Riding map measurement ${index} has inconsistent coverage semantics.`);
    }
    // Boundary tiles namespace every source identifier with its jurisdiction
    // (`CA-10001`, `BC-258`, and so on). Keep that exact public join key here
    // while the governed aggregation artifact retains the authority's raw id.
    const tileBoundaryId = `${jurisdiction}-${boundaryId}`;
    const identity = `${overlay}|${jurisdiction}|${tileBoundaryId}`;
    if (identities.has(identity)) throw new Error(`Duplicate riding map measurement ${identity}.`);
    identities.add(identity);
    counts.set(jurisdiction, (counts.get(jurisdiction) ?? 0) + 1);
    return {
      overlay,
      jurisdiction,
      boundaryId: tileBoundaryId,
      coverage: row.coverageGrade,
      fromYear: 2021,
      toYear: 2022,
      observedLossPercent: row.observedLossPercent,
      observedLossHectares: row.lossHectares,
      knownObservedSubtotalHectares: row.knownObservedLossHectares,
    } as RidingBoundaryMeasurement;
  });

  for (const [jurisdiction, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts.get(jurisdiction) !== expected) {
      throw new Error(`Riding map measurements have an invalid ${jurisdiction} count.`);
    }
  }
  return result;
}

export const ridingMeasurements = parseRidingMapMeasurements(source);
