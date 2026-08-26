import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decideStagedTransformation }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/transformation/decision.ts";
import type { DeterministicGeometryPolicy, StagedTransformationInput } from "../lib/transformation/types";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

type StagedAcquisitions = { entries: { sourceId: string; sha256: string; attributionState: string }[] };
type GeospatialProfile = { sources: { sourceId: string; decision: string; layers: { invalidGeometryCount: number }[] }[] };
type PolicyRun = { specification: string; totals: { featureCount: number; repairedCount: number; quarantinedCount: number; unchangedCount: number } };

const STAGED = readJson<StagedAcquisitions>("../data/staged-acquisitions.json");
const PROFILE = readJson<GeospatialProfile>("../data/staged-geospatial-profile.json");
const ALBERTA_RUN = readJson<PolicyRun>("../data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json");

/** Builds the decision input from the checked-in evidence rather than from a hand-written fixture. */
function stagedInput(sourceId: StagedTransformationInput["sourceId"]): StagedTransformationInput {
  const entry = STAGED.entries.find((candidate) => candidate.sourceId === sourceId);
  const profile = PROFILE.sources.find((candidate) => candidate.sourceId === sourceId);
  assert.ok(entry, `staged-acquisitions.json is missing ${sourceId}`);
  assert.ok(profile, `staged-geospatial-profile.json is missing ${sourceId}`);
  return {
    sourceId,
    rawChecksumSha256: entry.sha256,
    profileDecision: profile.decision as StagedTransformationInput["profileDecision"],
    attributionState: entry.attributionState as StagedTransformationInput["attributionState"],
    invalidGeometryCount: { kind: "known", value: profile.layers.reduce((total, layer) => total + layer.invalidGeometryCount, 0) },
  };
}

const ALBERTA_POLICY: DeterministicGeometryPolicy = {
  version: ALBERTA_RUN.specification,
  action: "repair-or-quarantine",
  deterministic: true,
  outcome: ALBERTA_RUN.totals,
};

const QUEBEC = stagedInput("qc-historic-wildfire-detailed");
const ALBERTA = stagedInput("alberta-avi-crown");

test("allows only transformation design for the clean, attributed Québec staged profile", () => {
  const decision = decideStagedTransformation(QUEBEC);
  assert.equal(decision.status, "ready-for-transformation-design");
  assert.equal(decision.eligibleForTransformationDesign, true);
  assert.equal(decision.eligibleForIngestion, false);
  assert.equal(decision.productionEligible, false);
  assert.equal(decision.rawChecksumSha256, QUEBEC.rawChecksumSha256);
});

test("decides on the real staged Alberta record instead of throwing on its current state", () => {
  // Regression: the previous rule asserted a frozen snapshot of Alberta's state,
  // so the real record threw once its attribution became metadata-verified.
  assert.equal(ALBERTA.attributionState, "metadata-verified");
  const decision = decideStagedTransformation(ALBERTA);
  assert.ok(["blocked", "ready-for-transformation-design"].includes(decision.status));
  assert.equal(decision.eligibleForIngestion, false);
  assert.equal(decision.productionEligible, false);
});

test("keeps the real Alberta record blocked while no policy accounts for its invalid geometries", () => {
  const decision = decideStagedTransformation(ALBERTA);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.eligibleForTransformationDesign, false);
  assert.match(decision.reason, /invalid geometries/i);
});

test("admits the real Alberta record to transformation design only, once the real policy run accounts for every feature", () => {
  const decision = decideStagedTransformation({ ...ALBERTA, geometryPolicy: ALBERTA_POLICY });
  assert.equal(decision.status, "ready-for-transformation-design");
  assert.equal(decision.eligibleForTransformationDesign, true);
  assert.equal(decision.eligibleForIngestion, false);
  assert.equal(decision.productionEligible, false);
});

test("blocks rather than throws when attribution is still pending review", () => {
  const decision = decideStagedTransformation({ ...ALBERTA, attributionState: "pending-review", geometryPolicy: ALBERTA_POLICY });
  assert.equal(decision.status, "blocked");
  assert.equal(decision.eligibleForTransformationDesign, false);
  assert.match(decision.reason, /pending review/i);
});

test("rejects a policy that leaves features unaccounted for", () => {
  const short = { ...ALBERTA_POLICY, outcome: { ...ALBERTA_POLICY.outcome, unchangedCount: ALBERTA_POLICY.outcome.unchangedCount - 1 } };
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, geometryPolicy: short }), /account for every feature/i);
  const overRepaired = { ...ALBERTA_POLICY, outcome: { ...ALBERTA_POLICY.outcome, repairedCount: ALBERTA_POLICY.outcome.repairedCount + 1, unchangedCount: ALBERTA_POLICY.outcome.unchangedCount - 1 } };
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, geometryPolicy: overRepaired }), /exactly the invalid geometries/i);
});

test("rejects a non-deterministic or unversioned policy", () => {
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, geometryPolicy: { ...ALBERTA_POLICY, deterministic: false as unknown as true } }), /deterministic/i);
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, geometryPolicy: { ...ALBERTA_POLICY, version: "" } }), /deterministic/i);
});

test("rejects checksum drift, unknown counts, and self-contradictory profiles", () => {
  assert.throws(() => decideStagedTransformation({ ...QUEBEC, rawChecksumSha256: "a".repeat(64) }), /checksum/i);
  assert.throws(() => decideStagedTransformation({ ...QUEBEC, invalidGeometryCount: { kind: "unknown" } }), /unknown/i);
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, profileDecision: "ready-for-transformation-design" }), /cannot be ready/i);
  assert.throws(() => decideStagedTransformation({ ...QUEBEC, profileDecision: "blocked-pending-geometry-policy" }), /cannot be blocked/i);
});

// The bug this contract change fixes is not hypothetical. Alberta's deterministic
// repair-or-quarantine run is recorded on disk, and the previous decision function threw
// outright whenever a policy was supplied, so the project's own recorded state could not be
// decided at all. These tests drive the decision from that real record rather than a fixture.
test("the recorded Alberta geometry policy is accepted and decided rather than thrown on", () => {
  const run = readJson<{
    sourceId: "alberta-avi-crown";
    rawArchiveSha256: string;
    specification: string;
    totals: { featureCount: number; invalidGeometryCount: number; repairedCount: number; quarantinedCount: number; unchangedCount: number };
  }>("../data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json");

  // The run's own arithmetic is what the validator requires: the three disjoint classes cover
  // every feature, and repairs plus quarantines resolve exactly the invalid geometries found.
  assert.equal(run.totals.repairedCount + run.totals.quarantinedCount + run.totals.unchangedCount, run.totals.featureCount);
  assert.equal(run.totals.repairedCount + run.totals.quarantinedCount, run.totals.invalidGeometryCount);

  const geometryPolicy: DeterministicGeometryPolicy = {
    action: "repair-or-quarantine",
    deterministic: true,
    version: run.specification,
    outcome: {
      featureCount: run.totals.featureCount,
      repairedCount: run.totals.repairedCount,
      quarantinedCount: run.totals.quarantinedCount,
      unchangedCount: run.totals.unchangedCount,
    },
  };
  const base: StagedTransformationInput = {
    sourceId: run.sourceId,
    rawChecksumSha256: run.rawArchiveSha256,
    profileDecision: "blocked-pending-geometry-policy",
    attributionState: "pending-review",
    invalidGeometryCount: { kind: "known", value: run.totals.invalidGeometryCount },
    geometryPolicy,
  };

  // With attribution still pending, the policy resolves the geometry blocker but the source
  // stays blocked, and the reason names attribution alone rather than the geometries.
  const pending = decideStagedTransformation(base);
  assert.equal(pending.status, "blocked");
  assert.equal(pending.eligibleForTransformationDesign, false);
  assert.match(pending.reason, /attribution metadata is still pending review/);
  assert.doesNotMatch(pending.reason, /invalid geometries/);

  // With attribution verified, the source reaches transformation design and no further.
  const verified = decideStagedTransformation({ ...base, attributionState: "metadata-verified" });
  assert.equal(verified.status, "ready-for-transformation-design");
  assert.equal(verified.eligibleForTransformationDesign, true);
  assert.equal(verified.eligibleForIngestion, false);
  assert.equal(verified.productionEligible, false);
  assert.match(verified.reason, /accounts for every feature/);
});

test("a policy that does not account for every feature is refused", () => {
  const run = readJson<{ rawArchiveSha256: string; specification: string; totals: Record<string, number> }>(
    "../data/transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json",
  );
  const policy = (outcome: Record<string, number>): DeterministicGeometryPolicy => ({
    action: "repair-or-quarantine",
    deterministic: true,
    version: run.specification,
    outcome: outcome as DeterministicGeometryPolicy["outcome"],
  });
  const decide = (outcome: Record<string, number>) => decideStagedTransformation({
    sourceId: "alberta-avi-crown",
    rawChecksumSha256: run.rawArchiveSha256,
    profileDecision: "blocked-pending-geometry-policy",
    attributionState: "metadata-verified",
    invalidGeometryCount: { kind: "known", value: run.totals.invalidGeometryCount },
    geometryPolicy: policy(outcome),
  });

  // One feature dropped from the unchanged class: the classes no longer cover the run.
  assert.throws(() => decide({ ...run.totals, unchangedCount: run.totals.unchangedCount - 1 }), /account for every feature/);
  // The quarantined feature quietly reclassified as repaired still sums, and is allowed: the
  // validator checks coverage, not how a feature was resolved. Recorded so the boundary is explicit.
  assert.equal(decide({ ...run.totals, repairedCount: run.totals.repairedCount + 1, quarantinedCount: 0 }).status, "ready-for-transformation-design");
  // Claiming to have resolved fewer invalid geometries than the profile reported.
  assert.throws(() => decide({ ...run.totals, repairedCount: run.totals.repairedCount - 1, unchangedCount: run.totals.unchangedCount + 1 }), /resolve exactly the invalid geometries/);
  // A non-integer or negative count is never silently coerced.
  assert.throws(() => decide({ ...run.totals, repairedCount: 606.5, unchangedCount: run.totals.unchangedCount + 0.5 }), /non-negative/);
  assert.throws(() => decide({ ...run.totals, quarantinedCount: -1, unchangedCount: run.totals.unchangedCount + 1 }), /non-negative/);
});
