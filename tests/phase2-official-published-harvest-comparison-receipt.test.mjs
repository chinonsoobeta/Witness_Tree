import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateOfficialPublishedHarvestReceipt, verifyOfficialPublishedHarvestReceipt } from "../scripts/check-phase2-official-published-harvest-comparison-receipt.mjs";

const receiptPath = new URL("../data/phase2-official-published-harvest-comparison-receipt-2026-08-27.json", import.meta.url);
const readReceipt = () => JSON.parse(readFileSync(receiptPath, "utf8"));

test("the prepared public artifact is structurally bound and keeps restricted values absent", () => {
  const result = verifyOfficialPublishedHarvestReceipt({ receiptPath });
  assert.equal(result.externalVerified, false);
  assert.equal(result.publicOutput.rows.length, 118);
  assert.equal(result.publicOutput.rows.filter((row) => row.comparisonStatus === "computed-rounded-reference").length, 104);
  assert.equal(result.publicOutput.rows.filter((row) => row.comparisonStatus === "pending-restricted-source").every((row) => row.referenceHectaresNominal === null), true);
});

test("the receipt rejects publication, production, exact-replacement, and restricted-value claims", () => {
  const mutations = [
    (value) => { value.summary.safeExactNfdReplacementRows = 1; },
    (value) => { value.summary.restrictedNumericValuesPublished = 14; },
    (value) => { value.claims.strictNfdRowsReplaced = true; },
    (value) => { value.claims.likeForLike = true; },
    (value) => { value.claims.published = true; },
    (value) => { value.claims.productionEligible = true; },
    (value) => { value.claims.formalIndependentComparisonGateComplete = true; },
  ];
  for (const mutate of mutations) {
    const receipt = readReceipt();
    mutate(receipt);
    assert.throws(() => validateOfficialPublishedHarvestReceipt(receipt));
  }
});
