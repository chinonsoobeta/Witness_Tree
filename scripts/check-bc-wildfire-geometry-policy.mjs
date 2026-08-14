import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
export function validate(record) {
  assert.equal(record.status, "quarantined-no-derived-release"); assert.equal(record.sourceId, "bc-wildfire"); assert.equal(record.rawSha256, "46ee3a97ff83128630a030b5cfcc7f3c389fc94e3ca95d463595ab6f4fb57e83"); assert.equal(record.policy.areaTolerance, 0.0001); assert.equal(record.features.length, 2);
  assert.deepEqual(record.features.map((item) => item.fireNumber), ["G70362", "V10755"]);
  for (const item of record.features) { assert.equal(item.sourceGeometryType, "MULTIPOLYGON"); assert.equal(item.makeValidGeometryType, "MULTIPOLYGON"); assert.match(item.reason, /^Nested shells/); assert.equal(item.decision, "quarantine"); }
  assert.ok(record.features[0].relativeAreaDelta <= record.policy.areaTolerance); assert.ok(record.features[1].relativeAreaDelta > record.policy.areaTolerance); assert.match(record.coverageImpact, /Two of 217/); assert.equal(record.immutablePromotionReady, false); assert.equal(record.ownerAdmissionReady, false); assert.equal(record.productionEligible, false); return record;
}
if (process.argv[1]?.endsWith("check-bc-wildfire-geometry-policy.mjs")) { validate(JSON.parse(readFileSync(new URL("../data/bc-wildfire-geometry-policy-2026-08-14.json", import.meta.url), "utf8"))); console.log("BC wildfire geometry policy remains quarantined and fail-closed."); }
