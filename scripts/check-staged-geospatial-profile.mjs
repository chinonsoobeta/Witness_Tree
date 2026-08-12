import { readFile } from "node:fs/promises";

const EXPECTED = new Map([
  ["qc-historic-wildfire-detailed", {
    sha256: "cfed6c16eac901e6887a2518f566dff7608d4c4c371bd9c1ce6b2eff03fa0815",
    decision: "ready-for-transformation-design",
    layers: new Map([
      ["feux_prov", ["MultiPolygon", 94572, "EPSG:32198", 11, 0]],
      ["meta_feux_prov", ["Point", 94572, "EPSG:32198", 10, 0]],
    ]),
  }],
  ["alberta-avi-crown", {
    sha256: "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093",
    decision: "blocked-pending-geometry-policy",
    layers: new Map([
      ["AVI_Crown", ["MultiPolygon", 788810, "EPSG:3400", 67, 587]],
      ["AVI_PostInventoryHarvest", ["MultiPolygon", 3631, "EPSG:3400", 3, 19]],
      ["AVI_CrownIndex", ["MultiPolygon", 1, "EPSG:3400", 3, 1]],
      ["AVI_PostInventoryHarvestIndex", ["MultiPolygon", 1, "EPSG:3400", 2, 1]],
    ]),
  }],
]);

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

export function validateStagedGeospatialProfile(profile) {
  if (profile?.status !== "local-staging-profile") throw new Error("Profile must remain local-staging-profile.");
  required(profile.notice, "Notice");
  if (!/no source geometry was changed/i.test(profile.notice) || !/no source geometry .*production eligible/i.test(profile.notice)) throw new Error("Profile notice must retain its limitations.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(profile.profiledAt ?? "") || Number.isNaN(new Date(profile.profiledAt).getTime())) throw new Error("Profile time must be a UTC timestamp.");
  required(profile.tools?.pyogrio, "pyogrio version");
  required(profile.tools?.gdal, "GDAL version");
  if (!Array.isArray(profile.sources) || profile.sources.length !== EXPECTED.size) throw new Error("Profile must contain the exact staged sources.");
  const sourceIds = new Set();
  for (const source of profile.sources) {
    const expected = EXPECTED.get(source.sourceId);
    if (!expected) throw new Error(`Unexpected source ${source.sourceId}.`);
    if (sourceIds.has(source.sourceId)) throw new Error("Profile source ids must be unique.");
    sourceIds.add(source.sourceId);
    if (source.inputSha256 !== expected.sha256) throw new Error(`${source.sourceId} input checksum changed.`);
    if (source.decision !== expected.decision) throw new Error(`${source.sourceId} decision is unsafe.`);
    if (source.productionEligible !== false) throw new Error("A staging profile cannot grant production eligibility.");
    if (source.sourceId === "alberta-avi-crown") required(source.requiredAction, "Alberta required action");
    if (!Array.isArray(source.layers) || source.layers.length !== expected.layers.size) throw new Error(`${source.sourceId} layer set changed.`);
    const layerNames = new Set();
    for (const layer of source.layers) {
      const invariant = expected.layers.get(layer.name);
      if (!invariant) throw new Error(`Unexpected layer ${layer.name}.`);
      if (layerNames.has(layer.name)) throw new Error(`${source.sourceId} layer names must be unique.`);
      layerNames.add(layer.name);
      const [geometryType, featureCount, crs, fieldCount, invalidCount] = invariant;
      if (layer.geometryType !== geometryType || layer.featureCount !== featureCount || layer.crs !== crs || layer.fieldCount !== fieldCount) throw new Error(`${layer.name} schema invariant changed.`);
      if (layer.invalidGeometryCount !== invalidCount) throw new Error(`${layer.name} geometry evidence changed.`);
      const reasons = layer.invalidGeometryReasons;
      if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) throw new Error(`${layer.name} geometry reasons are required.`);
      const reasonTotal = Object.values(reasons).reduce((total, count) => total + count, 0);
      if (!Number.isSafeInteger(reasonTotal)) throw new Error(`${layer.name} geometry reasons are invalid.`);
      if (reasonTotal !== invalidCount) throw new Error(`${layer.name} geometry reasons do not reconcile.`);
      if (layer.missingGeometryCount !== 0 || layer.emptyGeometryCount !== 0) throw new Error(`${layer.name} contains missing or empty geometry.`);
      if (!Array.isArray(layer.requiredFields) || layer.requiredFields.length === 0) throw new Error(`${layer.name} required fields are missing.`);
    }
  }
  return profile;
}

export async function checkStagedGeospatialProfile(file = new URL("../data/staged-geospatial-profile.json", import.meta.url)) {
  return validateStagedGeospatialProfile(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const profile = await checkStagedGeospatialProfile();
  console.log(`Staged geospatial profile passed for ${profile.sources.length} sources.`);
}
