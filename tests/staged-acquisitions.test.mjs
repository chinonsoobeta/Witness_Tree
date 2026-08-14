import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagedAcquisitions } from "../scripts/check-staged-acquisitions.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const first = manifest.entries[0];
const alberta = manifest.entries.find((entry) => entry.sourceId === "alberta-avi-crown");
const canopy = manifest.entries.find((entry) => entry.sourceId === "nrcan-forest-canopy-cover-2022");
const harvest = manifest.entries.find((entry) => entry.sourceId === "nrcan-ca-forest-harvest-1985-2022");
const wildfire = manifest.entries.find((entry) => entry.sourceId === "nrcan-ca-forest-wildfire-1985-2022");

test("verified local acquisition remains staging-only", () => {
  assert.equal(validateStagedAcquisitions(manifest), manifest);
  assert.equal(first.byteLength, 414244435);
  assert.equal(first.sha256, "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815");
  assert.equal(first.immutableObjectStorage, false);
  assert.equal(first.productionEligible, false);
  assert.equal(first.attributionState, "metadata-verified");
  assert.match(first.attribution, /Ministère des Ressources naturelles et des Forêts/);
  assert.equal(first.licenceUrl, "https://www.donneesquebec.ca/licence/#cc-by");
  assert.equal(manifest.entries.reduce((total, entry) => total + entry.byteLength, 0), 11425991674);
  assert.equal(alberta?.sha256, "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093");
});

test("staged NRCan wildfire archive is checksum-bound, distinct from harvest, and remains staging-only", () => {
  assert.ok(wildfire, "nrcan-ca-forest-wildfire-1985-2022 entry is missing from the manifest");
  assert.equal(wildfire.byteLength, 252364563);
  assert.equal(wildfire.sha256, "725f3b582c87cb7c6f3fd397a523fba6621718ac59c68dc904cd1d849a9160c9");
  assert.equal(wildfire.zipIntegrity, "passed");
  assert.match(wildfire.catalogueRelationship, /distinct artifact/i);
  assert.equal(wildfire.immutableObjectStorage, false);
  assert.equal(wildfire.productionEligible, false);
});

test("staged NRCan harvest archive is distinct from the catalogue's fire-named link and remains staging-only", () => {
  assert.ok(harvest, "nrcan-ca-forest-harvest-1985-2022 entry is missing from the manifest");
  assert.equal(harvest.byteLength, 247945479);
  assert.equal(harvest.sha256, "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad");
  assert.equal(harvest.zipIntegrity, "passed");
  assert.equal(harvest.attributionState, "metadata-verified");
  assert.match(harvest.catalogueResourceDiscrepancy, /fire-named ZIP/);
  assert.equal(harvest.immutableObjectStorage, false);
  assert.equal(harvest.productionEligible, false);
});

test("staged canopy cover acquisition is pinned and staging-only", () => {
  assert.ok(canopy, "nrcan-forest-canopy-cover-2022 entry is missing from the manifest");
  assert.equal(canopy.byteLength, 9954395939);
  assert.equal(canopy.sha256, "80c37461f4deccfdfffc26124e9064d53a94dde660b9f96194445870393af130");
  assert.equal(canopy.immutableObjectStorage, false);
  assert.equal(canopy.productionEligible, false);
  assert.equal(canopy.attributionState, "metadata-verified");
  assert.match(canopy.licenceUrl, /^https:\/\/open\.canada\.ca\//);
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
