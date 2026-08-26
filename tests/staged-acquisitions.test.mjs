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
const harvest = manifest.entries.find((entry) => entry.sourceId === "nrcan-ca-forest-harvest-1985-2022");
const wildfire = manifest.entries.find((entry) => entry.sourceId === "nrcan-ca-forest-wildfire-1985-2022");
const canopyHeight = manifest.entries.find((entry) => entry.sourceId === "nrcan-forest-canopy-height-2022");
const electionsCanada = manifest.entries.find((entry) => entry.sourceId === "elections-canada-federal-electoral-districts-45th-general-election-2025-shp");
const albertaWildfire = manifest.entries.find((entry) => entry.sourceId === "alberta-historical-wildfire-2006-2025");
const cwfisCurrent = manifest.entries.find((entry) => entry.sourceId === "cwfis-current");
const bcWildfire = manifest.entries.find((entry) => entry.sourceId === "bc-wildfire");
const albertaCurrentWildfire = manifest.entries.find((entry) => entry.sourceId === "ab-wildfire");
const ontarioFire = manifest.entries.find((entry) => entry.sourceId === "on-fire-disturbance");
const plvi = manifest.entries.find((entry) => entry.sourceId === "ab-primary-land-vegetation");
const qcOriginalCurrent = manifest.entries.find((entry) => entry.sourceId === "qc-original-current-inventory");

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
  assert.equal(manifest.entries.reduce((total, entry) => total + entry.byteLength, 0), 33769122228);
  assert.equal(alberta?.sha256, "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093");
});

test("staged Alberta PLVI archive is checksum-bound and blocks invalid publisher geometry", () => {
  assert.ok(plvi, "ab-primary-land-vegetation entry is missing from the manifest");
  assert.equal(plvi.byteLength, 675544895);
  assert.equal(plvi.sha256, "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3");
  assert.equal(plvi.zipIntegrity, "passed");
  assert.equal(plvi.immutableObjectStorage, false);
  assert.equal(plvi.productionEligible, false);
  assert.match(plvi.changesNotice, /12 invalid polygon geometries/);
});

test("Québec original/current archive is checksum-bound and distinct from Québec's other ecoforest products", () => {
  assert.ok(qcOriginalCurrent);
  assert.equal(qcOriginalCurrent.byteLength, 11244667626);
  assert.equal(qcOriginalCurrent.sha256, "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61");
  assert.equal(qcOriginalCurrent.zipIntegrity, "passed");
  assert.match(qcOriginalCurrent.temporalCoverage, /distinct from the current ecoforest and fourth-inventory products/i);
  assert.equal(qcOriginalCurrent.immutableObjectStorage, false);
  assert.equal(qcOriginalCurrent.productionEligible, false);
});

test("Ontario in-year fire perimeters are checksum-bound and remain staging-only", () => {
  assert.ok(ontarioFire, "on-fire-disturbance entry is missing from the manifest");
  assert.equal(ontarioFire.byteLength, 19510504);
  assert.equal(ontarioFire.sha256, "99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11");
  assert.equal(ontarioFire.contentIntegrity, "passed");
  assert.equal(ontarioFire.immutableObjectStorage, false);
  assert.equal(ontarioFire.productionEligible, false);
});

test("Alberta current wildfire locations are checksum-bound and remain staging-only", () => {
  assert.ok(albertaCurrentWildfire, "ab-wildfire entry is missing from the manifest");
  assert.equal(albertaCurrentWildfire.byteLength, 423853);
  assert.equal(albertaCurrentWildfire.sha256, "f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0");
  assert.equal(albertaCurrentWildfire.contentIntegrity, "passed");
  assert.equal(albertaCurrentWildfire.immutableObjectStorage, false);
  assert.equal(albertaCurrentWildfire.productionEligible, false);
});

test("BC current wildfire perimeter snapshot is checksum-bound and remains staging-only", () => {
  assert.ok(bcWildfire, "bc-wildfire entry is missing from the manifest");
  assert.equal(bcWildfire.byteLength, 4813292);
  assert.equal(bcWildfire.sha256, "46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83");
  assert.equal(bcWildfire.contentIntegrity, "passed");
  assert.match(bcWildfire.sourceUrl, /BCWS_FirePerimeters_PublicView/);
  assert.match(bcWildfire.temporalCoverage, /not a real-time or complete incident claim/);
  assert.equal(bcWildfire.immutableObjectStorage, false);
  assert.equal(bcWildfire.productionEligible, false);
});

test("CWFIS current active-fire snapshot is complete for its fixed query and remains staging-only", () => {
  assert.ok(cwfisCurrent, "cwfis-current entry is missing from the manifest");
  assert.equal(cwfisCurrent.byteLength, 45917);
  assert.equal(cwfisCurrent.sha256, "fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86");
  assert.equal(cwfisCurrent.zipIntegrity, "passed");
  assert.match(cwfisCurrent.sourceUrl, /cwfif_national_activefires/);
  assert.match(cwfisCurrent.temporalCoverage, /586 records valid at the fixed WFS query instant/);
  assert.equal(cwfisCurrent.immutableObjectStorage, false);
  assert.equal(cwfisCurrent.productionEligible, false);
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

test("staged canopy-height acquisition is pinned and staging-only", () => {
  assert.ok(canopyHeight);
  assert.equal(canopyHeight.byteLength, 10347564066);
  assert.equal(canopyHeight.sha256, "86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124");
  assert.equal(canopyHeight.productionEligible, false);
});

test("current Elections Canada boundaries are checksum-bound and staging-only", () => {
  assert.ok(electionsCanada, "current Elections Canada entry is missing from the manifest");
  assert.equal(electionsCanada.byteLength, 10301648);
  assert.equal(electionsCanada.sha256, "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93");
  assert.equal(electionsCanada.zipIntegrity, "passed");
  assert.equal(electionsCanada.immutableObjectStorage, false);
  assert.equal(electionsCanada.productionEligible, false);
});

test("staged Alberta historical-wildfire CSV is checksum-bound and remains non-operational", () => {
  assert.ok(albertaWildfire, "alberta-historical-wildfire-2006-2025 entry is missing from the manifest");
  assert.equal(albertaWildfire.byteLength, 10400030);
  assert.equal(albertaWildfire.sha256, "8b6ed447ab0f958dbe845a53dc15362b8ef5c0810ad9420d2143f9f5ee010a72");
  assert.equal(albertaWildfire.contentIntegrity, "passed");
  assert.equal(albertaWildfire.immutableObjectStorage, false);
  assert.equal(albertaWildfire.productionEligible, false);
  assert.match(albertaWildfire.changesNotice, /no transformation, geometry creation, perimeter inference/i);
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
