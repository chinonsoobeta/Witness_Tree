import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCoverageGeometryAdmission } from "../scripts/check-coverage-geometry-admission.mjs";

const manifest = JSON.parse(readFileSync(new URL("../data/coverage-geometry-admission.json", import.meta.url), "utf8"));
const checksum = "a".repeat(64);
const layer = (province) => ({
  evidenceClass: "versioned-source-geometry", sourceId: `authority-${province.toLowerCase()}-land-base`, province, edition: "2026-01", crs: "EPSG:3347", checksumSha256: checksum,
  sourceUrl: `https://authority.invalid/${province.toLowerCase()}/2026-01`, extent: { west: -130, south: 45, east: -60, north: 61 }, areaSquareKilometres: 1,
  coverageClass: province === "ON" ? "national-baseline-plus-managed-forest-context" : "land-base",
  scope: province === "ON" ? { decision: "crown-forest-planning-unit-context-only", outsideBoundaryCoverage: "national-baseline", forestLandBaseDenominator: false, enhancedRecordCoverage: false, enhancedRecordCondition: "Verified local records are required." } : undefined,
  profile: { evidenceId: `profile-${province.toLowerCase()}-2026-01`, profiledAt: "2026-08-14T00:00:00Z", evidencePath: `../Witness_Tree-data/derived/${province.toLowerCase()}/profile.json`, evidenceChecksumSha256: "b".repeat(64), geometryChecksumSha256: "c".repeat(64), geometryType: "MultiPolygon", featureCount: 1, invalidGeometryCount: 0, validity: "passed" },
  licence: { id: "public-licence", url: "https://authority.invalid/licence" }, attribution: "Source authority attribution."
});

test("Ontario is admitted only as baseline-plus-context planning-unit geometry", () => {
  assert.equal(validateCoverageGeometryAdmission(manifest), manifest);
  assert.equal(manifest.status, "partial");
  assert.equal(manifest.layers.length, 1);
  assert.equal(manifest.layers[0].coverageClass, "national-baseline-plus-managed-forest-context");
  assert.equal(manifest.layers[0].scope.enhancedRecordCoverage, false);
});

test("complete admission requires all provinces and both explicit scope decisions", () => {
  const layers = ["BC", "AB", "ON", "QC"].map(layer);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "pending", quebecSouthOf52: "approved" } }), /Ontario managed-forest/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "pending" } }), /Québec south-of-52/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers, requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }), /land-base geometry/);
  const landBaseLayers = layers.map((entry) => entry.province === "ON" ? { ...entry, sourceId: "ontario-verified-land-base", coverageClass: "land-base", scope: undefined } : entry);
  assert.equal(validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers: landBaseLayers, requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }).status, "complete");
});

test("negative corpus rejects incomplete, proxy, and illustrative coverage evidence", () => {
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "pending-evidence", layers: [layer("BC")] }), /Pending evidence/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "complete", layers: [layer("BC")], requiredProvinceDecisions: { ontarioManagedForest: "approved", quebecSouthOf52: "approved" } }), /BC, AB, ON, and QC/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), evidenceClass: "latitude-proxy" }] }), /latitude-proxy/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", latitudeProxy: true, layers: [layer("BC")] }), /latitude-proxy/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), sourceId: "fixture-boundary" }] }), /fixture/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("BC"), profile: { ...layer("BC").profile, invalidGeometryCount: "unknown" } }] }), /known non-negative/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("ON"), scope: { ...layer("ON").scope, forestLandBaseDenominator: true } }] }), /cannot be a forest land-base denominator/);
  assert.throws(() => validateCoverageGeometryAdmission({ ...manifest, status: "partial", layers: [{ ...layer("ON"), scope: { ...layer("ON").scope, enhancedRecordCoverage: true } }] }), /cannot enable enhanced records/);
});
