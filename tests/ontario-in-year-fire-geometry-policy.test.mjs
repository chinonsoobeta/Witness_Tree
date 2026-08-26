import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validate } from "../scripts/check-ontario-in-year-fire-geometry-policy.mjs";

const record = () => JSON.parse(readFileSync(new URL("../data/ontario-in-year-fire-geometry-policy-2026-08-14.json", import.meta.url)));

test("rejects loss, unbounded repair, or an implied admission", () => {
  assert.doesNotThrow(() => validate(record()));
  const loss = record(); loss.closedJoin.lostFeatureCount = 1;
  assert.throws(() => validate(loss));
  const drift = record(); drift.policy.invalidFeatures[0].relativeAreaDelta = 1e-8;
  assert.throws(() => validate(drift));
  const admitted = record(); admitted.ownerAdmission = true;
  assert.throws(() => validate(admitted));
});
