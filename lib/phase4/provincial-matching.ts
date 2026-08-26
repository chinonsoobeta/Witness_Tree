import {
  matchDetectedChange,
  type DetectedChange,
  type OfficialRecordCandidate,
} from "../pipeline/matching";

export type ProvincialChange = DetectedChange & Readonly<{ province: "BC" | "QC" }>;
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
  const blockers = [
    !readiness.sourceRightsVerified && "Provincial source reuse rights are not verified.",
    !readiness.sourceEvidenceAdmitted && "Provincial source evidence is not admitted.",
    !readiness.sourceTransformationApproved && "Provincial source transformation is not approved.",
    !readiness.sourceReleaseApproved && "Provincial source release is not approved.",
    !readiness.changeGeometryMaterialized && "Phase 2 change geometry is not materialized for provincial matching.",
  ].filter((value): value is string => Boolean(value));
  if (blockers.length > 0) {
    return {
      status: "blocked", productionEligible: false, counts: null, matchRate: null,
      nonMatchRate: null, nonMatchReasonDistribution: null, blockers,
    };
  }
  if (candidateSets.length === 0) throw new Error("A runnable provincial matching report requires at least one assessed change.");

  let matchedChanges = 0;
  const reasons: Record<string, number> = {};
  for (const { change, candidates } of candidateSets) {
    const result = matchDetectedChange(change, candidates);
    if (result.selectedMatch) {
      matchedChanges += 1;
      continue;
    }
    const reason = candidates.length === 0
      ? "no-official-record-candidates"
      : result.rejectedCandidates.map(({ reason: rejected }) => rejected).sort().join(",") || "no-qualifying-official-record";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  const assessedChanges = candidateSets.length;
  const unmatchedChanges = assessedChanges - matchedChanges;
  return {
    status: "computed-nonproduction", productionEligible: false,
    counts: { assessedChanges, matchedChanges, unmatchedChanges },
    matchRate: matchedChanges / assessedChanges,
    nonMatchRate: unmatchedChanges / assessedChanges,
    nonMatchReasonDistribution: reasons,
    blockers: [],
  };
}
