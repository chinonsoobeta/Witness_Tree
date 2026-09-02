// The span domain, tested against the thing that can actually go wrong.
//
// Two failures matter here and neither one looks like a crash. The first is a
// packed-array index that drifts from the producer's order, which returns a
// real number for the wrong years. The second is a percentage on the summed
// figure, which is why the type has no field to put one in.
import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
  intervalAtWindowIndex,
  intervalMeasurement,
  intervalStepCount,
  intervalWindowIndex,
  isAnnualInterval,
  parseExploreInterval,
  type IntervalDistrictAggregate,
} from "../lib/explore/interval";
import { EXPLORE_YEAR_MAX, EXPLORE_YEAR_MIN } from "../lib/explore/types";

/* The producer's order, written out the long way: every span starting at the
   first year in end-year order, then every span starting a year later. If the
   arithmetic in intervalWindowIndex drifts, this disagrees. */
const canonical: Array<{ fromYear: number; toYear: number }> = [];
for (let start = 0; start < EXPLORE_ANNUAL_STEP_COUNT; start += 1) {
  for (let end = start; end < EXPLORE_ANNUAL_STEP_COUNT; end += 1) {
    canonical.push({
      fromYear: EXPLORE_INTERVAL_FIRST_YEAR + start,
      toYear: EXPLORE_YEAR_MIN + end,
    });
  }
}

test("the record holds 741 spans across 38 annual steps", () => {
  assert.equal(EXPLORE_ANNUAL_STEP_COUNT, 38);
  assert.equal(EXPLORE_INTERVAL_COUNT, 741);
  assert.equal(canonical.length, EXPLORE_INTERVAL_COUNT);
});

test("every span maps to the producer's packed position", () => {
  canonical.forEach((interval, index) => {
    assert.equal(intervalWindowIndex(interval), index, `${interval.fromYear}-${interval.toYear}`);
    assert.deepEqual(intervalAtWindowIndex(index), interval);
  });
});

/* Pinned against the Python aggregate's own WINDOWS list, read from a run of
   scripts/phase3_interval_zonal_aggregate.py. If either side is edited without
   the other, these four numbers move. */
test("the packed positions agree with the aggregate that wrote them", () => {
  assert.equal(intervalWindowIndex({ fromYear: 1984, toYear: 1985 }), 0);
  assert.equal(intervalWindowIndex({ fromYear: 1986, toYear: 1987 }), 75);
  assert.equal(intervalWindowIndex({ fromYear: 1990, toYear: 1998 }), 220);
  assert.equal(intervalWindowIndex({ fromYear: 2002, toYear: 2010 }), 538);
  assert.equal(intervalWindowIndex({ fromYear: 2021, toYear: 2022 }), 740);
});

test("a span the record cannot answer has no position", () => {
  assert.equal(intervalWindowIndex({ fromYear: 1983, toYear: 1985 }), -1);
  assert.equal(intervalWindowIndex({ fromYear: 1990, toYear: 2023 }), -1);
  assert.equal(intervalWindowIndex({ fromYear: 1998, toYear: 1990 }), -1);
  assert.equal(intervalAtWindowIndex(EXPLORE_INTERVAL_COUNT), null);
  assert.equal(intervalAtWindowIndex(-1), null);
});

test("an absent span falls back to the annual interval ending at the last year", () => {
  assert.deepEqual(parseExploreInterval(undefined, undefined), {
    fromYear: EXPLORE_YEAR_MAX - 1,
    toYear: EXPLORE_YEAR_MAX,
  });
});

test("an end year alone keeps the old single-year meaning", () => {
  assert.deepEqual(parseExploreInterval(undefined, "1995"), { fromYear: 1994, toYear: 1995 });
  assert.ok(isAnnualInterval(parseExploreInterval(undefined, "1995")));
  assert.equal(intervalStepCount(parseExploreInterval(undefined, "1995")), 1);
});

test("a reader's span is read as asked", () => {
  assert.deepEqual(parseExploreInterval("1990", "1998"), { fromYear: 1990, toYear: 1998 });
  assert.equal(intervalStepCount({ fromYear: 1990, toYear: 1998 }), 8);
  assert.equal(isAnnualInterval({ fromYear: 1990, toYear: 1998 }), false);
});

test("years outside the record are pulled back to it, never past it", () => {
  assert.deepEqual(parseExploreInterval("1900", "2100"), {
    fromYear: EXPLORE_INTERVAL_FIRST_YEAR,
    toYear: EXPLORE_INTERVAL_LAST_YEAR,
  });
  assert.deepEqual(parseExploreInterval("nonsense", "nonsense"), {
    fromYear: EXPLORE_YEAR_MAX - 1,
    toYear: EXPLORE_YEAR_MAX,
  });
});

test("a zero-length or reversed span becomes a real interval", () => {
  const zero = parseExploreInterval("1998", "1998");
  assert.ok(zero.fromYear < zero.toYear, `${zero.fromYear} to ${zero.toYear}`);
  const reversed = parseExploreInterval("2010", "2002");
  assert.ok(reversed.fromYear < reversed.toYear, `${reversed.fromYear} to ${reversed.toYear}`);
  assert.ok(intervalWindowIndex(zero) >= 0);
  assert.ok(intervalWindowIndex(reversed) >= 0);
});

const district = (): IntervalDistrictAggregate => {
  const known = new Array(EXPLORE_INTERVAL_COUNT).fill(0);
  const union = new Array(EXPLORE_INTERVAL_COUNT).fill(0);
  const unknown = new Array(EXPLORE_INTERVAL_COUNT).fill(0);
  const summed = new Array(EXPLORE_INTERVAL_COUNT).fill(0);
  const index = intervalWindowIndex({ fromYear: 1990, toYear: 1998 });
  known[index] = 1_000_000;
  union[index] = 30_000;
  summed[index] = 41_000;
  unknown[index] = 7_000;
  return {
    boundaryId: "59-test",
    boundaryName: "Test district",
    intervalKnownCells: known,
    intervalUnionLossCells: union,
    intervalUnknownCells: unknown,
    intervalSummedLossCells: summed,
  };
};

test("a span reads its own numbers, in hectares, at 0.09 ha a cell", () => {
  const measurement = intervalMeasurement(district(), { fromYear: 1990, toYear: 1998 });
  assert.ok(measurement);
  assert.equal(measurement.knownForestedHectares, 90_000);
  assert.equal(measurement.unionLossHectares, 2_700);
  assert.equal(measurement.summedLossHectares, 3_690);
  assert.equal(measurement.unknownHectares, 630);
  assert.ok(Math.abs((measurement.unionLossPercent ?? 0) - 3) < 1e-9);
});

test("the summed figure carries no percentage, because it can carry none", () => {
  const measurement = intervalMeasurement(district(), { fromYear: 1990, toYear: 1998 });
  assert.ok(measurement);
  assert.equal("summedLossPercent" in measurement, false);
  // The sum exceeds the union here, which is the whole reason: a cell lost
  // twice is counted twice in the sum and once in the union.
  assert.ok((measurement.summedLossHectares ?? 0) > (measurement.unionLossHectares ?? 0));
});

test("no known forest means Unknown, never zero percent", () => {
  const aggregate = district();
  const empty = {
    ...aggregate,
    intervalKnownCells: new Array(EXPLORE_INTERVAL_COUNT).fill(0),
    intervalUnionLossCells: new Array(EXPLORE_INTERVAL_COUNT).fill(0),
  };
  const measurement = intervalMeasurement(empty, { fromYear: 1990, toYear: 1998 });
  assert.ok(measurement);
  assert.equal(measurement.unionLossPercent, null);
});

test("a span the aggregate does not carry returns nothing at all", () => {
  assert.equal(intervalMeasurement(district(), { fromYear: 1990, toYear: 2023 }), null);
});
