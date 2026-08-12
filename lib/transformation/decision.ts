import type { DeterministicGeometryPolicy, StagedTransformationDecision, StagedTransformationInput } from "./types";

const SHA_256 = /^[a-f0-9]{64}$/i;

const EXPECTED_CHECKSUMS = {
  "qc-historic-wildfire-detailed": "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815",
  "alberta-avi-crown": "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093",
} as const;

function requireKnownCount(value: StagedTransformationInput["invalidGeometryCount"]): number {
  if (value?.kind === "unknown") throw new Error("Transformation cannot treat an unknown invalid geometry count as zero.");
  if (value?.kind !== "known" || !Number.isInteger(value.value) || value.value < 0) throw new Error("Transformation requires a known non-negative invalid geometry count.");
  return value.value;
}

function requireWholeCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Transformation requires a known non-negative ${label}.`);
  return value;
}

/**
 * Validates a supplied policy as input only. It throws when the policy is
 * malformed or self-contradictory; it never decides whether a source is ready.
 */
function requireAccountedPolicy(policy: DeterministicGeometryPolicy, invalidGeometryCount: number): void {
  if (policy.action !== "repair-or-quarantine" || policy.deterministic !== true || typeof policy.version !== "string" || policy.version.length === 0) {
    throw new Error("A geometry policy must be a versioned, deterministic repair-or-quarantine policy.");
  }
  const outcome = policy.outcome;
  if (!outcome) throw new Error("A geometry policy must record how every feature was accounted for.");
  const featureCount = requireWholeCount(outcome.featureCount, "policy feature count");
  const repaired = requireWholeCount(outcome.repairedCount, "policy repaired count");
  const quarantined = requireWholeCount(outcome.quarantinedCount, "policy quarantined count");
  const unchanged = requireWholeCount(outcome.unchangedCount, "policy unchanged count");
  if (repaired + quarantined + unchanged !== featureCount) {
    throw new Error("A geometry policy must account for every feature: repaired, quarantined, and unchanged counts must sum to the feature count.");
  }
  if (repaired + quarantined !== invalidGeometryCount) {
    throw new Error("A geometry policy must resolve exactly the invalid geometries the profile reported.");
  }
}

/**
 * Produces a staging-only decision from profiled source evidence. It performs no
 * geometry transformation, data ingestion, storage, or network access.
 *
 * A throw means the input is malformed or self-contradictory. A source that is
 * not ready is a normal returned `blocked` decision, never a throw, so no
 * moment-in-time state of any source is encoded here as a precondition.
 */
export function decideStagedTransformation(input: StagedTransformationInput): StagedTransformationDecision {
  if (!SHA_256.test(input.rawChecksumSha256)) throw new Error("Transformation requires a SHA-256 source checksum.");
  const checksum = input.rawChecksumSha256.toLowerCase();
  if (checksum !== EXPECTED_CHECKSUMS[input.sourceId]) throw new Error("Transformation checksum does not match the staged profile.");
  const invalidGeometryCount = requireKnownCount(input.invalidGeometryCount);

  if (input.profileDecision === "ready-for-transformation-design" && invalidGeometryCount > 0) {
    throw new Error("A profile cannot be ready for transformation design while it reports invalid geometries.");
  }
  if (input.profileDecision === "blocked-pending-geometry-policy" && invalidGeometryCount === 0) {
    throw new Error("A profile cannot be blocked pending a geometry policy while it reports no invalid geometries.");
  }
  if (input.geometryPolicy) requireAccountedPolicy(input.geometryPolicy, invalidGeometryCount);

  const geometryResolved = invalidGeometryCount === 0 || Boolean(input.geometryPolicy);
  const blockers: string[] = [];
  if (!geometryResolved) blockers.push(`the staged profile reports ${invalidGeometryCount} invalid geometries and no deterministic repair-or-quarantine policy accounts for them`);
  if (input.attributionState !== "metadata-verified") blockers.push("attribution metadata is still pending review");

  if (blockers.length > 0) {
    return Object.freeze({
      ...input,
      rawChecksumSha256: checksum,
      status: "blocked",
      reason: `This staged source is blocked because ${blockers.join(", and ")}. No transformation or ingestion is allowed.`,
      eligibleForTransformationDesign: false,
      eligibleForIngestion: false,
      productionEligible: false,
    });
  }

  return Object.freeze({
    ...input,
    rawChecksumSha256: checksum,
    status: "ready-for-transformation-design",
    reason: input.geometryPolicy
      ? "A deterministic repair-or-quarantine policy accounts for every feature and attribution metadata is verified. This permits transformation design only."
      : "The staged profile is clean and attribution metadata is verified. This permits transformation design only.",
    eligibleForTransformationDesign: true,
    eligibleForIngestion: false,
    productionEligible: false,
  });
}
