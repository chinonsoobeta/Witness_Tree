import {
  matchDetectedChange,
  type DetectedChange,
  type OfficialRecordCandidate,
} from "../pipeline/matching";
import type { ChangePatchBinding } from "./raster-to-change-vector";

export type ProvincialChange = DetectedChange & Readonly<{ province: "BC" | "QC"; sourcePatch?: ChangePatchBinding }>;
export type ProvincialCandidateSet = Readonly<{
  change: ProvincialChange;
  candidates: readonly OfficialRecordCandidate[];
}>;

export type ProvincialMatchingReadiness = Readonly<{
  sourceRightsVerified: boolean;
  sourceEvidenceAdmitted: boolean;
  sourceTransformationApproved: boolean;
  sourceReleaseApproved: boolean;
  changeGeometryMaterialized: boolean;
}>;

export type ProvincialMatchingReport = Readonly<{
  status: "computed-nonproduction" | "blocked";
  productionEligible: false;
  counts: Readonly<{ assessedChanges: number; matchedChanges: number; unmatchedChanges: number }> | null;
  matchRate: number | null;
  nonMatchRate: number | null;
  nonMatchReasonDistribution: Readonly<Record<string, number>> | null;
  blockers: readonly string[];
}>;

const READINESS_FIELDS = [
  ["sourceRightsVerified", "Provincial source reuse rights are not verified."],
  ["sourceEvidenceAdmitted", "Provincial source evidence is not admitted."],
  ["sourceTransformationApproved", "Provincial source transformation is not approved."],
  ["sourceReleaseApproved", "Provincial source release is not approved."],
  ["changeGeometryMaterialized", "Phase 2 change geometry is not materialized for provincial matching."],
] as const;

function blockedReport(blockers: readonly string[]): ProvincialMatchingReport {
  return {
    status: "blocked",
    productionEligible: false,
    counts: null,
    matchRate: null,
    nonMatchRate: null,
    nonMatchReasonDistribution: null,
    blockers: Object.freeze([...blockers]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function validPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Reject malformed candidate sets before the aggregate is calculated.  The
 * matching policy intentionally returns `invalid-geometry` for a single
 * malformed candidate, but treating that data-quality defect as an ordinary
 * provincial non-match would make a numeric report look complete.  A report
 * boundary therefore returns the same all-null blocked shape used for other
 * unavailable inputs.
 */
function validateCandidateSets(candidateSets: unknown): readonly string[] {
  if (!Array.isArray(candidateSets)) return ["Provincial candidate sets must be an array."];
  const blockers: string[] = [];
  const changeIds = new Set<string>();

  candidateSets.forEach((candidateSet, setIndex) => {
    if (!isRecord(candidateSet)) {
      blockers.push(`Provincial candidate set ${setIndex} must be an object.`);
      return;
    }
    const change = candidateSet.change;
    if (!isRecord(change)) {
      blockers.push(`Provincial candidate set ${setIndex} is missing its change.`);
    } else {
      const id = change.id;
      if (!validId(id)) blockers.push(`Provincial change ${setIndex} requires a non-empty id.`);
      else if (changeIds.has(id)) blockers.push(`Provincial changes contain duplicate identifier ${id}.`);
      else changeIds.add(id);
      if (change.province !== "BC" && change.province !== "QC") blockers.push(`Provincial change ${setIndex} must belong to BC or QC.`);
      if (!validInteger(change.observationYear)) blockers.push(`Provincial change ${setIndex} requires a positive integer observation year.`);
      if (!validPositiveFinite(change.geometryHectares)) blockers.push(`Provincial change ${setIndex} requires a positive finite geometry area.`);
    }

    if (!Array.isArray(candidateSet.candidates)) {
      blockers.push(`Provincial candidate set ${setIndex} must contain an array of candidates.`);
      return;
    }
    const eventIds = new Set<string>();
    candidateSet.candidates.forEach((candidate, candidateIndex) => {
      if (!isRecord(candidate)) {
        blockers.push(`Candidate ${setIndex}/${candidateIndex} must be an object.`);
        return;
      }
      if (!validId(candidate.id)) blockers.push(`Candidate ${setIndex}/${candidateIndex} requires a non-empty id.`);
      else if (eventIds.has(candidate.id)) blockers.push(`Candidate set ${setIndex} contains duplicate identifier ${candidate.id}.`);
      else eventIds.add(candidate.id);
      if (!validInteger(candidate.eventYear)) blockers.push(`Candidate ${setIndex}/${candidateIndex} requires a positive integer event year.`);
      if (!validPositiveFinite(candidate.geometryHectares)) blockers.push(`Candidate ${setIndex}/${candidateIndex} requires a positive finite geometry area.`);
      if (!validNonNegativeFinite(candidate.intersectionHectares)) blockers.push(`Candidate ${setIndex}/${candidateIndex} requires a finite non-negative intersection area.`);
      if (validPositiveFinite(candidate.geometryHectares) && validNonNegativeFinite(candidate.intersectionHectares)
        && candidate.intersectionHectares > candidate.geometryHectares) {
        blockers.push(`Candidate ${setIndex}/${candidateIndex} intersection cannot exceed its geometry area.`);
      }
      if (isRecord(change) && validPositiveFinite(change.geometryHectares) && validNonNegativeFinite(candidate.intersectionHectares)
        && candidate.intersectionHectares > change.geometryHectares) {
        blockers.push(`Candidate ${setIndex}/${candidateIndex} intersection cannot exceed its change area.`);
      }
    });
  });

  return Object.freeze(blockers);
}

/**
 * Produces the Phase 4 reporting values only from an explicitly admitted,
 * transform-approved local source and materialized change geometry. This is a
 * non-production calculation: publication and production eligibility are
 * separate gates. A blocked run has no numeric values, never zeroes.
 */
export function reportProvincialMatching(
  readiness: ProvincialMatchingReadiness,
  candidateSets: readonly ProvincialCandidateSet[],
): ProvincialMatchingReport {
  const blockers = READINESS_FIELDS
    .filter(([field]) => !isRecord(readiness) || readiness[field] !== true)
    .map(([, blocker]) => blocker);
  if (blockers.length > 0) return blockedReport(blockers);

  const inputBlockers = validateCandidateSets(candidateSets);
  if (inputBlockers.length > 0) return blockedReport(inputBlockers);
  if (candidateSets.length === 0) throw new Error("A runnable provincial matching report requires at least one assessed change.");

  let matchedChanges = 0;
  const reasons: Record<string, number> = {};
  const stableCandidateSets = [...candidateSets]
    .sort((left, right) => left.change.id < right.change.id ? -1 : left.change.id > right.change.id ? 1 : 0)
    .map((candidateSet) => ({
      change: candidateSet.change,
      candidates: [...candidateSet.candidates]
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    }));
  for (const { change, candidates } of stableCandidateSets) {
    const result = matchDetectedChange(change, candidates);
    if (result.selectedMatch) {
      matchedChanges += 1;
      continue;
    }
    const reason = candidates.length === 0
      ? "no-official-record-candidates"
      : [...new Set(result.rejectedCandidates.map(({ reason: rejected }) => rejected))]
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
        .join(",") || "no-qualifying-official-record";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const assessedChanges = candidateSets.length;
  const unmatchedChanges = assessedChanges - matchedChanges;
  const nonMatchReasonDistribution = Object.fromEntries(
    Object.entries(reasons).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
  return {
    status: "computed-nonproduction", productionEligible: false,
    counts: { assessedChanges, matchedChanges, unmatchedChanges },
    matchRate: matchedChanges / assessedChanges,
    nonMatchRate: unmatchedChanges / assessedChanges,
    nonMatchReasonDistribution,
    blockers: [],
  };
}
