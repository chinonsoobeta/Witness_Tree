import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function validate(record) {
  assert.equal(record.status, "full-derived-release-local-only");
  assert.equal(record.rawArchive.unchanged, true);
  assert.equal(record.policy.relativeAreaTolerance, 1e-9);
  assert.equal(record.policy.invalidFeatureCount, 9);
  assert.equal(record.policy.validFeaturesCopiedUnchanged, 179);
  assert.equal(record.policy.repairedFeatureCount, 9);
  assert.deepEqual(record.policy.quarantinedFeatureIds, []);
  assert.equal(record.policy.invalidFeatures.length, 9);
  const ids = new Set();
  for (const feature of record.policy.invalidFeatures) {
    assert.match(feature.reason, /^Ring Self-intersection/);
    assert.ok(["POLYGON", "MULTIPOLYGON"].includes(feature.geometryType));
    assert.equal(feature.disposition, "repair-in-derived-release");
    assert.ok(feature.relativeAreaDelta <= record.policy.relativeAreaTolerance);
    assert.ok(!ids.has(feature.objectId));
    ids.add(feature.objectId);
  }
  const join = record.closedJoin;
  assert.equal(join.rawFeatureCount, 188);
  assert.equal(join.derivedFeatureCount, 188);
  assert.equal(join.rawDistinctObjectIdCount, 188);
  assert.equal(join.derivedDistinctObjectIdCount, 188);
  assert.equal(join.lostFeatureCount, 0);
  assert.equal(join.duplicatedFeatureCount, 0);
  assert.equal(join.attributesPreserved, true);
  assert.equal(record.derivedRelease.featureCount, 188);
  assert.equal(record.derivedRelease.distinctObjectIdCount, 188);
  assert.equal(record.derivedRelease.allGeometriesValid, true);
  assert.equal(record.derivedRelease.emptyOrNullGeometryCount, 0);
  assert.equal(record.derivedRelease.nonPolygonalGeometryCount, 0);
  assert.equal(record.immutableArchive, false);
  assert.equal(record.ownerAdmission, false);
  assert.equal(record.productionEligible, false);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(readFileSync(new URL("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json", import.meta.url)));
  validate(record);
  console.log("Ontario in-year fire geometry policy passed.");
}
