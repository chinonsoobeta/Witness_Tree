import assert from "node:assert/strict";
import test from "node:test";

import receipt from "../data/coverage-gap-investigation-2026-09-08.json";
import { UNMAPPED_REASONS } from "../lib/explore/unmapped-reasons";

const gap = receipt.findings.gap;
const expected = {
  AB: gap.provinceHectares.AB - gap.distribution.albertaMid52To56NHectares,
  QC: gap.distribution.quebecFarNorthHectares,
  ON: gap.distribution.southBelow52NHectares
    - (gap.provinceHectares.AB - gap.distribution.albertaMid52To56NHectares)
    - (gap.provinceHectares.QC - gap.distribution.quebecFarNorthHectares),
  BC: receipt.findings.britishColumbia.shorelineAndBoundaryEditionDisagreement.hectares,
};

test("every province reason is bilingual, receipt-based, and uses no unsupported figures", () => {
  for (const reason of Object.values(UNMAPPED_REASONS)) {
    assert.ok(reason.en);
    assert.ok(reason.fr);
    assert.ok(reason.basis.length > 0);
    assert.doesNotMatch(reason.en.replaceAll("52", "").replaceAll("56", ""), /\d/u);
    assert.doesNotMatch(reason.fr.replaceAll("52", "").replaceAll("56", ""), /\d/u);
  }
});

test("the receipt supports each qualitative reason", () => {
  assert.ok(expected.AB / gap.provinceHectares.AB > 0.5);
  assert.ok(expected.QC / gap.provinceHectares.QC > 0.5);
  assert.ok(expected.ON / gap.provinceHectares.ON >= 0.999);
  assert.ok(expected.BC / gap.provinceHectares.BC > 0.5);
  assert.match(UNMAPPED_REASONS["48"].en, /mostly/u);
  assert.match(UNMAPPED_REASONS["24"].en, /mostly/u);
  assert.match(UNMAPPED_REASONS["35"].en, /settled south, below 52° north/u);
});
