import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-cwfis-current-active-fires.mjs";
import record from "../data/cwfis-current-active-fires-profile.json" with { type: "json" };

test("CWFIS current profile rejects partial, mutable, and production claims", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, artifact: { ...record.artifact, bytes: 1000 } },
    { ...record, snapshot: { ...record.snapshot, resultTypeHits: 10000 } },
    { ...record, layer: { ...record.layer, invalid: 1 } },
    { ...record, productionEligible: true }
  ]) assert.throws(() => validate(bad));
});
