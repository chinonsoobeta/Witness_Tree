import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateStagedGeospatialProfile } from "../scripts/check-staged-geospatial-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/staged-geospatial-profile.json", import.meta.url), "utf8"));
const alberta = profile.sources.find((source) => source.sourceId === "alberta-avi-crown");
const crown = alberta.layers.find((layer) => layer.name === "AVI_Crown");
const bcWildfire = profile.sources.find((source) => source.sourceId === "bc-wildfire");
const plvi = profile.sources.find((source) => source.sourceId === "ab-primary-land-vegetation");

test("real staged schemas and geometry findings remain reproducible", () => {
  assert.equal(validateStagedGeospatialProfile(profile), profile);
  assert.equal(alberta.decision, "blocked-pending-geometry-policy");
  assert.equal(alberta.layers.reduce((total, layer) => total + layer.invalidGeometryCount, 0), 608);
  assert.equal(bcWildfire.geometryPolicy.derivedReleaseFeatureCount, 216);
  assert.deepEqual(bcWildfire.geometryPolicy.quarantinedFeatureIds, ["V10755"]);
  assert.equal(bcWildfire.geometryPolicy.immutablePromotionReady, false);
  assert.equal(plvi.layers[0].invalidGeometryCount, 12);
  assert.equal(plvi.layers[0].attributeFieldCount, 60);
  assert.equal(profile.sources.every((source) => source.productionEligible === false), true);
});

test("profile gate rejects schema drift, hidden defects, and production claims", () => {
  const replaceAlberta = (replacement) => profile.sources.map((source) => source.sourceId === alberta.sourceId ? replacement : source);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceAlberta({ ...alberta, productionEligible: true }) }), /production eligibility/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceAlberta({ ...alberta, layers: alberta.layers.map((layer) => layer.name === crown.name ? { ...layer, featureCount: 1 } : layer) }) }), /schema invariant/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceAlberta({ ...alberta, layers: alberta.layers.map((layer) => ({ ...layer, invalidGeometryCount: 0 })) }) }), /geometry evidence/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceAlberta({ ...alberta, decision: "ready-for-ingestion" }) }), /unsafe/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, profiledAt: "2026-08-12" }), /UTC timestamp/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: [profile.sources[0], profile.sources[0]] }), /source ids must be unique/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceAlberta({ ...alberta, layers: [crown, crown, ...alberta.layers.slice(2)] }) }), /layer names must be unique/);
  const replaceBc = (replacement) => profile.sources.map((source) => source.sourceId === bcWildfire.sourceId ? replacement : source);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceBc({ ...bcWildfire, geometryPolicy: { ...bcWildfire.geometryPolicy, derivedReleaseFeatureCount: 217 } }) }), /derived-release and quarantine evidence/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replaceBc({ ...bcWildfire, geometryPolicy: { ...bcWildfire.geometryPolicy, ownerAdmissionReady: true } }) }), /derived-release and quarantine evidence/);
  const replacePlvi = (replacement) => profile.sources.map((source) => source.sourceId === plvi.sourceId ? replacement : source);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replacePlvi({ ...plvi, layers: [{ ...plvi.layers[0], attributeFieldCount: 63 }] }) }), /schema invariant/);
  assert.throws(() => validateStagedGeospatialProfile({ ...profile, sources: replacePlvi({ ...plvi, layers: [{ ...plvi.layers[0], fieldCount: 63 }] }) }), /attribute-field count semantics/);
});
