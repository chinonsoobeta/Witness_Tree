import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-bc-wildfire-current-perimeters.mjs";
import record from "../data/bc-wildfire-current-perimeters-profile.json" with { type: "json" };

test("BC wildfire perimeter profile rejects incomplete, repaired, and production claims", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, artifact: { ...record.artifact, sha256: "a".repeat(64) } },
    { ...record, snapshot: { ...record.snapshot, responseFeatureCount: 1000 } },
    { ...record, layer: { ...record.layer, invalid: 0 } },
    { ...record, productionEligible: true }
  ]) assert.throws(() => validate(bad));
});
