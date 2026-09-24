import assert from "node:assert/strict";
import test from "node:test";

import releaseRecord from "../data/phase4-condition-recovery-explore.json";
import {
  CONDITION_RECOVERY,
  conditionRecoveryMeasurements,
  parseConditionRecoveryRelease,
} from "../lib/explore/condition-recovery";

const admitted = (overrides: Record<string, unknown> = {}) => ({
  ...releaseRecord,
  claims: { ...releaseRecord.claims, admitted: true, ownerReviewed: true },
  ...overrides,
});

test("the mode stays empty while the product is not admitted", () => {
  assert.equal(releaseRecord.claims.admitted, false);
  assert.equal(CONDITION_RECOVERY, null);
  assert.deepEqual(conditionRecoveryMeasurements(), []);
});

test("admission alone is not enough: owner review is also required", () => {
  assert.equal(parseConditionRecoveryRelease({ ...admitted(), claims: { admitted: true, ownerReviewed: false } }), null);
  assert.equal(parseConditionRecoveryRelease({ ...admitted(), schema: "something-else" }), null);
});

test("an admitted release that cannot be read correctly throws instead of showing", () => {
  assert.throws(() => parseConditionRecoveryRelease(admitted({ regions: releaseRecord.regions.slice(1) })));
  const zeroed = { ...releaseRecord.provinces[0], latestRecoveredCells: 0, belowFloor: false };
  assert.doesNotThrow(() => parseConditionRecoveryRelease(admitted({ provinces: [zeroed, ...releaseRecord.provinces.slice(1)] })));
  const unknownAsZero = { ...releaseRecord.provinces[1], unknownCells: 0 };
  assert.throws(() => parseConditionRecoveryRelease(admitted({ provinces: [releaseRecord.provinces[0], unknownAsZero, ...releaseRecord.provinces.slice(2)] })));
});

test("an admitted release gives four provinces, 44 regions, and the four-province headline", () => {
  const rows = conditionRecoveryMeasurements(parseConditionRecoveryRelease(admitted()));
  assert.equal(rows.length, 49);
  assert.equal(rows.filter((row) => row.kind === "region").length, 44);
  const four = rows[0];
  assert.equal(four.kind, "four-provinces");
  assert.equal(Math.round(four.lostHectares / 1e4) / 100, 55.13);
  assert.equal(Math.round((four.latestRecoveredPercent ?? 0) * 10) / 10, 36.7);
  assert.ok((four.anyRecoveredPercent ?? 0) > (four.latestRecoveredPercent ?? 0));
});

test("the provinces partition the four-province figure and every region sits in one province", () => {
  const rows = conditionRecoveryMeasurements(parseConditionRecoveryRelease(admitted()));
  const provinces = rows.filter((row) => row.kind === "province");
  const sum = provinces.reduce((total, row) => total + row.lostHectares, 0);
  assert.ok(Math.abs(sum - rows[0].lostHectares) < 1e-3);
  for (const region of rows.filter((row) => row.kind === "region")) {
    assert.ok(provinces.some((p) => p.id === region.provinceId), region.id);
    assert.ok(region.name.en.length > 0 && region.name.fr.length > 0 && !region.name.en.includes(" / "), region.id);
  }
});

test("a region below the 500 ha floor withholds recovery and still reports what nobody could see", () => {
  const rows = conditionRecoveryMeasurements(parseConditionRecoveryRelease(admitted()));
  const toronto = rows.find((row) => row.id === "3530");
  assert.ok(toronto);
  assert.equal(toronto.belowFloor, true);
  assert.equal(toronto.latestRecoveredPercent, null);
  assert.equal(toronto.anyRecoveredPercent, null);
  assert.equal(toronto.unknownSharePercent, 100);
  for (const row of rows) {
    assert.equal(row.belowFloor, row.lostHectares < 500, row.id);
    assert.equal(row.latestRecoveredPercent === null, row.belowFloor, row.id);
  }
});

test("recent decades carry their caveat, and the treed wetland share sits beside each province", () => {
  const rows = conditionRecoveryMeasurements(parseConditionRecoveryRelease(admitted()));
  const bc = rows.find((row) => row.id === "59");
  assert.ok(bc);
  assert.deepEqual(bc.decades.map((d) => d.note?.en.split(":")[0] ?? null), [null, null, "Partial follow-up", "Too recent to judge"]);
  assert.equal(bc.decades[0].coverageGrade, "extended-record-sparse-official-matching");
  assert.equal(bc.decades[3].coverageGrade, "national-baseline");
  const wetland = Object.fromEntries(rows.filter((row) => row.kind === "province").map((row) => [row.id, row.treedWetlandSharePercent ?? 0]));
  assert.ok(wetland["48"] > 10 && wetland["35"] > 10, "Alberta and Ontario leave out a large treed wetland share");
  assert.ok(wetland["59"] < 5 && wetland["24"] < 5);
  assert.equal(rows.find((row) => row.kind === "region")?.treedWetlandSharePercent, null);
});

test("cause of the latest loss partitions lost area, and the RESULTS agreement is reported as below target", () => {
  const release = parseConditionRecoveryRelease(admitted());
  assert.ok(release);
  for (const row of conditionRecoveryMeasurements(release)) {
    const total = row.causes.reduce((sum, c) => sum + c.shareOfLostPercent, 0);
    if (row.lostHectares > 0) assert.ok(Math.abs(total - 100) < 1e-9, row.id);
  }
  assert.equal(release.resultsAgreement.targetMet, false);
  assert.ok(release.resultsAgreement.agreement < release.resultsAgreement.target);
  assert.match(release.resultsAgreement.note.en, /61%/);
  assert.match(release.resultsAgreement.note.fr, /61 %/);
});
