import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-alberta-wildfire-locations.mjs";
import record from "../data/alberta-wildfire-locations-profile.json" with { type: "json" };

test("Alberta wildfire locations profile rejects incomplete and production claims", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, artifact: { ...record.artifact, sha256: "a".repeat(64) } },
    { ...record, snapshot: { ...record.snapshot, responseFeatureCount: 1000 } },
    { ...record, layer: { ...record.layer, invalid: 1 } },
    { ...record, productionEligible: true },
  ]) assert.throws(() => validate(bad));
});
