import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateReceipt, verifyReceipt } from "../scripts/check-phase2-annual-nfd-provisional-comparison-receipt.mjs";

const receiptPath = new URL("../data/phase2-annual-nfd-provisional-comparison-receipt-2026-08-27.json", import.meta.url);
const receipt = () => JSON.parse(readFileSync(receiptPath, "utf8"));

test("the durable receipt is structurally valid without reading the external SSD", () => {
  const result = verifyReceipt({ receiptPath });
  assert.equal(result.externalVerified, false);
  assert.equal(result.receipt.rows.comparisonRows, 152);
  assert.equal(result.receipt.claims.formalIndependentComparisonGateComplete, false);
});

test("the receipt rejects a fabricated gate, review, or like-for-like claim", () => {
  for (const [field, value] of [
    ["formalIndependentComparisonGateComplete", true],
    ["likeForLike", true],
    ["productAccuracy", true],
    ["published", true],
    ["productionEligible", true],
  ]) {
    const candidate = receipt();
    candidate.claims[field] = value;
    assert.throws(() => validateReceipt(candidate));
  }
});

test("the receipt rejects hidden pending rows or a relabelled schedule", () => {
  const counts = receipt();
  counts.rows.pendingRows -= 1;
  counts.rows.computedRows += 1;
  assert.throws(() => validateReceipt(counts));
  const schedule = receipt();
  schedule.rows.firstToYear = 1984;
  assert.throws(() => validateReceipt(schedule));
});
