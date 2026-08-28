import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NFD_HEADERS,
  aggregateNfdRows,
  parseCsv,
  parseNfdCsv,
  transformNfdCsv,
} from "../lib/phase2/nfd-harvest-statistics.mjs";
import { validateNfdHarvestStatisticsProfile } from "../scripts/check-nfd-harvest-statistics-profile.mjs";

const profile = JSON.parse(readFileSync(new URL("../data/nfd-harvest-statistics-profile.json", import.meta.url), "utf8"));
const csvPath = "/Volumes/Extended_SSD/Witness_Tree-data/raw/nfd-harvest-statistics/2026-08-27/nfd-area-harvested-en-fr.csv";
const sourceCsv = readFileSync(csvPath, "utf8");

function row({
  year = 1984,
  yearFr = year,
  iso = "BC",
  jurisdiction = "British Columbia",
  jurisdictionFr = "Colombie-Britannique",
  tenure = "Private land",
  tenureFr = "Terres privées",
  management = "Even-aged management",
  managementFr = "Aménagement équienne",
  method = "Other",
  methodFr = "Autre",
  area = "10",
  qualifier = "a",
  qualifierFr = qualifier,
} = {}) {
  return [
    year,
    yearFr,
    iso,
    jurisdiction,
    jurisdictionFr,
    tenure,
    tenureFr,
    management,
    managementFr,
    method,
    methodFr,
    area,
    qualifier,
    area,
    qualifierFr,
  ];
}

function csv(rows) {
  return `\ufeff${NFD_HEADERS.join(",")}\r\n${rows.map((values) => values.join(",")).join("\r\n")}\r\n`;
}

test("the checksum-bound profile has the exact 156-row target frame", () => {
  validateNfdHarvestStatisticsProfile(profile, { verifyBytes: true });
  assert.equal(profile.frame.rows.length, 4 * 39);
  assert.deepEqual(profile.frame.rows.slice(0, 2).map((entry) => `${entry.province}:${entry.year}`), ["BC:1984", "BC:1985"]);
  assert.equal(profile.frame.rows.at(-1).province, "QC");
  assert.equal(profile.frame.rows.at(-1).year, 2022);
  assert.equal(profile.frame.rows.find((entry) => entry.province === "BC" && entry.year === 1984).areaHectares, 198453);
  const partial = profile.frame.rows.find((entry) => entry.province === "AB" && entry.year === 1990);
  assert.equal(partial.areaHectares, null);
  assert.equal(partial.knownAreaHectares, 51869);
  assert.equal(partial.missingness.state, "partial-unknown");
  const notApplicable = profile.frame.rows.find((entry) => entry.province === "AB" && entry.year === 2020);
  assert.equal(notApplicable.areaHectares, 96317);
  assert.equal(notApplicable.missingness.state, "complete-with-not-applicable");
});

test("CSV parser accepts BOM, CRLF, quoted delimiters, and escaped quotes", () => {
  assert.deepEqual(parseCsv('\ufeff"a,b","he said ""hi"""\r\n'), [["a,b", 'he said "hi"']]);
});

test("transformer returns all 156 frame cells without turning absent groups into zero", () => {
  const frame = transformNfdCsv(csv([row()]));
  assert.equal(frame.length, 156);
  assert.deepEqual(frame[0], {
    province: "BC",
    year: 1984,
    areaHectares: 10,
    areaHectaresExact: "10",
    knownAreaHectares: 10,
    knownAreaHectaresExact: "10",
    sourceRowCount: 1,
    knownAreaRowCount: 1,
    blankAreaRowCount: 0,
    qualifierCounts: { a: 1 },
    missingness: { state: "complete", unknownAreaRowCount: 0, notApplicableRowCount: 0, unknownQualifiers: [] },
    likeForLikeClaim: false,
  });
  const absent = frame.find((entry) => entry.province === "AB" && entry.year === 1984);
  assert.equal(absent.areaHectares, null);
  assert.equal(absent.knownAreaHectares, 0);
  assert.equal(absent.missingness.state, "no-source-rows");
});

test("aggregate uses exact decimal addition and exposes partial unknowns", () => {
  const partial = row({ tenure: "Private land", tenureFr: "Terres privées", area: "10.1", qualifier: "a" });
  const second = row({ tenure: "Provincial land", tenureFr: "Terres provinciales", area: "0.2", qualifier: "E" });
  const unknown = row({ tenure: "Federal land", tenureFr: "Terres fédérales", area: "", qualifier: "u" });
  const result = aggregateNfdRows(parseNfdCsv(csv([partial, second, unknown])))[0];
  assert.equal(result.areaHectares, null);
  assert.equal(result.areaHectaresExact, null);
  assert.equal(result.knownAreaHectaresExact, "10.3");
  assert.equal(result.knownAreaHectares, 10.3);
  assert.equal(result.missingness.state, "partial-unknown");
  assert.deepEqual(result.missingness.unknownQualifiers, ["u"]);
});

test("n is explicit not-applicable, not an unknown zero", () => {
  const result = transformNfdCsv(csv([
    row({ area: "7", qualifier: "a" }),
    row({ tenure: "Provincial land", tenureFr: "Terres provinciales", area: "", qualifier: "n" }),
  ]))[0];
  assert.equal(result.areaHectares, 7);
  assert.equal(result.missingness.state, "complete-with-not-applicable");
  assert.equal(result.missingness.notApplicableRowCount, 1);
  assert.equal(result.missingness.unknownAreaRowCount, 0);
});

test("unknown qualifiers, duplicate semantic keys, and bilingual/arithmetic ambiguity fail closed", () => {
  assert.throws(() => parseNfdCsv(csv([row({ qualifier: "x", qualifierFr: "x" })])), /unknown data qualifier/);
  assert.throws(() => parseNfdCsv(csv([row(), row()])), /duplicate semantic row key/);
  assert.throws(() => parseNfdCsv(csv([row({ jurisdictionFr: "Québec" })])), /Juridiction does not match/);
  const mismatchedArea = row();
  mismatchedArea[13] = "11";
  assert.throws(() => parseNfdCsv(csv([mismatchedArea])), /area values disagree/);
  assert.throws(() => parseNfdCsv(csv([row({ area: "10", qualifier: "u" })])), /semantically incompatible/);
  assert.throws(() => parseNfdCsv(csv([row({ area: "", qualifier: "a" })])), /semantically incompatible/);
});

test("profile digest catches derived-frame arithmetic drift", () => {
  const altered = structuredClone(profile);
  altered.frame.rows[0].knownAreaHectares = altered.frame.rows[0].knownAreaHectares + 1;
  assert.throws(() => validateNfdHarvestStatisticsProfile(altered, { verifyBytes: false }), /arithmetic drifted|digest drifted/);
});

test("the official CSV parses to the recorded source row count", () => {
  assert.equal(parseNfdCsv(sourceCsv).length, profile.raw.csvRowCount);
});
