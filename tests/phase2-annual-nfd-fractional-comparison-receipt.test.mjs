import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateReceipt, verifyReceipt } from "../scripts/check-phase2-annual-nfd-fractional-comparison-receipt.mjs";

const receiptPath = new URL("../data/phase2-annual-nfd-fractional-comparison-receipt-2026-08-27.json", import.meta.url);
const receipt = () => JSON.parse(readFileSync(receiptPath, "utf8"));

test("the fractional comparison receipt is structurally valid without the external SSD", () => {
  const result = verifyReceipt({ receiptPath });
  assert.equal(result.externalVerified, false);
  assert.equal(result.receipt.fractionalCorrection.candidateCellCount, 5113929);
  assert.equal(result.receipt.rows.comparisonRows, 152);
  assert.equal(result.receipt.claims.formalIndependentComparisonGateComplete, false);
});

test("the fractional receipt rejects inflated comparison or production claims", () => {
  for (const [field, value] of [
    ["likeForLike", true],
    ["causalAttribution", true],
    ["formalIndependentComparisonGateComplete", true],
    ["published", true],
    ["admitted", true],
    ["productionEligible", true],
  ]) {
    const candidate = receipt();
    candidate.claims[field] = value;
    assert.throws(() => validateReceipt(candidate));
  }
});

test("the fractional receipt rejects hidden pending rows and correction-count drift", () => {
  const pending = receipt();
  pending.rows.pendingRows -= 1;
  pending.rows.computedRows += 1;
  assert.throws(() => validateReceipt(pending));
  const correction = receipt();
  correction.fractionalCorrection.changedCellCount += 1;
  assert.throws(() => validateReceipt(correction));
});
