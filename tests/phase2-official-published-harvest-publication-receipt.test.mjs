import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkOfficialPublishedHarvestPublicationReceipt, validateOfficialPublishedHarvestPublicationReceipt } from "../scripts/check-phase2-official-published-harvest-publication-receipt.mjs";

const receiptPath = new URL("../data/phase2-official-published-harvest-publication-receipt-2026-08-27.json", import.meta.url);

test("the publication receipt binds the merged source, deployed version, and exact public artifact", () => {
  const receipt = checkOfficialPublishedHarvestPublicationReceipt(receiptPath);
  assert.equal(receipt.claims.published, true);
  assert.equal(receipt.claims.formalIndependentComparisonGateComplete, false);
});

test("publication cannot imply production, equivalence, or strict NFD replacement", () => {
  const mutations = [
    (value) => { value.claims.productionEligible = true; },
    (value) => { value.claims.likeForLike = true; },
    (value) => { value.claims.strictNfdRowsReplaced = true; },
    (value) => { value.claims.formalIndependentComparisonGateComplete = true; },
    (value) => { value.summary.restrictedNumericValuesPublished = 14; },
  ];
  for (const mutate of mutations) {
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    mutate(receipt);
    assert.throws(() => validateOfficialPublishedHarvestPublicationReceipt(receipt));
  }
});
