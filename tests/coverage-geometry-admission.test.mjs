import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCoverageGeometryAdmission } from "../scripts/check-coverage-geometry-admission.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/coverage-geometry-admission.json", import.meta.url), "utf8"));
const checksum = "a".repeat(64);
const layer = (province) => ({
  evidenceClass: "versioned-source-geometry", sourceId: `authority-${province.toLowerCase()}-land-base`, province, edition: "2026-01", crs: "EPSG:3347", checksumSha256: checksum,
  sourceUrl: `https://authority.invalid/${province.toLowerCase()}/2026-01`, coverageClass: "land-base", coverageRole: "national-baseline-land-base", coverageGrade: "national-baseline", extent: { west: -130, south: 45, east: -60, north: 61 }, areaSquareKilometres: 1,
  profile: { evidenceId: `profile-${province.toLowerCase()}-2026-01`, profiledAt: "2026-08-14T00:00:00Z", evidenceUrl: `https://authority.invalid/${province.toLowerCase()}/profile`, evidenceChecksumSha256: "b".repeat(64), geometryChecksumSha256: "c".repeat(64), geometryType: "MultiPolygon", featureCount: 1, invalidGeometryCount: 0, validity: "passed" },
  licence: { id: "public-licence", url: "https://authority.invalid/licence" }, attribution: "Source authority attribution."
});

test("default admission manifest completes all four baselines and retains bounded overlays", () => {
  assert.equal(validateCoverageGeometryAdmission(manifest), manifest);
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.layers.length, 7);
  const bc = manifest.layers.find((entry) => entry.province === "BC");
  const alberta = manifest.layers.find((entry) => entry.sourceId === "alberta-known-coverage-fma-and-avi-v1");
  const ontario = manifest.layers.find((entry) => entry.sourceId === "ontario-forest-management-units");
  const quebec = manifest.layers.find((entry) => entry.sourceId === "qc-current-ecoforest-coverage-footprint-v1");
  const baselineProvinces = manifest.layers.filter((entry) => entry.coverageRole === "national-baseline-land-base").map((entry) => entry.province).sort();
  assert.deepEqual(baselineProvinces, ["AB", "BC", "ON", "QC"]);
  assert.equal(bc.coverageClass, "national-baseline-jurisdiction-reference");
  assert.equal(bc.scope.enhancedRecordCoverage, false);
  assert.equal(alberta.coverageGrade, "national-baseline-plus-local-context");
  assert.equal(ontario.coverageClass, "national-baseline-plus-managed-forest-context");
  assert.equal(ontario.scope.enhancedRecordCoverage, false);
  assert.equal(quebec.coverageClass, "publisher-current-ecoforest-footprint");
  assert.equal(quebec.scope.outsideBoundaryCoverage, "national-baseline");
  assert.equal(quebec.scope.forestLandBaseDenominator, false);
  assert.equal(quebec.scope.enhancedRecordCoverage, false);
  assert.equal(manifest.requiredProvinceDecisions.quebecSouthOf52, "approved");
});

test("complete admission requires all provinces and both explicit scope decisions", () => {
  const layers = ["BC", "AB", "ON", "QC"].map(layer);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "pending", quebecSouthOf52: "approved" } }), /Ontario managed-forest/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "pending" } }), /Québec south-of-52/);
  assert.equal(validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }).status, "complete");
});

test("local context never substitutes for a provincial national-baseline land-base layer", () => {
  const localBc = { ...layer("BC"), coverageRole: "local-context", coverageGrade: "national-baseline-plus-local-context" };
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers: [localBc, layer("AB"), layer("ON"), layer("QC")], requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }), /national-baseline land-base geometry/);
  const enhancedQc = { ...layer("QC"), sourceId: "qc-current-ecoforest-footprint", coverageRole: "local-context", coverageGrade: "enhanced-local-records" };
  const layersWithoutQcBaseline = manifest.layers.filter((entry) => entry.province !== "QC");
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers: [...layersWithoutQcBaseline, enhancedQc], requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }), /national-baseline land-base geometry/);
});

test("negative corpus rejects incomplete, proxy, and illustrative coverage evidence", () => {
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "pending-evidence", layers: [layer("BC")] }), /Pending evidence/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers: [layer("BC")], requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }), /BC, AB, ON, and QC/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), evidenceClass: "latitude-proxy" }] }), /latitude-proxy/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", latitudeProxy: true, layers: [layer("BC")] }), /latitude-proxy/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), sourceId: "fixture-boundary" }] }), /fixture/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), profile: { ...layer("BC").profile, invalidGeometryCount: "unknown" } }] }), /known non-negative/);
  const ontario = manifest.layers.find((entry) => entry.sourceId === "ontario-forest-management-units");
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...ontario, scope: { ...ontario.scope, forestLandBaseDenominator: true } }] }), /cannot be a forest land-base denominator/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...ontario, scope: { ...ontario.scope, enhancedRecordCoverage: true } }] }), /cannot enable enhanced records/);
  const bc = manifest.layers.find((entry) => entry.province === "BC");
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...bc, scope: { ...bc.scope, forestLandBaseDenominator: true } }] }), /cannot be a forest land-base denominator/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...bc, resourceUrl: "ftp://unrelated.invalid/bc.zip" }] }), /official FTP resource URL/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), coverageRole: "local-context", coverageGrade: "national-baseline" }] }), /Local context cannot use/);
  const quebec = manifest.layers.find((entry) => entry.sourceId === "qc-current-ecoforest-coverage-footprint-v1");
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, coverageClass: "land-base" }] }), /Derived coverage must be explicitly partial/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, scope: { ...quebec.scope, forestLandBaseDenominator: true } }] }), /cannot be a forest land-base denominator/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, scope: { ...quebec.scope, enhancedRecordCoverage: true } }] }), /cannot enable enhanced records/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, scope: { ...quebec.scope, outsideBoundaryCoverage: "enhanced-local-records" } }] }), /must retain the national baseline/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, inputEvidence: [] }] }), /exactly one checksum-bound/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, checksumSha256: "d".repeat(64) }] }), /must match its admitted profiled derivative/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...quebec, profile: { ...quebec.profile, evidenceChecksumSha256: "d".repeat(64) } }] }), /must match its admitted evidence record/);
});

test("partial known coverage requires lineage, an honest scope, and the local-context grade", () => {
  const partial = {
    ...layer("AB"), evidenceClass: "lineage-bound-derived-geometry", coverageScope: "partial-known-coverage", coverageRole: "local-context", coverageGrade: "national-baseline-plus-local-context",
    inputEvidence: [
      { sourceId: "alberta-fma-published-area", checksumSha256: "c".repeat(64), sourceUrl: "https://authority.invalid/fma" },
      { sourceId: "alberta-avi-crown-coverage-footprint-v1", checksumSha256: "d".repeat(64), sourceUrl: "https://authority.invalid/avi" },
    ],
    scopeNotice: "Known FMA and AVI source footprints only; areas outside both inputs remain outside this bounded coverage.",
    claims: "This does not assert complete coverage.",
  };
  assert.equal(validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [partial] }).status, "partial");
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...partial, coverageGrade: "enhanced-local-records" }] }), /national-baseline-plus-local-context/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...partial, scopeNotice: "Province-wide Alberta forest land-base coverage." }] }), /cannot claim/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [] }), /requires at least one/);
});
