import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * The all-interval riding join carries the same 774 boundaries as the
 * single-interval file, across all 38 annual pairs instead of the latest one.
 *
 * The load-bearing assertion is the last one: the 2021-2022 slice of this file
 * must equal data/phase2-riding-map-measurements.json field for field. Two
 * files describing the same measurement can drift silently, and the shipped
 * map would then disagree with itself depending on where the reader stopped.
 * Checking the overlap makes that drift a failing build instead.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const ALL_PATH = `${root}/data/phase2-riding-map-measurements-all-intervals.json`;
const LATEST_PATH = `${root}/data/phase2-riding-map-measurements.json`;
const FIRST_YEAR = 1984;
const PAIR_COUNT = 38;
const GRADE = Object.freeze({ c: "complete", p: "partial-with-unknown", n: "none-mapped" });
const CLAIMS = Object.freeze({ admitted: false, released: false, productionEligible: false, externalAction: false });
const EXPECTED_COUNTS = Object.freeze({ CA: 343, BC: 93, AB: 87, ON: 124, QC: 127 });

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonNegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const nullableNonNegative = (value) => value === null || nonNegative(value);

export function validateAllIntervalRidingMeasurements(record, latest) {
  assert.equal(record.schemaVersion, "witness-tree/phase2-riding-map-measurements-all-intervals/1");
  assert.equal(record.status, "local-nonproduction-executed");
  assert.deepEqual(record.claims, CLAIMS);
  assert.equal(record.context.netChangeIncluded, false, "an interval table must not carry a net-change claim");
  assert.deepEqual(record.context.coverageGradeCodes, GRADE);
  assert.equal(record.context.intervals.length, PAIR_COUNT);
  record.context.intervals.forEach(([from, to], index) => {
    assert.equal(from, FIRST_YEAR + index, `interval ${index} start year`);
    assert.equal(to, FIRST_YEAR + index + 1, `interval ${index} end year`);
  });
  assert.equal(record.sources.length, 5, "all five corrected V2 runs must be bound");
  assert.equal(record.measurements.length, 774);

  const counts = new Map();
  const identities = new Set();
  for (const row of record.measurements) {
    assert.ok(isObject(row) && typeof row.boundaryId === "string" && row.boundaryId.trim() !== "");
    const expectedOverlay = row.jurisdiction === "CA" ? "federal-ridings" : "provincial-ridings";
    assert.equal(row.overlay, expectedOverlay, `${row.boundaryId} overlay`);
    assert.equal(row.evidence, "satellite-observation");
    assert.deepEqual(row.claims, CLAIMS);
    assert.ok(nonNegative(row.districtHectares), `${row.boundaryId} districtHectares`);
    assert.ok(nonNegative(row.baselineForestedHectares), `${row.boundaryId} baselineForestedHectares`);
    assert.equal(row.coverageGrades.length, PAIR_COUNT, `${row.boundaryId} coverage grade string length`);
    for (const key of ["knownForestedHectares", "knownObservedLossHectares", "lossHectares", "observedLossPercent", "unknownRequiredInputHectares", "unmappedByProductExtentHectares"]) {
      assert.equal(row[key].length, PAIR_COUNT, `${row.boundaryId} ${key} length`);
    }
    for (let index = 0; index < PAIR_COUNT; index += 1) {
      const label = `${row.jurisdiction}/${row.boundaryId}/${FIRST_YEAR + index}`;
      const grade = GRADE[row.coverageGrades[index]];
      assert.ok(grade, `${label} has an unsupported coverage grade code`);
      assert.ok(nonNegative(row.knownForestedHectares[index]), `${label} knownForestedHectares`);
      assert.ok(nonNegative(row.knownObservedLossHectares[index]), `${label} knownObservedLossHectares`);
      assert.ok(nonNegative(row.unknownRequiredInputHectares[index]), `${label} unknownRequiredInputHectares`);
      assert.ok(nonNegative(row.unmappedByProductExtentHectares[index]), `${label} unmappedByProductExtentHectares`);
      assert.ok(nullableNonNegative(row.lossHectares[index]), `${label} lossHectares`);
      assert.ok(nullableNonNegative(row.observedLossPercent[index]), `${label} observedLossPercent`);
      const complete = grade === "complete";
      assert.equal(complete, row.unknownRequiredInputHectares[index] === 0, `${label} grade conflicts with unknown area`);
      assert.equal(complete, row.lossHectares[index] !== null, `${label} a complete total must exist only where coverage is complete`);
      // A share needs a denominator. A fully mapped riding with no forest that
      // year (several urban BC seats before the 1990s) has none, and null is
      // the honest answer there; zero would read as "measured, no loss".
      const hasDenominator = complete && row.knownForestedHectares[index] > 0;
      assert.equal(hasDenominator, row.observedLossPercent[index] !== null, `${label} a share must exist exactly where coverage is complete and forest was present`);
      assert.ok(row.knownObservedLossHectares[index] <= row.knownForestedHectares[index] + 1e-6, `${label} observed loss exceeds the forest it was measured against`);
    }
    // The mapped extent does not move between years, so neither can the grade.
    assert.equal(new Set(row.coverageGrades).size, 1, `${row.jurisdiction}/${row.boundaryId} coverage grade changes between intervals`);
    const identity = `${row.overlay}|${row.jurisdiction}|${row.boundaryId}`;
    assert.ok(!identities.has(identity), `duplicate identity ${identity}`);
    identities.add(identity);
    counts.set(row.jurisdiction, (counts.get(row.jurisdiction) ?? 0) + 1);
  }
  for (const [jurisdiction, expected] of Object.entries(EXPECTED_COUNTS)) {
    assert.equal(counts.get(jurisdiction), expected, `${jurisdiction} boundary count`);
  }

  const index = record.context.intervals.findIndex(([from, to]) => from === 2021 && to === 2022);
  assert.ok(index >= 0, "the 2021-2022 interval must be present");
  const byIdentity = new Map(record.measurements.map((row) => [`${row.overlay}|${row.jurisdiction}|${row.boundaryId}`, row]));
  assert.equal(latest.measurements.length, 774);
  for (const bound of latest.measurements) {
    const identity = `${bound.overlay}|${bound.jurisdiction}|${bound.boundaryId}`;
    const row = byIdentity.get(identity);
    assert.ok(row, `${identity} is missing from the all-interval join`);
    assert.deepEqual({
      knownForestedHectares: row.knownForestedHectares[index],
      knownObservedLossHectares: row.knownObservedLossHectares[index],
      lossHectares: row.lossHectares[index],
      observedLossPercent: row.observedLossPercent[index],
      unknownRequiredInputHectares: row.unknownRequiredInputHectares[index],
      unmappedByProductExtentHectares: row.unmappedByProductExtentHectares[index],
      districtHectares: row.districtHectares,
      coverageGrade: GRADE[row.coverageGrades[index]],
    }, {
      knownForestedHectares: bound.knownForestedHectares,
      knownObservedLossHectares: bound.knownObservedLossHectares,
      lossHectares: bound.lossHectares,
      observedLossPercent: bound.observedLossPercent,
      unknownRequiredInputHectares: bound.unknownRequiredInputHectares,
      unmappedByProductExtentHectares: bound.unmappedByProductExtentHectares,
      districtHectares: bound.districtHectares,
      coverageGrade: bound.coverageGrade,
    }, `${identity} 2021-2022 disagrees with the shipped single-interval table`);
  }
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = JSON.parse(readFileSync(ALL_PATH, "utf8"));
  const latest = JSON.parse(readFileSync(LATEST_PATH, "utf8"));
  validateAllIntervalRidingMeasurements(record, latest);
  console.log(`Phase 2 all-interval riding join passes; 774 ridings across ${PAIR_COUNT} annual intervals, and the 2021-2022 slice reproduces the shipped table exactly.`);
}
