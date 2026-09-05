import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedReason,
  literalViolations,
  periodFieldReaders,
  proseLiterals,
  run,
  stripComments,
  sweepViolations,
}
from "../scripts/check-year-range-format.mjs";
import { formatYearRange, formatYearRangeKey, parseYearRange, yearRange, yearRangeKey }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/domain/year-range.ts";
import { EXPLORE_COVERAGE_PERIOD, EXPLORE_COVERAGE_SPAN }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/explore/types.ts";
import { annualIntervalCoverage, PRODUCTION_AGGREGATE_PERIOD, productionAggregatePeriod }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/explore/period.ts";
import { EXPLORE_PRODUCTION_LAYER }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/explore/map-style.ts";

const EN_DASH = "–";
const EM_DASH = "—";

test("a numeric range is set with an en dash, never a hyphen and never an em dash", () => {
  const range = yearRange(2020, 2022);
  assert.equal(formatYearRange(range, "en"), `2020${EN_DASH}2022`);
  assert.equal(formatYearRange(range, "fr"), `2020${EN_DASH}2022`);
  assert.equal(formatYearRange(range, "en").includes("-"), false);
  assert.equal(formatYearRange(range, "en").includes(EM_DASH), false);
});

test("each form is spelled for its sentence position in both locales", () => {
  const range = yearRange(2020, 2022);
  assert.equal(formatYearRange(range, "en", "span"), "2020 to 2022");
  assert.equal(formatYearRange(range, "fr", "span"), "2020 à 2022");
  assert.equal(formatYearRange(range, "en", "from"), "from 2020 to 2022");
  assert.equal(formatYearRange(range, "fr", "from"), "de 2020 à 2022");
  // Bounds, not a course. A validation message states limits.
  assert.equal(formatYearRange(range, "en", "between"), "between 2020 and 2022");
  assert.equal(formatYearRange(range, "fr", "between"), "entre 2020 et 2022");
});

test("a one-year span is printed as one year rather than as a range to itself", () => {
  const single = yearRange(2022, 2022);
  assert.equal(formatYearRange(single, "en"), "2022");
  assert.equal(formatYearRange(single, "en", "span"), "2022");
  assert.equal(formatYearRange(single, "en", "from"), "in 2022");
  assert.equal(formatYearRange(single, "fr", "from"), "de 2022");
  assert.equal(formatYearRange(single, "en", "between"), "in 2022");
  assert.equal(formatYearRange(single, "fr", "between"), "en 2022");
});

test("machine forms round-trip, and a range that is not one is refused rather than printed", () => {
  assert.deepEqual(parseYearRange("2020-2022"), { fromYear: 2020, toYear: 2022 });
  assert.deepEqual(parseYearRange(`1984${EN_DASH}2022`), { fromYear: 1984, toYear: 2022 });
  assert.equal(yearRangeKey(yearRange(1984, 2022)), "1984-2022");
  assert.equal(formatYearRangeKey("2020-2022", "en", "span"), "2020 to 2022");
  assert.throws(() => parseYearRange("2020 to 2022"), /Cannot read/u);
  assert.throws(() => yearRange(2022, 2020), /cannot end/u);
  assert.throws(() => yearRange(1900, 2022), /not a period/u);
  assert.throws(() => yearRange(2020.5, 2022), /integer/u);
});

test("the published spans are derived from their artifacts, not spelled out again", () => {
  assert.deepEqual(PRODUCTION_AGGREGATE_PERIOD, parseYearRange(EXPLORE_PRODUCTION_LAYER.period));
  assert.equal(productionAggregatePeriod("en"), formatYearRange(PRODUCTION_AGGREGATE_PERIOD, "en"));
  assert.equal(EXPLORE_COVERAGE_PERIOD.compact, formatYearRange(EXPLORE_COVERAGE_SPAN, "en"));
  assert.equal(EXPLORE_COVERAGE_PERIOD.compact.includes(EN_DASH), true);
  assert.equal(EXPLORE_COVERAGE_PERIOD.en, "1984 to 2022");
  assert.equal(EXPLORE_COVERAGE_PERIOD.fr, "1984 à 2022");
  assert.equal(annualIntervalCoverage("en"), `1984${EN_DASH}1985 to 2021${EN_DASH}2022`);
  assert.equal(annualIntervalCoverage("fr"), `de 1984${EN_DASH}1985 à 2021${EN_DASH}2022`);
});

test("the gate refuses the forms it exists to refuse, and holds quoted product titles as written", () => {
  assert.deepEqual(literalViolations("Covers 2020-2022 only."), ["hyphenated-range"]);
  assert.deepEqual(literalViolations("A period — a clause break."), ["em-dash"]);
  assert.deepEqual(literalViolations(`Covers 2020${EN_DASH}2022 only.`), []);
  assert.deepEqual(
    literalViolations(
      "Adapted from Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022).",
    ),
    [],
  );
  assert.ok(allowedReason("Annual High-resolution forest land cover for Canada (1984-2022)")?.reason);
});

test("the sweep reads prose and skips machine strings and comments", () => {
  assert.equal(stripComments("/* 2020-2022 */ const a = 1;").includes("2020-2022"), false);
  assert.equal(stripComments("// 2020-2022\nconst a = 1;").includes("2020-2022"), false);
  // A bare identifier and a URL name published objects and keep their hyphens.
  assert.deepEqual(proseLiterals(`const a = "phase2-province-loss-2020-2022-csv";`), []);
  assert.deepEqual(proseLiterals(`const a = "https://example.test/a-2020-2022.pmtiles x";`), []);
  assert.deepEqual(proseLiterals(`const a = "Covers 2020 to 2022.";`), ["Covers 2020 to 2022."]);
});

test("the repository itself passes, with one module reading the machine period field", () => {
  assert.deepEqual(sweepViolations(), []);
  assert.deepEqual(periodFieldReaders(), []);
  const result = run();
  assert.ok(result.checkedFiles > 100);
  assert.equal(result.allowedQuotations, 4);
});
