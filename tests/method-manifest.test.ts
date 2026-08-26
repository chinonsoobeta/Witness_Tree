import assert from "node:assert/strict";
import test from "node:test";

import { MATCHING_PARAMETERS } from "../lib/pipeline/matching";
import {
  canonicalMethodParameters,
  gateMethodChange,
  methodParameterSha256,
  validateMethodManifest,
  type MethodChangeMarker,
  type MethodParameterManifest,
} from "../lib/pipeline/method-manifest";
import { PRECEDENCE_ORDER } from "../lib/pipeline/precedence";

function fixture(version = "phase2-method-v1-test"): MethodParameterManifest {
  const parameters: MethodParameterManifest["parameters"] = {
    matching: { ...MATCHING_PARAMETERS, multipleCandidateRule: "highest-overlap-stable-input-order" },
    precedence: [...PRECEDENCE_ORDER],
    mask: { forestClassCrosswalkStatus: "synthetic-test-only", forestClassValues: [210, 220, 230], nodataPolicy: "preserve", implicitReprojection: "forbidden" },
    vectorization: { connectivity: 8, minimumPatchPixels: 1, simplifyToleranceMetres: 0, dissolveAdjacentCells: true },
    aggregation: { denominatorReference: "first-year-of-range", overlapPolicy: "precedence-once-per-hectare-year", areaUnit: "hectare", decimalPlaces: 6 },
    boundary: { cellIntersection: "fractional-area", gridAlignment: "exact", snapToleranceMetres: 0, boundaryEditionRequired: true, crossEditionComparison: "reject-without-acknowledgement" },
  };
  return {
    schemaVersion: 1,
    methodVersion: version,
    parameterSha256: methodParameterSha256(parameters),
    reviewStatus: "unapproved",
    scope: "owner-independent-phase2-method-contract",
    productionEligible: false,
    parameters,
  };
}

function withParameters(manifest: MethodParameterManifest, parameters: MethodParameterManifest["parameters"]): MethodParameterManifest {
  return { ...manifest, parameterSha256: methodParameterSha256(parameters), parameters };
}

function marker(previous: MethodParameterManifest, next: MethodParameterManifest): MethodChangeMarker {
  const previousIdentity = validateMethodManifest(previous);
  const nextIdentity = validateMethodManifest(next);
  return {
    schemaVersion: 1,
    previousMethodVersion: previous.methodVersion,
    nextMethodVersion: next.methodVersion,
    previousParameterSha256: previousIdentity.parameterSha256,
    nextParameterSha256: nextIdentity.parameterSha256,
    recomputationRequired: true,
    releaseNoteRequired: true,
    releaseNoteId: "phase2-method-v2-change-note-test",
    productionEligible: false,
  };
}

test("canonical parameter identity is deterministic across object key insertion order", () => {
  const manifest = fixture();
  const reordered = {
    ...manifest,
    parameters: Object.fromEntries(Object.entries(manifest.parameters).reverse()),
  } as MethodParameterManifest;
  assert.equal(canonicalMethodParameters(manifest.parameters), canonicalMethodParameters(reordered.parameters));
  assert.equal(validateMethodManifest(manifest).parameterSha256, validateMethodManifest(reordered).parameterSha256);
  assert.match(validateMethodManifest(manifest).parameterSha256, /^[a-f0-9]{64}$/);
});

test("every method family contributes to the canonical parameter hash", () => {
  const original = fixture();
  const hash = validateMethodManifest(original).parameterSha256;
  const mutations: MethodParameterManifest[] = [
    withParameters(original, { ...original.parameters, matching: { ...original.parameters.matching, minimumOverlapOfSmallerGeometry: 0.6 } }),
    withParameters(original, { ...original.parameters, precedence: [original.parameters.precedence[1]!, original.parameters.precedence[0]!, ...original.parameters.precedence.slice(2)] }),
    withParameters(original, { ...original.parameters, mask: { ...original.parameters.mask, forestClassValues: [210, 220] } }),
    withParameters(original, { ...original.parameters, vectorization: { ...original.parameters.vectorization, connectivity: 4 } }),
    withParameters(original, { ...original.parameters, aggregation: { ...original.parameters.aggregation, decimalPlaces: 5 } }),
    withParameters(original, { ...original.parameters, boundary: { ...original.parameters.boundary, snapToleranceMetres: 0.01 } }),
  ];
  assert.equal(new Set(mutations.map((candidate) => validateMethodManifest(candidate).parameterSha256)).has(hash), false);
  assert.equal(new Set(mutations.map((candidate) => validateMethodManifest(candidate).parameterSha256)).size, mutations.length);
});

test("manifest fails closed on approval, production, incomplete precedence, and invalid numeric parameters", () => {
  const manifest = fixture();
  assert.throws(() => validateMethodManifest({ ...manifest, reviewStatus: "approved" as never }), /exact non-production pair/);
  assert.throws(() => validateMethodManifest({ ...manifest, productionEligible: true as false }), /non-production/);
  assert.throws(() => validateMethodManifest({ ...manifest, parameterSha256: "0".repeat(64) }), /does not match/);
  assert.throws(() => validateMethodManifest({ ...manifest, parameters: { ...manifest.parameters, precedence: PRECEDENCE_ORDER.slice(1) } }), /every registered/);
  assert.throws(() => validateMethodManifest({ ...manifest, parameters: { ...manifest.parameters, matching: { ...manifest.parameters.matching, minimumOverlapOfSmallerGeometry: Number.NaN } } }), /overlap/);
  assert.throws(() => validateMethodManifest({ ...manifest, parameters: { ...manifest.parameters, mask: { ...manifest.parameters.mask, forestClassValues: [210, 210] } } }), /unique/);
  assert.throws(() => validateMethodManifest({ ...manifest, parameters: { ...manifest.parameters, vectorization: { ...manifest.parameters.vectorization, minimumPatchPixels: 0 } } }), /at least 1/);
});

test("parameter changes require a new version and an exact recomputation and release-note marker", () => {
  const previous = fixture();
  const unchanged = fixture();
  assert.deepEqual(gateMethodChange(previous, unchanged).changed, false);
  assert.throws(() => gateMethodChange(previous, fixture("renamed-without-change")), /cannot change/);

  const changedSameVersion = withParameters(previous, { ...previous.parameters, vectorization: { ...previous.parameters.vectorization, connectivity: 4 } });
  assert.throws(() => gateMethodChange(previous, changedSameVersion), /new method version/);
  const next: MethodParameterManifest = { ...changedSameVersion, methodVersion: "phase2-method-v2-test" };
  assert.throws(() => gateMethodChange(previous, next), /recomputation and release-note/);
  const exactMarker = marker(previous, next);
  assert.equal(gateMethodChange(previous, next, exactMarker).changed, true);
  assert.throws(() => gateMethodChange(previous, next, { ...exactMarker, nextParameterSha256: "0".repeat(64) }), /exact versions/);
  assert.throws(() => gateMethodChange(previous, unchanged, exactMarker), /must not carry/);
});
