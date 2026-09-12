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
  assert.equal(manifest.entries.reduce((total, entry) => total + entry.byteLength, 0), 105345312334);
  assert.equal(alberta?.sha256, "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093");
});

// The four NRCan definitional products staged on 2026-09-09. They exist to measure the
// NFI conditions against, not to publish from: every one of them is local staging with no
// immutable object key, no publisher-declared version, and no retention evidence, so each
// must stay productionEligible: false. The per-entry checksums are asserted here as well as
// summed into the total above, so a silent substitution cannot hide inside a matching sum.
const NTEMS_DEFINITIONAL = [
  ["nrcan-fao-forest-2022", 831994643, "1ed253eae5cb4898a79361d8aa42ce18a50fba3bcba2e83bd546c8a8191dfc0e"],
  ["nrcan-treed-area-1984-2022", 1183942534, "06458f5b8c85e7667ad88977c68482413ec9689589b18d7a521546ad3af17821"],
  ["nrcan-forest-age-2022", 5922298842, "3e2771e46d9f08176a916fabc6c5350f5226ee148c97d6d44fb8b57b50ea4158"],
  ["nrcan-satellite-forest-inventory-2020", 7234719296, "b71dd76aecbb824b91f5580b991cf44bf0fb4bdaa1c36e8ae1bd9985f672ef3e"],
];

test("the NTEMS definitional products are checksum-bound and remain staging-only", () => {
  for (const [sourceId, byteLength, sha256] of NTEMS_DEFINITIONAL) {
    const entry = manifest.entries.find((candidate) => candidate.sourceId === sourceId);
    assert.ok(entry, `${sourceId} entry is missing from the manifest`);
    assert.equal(entry.byteLength, byteLength);
    assert.equal(entry.sha256, sha256);
    assert.equal(entry.zipIntegrity, "passed");
    assert.equal(entry.immutableObjectStorage, false);
    assert.equal(entry.productionEligible, false);
    assert.equal(entry.licenceId, "ogl-canada");
    assert.equal(entry.attributionState, "metadata-verified");
    // The publisher declares no dataset version. Recording "undeclared" is the honest
    // value; a retrieval timestamp is not a version and must never be written as one.
    assert.equal(entry.sourceVersion, "undeclared");
  }
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

const nfd = manifest.entries.find((entry) => entry.sourceId === "nfd-5.2-undeclared");
test("the authorized NFD HTTP exception is exact and checksum-bound", () => {
  assert.ok(nfd);
  assert.equal(nfd.byteLength, 2033845);
  assert.equal(nfd.sha256, "1644b66e78a3e30d865f1425065de39350532ad96a131038ec77e1890f58f706");
  assert.equal(nfd.crc64nvme, "ef1972d415353fcf");
  assert.equal(nfd.sourceVersion, "undeclared");
  assert.equal(nfd.immutableObjectStorage, false);
  assert.equal(nfd.productionEligible, false);
  for (const mutation of [
    { sourceUrl: nfd.sourceUrl + "?substitute=1" },
    { sourceUrl: "http://example.test/file.csv" },
    { sourceId: "another-source" },
    { byteLength: nfd.byteLength + 1 },
    { sha256: "0".repeat(64) },
    { crc64nvme: "0".repeat(16) },
  ]) assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...nfd, ...mutation }] }), /HTTPS/);
});

// Derived staging has the same non-production boundary as raw acquisitions.
// These mutations protect the WP2 path and lineage extension.
test("derived staging rejects traversal and missing lineage", () => {
  const derived = {
    ...first, localPath: "../Witness_Tree-data/derived/annual/series.json",
    sourceVersion: "undeclared", retrievedAt: "2026-09-09T00:00:00Z",
    retrievedAtBasis: { en: "Existing local modification time.", fr: "Date de modification locale existante." },
    derivation: "Existing annual computation, without a production claim.", crc64nvme: "1234567890abcdef",
    publicationBoundary: { en: "Annual only; no interval sums.", fr: "Valeurs annuelles seulement; aucune somme entre les intervalles." },
  };
  assert.equal(validateStagedAcquisitions({ ...manifest, entries: [derived] }).entries[0], derived);
  for (const localPath of ["../Witness_Tree-data/derived/../raw/file.json", "../Witness_Tree-data/derived/a/./b.json", "../Witness_Tree-data/derived//a.json", "../Witness_Tree-data/derived/a/%2e%2e/b.json", "/Volumes/Extended_SSD/file.json", "../Witness_Tree-data/raw/undated/file.json"]) {
    assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...derived, localPath }] }), /staging tree/);
  }
  for (const mutation of [{ crc64nvme: undefined }, { crc64nvme: "BASE64DIGEST==" }, { retrievedAt: "2026-02-30T00:00:00Z" }, { sourceVersion: "" }, { derivation: "" }, { licenceUrl: "" }, { retrievedAtBasis: { en: "Local mtime" } }, { publicationBoundary: { en: "Annual only" } }]) {
    assert.throws(() => validateStagedAcquisitions({ ...manifest, entries: [{ ...derived, ...mutation }] }));
  }
});

const WP2_ANNUAL_FILES = [
  [
    "wp2-bc-annual-series-20260909--bc-annual-series-1984-2022.json",
    619782,
    "aa62e563917b870b0c0b14ae3951005ba88ca30453e56cd737da9ccadae9e2f8",
    "ab097d5352756e60",
    "2026-09-09T19:08:52Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1984.tif",
    1409839605,
    "05eb22b9abc058f722a12379dd64dc1bc4690dedb4a49e3a8c16817346929115",
    "1c08c1f8eca685cb",
    "2025-10-08T23:19:12Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1985.tif",
    1405969176,
    "714f985aa5bef947048dd793b3299297a8a246a1ee6c06c84e2488f193e8ddd1",
    "3e83e919518870ae",
    "2025-10-08T23:26:16Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1986.tif",
    1401808159,
    "753d0ca767e348ba823533cfeb5c9503575a75a0e6c606a544b7c0fe50524f0a",
    "f5b99094ca7999b4",
    "2025-10-08T23:34:28Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1987.tif",
    1398748627,
    "6e4b366143e47c0991f4f593a05b1c71dc16ff5717d762bee6a384152ee591db",
    "396fb92fa8806406",
    "2025-10-08T23:42:46Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1988.tif",
    1395627023,
    "21cb2ad1511c8ccc7769a695e6ba2110e99051433147786ea21b84af47f2e5d0",
    "6da1be22774c68cb",
    "2025-10-08T23:50:06Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1989.tif",
    1395023707,
    "f3e3e9edfdb4723d213055b129d1adb180a0d90143dd9966b40a33f7eae2da50",
    "9a159238aeb1d7bc",
    "2025-10-08T23:57:38Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1990.tif",
    1392110117,
    "d3b014a6bd84798749e5bd3e692523bfd75ee425ec72afa47afd7dbdb95bd129",
    "aa029d734d37112a",
    "2025-10-09T00:05:20Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1991.tif",
    1389988449,
    "cc0fce2f5495ea55b7f6b30f8b4f564c6d4d70571572d8afbc1a9d1fb9ed87ba",
    "120741d7a0fba81f",
    "2025-10-09T00:12:10Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1992.tif",
    1387642617,
    "a6141ef6e0d51985398834152f1c10f6539ff940d00705318a7bee8ebc038fe4",
    "5d0be2017c7d1f82",
    "2025-10-09T00:18:38Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1993.tif",
    1386970519,
    "e8dab76a0b15d63b6a2711e542c2665a662cad28f726cab24b3d749afcf0d62f",
    "dad7a95fecb8c8f4",
    "2025-10-09T00:21:18Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1994.tif",
    1388371643,
    "8eb8a7472fddb8ae7e8e08ea00bf68a0948756b870b7d5dc8c7090f9b1570758",
    "bc7690f4a4808768",
    "2025-10-09T15:23:52Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1995.tif",
    1392165858,
    "71c3ef9ac6e8b4c8a86b913f9f2781002979510a4f75d8b691bbc496c6f9d66e",
    "f3b0bbf3b4e8af17",
    "2025-10-09T15:25:50Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1996.tif",
    1392372283,
    "a6c36f9e4f06e31fc8795439c0309706dbfdcb14d5570cbb8a2bf9c85b3d3f0f",
    "3a3ed6fe76bb2d7f",
    "2025-10-09T15:27:50Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1997.tif",
    1393383549,
    "3babace5e09d5bb9f558131cb2351fa0473377b4218901444978291d4a81bfb1",
    "5b85ec598632adc0",
    "2025-10-09T15:29:50Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1998.tif",
    1395078813,
    "9baa99b5e0edc17fd6064b161bf95c58897426e755fa67cf1b0daed1031a2250",
    "8f00cfd19042d645",
    "2025-10-09T15:31:52Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_1999.tif",
    1395690399,
    "9e349a5ac4a9a5ced510f65cf4a028374a5827b8885576a661402eba561d967a",
    "4c2931ae52369814",
    "2025-10-09T15:33:54Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2000.tif",
    1396969709,
    "e7457b7a2df3d004c64034c2686905c13fe1f3e6682a5a2adf5a8b0268292ac8",
    "af07d39d72363ede",
    "2025-10-09T15:42:06Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2001.tif",
    1396689423,
    "db0592f09677d69e1e7148ab2fae79ee717f22f3fe730f25259300424cbfdf55",
    "e065977e038c0838",
    "2025-10-09T15:50:16Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2002.tif",
    1396481928,
    "276c7f82b4bf09d30ffcb915b681acbe877563035f0c3cfc432839deb5856ce7",
    "46f002c90540cf14",
    "2025-10-09T16:04:52Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2003.tif",
    1395782364,
    "78816157fbc737a3fbbf2c5a2713487d2a1d7425a7976d362dad96ee075d9bb2",
    "4bd3f32bf28663c4",
    "2025-10-09T16:23:00Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2004.tif",
    1396197005,
    "fab84ed99b331637ddcd8c95749ef8a9c4f178fa3857e341bcb207d48d801295",
    "56d8c50b411dec17",
    "2025-10-09T16:42:58Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2005.tif",
    1397306627,
    "d7f5b5b8123c2c4f278c7db1d9a6b90fc6aee3d7dbeec02e30f2b6b3c6966ad3",
    "dec15ddf8dcbf764",
    "2025-10-09T17:03:52Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2006.tif",
    1398336428,
    "9d3c8a3089c60e727ec0ec6165c5e3aef7216beab116ba3a2ac4d025bc1fd624",
    "9c8baee474c263b7",
    "2025-10-09T17:25:00Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2007.tif",
    1397163251,
    "da8efd63a7d71cfa4d7e77c09dcd126dead69a3bd98ad8d6f686ea6975ec59bb",
    "6ffc3b91eba83bfe",
    "2025-10-09T17:45:20Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2008.tif",
    1395799262,
    "ff33cbf2490df3128d16cb73777080f23ee7df8a304f0ed0f379a66c635b74bf",
    "10b5bcc94f4adabc",
    "2025-10-09T18:01:48Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2009.tif",
    1395075767,
    "250928b11bc07d8c0bfaf3c212d4d6ee2b895332875c0d07001a4f26fb7b93fd",
    "126f8c2b85539dba",
    "2025-10-09T18:16:48Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2010.tif",
    1397525392,
    "c1adfb35c3e43d998ea5c44034300a3b145a3f2b67305fa2afcab5124bcbd58f",
    "7d087cfcbb3b3540",
    "2025-10-09T18:36:02Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2011.tif",
    1400755848,
    "8800a85ae7e724b859a253daeae6d4e1fbcfacea918523abb15f31902d22e131",
    "877d2e4b67276891",
    "2025-10-09T18:48:26Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2012.tif",
    1406791907,
    "6bf8f40cb01afa8837a56754c0899f9a5ee5911d5e262b676e1592194e259acb",
    "50a32d9696611d58",
    "2025-10-09T19:02:54Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2013.tif",
    1409743719,
    "05d8241cc3dad696e2cf7129ba4b9c1cacc1cc5497590e373368a986d6e22df4",
    "7009e614ea547c0c",
    "2025-10-09T19:08:10Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2014.tif",
    1412585247,
    "335155a31f55345dbc9a3f6ba96cfaf1066c9312d35689e4f25c93dc527f74cc",
    "d6baf299fc246c3e",
    "2025-10-09T19:10:14Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2015.tif",
    1416274232,
    "de328b6aca047fe157ae33ef0d1203301089ba26408c99b5da756fad572aa35c",
    "8aa9003ac56908c5",
    "2025-10-09T19:12:18Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2016.tif",
    1417718212,
    "8157bd64c803a83ade48fbe14f5fc281bc20d7d79dcbdd86e78e14baa7bbd78d",
    "48c4bcc3f8b7bfab",
    "2025-10-09T19:14:20Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2017.tif",
    1416045569,
    "796b00d24fd887fe5650f7ce3f26f426cd8cf5aa8cdfd4548dd5fb010eeac598",
    "e379e50f1f35e53f",
    "2025-10-09T19:16:24Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2018.tif",
    1415533332,
    "a365a1818743aad4a24ca5a9ec01561d38abb7b500776713c37a59e6bd98d1b2",
    "51712aa2ea955434",
    "2025-10-09T19:18:26Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2019.tif",
    1417702191,
    "771b0a872c55f34c46c73143f455549bfd13eff2d20d37b11d44e66638607b89",
    "eb4dad8e2b37c7c8",
    "2025-10-09T19:20:30Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2020.tif",
    1418226864,
    "c8a81b3acd47232685555c5bdaea327998140ca05f77087af3be7884c301e2b0",
    "5ce09a9d2e7cb79b",
    "2025-10-09T19:22:36Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2021.tif",
    1417114835,
    "0c0baae74a89fea9f5229e0fdac5eafa99d2d288862d83b3e922b8c6f156492e",
    "d6d9e0a521f9a343",
    "2025-10-09T19:24:40Z"
  ],
  [
    "wp2-bc-annual-series-20260909--lc--CA_forest_VLCE2_2022.tif",
    1417320397,
    "0adb935df9e17fc40c21b3a588c7b2f1ade8b79c617a1bd9a39f118c24f4a4e5",
    "c75da398f4de5d1c",
    "2025-10-09T19:26:46Z"
  ],
  [
    "wp2-bc-annual-series-20260909--rasters--CA_Forest_Fire_1985-2022.tfw",
    94,
    "ef148353be260aa50ee73e037224baf66df0db03464ce4ef00c57afdc5056c10",
    "a46f152aa8528316",
    "2025-03-20T20:01:20Z"
  ],
  [
    "wp2-bc-annual-series-20260909--rasters--CA_Forest_Fire_1985-2022.tif",
    648704594,
    "c7d9159efa10d10935f98d64ed3c630f17f1626a780b5e69e5deb19ed8773eea",
    "ed794520882c5e7d",
    "2025-08-13T15:39:20Z"
  ],
  [
    "wp2-bc-annual-series-20260909--rasters--CA_Forest_Harvest_1985-2022.tfw",
    94,
    "ef148353be260aa50ee73e037224baf66df0db03464ce4ef00c57afdc5056c10",
    "a46f152aa8528316",
    "2025-03-20T18:02:36Z"
  ],
  [
    "wp2-bc-annual-series-20260909--rasters--CA_Forest_Harvest_1985-2022.tif",
    649221944,
    "81e1cced15d17e0f986b35a006cfe5b3964c6b0aa5b24c36099f35c003fdca08",
    "a8094ae278c56b62",
    "2025-08-13T15:40:58Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--alberta-annual-series-1984-2022.json",
    619611,
    "982272c72b6f3a1d23ffb8e4032c1ea92cd4afa364b75e22d91cd0ab55319b94",
    "4b19fe12eaaf3098",
    "2026-09-09T20:30:04Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--boundary--lpr_000b21a_e.dbf",
    4918,
    "34c024a209176eeb64ee6d95418b290ed4bd135e8f840ef0a89703781e0b0851",
    "180e99f3f34a78c9",
    "2021-12-20T18:21:24Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--boundary--lpr_000b21a_e.prj",
    524,
    "ab73d71a919003b760582daea9d1653b857b98c0a66efecb65d7d3c30911908b",
    "4bdb2ab8560a6634",
    "2021-12-20T18:20:56Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--boundary--lpr_000b21a_e.shp",
    265901524,
    "46c62ecd4a8dce05e0f8343e919fbf9c7f87c6d4ec0f556a1a7b662aaedcca52",
    "c1e71c1d2cbbf988",
    "2021-12-20T18:21:24Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--boundary--lpr_000b21a_e.shx",
    204,
    "9e5fe372d0c512c76d214ef9502ffaa54112ffea74a26e7c6bd159f6593b98b8",
    "623cbf5548fb93c3",
    "2021-12-20T18:21:24Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--boundary--lpr_000b21a_e.xml",
    48085,
    "b0412cf29db8ac0f197dbc742bd13791236075e84e0bd711eec8158c51182d88",
    "d520c6965aa57c00",
    "2021-10-21T20:52:36Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--british-columbia-annual-series-1984-2022.json",
    619951,
    "61dc817bb83d0dc2bba1cb3fe75f7fbe2ff4d0856062026076726fffedab3357",
    "1f4c9e6ce204ea3e",
    "2026-09-09T21:35:23Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--alberta.gpkg",
    233472,
    "b9cfc89b545428f432306bfb39f7e708a5ef13a19e7da10f4e12b806c144116e",
    "34cb57979f176426",
    "2026-09-09T19:15:34Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--alberta_mask.tif",
    4512474,
    "1a958ff9b56a0af2e8a9bca0770ff220da8c3c5335d985b02c542f69e6edcf0c",
    "476d3b9db3e8ef85",
    "2026-09-09T19:15:41Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--british-columbia.gpkg",
    47071232,
    "6a01985e81f6d5f95f3f59c2cd19146f0e8cd92e320b117232ab6f506e2c8bff",
    "e8d83622b2997d09",
    "2026-09-09T19:24:04Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--british-columbia_mask.tif",
    9291257,
    "8c8eb0dbbc78b1f38aa1c8df93d004915c82bd971472834e2eb89528d12f78db",
    "c4bd9543339471f8",
    "2026-09-09T19:24:43Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--ontario.gpkg",
    61607936,
    "f0fb6e00e7db228f39455a77a3152ac5b005353da47f7191299cdd4112fb487b",
    "b8d05315f4dbf172",
    "2026-09-09T19:17:47Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--ontario_mask.tif",
    11857661,
    "0f4aad570338f6462e50893c7ca429fb7c80024088185ab73561315e4a630a98",
    "e0a8a4b0c8bfc90d",
    "2026-09-09T19:18:57Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--quebec.gpkg",
    35803136,
    "fac6aa2da5f697b92a62ad6069096bccf1589fb1d084b1223a6019cd316d7045",
    "dcda2b22a147ee32",
    "2026-09-09T19:21:04Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--masks--quebec_mask.tif",
    13886057,
    "8acce80eec69ae05d77c0f0b78c0c9f18ffbb45fe162550a40bbacc71ac348e1",
    "6579d36b72a46474",
    "2026-09-09T19:21:58Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--ontario-annual-series-1984-2022.json",
    630137,
    "52610b8e6245eada192a5eee639a8fa0b24c7c11be662a91e59755ffcab6bf68",
    "fbe1549b3f6ce391",
    "2026-09-09T20:42:54Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--province-windows.json",
    1836,
    "09ba0c977dd9110eb1acc24da5700a1e97a6bf01cf08c6ace1ef5e14658beaf5",
    "bd51021b4e1b7134",
    "2026-09-09T19:24:45Z"
  ],
  [
    "wp2-provincial-annual-series-20260909--quebec-annual-series-1984-2022.json",
    634370,
    "91e6f90bbd69c7f34eb1a21d5957a5755621ac3f738e3b8770b120363953e9b9",
    "c9967361392a2079",
    "2026-09-09T21:04:35Z"
  ]
];

test("every WP2 annual-series file is individually bound and staging-only", () => {
  assert.equal(manifest.entries.filter(entry => entry.id.startsWith("wp2-")).length, WP2_ANNUAL_FILES.length);
  for (const [id, byteLength, sha256, crc64nvme, retrievedAt] of WP2_ANNUAL_FILES) {
    const entry = manifest.entries.find(candidate => candidate.id === id);
    assert.ok(entry, id);
    assert.equal(entry.byteLength, byteLength);
    assert.equal(entry.sha256, sha256);
    assert.equal(entry.crc64nvme, crc64nvme);
    assert.equal(entry.retrievedAt, retrievedAt);
    assert.equal(entry.licenceId, "ogl-canada");
    assert.equal(entry.attributionState, "metadata-verified");
    assert.equal(entry.immutableObjectStorage, false);
    assert.equal(entry.productionEligible, false);
    assert.match(entry.publicationBoundary.en, /intervals must not be summed/);
    assert.match(entry.publicationBoundary.fr, /ne doivent pas être additionnés/);
  }
  const bc = manifest.entries.find(entry => entry.id === "wp2-bc-annual-series-20260909--bc-annual-series-1984-2022.json");
  assert.equal(bc.additionalLicences[0].licenceId, "ogl-bc");
});
