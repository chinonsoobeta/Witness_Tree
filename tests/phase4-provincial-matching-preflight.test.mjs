import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase4ProvincialMatchingPreflight } from "../scripts/check-phase4-provincial-matching-preflight.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase4-provincial-matching-preflight.json", import.meta.url), "utf8"));

test("the Phase 4 Québec preflight is checksum-bound and cannot publish blocked values", async () => {
  await assert.doesNotReject(validatePhase4ProvincialMatchingPreflight(record));
  await assert.rejects(validatePhase4ProvincialMatchingPreflight({ ...record, result: { ...record.result, matchRate: 0 } }), /cannot publish numeric/);
  await assert.rejects(validatePhase4ProvincialMatchingPreflight({ ...record, inputBindings: record.inputBindings.map((value, index) => index === 0 ? { ...value, sha256: "0".repeat(64) } : value) }), /checksum/);
});
