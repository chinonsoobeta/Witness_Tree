import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const RAW = {
  localPath: "../Witness_Tree-data/raw/nrcan-forest-canopy-cover-2022/2026-08-11/CA_canopy_cover_2022.zip",
  byteLength: 9954395939,
  sha256: "80c37461f4deccfdfffc26124e9064d53a94dde660b9f96194445870393af130",
  zipIntegrity: "passed",
  memberCount: 8,
};
const GEOTRANSFORM = [-2660910.524, 30, 0, 2998848.1105, 0, -30];

export function validateNrcanCanopyCoverProfile(profile) {
  assert.equal(profile?.schemaVersion, "1.0");
  assert.equal(profile?.status, "read-only-staging-profile");
  assert.match(profile.notice, /not a transformation, ingestion, immutable archive, or production dataset/i);
  assert.equal(profile.sourceId, "nrcan-forest-canopy-cover-2022");
  assert.equal(profile.stagedAcquisitionId, "nrcan-forest-canopy-cover-2022-2026-08-11");
  assert.deepEqual(profile.raw, RAW);

  const raster = profile.raster;
  assert.equal(raster.member, "CA_canopy_cover_2022.tif");
  assert.equal(raster.driver, "GTiff");
  assert.equal(raster.geometryKind, "raster");
  assert.equal(raster.bandCount, 1);
  assert.equal(raster.dataType, "Float32");
  assert.equal(raster.pixelWidth, 193936);
  assert.equal(raster.pixelHeight, 128340);
  assert.equal(raster.pixelSizeMetres, 30);
  assert.equal(raster.crs, "NAD83 Lambert Conformal Conic (no EPSG authority asserted)");
  assert.deepEqual(raster.geoTransform, GEOTRANSFORM);
  assert.equal(raster.noDataValue, -3.402823e+38);
  assert.deepEqual(raster.statistics, {
    minimum: 0,
    maximum: 100,
    mean: 8.708,
    stdDev: 23.252,
    evidence: "GDAL read-only metadata/statistics; no values were rewritten",
  });
  assert.equal(raster.valueEvidence.zeroMeaning, "Areas with no tree cover as defined by the annual forest land cover map in 2022.");
  assert.equal(raster.valueEvidence.range, "0–100 percent canopy cover");
  assert.match(raster.valueEvidence.categoricalValueTable, /not-present.*Float32 continuous raster/i);
  assert.equal(raster.geometryValidity, "not-applicable-raster");

  assert.deepEqual(profile.gridConformance, {
    profile: "data/raster-grid.json",
    pixelWidth: 193936,
    pixelHeight: 128340,
    pixelSizeMetres: 30,
    geoTransform: GEOTRANSFORM,
    crsWktSha256: "551d75abf82e92e1e1ce144f31f5934ad0bc2b8a2fa279316ac72a812e03656f",
    authorityCode: null,
  });
  assert.equal(profile.productionEligible, false);
  assert.equal(profile.limitations.length, 5);
  assert.match(profile.limitations.join("\n"), /No target transformation specification/i);
  assert.doesNotMatch(JSON.stringify(profile), /productionEligible["']?\s*:\s*true/i);
  return profile;
}

if (process.argv[1]?.endsWith("check-nrcan-canopy-cover-profile.mjs")) {
  const profile = await readFile(new URL("../data/nrcan-canopy-cover-profile.json", import.meta.url), "utf8").then(JSON.parse);
  validateNrcanCanopyCoverProfile(profile);
  console.log("NRCan canopy-cover staging profile passed; transformation and production remain blocked.");
}
