import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IDS = ["ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation", "cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"];
const SHA = /^[a-f0-9]{64}$/;
const EXPECTED = {
  "ab-avi-crown": { rawSha256: "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093", rawBytes: 557041258, featureCount: 788810 },
  "ab-avi-post-harvest": { rawSha256: "e93572129f25c83911b73eadfacff12624ff6b08f2db4b311c1662196b665093", rawBytes: 557041258, featureCount: 3631 },
  "ab-primary-land-vegetation": { rawSha256: "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3", rawBytes: 675544895, featureCount: 179087 },
  "cwfis-current": { rawSha256: "fc3d4a0730f30d6f12782b16e9459c173dabd6e50d0715b27cddecd954097f86", rawBytes: 45917, featureCount: 586, archiveVersionId: "Dg8F.JwRhDyVT9f30sy2oIY28PXXBhBz" },
  "bc-wildfire": { rawSha256: "46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83", rawBytes: 4813292, featureCount: 216, archiveVersionId: "MlbWtwNKGNYE3NKLKZ6Lwd_SIE3nU3.O" },
  "ab-wildfire": { rawSha256: "f0e86ea34a7624c365349b3a8fbb77967bb45ab73c507cf441efb8f6a8736ee0", rawBytes: 423853, featureCount: 751, archiveVersionId: "dw4wHmsAflq2tavoyrvgU5MYCvAXZT2z" },
  "on-fire-disturbance": { rawSha256: "99881f19a32068b5d66b244955f7b088e873ffe76eafebf1740f03e16f042f11", rawBytes: 19510504, featureCount: 188, archiveVersionId: "1QhoWWDx0BdCnGd.HuIhNFBOM4BGvOL_" },
};

export function validatePhase1AlbertaCurrentWildfireProductionSpec(spec) {
  assert.equal(spec.schemaVersion, "witness-tree/phase1-production-transformation-spec/1");
  assert.equal(spec.status, "specification-only-all-execution-and-admission-blocked");
  assert.deepEqual(spec.rows.map((row) => row.sourceId), IDS);
  assert.equal(spec.claims.productionEligible, false);
  assert.equal(spec.claims.transformed, false);
  assert.equal(spec.claims.ingested, false);
  assert.equal(spec.claims.released, false);
  assert.equal(spec.claims.productionAdmission, false);
  assert.equal(spec.claims.phase2, false);
  for (const row of spec.rows) {
    assert.match(row.input.rawSha256, SHA, `${row.sourceId} raw checksum must be SHA-256.`);
    assert.ok(row.input.rawBytes > 0);
    assert.ok(row.authorityAndArchive.licence.length > 0);
    assert.ok(row.authorityAndArchive.attribution.length > 0);
    assert.ok(row.operation.output.layer.length > 0);
    assert.ok(row.operation.output.crs.startsWith("EPSG:"));
    assert.ok(row.qa.length >= 5);
    assert.ok(row.blockedPrerequisites.length >= 4);
    assert.match(row.intendedUse, /only/i);
  }
  const byId = new Map(spec.rows.map((row) => [row.sourceId, row]));
  for (const [sourceId, expected] of Object.entries(EXPECTED)) {
    const row = byId.get(sourceId);
    assert.equal(row.input.rawSha256, expected.rawSha256, `${sourceId} raw checksum must match the recorded evidence.`);
    assert.equal(row.input.rawBytes, expected.rawBytes, `${sourceId} raw byte length must match the recorded evidence.`);
    assert.equal(row.operation.output.expectedFeatureCount ?? row.input.featureCount, expected.featureCount, `${sourceId} feature count must match the recorded evidence.`);
    if (expected.archiveVersionId) assert.equal(row.input.archiveVersionId ?? row.input.rawArchiveVersionId, expected.archiveVersionId, `${sourceId} raw archive version must match the exact capture.`);
  }
  assert.equal(byId.get("ab-avi-crown").operation.output.expectedFeatureCount, 788810);
  assert.equal(byId.get("ab-avi-post-harvest").operation.output.expectedFeatureCount, 3631);
  assert.equal(byId.get("ab-primary-land-vegetation").operation.output.expectedFeatureCount, 179087);
  assert.match(byId.get("ab-primary-land-vegetation").operation.attributes, /41405/);
  assert.equal(byId.get("cwfis-current").input.featureCount, 586);
  assert.equal(byId.get("ab-wildfire").input.featureCount, 751);
  assert.deepEqual(byId.get("bc-wildfire").operation.output.expectedQuarantineIds, ["V10755"]);
  assert.equal(byId.get("on-fire-disturbance").operation.output.expectedDistinctObjectIdCount, 188);
  return spec;
}

export async function checkPhase1AlbertaCurrentWildfireProductionSpec(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const read = async (file) => JSON.parse(await readFile(path.join(root, "data", file), "utf8"));
  const [spec, avi, plvi, albertaAudit, cwfis, alberta, rawArchive, bcPolicy, ontarioPolicy, bcProfile, ontarioProfile] = await Promise.all([
    read("transformation-specs/phase1-alberta-current-wildfire-production-v1.json"),
    read("transformation-runs/alberta-avi-geometry-repair-v1-2026-08-12.json"),
    read("alberta-plvi-full-release-readiness.json"),
    read("phase1-alberta-transform-ingestion-audit.json"),
    read("cwfis-current-active-fires-profile.json"),
    read("alberta-wildfire-locations-profile.json"),
    read("current-wildfire-exact-raw-archive-capture-2026-08-25.json"),
    read("bc-wildfire-geometry-policy-2026-08-14.json"),
    read("ontario-in-year-fire-geometry-policy-2026-08-14.json"),
    read("bc-wildfire-current-perimeters-profile.json"),
    read("ontario-in-year-fire-perimeters-profile.json"),
  ]);
  validatePhase1AlbertaCurrentWildfireProductionSpec(spec);
  const rows = new Map(spec.rows.map((row) => [row.sourceId, row]));
  const aviLayer = (name) => avi.layers.find((layer) => layer.name === name);
  assert.equal(aviLayer("AVI_Crown").featureCount, rows.get("ab-avi-crown").operation.output.expectedFeatureCount);
  assert.equal(aviLayer("AVI_Crown").invalidGeometryCount, rows.get("ab-avi-crown").operation.output.expectedInvalidInputCount);
  assert.equal(aviLayer("AVI_PostInventoryHarvest").featureCount, rows.get("ab-avi-post-harvest").operation.output.expectedFeatureCount);
  assert.equal(aviLayer("AVI_PostInventoryHarvest").invalidGeometryCount, rows.get("ab-avi-post-harvest").operation.output.expectedInvalidInputCount);
  for (const sourceId of ["ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation"]) {
    const audited = albertaAudit.rows.find((row) => row.id === sourceId).localArtifacts.raw;
    assert.equal(audited.sha256, rows.get(sourceId).input.rawSha256);
    assert.equal(audited.byteLength, rows.get(sourceId).input.rawBytes);
  }
  assert.equal(plvi.rawInput.sha256, rows.get("ab-primary-land-vegetation").input.rawSha256);
  assert.equal(plvi.derivedOutput.sha256, rows.get("ab-primary-land-vegetation").input.derivedSha256);
  assert.equal(plvi.closedJoin.outputFeatureCount, rows.get("ab-primary-land-vegetation").operation.output.expectedFeatureCount);
  assert.equal(cwfis.artifact.sha256, rows.get("cwfis-current").input.rawSha256);
  assert.equal(cwfis.layer.count, rows.get("cwfis-current").input.featureCount);
  assert.equal(cwfis.snapshot.fixedQueryInstant, rows.get("cwfis-current").input.asOf);
  assert.equal(alberta.artifact.sha256, rows.get("ab-wildfire").input.rawSha256);
  assert.equal(alberta.layer.count, rows.get("ab-wildfire").input.featureCount);
  assert.equal(alberta.snapshot.retrievedAt, rows.get("ab-wildfire").input.asOf);
  assert.equal(bcPolicy.derivedRelease.sha256, rows.get("bc-wildfire").input.derivedSha256);
  assert.equal(bcPolicy.derivedRelease.featureCount, rows.get("bc-wildfire").operation.output.expectedFeatureCount);
  assert.equal(bcPolicy.features.find((feature) => feature.fireNumber === "V10755").decision, "quarantine");
  assert.equal(bcPolicy.features.find((feature) => feature.fireNumber === "G70362").decision, "repair-in-derived-release");
  assert.equal(ontarioPolicy.derivedRelease.sha256, rows.get("on-fire-disturbance").input.derivedSha256);
  assert.equal(ontarioPolicy.derivedRelease.featureCount, rows.get("on-fire-disturbance").operation.output.expectedFeatureCount);
  assert.equal(rows.get("bc-wildfire").authorityAndArchive.attribution, bcProfile.licence.requiredNotice);
  assert.equal(rows.get("on-fire-disturbance").authorityAndArchive.attribution, ontarioProfile.licence.requiredNotice);
  assert.deepEqual(rawArchive.entries.map((entry) => entry.sourceId), ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"]);
  for (const entry of rawArchive.entries) {
    const row = rows.get(entry.sourceId);
    assert.ok(row, `Unexpected raw archive source ${entry.sourceId}.`);
    assert.equal(entry.payload.sha256, row.input.rawSha256);
    assert.equal(entry.payload.byteLength, row.input.rawBytes);
    assert.equal(entry.payload.versionId, row.input.archiveVersionId ?? row.input.rawArchiveVersionId);
  }
  return spec;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = await checkPhase1AlbertaCurrentWildfireProductionSpec();
  console.log(`Phase 1 Alberta/current-wildfire specification passed for ${spec.rows.length} blocked rows.`);
}
