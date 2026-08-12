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
