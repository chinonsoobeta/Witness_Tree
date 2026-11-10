import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PlaceYearlyChart } from "../components/places/PlaceYearlyChart.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { yearlyRows, YEARLY_STEP_COUNT } from "../lib/place-pages/yearly.ts";

const series = (fill: number, overrides: Record<number, number> = {}) =>
  Array.from({ length: YEARLY_STEP_COUNT }, (_, step) => overrides[step] ?? fill);

test("each year keeps its own coverage: figure, measured zero, minimum and Unknown gaps", () => {
  const rows = yearlyRows({
    // 1985: 100 cells lost, all mapped. 1986: measured 0. 1987: 50 lost with part unmapped.
    // 1988: nothing detected with part unmapped. 1989: no forest mapped.
    loss: series(0, { 0: 100, 2: 50 }),
    known: series(1000, { 4: 0 }),
    unknown: series(0, { 2: 500, 3: 500, 4: 10 }),
  });
  assert.equal(rows.length, 38);
  assert.deepEqual(rows[0], { year: 1985, kind: "figure", hectares: 9 });
  assert.deepEqual(rows[1], { year: 1986, kind: "figure", hectares: 0 }, "a fully mapped year with no loss is a measured 0");
  assert.deepEqual(rows[2], { year: 1987, kind: "minimum", hectares: 4.5 });
  assert.deepEqual(rows[3], { year: 1988, kind: "unknown", reason: "nothing-detected-where-mapped" }, "an unmapped year is never 0");
  assert.deepEqual(rows[4], { year: 1989, kind: "unknown", reason: "no-forest-mapped" });
  assert.equal(rows[37]!.year, 2022);
});

test("the place's unknown tolerance applies to each year as it does to the whole record", () => {
  const cells = { loss: series(10), known: series(1000), unknown: series(5) }; // 0.5% unmapped
  assert.equal(yearlyRows(cells, 0)[0]!.kind, "minimum", "communities: any gap makes a minimum");
  assert.equal(yearlyRows(cells, 1)[0]!.kind, "figure", "ridings and regions: under 1% is admitted");
  assert.equal(yearlyRows({ ...cells, unknown: series(11) }, 1)[0]!.kind, "minimum", "1.09% is over the tolerance");
});

test("a malformed series or a year losing more than it mapped is refused", () => {
  assert.throws(() => yearlyRows({ loss: series(0).slice(1), known: series(1), unknown: series(0) }), /38/);
  assert.throws(() => yearlyRows({ loss: series(0, { 0: -1 }), known: series(1), unknown: series(0) }), /38/);
  assert.throws(() => yearlyRows({ loss: series(0, { 5: 2 }), known: series(1), unknown: series(0) }), /1990 loss exceeds/);
});

test("the chart states its unit, draws gaps as gaps, offers a table and never sums the years", () => {
  const rows = yearlyRows({
    loss: series(100, { 3: 0, 4: 0 }),
    known: series(1000, { 4: 0 }),
    unknown: series(0, { 2: 400, 3: 400 }),
  });
  for (const locale of ["en", "fr"] as const) {
    const html = renderToStaticMarkup(<PlaceYearlyChart rows={rows} locale={locale} wholeRecordHectares={null} />);
    assert.match(html, locale === "en" ? /in hectares \(ha\)/ : /en hectares \(ha\)/);
    assert.match(html, locale === "en" ? /Detected loss \(ha\)/ : /Perte détectée \(ha\)/);
    assert.equal((html.match(/class="place-yearly-gap"/g) ?? []).length, 2, "two dashed gaps");
    assert.equal((html.match(/class="place-yearly-bar place-yearly-bar--minimum"/g) ?? []).length, 1);
    assert.equal((html.match(/<tr class="place-yearly-row--/g) ?? []).length, 38, "one table row per year");
    assert.match(html, locale === "en" ? /at least 9 ha/ : /au moins 9 ha/);
    assert.match(html, locale === "en" ? /Unknown<span class="place-yearly-reason">/ : /Inconnu<span class="place-yearly-reason">/);
    assert.doesNotMatch(html, /\b(315|324)(,00)? ha/, "the 35 measured years and the minimum, 9 ha each, are not added up");
    assert.doesNotMatch(html, /\bTotal\b/i);
    assert.match(html, locale === "en" ? /href="\/en\/data\/harvest-and-fire"/ : /href="\/fr\/donnees\/recolte-et-incendies"/);
    assert.doesNotMatch(html, /larger than the 1984–2022 figure|dépasse le chiffre/, "no year exceeds a figure that was not given");
  }
  const larger = renderToStaticMarkup(<PlaceYearlyChart rows={rows} locale="en" wholeRecordHectares={5} />);
  assert.match(larger, /at least one year is larger than the 1984–2022 figure above/);
});

test("riding and economic-region pages carry the yearly chart; community pages do not yet", () => {
  const params = placePageParams();
  const pick = (geography: string) => params.find((param) => param.geography === geography)!;
  for (const geography of ["federal-2023", "er-2021"]) {
    const { code } = pick(geography);
    const record = placePageRecord(PLACE_DATA_VERSION, geography, code)!;
    assert.ok(record.yearly, `${geography}/${code} has a yearly series`);
    const rows = yearlyRows(record.yearly, record.unknownTolerancePercent);
    assert.equal(rows.length, 38);
    const html = renderToStaticMarkup(<RecordPlacePage record={record} locale="en" />);
    assert.match(html, /id="place-yearly-heading"/);
  }
  const community = placePageRecord(PLACE_DATA_VERSION, "csd-2021", "5924034")!;
  assert.equal(community.yearly, null);
  assert.doesNotMatch(renderToStaticMarkup(<RecordPlacePage record={community} locale="en" />), /place-yearly-heading/);
});

test("the scale never prints a rounded or empty tick: small maxima keep their decimals, all-gap years get no scale", () => {
  const ticks = (html: string) => [...html.matchAll(/class="place-yearly-tick" x="56" y="[\d.]+" text-anchor="end">([^<]*)</g)].map((match) => match[1]);
  const small = yearlyRows({ loss: series(0, { 0: 3 }), known: series(1000), unknown: series(0) }); // 0.27 ha, scale to 0.5
  assert.deepEqual(ticks(renderToStaticMarkup(<PlaceYearlyChart rows={small} locale="en" wholeRecordHectares={null} />)), ["0", "0.25", "0.5"]);
  const gaps = yearlyRows({ loss: series(0), known: series(0), unknown: series(10) });
  const html = renderToStaticMarkup(<PlaceYearlyChart rows={gaps} locale="en" wholeRecordHectares={null} />);
  assert.deepEqual(ticks(html), [], "no labelled axis over gaps");
  assert.equal((html.match(/class="place-yearly-gap"/g) ?? []).length, 38);
  const zero = yearlyRows({ loss: series(0), known: series(1000), unknown: series(0) });
  assert.deepEqual(ticks(renderToStaticMarkup(<PlaceYearlyChart rows={zero} locale="en" wholeRecordHectares={null} />)), ["0"], "measured zeros get only the zero line");
});
