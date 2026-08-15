import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateQcFourthInventoryEvidence } from "../scripts/check-qc-fourth-inventory-evidence.mjs";

const evidence = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-evidence.json", import.meta.url), "utf8"));

test("Québec fourth inventory is checksum-bound as the complete distinct 56-sheet product", () => {
  assert.equal(validateQcFourthInventoryEvidence(evidence), evidence);
  assert.equal(evidence.fullProductAcquisition.archiveByteLength, 16177306782);
  assert.equal(evidence.profile.baseGeometry.pee_ori_4.featureCount, 7489195);
  assert.equal(evidence.profile.baseGeometry.pee_ori_4.invalid, 0);
  assert.equal(evidence.productionEligible, false);
});

test("Québec fourth-inventory evidence fails closed on collection, geometry, identity, and admission drift", () => {
  const collection = structuredClone(evidence); collection.fullProductAcquisition.archiveCount = 55;
  assert.throws(() => validateQcFourthInventoryEvidence(collection), /56-sheet archive evidence/i);
  const geometry = structuredClone(evidence); geometry.profile.baseGeometry.pee_ori_4.invalid = 1;
  assert.throws(() => validateQcFourthInventoryEvidence(geometry), /base-geometry profile/i);
  const identity = structuredClone(evidence); identity.dataset.distinction = "Current map";
  assert.throws(() => validateQcFourthInventoryEvidence(identity), /distinct from both current/i);
  const admitted = structuredClone(evidence); admitted.productionAdmission = true;
  assert.throws(() => validateQcFourthInventoryEvidence(admitted), /must remain false/i);
});
