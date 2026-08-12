import type { EvidenceClass } from "../domain/evidence";

export const MATCHING_PARAMETERS = Object.freeze({
  minimumOverlapOfSmallerGeometry: 0.5,
  standardTemporalToleranceYears: 2,
  historicalTemporalToleranceYears: 3,
  historicalYearExclusive: 1995,
});

export type DetectedChange = Readonly<{
  id: string;
  observationYear: number;
  geometryHectares: number;
}>;

/** A record paired with a detected change using a precomputed intersection area. */
export type OfficialRecordCandidate = Readonly<{
  id: string;
  eventYear: number;
  geometryHectares: number;
  intersectionHectares: number;
}>;

export type CandidateRejectionReason =
  | "outside-temporal-tolerance"
  | "below-spatial-tolerance"
  | "invalid-geometry";

export type RejectedCandidate = Readonly<{
  candidate: OfficialRecordCandidate;
  overlapShare: number | null;
  reason: CandidateRejectionReason | "lower-overlap-than-selected";
}>;

export type OfficialRecordMatch = Readonly<{
  candidate: OfficialRecordCandidate;
  overlapShare: number;
}>;

export type MatchingResult = Readonly<{
  detectedChange: DetectedChange;
  evidenceClass: EvidenceClass;
  temporalToleranceYears: number;
  selectedMatch: OfficialRecordMatch | null;
  rejectedCandidates: readonly RejectedCandidate[];
  nonMatchReason?: string;
}>;

export type MatchingOptions = Readonly<{
  /** Kept whenever no official record satisfies both matching tolerances. */
  nonMatchReason?: string;
}>;

export function temporalToleranceYears(observationYear: number): number {
  return observationYear < MATCHING_PARAMETERS.historicalYearExclusive
    ? MATCHING_PARAMETERS.historicalTemporalToleranceYears
    : MATCHING_PARAMETERS.standardTemporalToleranceYears;
}

/** Returns intersection divided by the smaller geometry, or null for invalid areas. */
export function overlapShareOfSmallerGeometry(
  firstGeometryHectares: number,
  secondGeometryHectares: number,
  intersectionHectares: number,
): number | null {
  if (
    !Number.isFinite(firstGeometryHectares) ||
    !Number.isFinite(secondGeometryHectares) ||
    !Number.isFinite(intersectionHectares) ||
    firstGeometryHectares <= 0 ||
    secondGeometryHectares <= 0 ||
    intersectionHectares < 0 ||
    intersectionHectares > firstGeometryHectares ||
    intersectionHectares > secondGeometryHectares
  ) {
    return null;
  }

  return intersectionHectares / Math.min(firstGeometryHectares, secondGeometryHectares);
}

/**
 * Matches one detected change to official records. Geometry intersections are supplied by
 * the caller so this policy stays independent of a particular spatial database.
 */
export function matchDetectedChange(
  detectedChange: DetectedChange,
  candidates: readonly OfficialRecordCandidate[],
  options: MatchingOptions = {},
): MatchingResult {
  const tolerance = temporalToleranceYears(detectedChange.observationYear);
  const qualifying: OfficialRecordMatch[] = [];
  const rejectedCandidates: RejectedCandidate[] = [];

  for (const candidate of candidates) {
    const overlapShare = overlapShareOfSmallerGeometry(
      detectedChange.geometryHectares,
      candidate.geometryHectares,
      candidate.intersectionHectares,
    );

    if (overlapShare === null) {
      rejectedCandidates.push({ candidate, overlapShare, reason: "invalid-geometry" });
    } else if (Math.abs(candidate.eventYear - detectedChange.observationYear) > tolerance) {
      rejectedCandidates.push({ candidate, overlapShare, reason: "outside-temporal-tolerance" });
    } else if (overlapShare < MATCHING_PARAMETERS.minimumOverlapOfSmallerGeometry) {
      rejectedCandidates.push({ candidate, overlapShare, reason: "below-spatial-tolerance" });
    } else {
      qualifying.push({ candidate, overlapShare });
    }
  }

  qualifying.sort((left, right) => right.overlapShare - left.overlapShare);
  const selectedMatch = qualifying[0] ?? null;
  for (const rejected of qualifying.slice(1)) {
    rejectedCandidates.push({
      candidate: rejected.candidate,
      overlapShare: rejected.overlapShare,
      reason: "lower-overlap-than-selected",
    });
  }

  if (selectedMatch) {
    return { detectedChange, evidenceClass: "official-record", temporalToleranceYears: tolerance, selectedMatch, rejectedCandidates };
  }

  return {
    detectedChange,
    evidenceClass: "satellite-observation",
    temporalToleranceYears: tolerance,
    selectedMatch: null,
    rejectedCandidates,
    nonMatchReason: options.nonMatchReason?.trim() || "No official record met the date and geometry matching tolerances.",
  };
}

/** Official records are evidence even where no detected change was matched to them. */
export function recordedWithoutDetectedChange<T extends { readonly id: string }>(
  records: readonly T[],
  matchedRecordIds: ReadonlySet<string>,
): readonly T[] {
  return records.filter((record) => !matchedRecordIds.has(record.id));
}
