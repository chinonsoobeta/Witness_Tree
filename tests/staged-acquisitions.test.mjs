import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagedAcquisitions } from "../scripts/check-staged-acquisitions.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/staged-acquisitions.json", import.meta.url), "utf8"));
const first = manifest.entries.find((entry) => entry.sourceId === "qc-historic-wildfire-detailed");
const alberta = manifest.entries.find((entry) => entry.sourceId === "alberta-avi-crown");
const canopy = manifest.entries.find((entry) => entry.sourceId === "nrcan-forest-canopy-cover-2022");
const fma = manifest.entries.find((entry) => entry.sourceId === "alberta-fma-published-area");
const ontario = manifest.entries.find((entry) => entry.sourceId === "ontario-forest-management-units");
const electionsCanada = manifest.entries.find((entry) => entry.sourceId === "elections-canada-federal-electoral-districts-45th-general-election-2025-shp");

test("verified local acquisition remains staging-only", () => {
  assert.equal(validateStagedAcquisitions(manifest), manifest);
  assert.ok(first, "qc-historic-wildfire-detailed entry is missing from the manifest");
  assert.equal(first.byteLength, 414244435);
  assert.equal(first.sha256, "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815");
  assert.equal(first.immutableObjectStorage, false);
  assert.equal(first.productionEligible, false);
  assert.equal(first.attributionState, "metadata-verified");
  assert.match(first.attribution, /Ministère des Ressources naturelles et des Forêts/);
  assert.equal(first.licenceUrl, "https://www.donneesquebec.ca/licence/#cc-by");
  assert.equal(manifest.entries.reduce((total, entry) => total + entry.byteLength, 0), 10965842003);
  assert.equal(alberta?.sha256, "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093");
});

test("current Elections Canada boundaries are checksum-bound and staging-only", () => {
  assert.ok(electionsCanada, "current Elections Canada entry is missing from the manifest");
  assert.equal(electionsCanada.byteLength, 10301648);
  assert.equal(electionsCanada.sha256, "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93");
  assert.equal(electionsCanada.zipIntegrity, "passed");
  assert.equal(electionsCanada.immutableObjectStorage, false);
  assert.equal(electionsCanada.productionEligible, false);
});

test("staged Ontario FMU archive is checksum-bound and remains staging-only", () => {
  assert.ok(ontario, "ontario-forest-management-units entry is missing from the manifest");
  assert.equal(ontario.byteLength, 14324368);
  assert.equal(ontario.sha256, "b7fb8d30bf377725f97a0236be04e2d2611e2e4410215d99794fb9a14e9f4384");
  assert.equal(ontario.zipIntegrity, "passed");
  assert.equal(ontario.immutableObjectStorage, false);
  assert.equal(ontario.productionEligible, false);
  assert.equal(ontario.attribution, "Ontario Ministry of Natural Resources and Forestry © King's Printer for Ontario, 2022");
});

test("staged Alberta FMA snapshot is a checked GeoJSON, not a ZIP", () => {
  assert.ok(fma, "alberta-fma-published-area entry is missing from the manifest");
  assert.equal(fma.byteLength, 15534355);
  assert.equal(fma.sha256, "da4d3d80ddf71e6cae738077fed807cdb9ae39ba946a6a7ce5e2d3ffc69e0e0f");
  assert.equal(fma.contentIntegrity, "passed");
  assert.equal(fma.immutableObjectStorage, false);
  assert.equal(fma.productionEligible, false);
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
