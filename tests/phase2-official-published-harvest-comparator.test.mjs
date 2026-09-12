import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildOfficialPublishedHarvestComparison, extendOfficialPublishedHarvestComparison, parseStatCanTable210, validateOfficialPublishedHarvestComparison } from "../lib/phase2/official-published-harvest-comparator.mjs";

const statcanPath = "/Volumes/Extended_SSD/Witness_Tree-data/raw/nfd-recovery-official/2026-08-27/canada-legacy/table-2-10-forest-area-harvested-1975-2015.html";
const strictPath = "/Volumes/Extended_SSD/Witness_Tree-data/derived/phase2-annual-nfd-comparison-fractional-v1/annual-nfd-comparison-fractional-1985-2022.json";

function fixtureStrictRows() {
  const rows = [];
  for (const province of ["BC", "AB", "ON", "QC"]) {
    for (let year = 1985; year <= 2022; year += 1) {
      rows.push({
        province,
        boundaryId: province,
        rowType: "annual-comparison",
        fromYear: year - 1,
        toYear: year,
        joinKey: `${province}:${year}`,
        witnessTreeObservedForestLossHectares: year + 0.25,
        witnessTreeObservedForestLossHectaresExact: `${year}.25`,
        witnessTreeCoverageGrade: "complete",
        witnessTreeUnknownRequiredInputHectares: 0,
        nfdReportedHarvestHectares: year < 1990 || year > (province === "BC" || province === "AB" ? 2019 : 2018) ? 1 : null,
        nfdReportedHarvestHectaresExact: year < 1990 || year > (province === "BC" || province === "AB" ? 2019 : 2018) ? "1" : null,
        comparisonStatus: year < 1990 || year > (province === "BC" || province === "AB" ? 2019 : 2018) ? "computed" : "pending",
        signedDifferenceHectares: null,
        signedDifferenceHectaresExact: null,
        absoluteDifferenceHectares: null,
        absoluteDifferenceHectaresExact: null,
        relativeDifference: null,
      });
    }
  }
  return rows;
}

function fixtureStatCanRows() {
  const rows = [];
  for (const province of ["BC", "AB", "ON", "QC"]) {
    for (let year = 1990; year <= 2015; year += 1) {
      rows.push({ province, year, sourceId: "statcan-table-2.10-2018", sourceValueSquareKilometres: 10, referenceHectaresNominal: 1000, displayPrecisionHectares: 100, roundingHalfWidthHectares: 50, sourceScope: "provincial, private and federal land", sourceFlags: { preliminary: false, revised: false, agencyEstimated: false } });
    }
  }
  return rows;
}

test("builds 104 rounded comparisons and preserves 14 restricted rows as null", () => {
  const rows = buildOfficialPublishedHarvestComparison(fixtureStrictRows(), fixtureStatCanRows());
  assert.equal(rows.length, 118);
  assert.equal(rows.filter((row) => row.comparisonStatus === "computed-rounded-reference").length, 104);
  assert.equal(rows.filter((row) => row.comparisonStatus === "pending-restricted-source").length, 14);
  const computed = rows.find((row) => row.joinKey === "BC:1990");
  assert.equal(computed.referenceHectaresNominal, 1000);
  assert.equal(computed.referenceRoundingHalfWidthHectares, 50);
  assert.equal(computed.nominalSignedDifferenceHectaresExact, "990.25");
  assert.equal(computed.claims.likeForLike, false);
  const pending = rows.find((row) => row.joinKey === "BC:2019");
  assert.equal(pending.referenceHectaresNominal, null);
  assert.equal(pending.nominalSignedDifferenceHectares, null);
  assert.equal(pending.strictNfdExactTotalHectares, null);
});

test("rejects a strict known-subtotal substitution, duplicate target, and output claim inflation", () => {
  const subtotal = fixtureStrictRows();
  subtotal.find((row) => row.joinKey === "BC:1990").nfdReportedHarvestHectares = 12;
  assert.throws(() => buildOfficialPublishedHarvestComparison(subtotal, fixtureStatCanRows()), /must remain pending and null/i);
  const duplicate = fixtureStrictRows();
  duplicate[0] = { ...duplicate.find((row) => row.joinKey === "BC:1990") };
  assert.throws(() => buildOfficialPublishedHarvestComparison(duplicate, fixtureStatCanRows()), /duplicate strict target row|target row count/i);
  const result = buildOfficialPublishedHarvestComparison(fixtureStrictRows(), fixtureStatCanRows());
  result[0].claims.productionEligible = true;
  assert.throws(() => validateOfficialPublishedHarvestComparison(result), /claims drifted/i);
});

test("parses the exact StatCan source and preserves source qualification counts", { skip: !process.env.WITNESS_TREE_DATA_ROOT }, () => {
  const rows = parseStatCanTable210(readFileSync(statcanPath, "utf8"));
  assert.equal(rows.length, 104);
  assert.equal(rows.filter((row) => row.sourceFlags.preliminary).length, 6);
  assert.equal(rows.filter((row) => row.sourceFlags.revised).length, 13);
  assert.equal(rows.filter((row) => row.sourceFlags.agencyEstimated).length, 7);
});

test("real strict rows produce the fixed 118-row two-track result", { skip: !process.env.WITNESS_TREE_DATA_ROOT }, () => {
  const statcan = parseStatCanTable210(readFileSync(statcanPath, "utf8"));
  const strict = JSON.parse(readFileSync(strictPath, "utf8"));
  const rows = buildOfficialPublishedHarvestComparison(strict, statcan);
  assert.equal(rows.filter((row) => row.comparisonStatus === "computed-rounded-reference").length, 104);
  assert.equal(rows.filter((row) => row.strictNfdExactTotalHectares !== null).length, 0);
});

const nfdSource = { sourceId: "nfd-5.2-undeclared", sourceVersion: "undeclared", sourceUrl: "http://nfdp.ccfm.org/download/data/csv/NFD%20-%20Area%20harvested%20by%20ownership%20and%20harvesting%20method%20-%20EN%20FR.csv" };
function fixtureNfdRows() {
  return ["BC", "AB", "ON", "QC"].flatMap((province) => [2019, 2020, 2021, 2022].map((year) => ({
    province, year, areaHectares: 1000.125, areaHectaresExact: "1000.125",
    qualifierCounts: { a: 1 }, missingness: { state: "complete", unknownAreaRowCount: 0 },
  })));
}

test("NFD extends every province through 2022 with exact decimals and preserves all 118 historical rows", () => {
  const strict = fixtureStrictRows();
  const historical = buildOfficialPublishedHarvestComparison(strict, fixtureStatCanRows());
  const before = JSON.stringify(historical);
  const rows = extendOfficialPublishedHarvestComparison(historical, strict, fixtureNfdRows(), nfdSource);
  assert.equal(rows.length, 132);
  assert.equal(JSON.stringify(rows.slice(0, 118)), before);
  assert.equal(JSON.stringify(historical), before);
  const row = rows.find((entry) => entry.joinKey === "BC:2020");
  assert.equal(row.referenceSourceId, "nfd-5.2-undeclared");
  assert.equal(row.referenceHectaresExact, "1000.125");
  assert.equal(row.nominalSignedDifferenceHectaresExact, "1020.125");
  assert.equal(row.nominalSignedDifferenceHectares, 1020.125);
  assert.equal(row.witnessTreeCoverageGrade, "complete");
  assert.equal(row.witnessTreeUnknownRequiredInputHectares, 0);
  assert.equal(rows.filter((entry) => entry.toYear === 2022).length, 4);
  assert.equal(new Set(rows.map((entry) => entry.joinKey)).size, 132);
  assert.equal(rows.slice(118).every((entry) => Object.values(entry.claims).every((claim) => claim === false)), true);
});

test("NFD extension preserves missing reference components and unavailable or partial imagery as unknown", () => {
  const strict = fixtureStrictRows();
  const historical = buildOfficialPublishedHarvestComparison(strict, fixtureStatCanRows());
  const nfd = fixtureNfdRows();
  const reference = nfd.find((row) => row.province === "BC" && row.year === 2020);
  Object.assign(reference, { areaHectares: null, areaHectaresExact: null, missingness: { state: "partial-unknown", unknownAreaRowCount: 1 } });
  const partial = strict.find((row) => row.joinKey === "BC:2021");
  partial.witnessTreeCoverageGrade = "partial-with-unknown";
  partial.witnessTreeUnknownRequiredInputHectares = 12;
  const rows = extendOfficialPublishedHarvestComparison(historical, strict.filter((row) => row.joinKey !== "BC:2022"), nfd, nfdSource);
  for (const year of [2020, 2021, 2022]) {
    const row = rows.find((entry) => entry.joinKey === `BC:${year}`);
    assert.equal(row.comparisonStatus, "pending-incomplete-input");
    assert.equal(row.nominalSignedDifferenceHectares, null);
    assert.equal(row.nominalSignedDifferenceHectaresExact, null);
    assert.equal(row.strictNfdExactTotalStatus, "unknown-components");
  }
  const absent = rows.find((row) => row.joinKey === "BC:2022");
  assert.equal(absent.witnessTreeCoverageGrade, "unavailable");
  assert.equal(absent.witnessTreeObservedForestLossHectares, null);
  assert.equal(absent.witnessTreeUnknownRequiredInputHectares, null);
  reference.areaHectares = 0;
  reference.areaHectaresExact = "0";
  assert.throws(() => extendOfficialPublishedHarvestComparison(historical, strict, nfd, nfdSource), /incomplete NFD total must remain null/);
  assert.throws(() => extendOfficialPublishedHarvestComparison(historical, strict, fixtureNfdRows(), { ...nfdSource, sourceVersion: "2026-09-12" }), /undeclared edition/);
});
