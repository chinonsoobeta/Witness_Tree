import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export function validateNrcanCanopyHeightProfile(profile) {
  assert.equal(profile?.schemaVersion, "1.0"); assert.equal(profile?.status, "read-only-staging-profile"); assert.match(profile.notice, /not a transformation, ingestion, immutable archive, or production dataset/i);
  assert.equal(profile.sourceId, "nrcan-forest-canopy-height-2022"); const raw=profile.raw;
  assert.deepEqual(raw, {localPath:"../Witness_Tree-data/raw/nrcan-forest-canopy-height-2022/2026-08-14/CA_canopy_height_2022.zip",byteLength:10347564066,sha256:"86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124",zipIntegrity:"passed",memberCount:8});
  const r=profile.raster; assert.equal(r.member,"CA_canopy_height_2022.tif"); assert.equal(r.driver,"GTiff"); assert.equal(r.geometryKind,"raster"); assert.equal(r.bandCount,1); assert.equal(r.dataType,"Float32"); assert.equal(r.pixelWidth,193936); assert.equal(r.pixelHeight,128340); assert.equal(r.pixelSizeMetres,30); assert.deepEqual(r.geoTransform,[-2660910.524,30,0,2998848.1105,0,-30]); assert.equal(r.noDataValue,-3.402823e+38); assert.deepEqual(r.statistics,{minimum:0,maximum:62.503,mean:2.068,stdDev:5.423}); assert.match(r.valueEvidence.categoricalValueTable,/not-present/i); assert.equal(r.geometryValidity,"not-applicable-raster"); assert.equal(profile.productionEligible,false); assert.equal(profile.limitations.length,4); return profile;
}
if (process.argv[1]?.endsWith("check-nrcan-canopy-height-profile.mjs")) { validateNrcanCanopyHeightProfile(JSON.parse(await readFile(new URL("../data/nrcan-canopy-height-profile.json", import.meta.url),"utf8"))); console.log("NRCan canopy-height staging profile passed."); }
