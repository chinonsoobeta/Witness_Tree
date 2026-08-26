import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1AccessBlockerResolution } from "../scripts/check-phase1-access-blocker-resolution.mjs";

const matrix = JSON.parse(readFileSync(new URL("../data/phase1-access-blocker-resolution.json", import.meta.url), "utf8"));
const ledger = JSON.parse(readFileSync(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8"));

test("all canonical access-blocked Phase 1 rows have a primary-source resolution path without admission", () => {
  assert.equal(validatePhase1AccessBlockerResolution(matrix, ledger), matrix);
  assert.equal(matrix.rankedRows.length, 13);
  assert.ok(matrix.rankedRows.every((row) => row.lawfulAcquisitionNow === false));
  assert.deepEqual(matrix.rankedRows.map((row) => row.rank), Array.from({ length: 13 }, (_, index) => index + 1));
});

test("resolution matrix rejects a missing row or invented lawful acquisition", () => {
  const missing = structuredClone(matrix); missing.rankedRows.pop();
  assert.throws(() => validatePhase1AccessBlockerResolution(missing, ledger), /every blocked production row/i);
  const invented = structuredClone(matrix); invented.rankedRows[0].lawfulAcquisitionNow = true;
  assert.throws(() => validatePhase1AccessBlockerResolution(invented, ledger), /concrete fail-closed resolution/i);
});
