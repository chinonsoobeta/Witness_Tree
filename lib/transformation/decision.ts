import type { StagedTransformationDecision, StagedTransformationInput } from "./types";

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

/**
 * Produces a staging-only decision from profiled source evidence. It performs no
 * geometry transformation, data ingestion, storage, or network access.
 */
export function decideStagedTransformation(input: StagedTransformationInput): StagedTransformationDecision {
  if (!SHA_256.test(input.rawChecksumSha256)) throw new Error("Transformation requires a SHA-256 source checksum.");
  const checksum = input.rawChecksumSha256.toLowerCase();
  if (checksum !== EXPECTED_CHECKSUMS[input.sourceId]) throw new Error("Transformation checksum does not match the staged profile.");
  const invalidGeometryCount = requireKnownCount(input.invalidGeometryCount);

  if (input.sourceId === "qc-historic-wildfire-detailed") {
    if (input.profileDecision !== "ready-for-transformation-design" || input.attributionState !== "metadata-verified" || invalidGeometryCount !== 0) {
      throw new Error("Québec can be considered only with its clean, attributed staged profile.");
    }
    return Object.freeze({
      ...input,
      rawChecksumSha256: checksum,
      status: "ready-for-transformation-design",
      reason: "The staged profile is clean and attribution metadata is verified. This permits transformation design only.",
      eligibleForTransformationDesign: true,
      eligibleForIngestion: false,
      productionEligible: false,
    });
  }

  if (input.profileDecision !== "blocked-pending-geometry-policy" || input.attributionState !== "pending-review" || invalidGeometryCount === 0 || input.geometryPolicy) {
    throw new Error("Alberta remains blocked until attributed evidence and a deterministic repair-or-quarantine policy are profiled and approved.");
  }
  return Object.freeze({
    ...input,
    rawChecksumSha256: checksum,
    status: "blocked",
    reason: "The staged profile reports invalid geometries and attribution remains pending review. No transformation or ingestion is allowed.",
    eligibleForTransformationDesign: false,
    eligibleForIngestion: false,
    productionEligible: false,
  });
}
