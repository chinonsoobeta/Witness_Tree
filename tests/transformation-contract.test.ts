import assert from "node:assert/strict";
import test from "node:test";
import { decideStagedTransformation }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/transformation/decision.ts";

const QUEBEC = {
  sourceId: "qc-historic-wildfire-detailed" as const,
  rawChecksumSha256: "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815",
  profileDecision: "ready-for-transformation-design" as const,
  attributionState: "metadata-verified" as const,
  invalidGeometryCount: { kind: "known" as const, value: 0 },
};

const ALBERTA = {
  sourceId: "alberta-avi-crown" as const,
  rawChecksumSha256: "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093",
  profileDecision: "blocked-pending-geometry-policy" as const,
  attributionState: "pending-review" as const,
  invalidGeometryCount: { kind: "known" as const, value: 608 },
};

test("allows only transformation design for the clean, attributed Québec staged profile", () => {
  const decision = decideStagedTransformation(QUEBEC);
  assert.equal(decision.status, "ready-for-transformation-design");
  assert.equal(decision.eligibleForTransformationDesign, true);
  assert.equal(decision.eligibleForIngestion, false);
  assert.equal(decision.productionEligible, false);
  assert.equal(decision.rawChecksumSha256, QUEBEC.rawChecksumSha256);
});

test("keeps the profiled Alberta source blocked", () => {
  const decision = decideStagedTransformation(ALBERTA);
  assert.equal(decision.status, "blocked");
  assert.equal(decision.eligibleForTransformationDesign, false);
  assert.match(decision.reason, /invalid geometries/i);
});

test("rejects checksum drift, unknown counts, and any attempt to bypass Alberta's prerequisites", () => {
  assert.throws(() => decideStagedTransformation({ ...QUEBEC, rawChecksumSha256: "a".repeat(64) }), /checksum/i);
  assert.throws(() => decideStagedTransformation({ ...QUEBEC, invalidGeometryCount: { kind: "unknown" } }), /unknown/i);
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, attributionState: "metadata-verified" }), /Alberta remains blocked/i);
  assert.throws(() => decideStagedTransformation({ ...ALBERTA, geometryPolicy: { version: "1", action: "repair-or-quarantine", deterministic: true } }), /Alberta remains blocked/i);
});
