import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateRedactedFederalAttestation } from "../scripts/check-federal-electoral-promotion-attestation.mjs";
import { validateHansenSampleProfile } from "../scripts/check-phase2-hansen-gfc-v1.12-sample-profile.mjs";
import { validateVlce2ForestMaskDecision } from "../scripts/check-vlce2-forest-mask-decision.mjs";

test("federal electoral promotion attestation checker rejects a malformed record", () => {
  assert.throws(() => validateRedactedFederalAttestation({ schemaVersion: "invalid" }), /fields drifted/);
});

test("Hansen sample profile checker rejects a malformed record before reading artifacts", () => {
  let artifactRead = false;
  const malformed = { schemaVersion: "invalid" };
  assert.throws(() => validateHansenSampleProfile(malformed, () => { artifactRead = true; }), /schema version drifted/);
  assert.equal(artifactRead, false);
});

test("VLCE2 forest-mask decision checker rejects a malformed decision document", () => {
  const malformed = "| **Mask implementation permitted** | **No** |\n";
  assert.throws(() => validateVlce2ForestMaskDecision(malformed), /missing VLCE2 class 0/);
});

test("VLCE2 forest-mask decision checker rejects a scoped decision that drops its limit", () => {
  const doc = readFileSync("docs/VLCE2_FOREST_MASK_DECISION.md", "utf8");
  assert.doesNotThrow(() => validateVlce2ForestMaskDecision(doc));
  const widened = doc.replace("does not\npermit mask implementation", "permits mask implementation");
  assert.notEqual(widened, doc);
  assert.throws(() => validateVlce2ForestMaskDecision(widened), /scoped decision no longer states/);
});
