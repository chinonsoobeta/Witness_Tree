import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagedAcquisitions } from "../scripts/check-staged-acquisitions.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const first = manifest.entries[0];
const alberta = manifest.entries.find((entry) => entry.sourceId === "alberta-avi-crown");

test("verified local acquisition remains staging-only", () => {
  assert.equal(validateStagedAcquisitions(manifest), manifest);
  assert.equal(first.byteLength, 414244435);
  assert.equal(first.sha256, "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815");
  assert.equal(first.immutableObjectStorage, false);
  assert.equal(first.productionEligible, false);
  assert.equal(first.attributionState, "metadata-verified");
  assert.match(first.attribution, /Ministère des Ressources naturelles et des Forêts/);
  assert.equal(first.licenceUrl, "https://www.donneesquebec.ca/licence/#cc-by");
  assert.equal(manifest.entries.reduce((total, entry) => total + entry.byteLength, 0), 971285693);
  assert.equal(alberta?.sha256, "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093");
});

test("staging gate rejects unsafe paths, missing integrity, and inflated claims", () => {
  assert.throws(() => validateStagedAcquisitions({ ...manifest, status: "production" }), /local-staging/);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, localPath: "../private/file.zip" }] }), /staging tree/);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, zipIntegrity: "unknown" }] }), /integrity/);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, immutableObjectStorage: true }] }), /never claim/);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, productionEligible: true }] }), /never claim/);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, attribution: "" }] }), /attribution is required/i);
  assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...first, licenceUrl: "http://example.test" }] }), /HTTPS/);
});
