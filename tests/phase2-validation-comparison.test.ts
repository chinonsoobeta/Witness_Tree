import assert from "node:assert/strict";
import test from "node:test";
import {
  assertBurnedAreaComparison,
  assertHarvestComparison,
  assertNtemsHansenCrossCheck,
  assertSourceReportedAccuracy,
  assertStratifiedSamplePlan,
  type StratifiedSamplePlan,
} // @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/phase2/validation-comparison.ts";

const digest = "a".repeat(64);
const samplePlan: StratifiedSamplePlan = {
  fixtureStatus: "synthetic-illustrative-nonproduction", fixedSeed: "fixed", locationsPerProvince: 100, locationsPerStratum: 25, candidateCountPerStratum: 125,
  strata: ["1984-2002-attributed", "1984-2002-unattributed", "2003-2022-attributed", "2003-2022-unattributed"],
  selectionEvidence: { algorithm: "sha256-rank-v1", candidateIdPattern: "synthetic-{province}-{stratum}-{001..125}", selectedIdsSha256ByProvince: { BC: digest, AB: digest, ON: digest, QC: digest } },
  expertReview: { status: "not-started", completedLocationsByProvince: { BC: 0, AB: 0, ON: 0, QC: 0 }, resultClaims: "none" }, productionEligible: false,
};
const explanation = { en: "Published gap.", fr: "Écart publié." };

test("the sample plan is fixed, stratified, has 100 locations per province, and does not invent expert results", () => {
  assert.equal(assertStratifiedSamplePlan(samplePlan).locationsPerProvince, 100);
  assert.throws(() => assertStratifiedSamplePlan({ ...samplePlan, fixedSeed: "", }), /fixed seed/);
  assert.throws(() => assertStratifiedSamplePlan({ ...samplePlan, expertReview: { ...samplePlan.expertReview, completedLocationsByProvince: { ...samplePlan.expertReview.completedLocationsByProvince, BC: 1 } } }), /not-started/);
});

test("computed comparisons derive and publish both absolute and relative differences", () => {
  const harvest = assertHarvestComparison({ province: "BC", year: 2022, status: "computed", witnessTreeHectares: 120, provincialPublishedHectares: 100, absoluteDifferenceHectares: 20, relativeDifference: .2, publication: "published", explanation });
  assert.equal(harvest.relativeDifference, .2);
  assert.throws(() => assertHarvestComparison({ ...harvest, publication: "hidden" as never }), /cannot hide/);
  assert.throws(() => assertHarvestComparison({ ...harvest, absoluteDifferenceHectares: 0 }), /derived/);
  assert.equal(assertBurnedAreaComparison({ year: 2022, status: "computed", witnessTreeHectares: 100, nbacHectares: 0, absoluteDifferenceHectares: 100, relativeDifference: 0, publication: "published", explanation }).nbacHectares, 0);
});

test("Hansen remains a cross-check rather than a source and source accuracy remains contextual", () => {
  assert.equal(assertNtemsHansenCrossCheck({ fixtureStatus: "synthetic-illustrative-nonproduction", role: "independent-cross-check-not-source", status: "not-started", sampleSize: 1, resultClaims: "none", productionEligible: false }).role, "independent-cross-check-not-source");
  assert.throws(() => assertNtemsHansenCrossCheck({ fixtureStatus: "synthetic-illustrative-nonproduction", role: "source" as never, status: "not-started", sampleSize: 1, resultClaims: "none", productionEligible: false }), /never a Witness Tree source/);
  assert.equal(assertSourceReportedAccuracy({ sourceProduct: "Example source", sourceReportedFigure: "Reported by source", role: "source-reported-context-not-product-accuracy", witnessTreeProductAccuracyClaim: false }).witnessTreeProductAccuracyClaim, false);
  assert.throws(() => assertSourceReportedAccuracy({ sourceProduct: "Example source", sourceReportedFigure: "Reported", role: "source-reported-context-not-product-accuracy", witnessTreeProductAccuracyClaim: true as unknown as false }), /not a Witness Tree product-accuracy/);
});
