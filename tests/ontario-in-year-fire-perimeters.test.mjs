import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "../scripts/check-ontario-in-year-fire-perimeters.mjs";
import record from "../data/ontario-in-year-fire-perimeters-profile.json" with { type: "json" };

test("Ontario in-year fire profile rejects repair and production claims", () => {
  assert.doesNotThrow(() => validate(record));
  for (const bad of [
    { ...record, artifact: { ...record.artifact, sha256: "a".repeat(64) } },
    { ...record, snapshot: { ...record.snapshot, responseFeatureCount: 2000 } },
    { ...record, layer: { ...record.layer, invalid: 0 } },
    { ...record, transformed: true },
  ]) assert.throws(() => validate(bad));
});
