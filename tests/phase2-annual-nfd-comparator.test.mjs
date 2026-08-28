import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPARATOR_BASELINE_YEAR,
  COMPARATOR_END_YEAR,
  COMPARATOR_PROVINCES,
  COMPARATOR_ROW_COUNT,
  assertProvisionalAnnualNfdComparison,
  compareAnnualZonalToNfd,
} from "../lib/phase2/annual-nfd-comparator.mjs";
import { makeAnnualNfdFixture } from "./fixtures/phase2-annual-nfd-comparator-fixture.mjs";

test("joins each adjacent interval by toYear and excludes the four 1984 snapshots", () => {
  const { annualRows, nfdProfile } = makeAnnualNfdFixture();
  const rows = compareAnnualZonalToNfd(annualRows, nfdProfile);
  assert.equal(rows.length, COMPARATOR_ROW_COUNT);
  assert.equal(new Set(rows.map((row) => row.toYear)).size, COMPARATOR_END_YEAR - COMPARATOR_BASELINE_YEAR);
  assert.equal(rows.some((row) => row.toYear === COMPARATOR_BASELINE_YEAR), false);
  assert.deepEqual(rows.slice(0, 2).map((row) => [row.province, row.fromYear, row.toYear]), [["BC", 1984, 1985], ["BC", 1985, 1986]]);
  assert.deepEqual(rows.map((row) => row.province).filter((province, index, all) => index === 0 || province !== all[index - 1]), COMPARATOR_PROVINCES);
  assert.equal(rows.find((row) => row.province === "BC" && row.toYear === 1985).nfdReportedHarvestHectares, 100);
});

test("computes exact descriptive differences only when both complete totals are known", () => {
  const { annualRows, nfdProfile } = makeAnnualNfdFixture();
  const rows = compareAnnualZonalToNfd(annualRows, nfdProfile);
  const known = rows.find((row) => row.province === "BC" && row.toYear === 1985);
  assert.deepEqual({
    witness: known.witnessTreeObservedForestLossHectares,
    nfd: known.nfdReportedHarvestHectares,
    signed: known.signedDifferenceHectares,
    signedExact: known.signedDifferenceHectaresExact,
    absolute: known.absoluteDifferenceHectares,
    absoluteExact: known.absoluteDifferenceHectaresExact,
    status: known.comparisonStatus,
  }, {
    witness: 12.5,
    nfd: 100,
    signed: -87.5,
    signedExact: "-87.5",
    absolute: 87.5,
    absoluteExact: "87.5",
    status: "computed",
  });
  assert.equal(known.relativeDifference, -0.875);

  const incompleteWitness = rows.find((row) => row.province === "AB" && row.toYear === 2001);
  assert.equal(incompleteWitness.witnessTreeObservedForestLossHectares, null);
  assert.equal(incompleteWitness.nfdReportedHarvestHectares, 20);
  assert.equal(incompleteWitness.comparisonStatus, "pending");
  assert.equal(incompleteWitness.absoluteDifferenceHectares, null);
  assert.equal(incompleteWitness.signedDifferenceHectaresExact, null);

  const unknownNfd = rows.find((row) => row.province === "QC" && row.toYear === 2001);
  assert.equal(unknownNfd.witnessTreeObservedForestLossHectares, 1.25);
  assert.equal(unknownNfd.nfdReportedHarvestHectares, null);
  assert.equal(unknownNfd.comparisonStatus, "pending");
  assert.equal(unknownNfd.absoluteDifferenceHectares, null);
});

test("labels the two quantities as non-like-for-like and carries only negative claim flags", () => {
  const { annualRows, nfdProfile } = makeAnnualNfdFixture();
  const rows = compareAnnualZonalToNfd(annualRows, nfdProfile);
  for (const row of rows) {
    assert.equal(row.likeForLikeClaim, false);
    assert.match(row.comparisonLabel, /non-like-for-like/);
    assert.deepEqual(row.claims, {
      causalAttributionClaim: false,
      productAccuracyClaim: false,
      equivalenceClaim: false,
      likeForLikeClaim: false,
      admitted: false,
      released: false,
      productionEligible: false,
    });
  }
});

test("rejects a baseline relabelled as annual loss and rejects the formal 156-row gate shape", () => {
  const fixture = makeAnnualNfdFixture();
  const hostile = structuredClone(fixture.annualRows);
  hostile[0].rowType = "annual";
  hostile[0].fromYear = 1984;
  hostile[0].toYear = 1984;
  assert.throws(() => compareAnnualZonalToNfd(hostile, fixture.nfdProfile), /cannot label 1984 as annual loss|adjacent interval/);

  const rows = compareAnnualZonalToNfd(fixture.annualRows, fixture.nfdProfile);
  assert.throws(() => assertProvisionalAnnualNfdComparison([...rows, ...fixture.annualRows.slice(0, 4)]), /formal 156-row gate|baseline/);
  const fabricated = structuredClone(rows);
  fabricated[0].claims.productionEligible = true;
  assert.throws(() => assertProvisionalAnnualNfdComparison(fabricated), /productionEligible/);
});

test("does not use an NFD known-area subtotal when the complete total is unknown", () => {
  const fixture = makeAnnualNfdFixture();
  const profileRow = fixture.nfdProfile.frame.rows.find((row) => row.province === "QC" && row.year === 2001);
  profileRow.knownAreaHectares = 12.5;
  profileRow.knownAreaHectaresExact = "12.5";
  const row = compareAnnualZonalToNfd(fixture.annualRows, fixture.nfdProfile).find((entry) => entry.province === "QC" && entry.toYear === 2001);
  assert.equal(row.nfdReportedHarvestHectares, null);
  assert.equal(row.absoluteDifferenceHectares, null);
});

test("keeps relative difference null when the known NFD reference is zero", () => {
  const fixture = makeAnnualNfdFixture();
  const profileRow = fixture.nfdProfile.frame.rows.find((row) => row.province === "BC" && row.year === 1985);
  profileRow.areaHectares = 0;
  profileRow.areaHectaresExact = "0";
  const row = compareAnnualZonalToNfd(fixture.annualRows, fixture.nfdProfile).find((entry) => entry.province === "BC" && entry.toYear === 1985);
  assert.equal(row.comparisonStatus, "computed");
  assert.equal(row.signedDifferenceHectaresExact, "12.5");
  assert.equal(row.relativeDifference, null);
});
