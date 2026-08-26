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
  ["bc-wildfire", {
    sha256: "46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83",
    decision: "owner-approved-derived-release-pending-immutable-readbacks",
    layers: new Map([
      ["bc-wildfire-perimeters-2026-08-14", ["Polygon/MultiPolygon", 217, "EPSG:4326", 16, 2]],
    ]),
  }],
  ["ab-wildfire", {
    sha256: "f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0",
    decision: "owner-approved-scope-pending-immutable-readback",
    layers: new Map([
      ["alberta-wildfire-locations_2026-08-14", ["Point", 751, "EPSG:4326", 17, 0]],
    ]),
  }],
  ["on-fire-disturbance", {
    sha256: "99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11",
    decision: "owner-approved-derived-release-pending-immutable-readbacks",
    layers: new Map([
      ["ontario-in-year-fire-perimeters_2026-08-14", ["Polygon/MultiPolygon", 188, "EPSG:4326", 7, 9]],
    ]),
  }],
  ["ab-primary-land-vegetation", {
    sha256: "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3",
    decision: "blocked-pending-geometry-policy",
    layers: new Map([
      ["PrimaryLandAndVegetationInventory", ["Polygon", 179087, "EPSG:3400", 60, 12]],
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
  if (!Array.isArray(profile.sources)) throw new Error("Profile must contain the exact staged sources.");
  const suppliedIds = profile.sources.map((source) => source?.sourceId);
  if (new Set(suppliedIds).size !== suppliedIds.length) throw new Error("Profile source ids must be unique.");
  if (profile.sources.length !== EXPECTED.size) throw new Error("Profile must contain the exact staged sources.");
  const sourceIds = new Set();
  for (const source of profile.sources) {
    const expected = EXPECTED.get(source.sourceId);
    if (!expected) throw new Error(`Unexpected source ${source.sourceId}.`);
    if (sourceIds.has(source.sourceId)) throw new Error("Profile source ids must be unique.");
    sourceIds.add(source.sourceId);
    if (source.inputSha256 !== expected.sha256) throw new Error(`${source.sourceId} input checksum changed.`);
    if (source.decision !== expected.decision) throw new Error(`${source.sourceId} decision is unsafe.`);
    if (source.productionEligible !== false) throw new Error("A staging profile cannot grant production eligibility.");
    if (source.sourceId === "bc-wildfire") {
      const policy = source.geometryPolicy;
      if (policy?.record !== "data/bc-wildfire-geometry-policy-2026-08-14.json" || policy.rawFeatureCount !== 217 || policy.derivedReleaseFeatureCount !== 216 || policy.quarantinedFeatureIds?.join(",") !== "V10755" || policy.immutablePromotionReady !== false || policy.ownerAdmissionReady !== false || policy.productionEligible !== false) throw new Error("BC wildfire derived-release and quarantine evidence is incomplete or unsafe.");
    }
    if (["alberta-avi-crown", "bc-wildfire", "ab-primary-land-vegetation"].includes(source.sourceId)) required(source.requiredAction, "required action");
    if (!Array.isArray(source.layers) || source.layers.length !== expected.layers.size) throw new Error(`${source.sourceId} layer set changed.`);
    const layerNames = new Set();
    for (const layer of source.layers) {
      const invariant = expected.layers.get(layer.name);
      if (!invariant) throw new Error(`Unexpected layer ${layer.name}.`);
      if (layerNames.has(layer.name)) throw new Error(`${source.sourceId} layer names must be unique.`);
      layerNames.add(layer.name);
      const [geometryType, featureCount, crs, fieldCount, invalidCount] = invariant;
      const observedFieldCount = source.sourceId === "ab-primary-land-vegetation" ? layer.attributeFieldCount : layer.fieldCount;
      if (source.sourceId === "ab-primary-land-vegetation" && "fieldCount" in layer) throw new Error("PLVI schema must use the exact live attribute-field count semantics.");
      if (layer.geometryType !== geometryType || layer.featureCount !== featureCount || layer.crs !== crs || observedFieldCount !== fieldCount) throw new Error(`${layer.name} schema invariant changed.`);
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
