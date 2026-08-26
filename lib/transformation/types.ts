export const STAGED_TRANSFORMATION_SOURCE_IDS = ["qc-historic-wildfire-detailed", "alberta-avi-crown"] as const;

export type StagedTransformationSourceId = (typeof STAGED_TRANSFORMATION_SOURCE_IDS)[number];

export type AttributionState = "metadata-verified" | "pending-review";

export type GeometryCount =
  | Readonly<{ kind: "known"; value: number }>
  | Readonly<{ kind: "unknown" }>;

/** Every feature a deterministic policy run visited, split into disjoint classes. */
export type GeometryPolicyOutcome = Readonly<{
  featureCount: number;
  repairedCount: number;
  quarantinedCount: number;
  unchangedCount: number;
}>;

export type DeterministicGeometryPolicy = Readonly<{
  version: string;
  action: "repair-or-quarantine";
  deterministic: true;
  outcome: GeometryPolicyOutcome;
}>;

export type StagedTransformationInput = Readonly<{
  sourceId: StagedTransformationSourceId;
  rawChecksumSha256: string;
  profileDecision: "ready-for-transformation-design" | "blocked-pending-geometry-policy";
  attributionState: AttributionState;
  invalidGeometryCount: GeometryCount;
  geometryPolicy?: DeterministicGeometryPolicy;
}>;

export type StagedTransformationDecision = Readonly<{
  sourceId: StagedTransformationSourceId;
  rawChecksumSha256: string;
  profileDecision: StagedTransformationInput["profileDecision"];
  attributionState: AttributionState;
  invalidGeometryCount: GeometryCount;
  status: "ready-for-transformation-design" | "blocked";
  reason: string;
  eligibleForTransformationDesign: boolean;
  eligibleForIngestion: false;
  productionEligible: false;
}>;
