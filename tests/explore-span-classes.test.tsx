import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SPAN_SHARE_BREAKS,
  SPAN_SHARE_BREAKS_BY_LENGTH,
  WHOLE_RECORD_SHARE_BREAKS,
  spanShareBreaks,
  spanShareClass,
  spanShareClassOn,
} from "../lib/explore/province-spans";
import { forestRegionFigures } from "../lib/explore/region-intervals";
import {
  ExploreMapClient,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreMapClient.tsx";

/*
 * C2: the loss-share classes follow the length of the span, from a small fixed
 * table, the legend prints the edges in use, and a Play run holds the edges of
 * the whole record.
 */

test("the class edges come from a fixed table keyed by span length", () => {
  // Every length from 1 to 38 years has exactly one row, in order.
  const maxima = SPAN_SHARE_BREAKS_BY_LENGTH.map((row) => row.maxYears);
  assert.deepEqual(maxima, [1, 3, 7, 15, 25, 38]);
  for (const row of SPAN_SHARE_BREAKS_BY_LENGTH) {
    assert.equal(row.breaks.length, 4);
    for (let i = 1; i < row.breaks.length; i += 1) assert.ok(row.breaks[i]! > row.breaks[i - 1]!);
  }
  assert.deepEqual(spanShareBreaks({ fromYear: 2021, toYear: 2022 }), [0.5, 0.75, 1, 2]);
  assert.deepEqual(spanShareBreaks({ fromYear: 2019, toYear: 2022 }), [1, 1.5, 2.5, 4]);
  assert.deepEqual(spanShareBreaks({ fromYear: 2010, toYear: 2017 }), [2, 3, 5, 8]);
  assert.deepEqual(spanShareBreaks({ fromYear: 2000, toYear: 2015 }), [4, 6, 8, 12]);
  assert.deepEqual(spanShareBreaks({ fromYear: 1990, toYear: 2015 }), [6, 10, 14, 20]);
  assert.deepEqual(spanShareBreaks({ fromYear: 1984, toYear: 2022 }), [10, 15, 20, 25]);
  assert.deepEqual(WHOLE_RECORD_SHARE_BREAKS, [10, 15, 20, 25]);
});

test("the old fixed edges stay exported unchanged", () => {
  assert.deepEqual(SPAN_SHARE_BREAKS, [1, 5, 10, 20]);
  assert.deepEqual([0, 0.99, 1, 4.99, 5, 10, 19.99, 20, 90].map(spanShareClass), [0, 0, 1, 1, 2, 3, 3, 4, 4]);
});

test("a share is classed on the edges given; a missing share has no class", () => {
  const edges = spanShareBreaks({ fromYear: 2021, toYear: 2022 });
  assert.deepEqual([0, 0.49, 0.5, 0.74, 0.75, 1, 1.99, 2, 40].map((v) => spanShareClassOn(v, edges)), [0, 0, 1, 1, 2, 3, 3, 4, 4]);
  assert.equal(spanShareClassOn(null, edges), null);
  assert.equal(spanShareClassOn(Number.NaN, edges), null);
});

/*
 * The table was chosen from the checked-in region figures. At every span
 * length, pooling the 17 regions over every span of that length, no class may
 * hold more than 40 percent of the regions; the fixed edges put about 60
 * percent of one-year spans in the palest class.
 */
test("at every span length the classes separate the regions in the checked-in figures", () => {
  const lastYear = 2022;
  for (let length = 1; length <= 38; length += 1) {
    const counts = [0, 0, 0, 0, 0];
    let total = 0;
    for (let from = 1984; from + length <= lastYear; from += 1) {
      const interval = { fromYear: from, toYear: from + length };
      const edges = spanShareBreaks(interval);
      for (const figure of forestRegionFigures(interval)) {
        const band = spanShareClassOn(figure.mappedSharePercent, edges);
        if (band === null) continue;
        counts[band]! += 1;
        total += 1;
      }
    }
    assert.ok(total > 0, `no region figures for ${length}-year spans`);
    const fullest = Math.max(...counts) / total;
    assert.ok(fullest <= 0.4, `${length}-year spans: ${Math.round(fullest * 100)}% of regions in one class`);
  }
});

const legendItems = (markup: string) =>
  [...markup.matchAll(/<i class="loss-swatch loss-(\d)"><\/i><\/span><span>([^<]*)<\/span>/g)].map(
    (match) => `${match[1]}:${match[2]}`,
  );

test("the legend prints the edges in use, in English and French", () => {
  const whole = renderToStaticMarkup(<ExploreMapClient locale="en" mode="forest-change" year={2022} fromYear={1984} />);
  assert.deepEqual(legendItems(whole), ["0:Under 10%", "1:10% to under 15%", "2:15% to under 20%", "3:20% to under 25%", "4:25% or more"]);
  const annual = renderToStaticMarkup(<ExploreMapClient locale="en" mode="forest-change" year={2022} fromYear={2021} />);
  assert.deepEqual(legendItems(annual), ["0:Under 0.5%", "1:0.5% to under 0.75%", "2:0.75% to under 1%", "3:1% to under 2%", "4:2% or more"]);
  const french = renderToStaticMarkup(<ExploreMapClient locale="fr" mode="forest-change" year={2022} fromYear={2021} />);
  // French puts a no-break space before the percent sign.
  assert.deepEqual(legendItems(french), [
    "0:Moins de 0,5\u00a0%",
    "1:0,5\u00a0% à moins de 0,75\u00a0%",
    "2:0,75\u00a0% à moins de 1\u00a0%",
    "3:1\u00a0% à moins de 2\u00a0%",
    "4:2\u00a0% ou plus",
  ]);
});

test("during a Play run the map holds the whole record's edges", () => {
  const held = renderToStaticMarkup(
    <ExploreMapClient locale="en" mode="forest-change" year={1986} fromYear={1984} classSpan={{ fromYear: 1984, toYear: 2022 }} />,
  );
  assert.deepEqual(legendItems(held), ["0:Under 10%", "1:10% to under 15%", "2:15% to under 20%", "3:20% to under 25%", "4:25% or more"]);
  const view = readFileSync(new URL("../components/explore/ExploreView.tsx", import.meta.url), "utf8");
  assert.match(view, /classSpan=\{playRun \? EXPLORE_COVERAGE_SPAN : undefined\}/);
  const control = readFileSync(new URL("../components/explore/ExploreYearControl.tsx", import.meta.url), "utf8");
  // The run starts at Play, not at Resume, and ends when the reader picks years.
  assert.match(control, /if \(!resumable\) setPlayRun\(true\);/);
  assert.match(control, /const selectYear = [\s\S]*?setPlayRun\(false\);/);
});
