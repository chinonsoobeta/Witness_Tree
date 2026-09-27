import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import record from "../data/harvest-fire-province-annual-series.json";
import { HarvestFirePage } from "../components/transparency/HarvestFirePage";
import {
  cellsToHectares,
  HARVEST_FIRE_SERIES,
  harvestFireBins,
  harvestFireCharts,
  harvestFireCsv,
  harvestFireHref,
  harvestFireSpanTotals,
  niceScale,
  parseHarvestFireQuery,
  parseHarvestFireSeries,
} from "../lib/harvest-fire";
import { chartGeometry, SVG_SIZE } from "../lib/harvest-fire/chart";
import { PNG_COLOURS } from "../lib/harvest-fire/png";

const series = HARVEST_FIRE_SERIES!;
const province = (code: string) => series.provinces.find((p) => p.code === code)!;
const sum = (code: string, key: "harvestCells" | "fireCells", from: number, to: number) =>
  cellsToHectares(province(code).years.filter((r) => r.year >= from && r.year <= to).reduce((n, r) => n + (r[key] ?? 0), 0));

test("the published record validates, keeps 1984 Unknown and holds the four provinces in order", () => {
  assert.ok(HARVEST_FIRE_SERIES);
  assert.deepEqual(series.provinces.map((p) => p.code), ["BC", "AB", "ON", "QC"]);
  for (const p of series.provinces) {
    assert.equal(p.years[0].year, 1984);
    assert.equal(p.years[0].harvestCells, null);
    assert.equal(p.years[0].fireCells, null);
    assert.equal(p.years.at(-1)?.year, 2022);
  }
});

test("a record that turns 1984 into zero, drops a province or loses the sum rule is refused", () => {
  const copy = () => JSON.parse(JSON.stringify(record));
  const zeroed = copy();
  zeroed.provinces[0].years[0].harvestCells = 0;
  assert.equal(parseHarvestFireSeries(zeroed), null);
  const dropped = copy();
  dropped.provinces.pop();
  assert.equal(parseHarvestFireSeries(dropped), null);
  const unruled = copy();
  unruled.sumRule.allowed = "anything";
  assert.equal(parseHarvestFireSeries(unruled), null);
  const negative = copy();
  negative.provinces[2].years[5].fireCells = -1;
  assert.equal(parseHarvestFireSeries(negative), null);
});

test("five-year bins add years within one product and mark the short final interval", () => {
  const bins = harvestFireBins(province("BC"), 1985, 2022, 5);
  assert.deepEqual(bins.map((b) => [b.firstYear, b.lastYear, b.short]), [
    [1985, 1989, false], [1990, 1994, false], [1995, 1999, false], [2000, 2004, false],
    [2005, 2009, false], [2010, 2014, false], [2015, 2019, false], [2020, 2022, true],
  ]);
  // The finding: in BC, fire passed harvest in 2015 to 2019.
  assert.equal(Math.round(bins[6].harvestHectares), 1_012_502);
  assert.equal(Math.round(bins[6].fireHectares), 1_778_895);
  assert.equal(bins[6].fireHectares, sum("BC", "fireCells", 2015, 2019));
  // Bins partition the years: their totals equal the whole span.
  for (const code of ["BC", "AB", "ON", "QC"]) {
    const all = harvestFireBins(province(code), 1985, 2022, 5);
    const whole = harvestFireBins(province(code), 1985, 2022, "span")[0].fireHectares;
    assert.ok(Math.abs(all.reduce((n, b) => n + b.fireHectares, 0) - whole) < 1e-6);
  }
});

test("hectares are exact arithmetic on whole cells", () => {
  assert.equal(cellsToHectares(3), 0.27);
  assert.equal(cellsToHectares(170_800_264), 15_372_023.76);
});

test("the address parses to a safe default and round-trips", () => {
  assert.deepEqual(parseHarvestFireQuery({}), { provinces: ["59", "48", "35", "24"], firstYear: 1985, lastYear: 2022, step: 5, scale: "shared", view: "chart" });
  assert.deepEqual(parseHarvestFireQuery({ provinces: "24,59,99", from: "2019", to: "2010", step: "10", scale: "own", view: "table" }),
    { provinces: ["59", "24"], firstYear: 2010, lastYear: 2019, step: 10, scale: "own", view: "table" });
  assert.equal(parseHarvestFireQuery({ from: "1970", to: "2040", step: "7" }).step, 5);
  assert.equal(parseHarvestFireQuery({ from: "2018", to: "2022" }).step, 1, "a short span defaults to single years");
  const query = parseHarvestFireQuery({ provinces: "48", from: "2000", to: "2020", step: "span", scale: "own" });
  const href = harvestFireHref("fr", query);
  assert.equal(href, "/fr/donnees/recolte-et-incendies?provinces=48&from=2000&to=2020&step=span&scale=own");
  assert.deepEqual(parseHarvestFireQuery(Object.fromEntries(new URL(href, "https://x").searchParams)), query);
});

test("a shared scale is one axis for every chart; an own scale fits each", () => {
  const shared = harvestFireCharts(series, parseHarvestFireQuery({}));
  assert.equal(new Set(shared.map((c) => c.top)).size, 1);
  const largest = Math.max(...shared.flatMap((c) => c.bins.flatMap((b) => [b.harvestHectares, b.fireHectares])));
  assert.ok(shared[0].top >= largest && shared[0].top < largest * 1.5);
  const own = harvestFireCharts(series, parseHarvestFireQuery({ scale: "own" }));
  assert.ok(new Set(own.map((c) => c.top)).size > 1);
  assert.deepEqual(niceScale(2_072_835), { top: 2_500_000, ticks: [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000] });
  assert.deepEqual(niceScale(0), { top: 1, ticks: [0, 1] });
});

test("Explore's span maps to change years after its first year", () => {
  const single = harvestFireSpanTotals(2021, 2022)!;
  assert.equal(single[0].harvestHectares, sum("BC", "harvestCells", 2022, 2022));
  const whole = harvestFireSpanTotals(1984, 2022)!;
  assert.equal(whole[3].fireHectares, sum("QC", "fireCells", 1985, 2022));
  assert.equal(harvestFireSpanTotals(2022, 2022), null);
  assert.equal(harvestFireSpanTotals(2010, 2023), null);
});

test("the CSV keeps harvest and fire in separate columns and never totals them", () => {
  const csv = harvestFireCsv(harvestFireCharts(series, parseHarvestFireQuery({ provinces: "59" })));
  const [header, ...rows] = csv.trim().split("\n");
  assert.equal(header, "province,first_year,last_year,years,short_interval,harvest_hectares,fire_hectares,unmapped_hectares_unknown");
  assert.equal(rows.length, 8);
  assert.equal(rows[7], `BC,2020,2022,3,yes,${sum("BC", "harvestCells", 2020, 2022).toFixed(2)},${sum("BC", "fireCells", 2020, 2022).toFixed(2)},4095.27`);
  assert.doesNotMatch(csv, /total/i);
});

test("the chart labels every fifth single year and writes values only when there is room", () => {
  const yearly = harvestFireCharts(series, parseHarvestFireQuery({ provinces: "59", step: "1" }))[0];
  const geometry = chartGeometry(yearly, "en", SVG_SIZE);
  assert.equal(geometry.showValues, false);
  assert.deepEqual(geometry.bins.filter((b) => b.showLabel).map((b) => b.label), ["1985", "1990", "1995", "2000", "2005", "2010", "2015", "2020"]);
  const fives = chartGeometry(harvestFireCharts(series, parseHarvestFireQuery({ provinces: "59" }))[0], "en", SVG_SIZE);
  assert.equal(fives.showValues, true);
  assert.equal(fives.bins.at(-1)?.label, "2020–2022*");
  for (const bin of fives.bins) assert.ok(bin.harvest.x + bin.harvest.width < bin.fire.x, "a gap separates the pair");
});

test("the downloaded image uses the light palette the site defines", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)"));
  const token = (name: string) => root.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))?.[1];
  assert.deepEqual(PNG_COLOURS, {
    ground: token("ground"), ink: token("ink"), ink2: token("ink-2"), rule: token("rule"),
    ruleStrong: token("rule-strong"), harvest: token("harvest"), fire: token("fire"),
  });
});

test("both languages render the flags, the limits, Unknown areas and sources beside the charts", () => {
  const english = renderToStaticMarkup(<HarvestFirePage locale="en" query={parseHarvestFireQuery({})} />);
  const french = renderToStaticMarkup(<HarvestFirePage locale="fr" query={parseHarvestFireQuery({})} />);
  for (const html of [english, french]) {
    assert.equal((html.match(/<figure class="hf-figure"/g) ?? []).length, 4);
    for (const code of ["bc", "ab", "on", "qc"]) assert.match(html, new RegExp(`id="hf-flag-${code}"`));
    assert.equal((html.match(/class="hf-bar hf-bar--harvest"/g) ?? []).length, 32);
    assert.match(html, /opendata\.nfis\.org\/downloads\/forest_change\/CA_Forest_Fire_1985-2022\.zip/);
    assert.match(html, /doi\.org\/10\.1080\/17538947\.2016\.1187673/);
    assert.match(html, /HARVEST_FIRE_SERIES_DECISION\.md/);
  }
  assert.match(english, /British Columbia: forest cleared by harvest and by fire, 1985–2022/);
  assert.match(english, /2020–2022 covers 3 years only/);
  assert.match(english, /Unknown, never zero/);
  assert.match(english, /Later fire seasons, including 2023, are not in it/);
  assert.match(french, /Colombie-Britannique : forêt dégagée par la récolte et par le feu, 1985–2022/);
  assert.match(french, /inconnu, jamais zéro/);
  assert.match(french, /dont celle de 2023/);
});

test("the table view has one row per province and interval and no chart", () => {
  const html = renderToStaticMarkup(<HarvestFirePage locale="en" query={parseHarvestFireQuery({ view: "table", step: "10" })} />);
  assert.doesNotMatch(html, /<svg class="hf-chart-svg"/);
  assert.equal((html.match(/scope="col"/g) ?? []).length, 5);
  assert.equal((html.match(/<tr><th scope="row">/g) ?? []).length, 16);
});
