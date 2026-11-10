import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Context, ReactElement } from "react";
import { renderToStaticMarkup as renderElement } from "react-dom/server";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { addressWithProvince, keepAddressState, readExploreProvince } from "../lib/explore/province-address";
import { provinceSpanDisplayRows } from "../lib/explore/province-spans";
import { EXPLORE_COVERAGE_SPAN } from "../lib/explore/types";
import { formatHectares, formatPercent } from "../lib/domain";
import {
  ExploreView,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreView.tsx";
import {
  exploreFixtures,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/fixtures.ts";

/*
 * C6: the province chosen on the map is in the address, and the headline gives
 * that province's own figures. Same router stub as tests/explore.test.tsx.
 */
const stubRouter = Object.fromEntries(
  ["push", "replace", "back", "forward", "refresh", "prefetch"].map((method) => [method, () => undefined]),
) as unknown as AppRouterInstance;
const RouterContext: Context<AppRouterInstance | null> = AppRouterContext;
const render = (element: ReactElement) => renderElement(<RouterContext.Provider value={stubRouter}>{element}</RouterContext.Provider>);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("C6: the address names one of the four provinces or none", () => {
  for (const code of ["bc", "ab", "on", "qc"]) assert.equal(readExploreProvince(code), code);
  for (const value of [undefined, "", "BC", "sk", "all"]) assert.equal(readExploreProvince(value), null);
  assert.equal(readExploreProvince(["on", "qc"]), "on");
  assert.equal(addressWithProvince("/en/explore?year=2022&from=1984#map=4.00/55.0000/-100.0000", "bc"), "/en/explore?year=2022&from=1984&province=bc#map=4.00/55.0000/-100.0000");
  assert.equal(addressWithProvince("/en/explore?province=bc&year=2022", null), "/en/explore?year=2022");
});

test("C6: an address Explore writes for itself keeps the province and the map position", () => {
  const current = { pathname: "/fr/explorer", search: "?year=2022&province=qc", hash: "#map=5.25/47.1234/-71.5678" };
  assert.equal(keepAddressState("/fr/explorer?mode=wildfire&year=2010", current), "/fr/explorer?mode=wildfire&year=2010&province=qc#map=5.25/47.1234/-71.5678");
  // A relative query resolves against the page it is on.
  assert.equal(keepAddressState("?mode=wildfire&year=2010", current), "/fr/explorer?mode=wildfire&year=2010&province=qc#map=5.25/47.1234/-71.5678");
  // A new address that names its own wins; an unusable province is not carried.
  assert.equal(keepAddressState("/fr/explorer?year=2010&province=on#map=3.00/50.0000/-90.0000", current), "/fr/explorer?year=2010&province=on#map=3.00/50.0000/-90.0000");
  assert.equal(keepAddressState("/fr/explorer?year=2010", { pathname: "/fr/explorer", search: "?province=sk", hash: "" }), "/fr/explorer?year=2010");
  // Both writers use it.
  assert.match(read("components/explore/ExploreYearControl.tsx"), /write\.call\(window\.history, null, "", keepAddressState\(url, window\.location\)\);/);
  assert.match(read("components/explore/ExploreView.tsx"), /History\.prototype\.replaceState\.call\(window\.history, window\.history\.state, "", keepAddressState\(url, window\.location\)\);/);
});

for (const [locale, code, name] of [["en", "bc", "British Columbia"], ["fr", "qc", "Québec"]] as const) {
  test(`C6: a province in the address heads the reading panel with its own figures (${locale})`, () => {
    const row = provinceSpanDisplayRows(EXPLORE_COVERAGE_SPAN).find((entry) => entry.code.toLowerCase() === code)!;
    assert.ok(row.unionLossHectares !== null && row.unionLossPercent !== null && row.unknownHectares !== null);
    const html = render(<ExploreView events={exploreFixtures} locale={locale} province={code} year={2022} fromYear={1984} />);
    assert.match(html, new RegExp(`id="explore-reading-heading">${name} · 1984–2022</p>`));
    const total = html.match(/<div class="explore-reading-total">[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(total.includes(`<p class="explore-reading-figure">${formatHectares(row.unionLossHectares, locale)}</p>`));
    assert.ok(total.includes(formatPercent(row.unionLossPercent, locale)));
    // The minimum stays: this province's own land with no satellite data.
    assert.ok(total.includes(formatHectares(row.unknownHectares, locale)));
    assert.match(total, locale === "en" ? /A minimum\./ : /Un minimum\./);
    // The phone's line over the map says the same.
    assert.match(html, new RegExp(`<p class="explore-map-readout">${name} · 1984–2022 · ${formatHectares(row.unionLossHectares, locale).replace(/[.]/g, "\\.")}`));
    // Every link and the year form carry the province.
    for (const link of html.match(/href="\?[^"]*"/g) ?? []) assert.match(link, new RegExp(`&amp;province=${code}"$`));
    assert.match(html, new RegExp(`<input type="hidden" name="province" value="${code}"/>`));
  });
}

test("C6: with no province the page is as it was, and an Unknown is said as Unknown", () => {
  const html = render(<ExploreView events={exploreFixtures} locale="en" year={2022} fromYear={1984} />);
  assert.match(html, /id="explore-reading-heading">Four provinces · 1984–2022<\/p>/);
  assert.doesNotMatch(html, /province=/);
  const view = read("components/explore/ExploreView.tsx");
  assert.match(view, /\{headline\.unionLossHectares === null \? \(\n\s+<>\n\s+<p className="explore-reading-figure">\{text\.unknownFigure\}<\/p>\n\s+<p className="explore-reading-share">\{text\.unknownFigureWhy\}<\/p>/);
  assert.match(view, /unknownFigure: "Unknown",/);
  assert.match(view, /unknownFigure: "Inconnu",/);
});

test("C6: the pages read the province, and the map frames it and reports a new choice", () => {
  for (const path of ["app/en/explore/page.tsx", "app/fr/explorer/page.tsx"])
    assert.match(read(path), /province=\{readExploreProvince\(query\.province\)\}/);
  const map = read("components/explore/ExploreMapClient.tsx");
  assert.match(map, /useState<ExploreMapView \| null>\(initialProvince\)/);
  assert.match(map, /if \(focusRef\.current\) map\.fitBounds\(MAP_VIEW_BOUNDS\[focusRef\.current\], \{ padding: FRAME_PADDING, maxZoom: 6, duration: 0 \}\);/);
  assert.match(map, /setSelectedMapView\(mapView\);\n\s+onProvinceChange\?\.\(mapView\);/);
});
