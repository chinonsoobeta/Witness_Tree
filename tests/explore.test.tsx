import assert from "node:assert/strict";
import test from "node:test";
import type { Context, ReactElement } from "react";
import { renderToStaticMarkup as renderElement } from "react-dom/server";
import type { AppRouterInstance } from "vinext/shims/internal/app-router-context";
import { AppRouterContext } from "vinext/shims/internal/app-router-context";

/*
 * Explore now contains a client island that reads the app router. The framework
 * mounts that router around every real render, server and browser alike; this
 * bare harness does not, and the hook refuses to run without one. The stub below
 * is the missing mount, not a stand-in for behaviour: no assertion here navigates,
 * so the methods only have to exist, and every one of them records the call so a
 * render that navigates on its own would be visible rather than silent.
 */
const routerCalls: string[] = [];
const stubRouter = Object.fromEntries(
  ["push", "replace", "back", "forward", "refresh", "prefetch"].map((method) => [
    method,
    (...args: unknown[]) => void routerCalls.push(`${method}(${args.join(", ")})`),
  ]),
) as unknown as AppRouterInstance;

// The shim types the context as possibly absent, because a build without the
// client runtime does not ship one. This file renders client islands, so an
// absent context is a broken assumption rather than a case to handle. Failing
// here says why; failing inside a hook would not.
if (!AppRouterContext) throw new Error("vinext no longer exports AppRouterContext");
const RouterContext: Context<AppRouterInstance | null> = AppRouterContext;

function renderToStaticMarkup(element: ReactElement): string {
  return renderElement(
    <RouterContext.Provider value={stubRouter}>
      {element}
    </RouterContext.Provider>,
  );
}
import {
  ExploreView,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreView.tsx";
import {
  exploreFixtures,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/fixtures.ts";
import {
  ExploreMapClient,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreMapClient.tsx";

test("renders four plan modes, independent same-url controls, fixture boundaries, and native time control", () => {
  const en = renderToStaticMarkup(
    <ExploreView events={exploreFixtures} locale="en" />,
  );
  const listTable = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      mode="recorded-harvest"
      presentation="list"
      data="table"
    />,
  );
  const fr = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="fr"
      mode="condition-recovery"
      presentation="list"
      data="chart"
    />,
  );
  assert.match(
    en,
    /list, chart, and table use the same provisional 2020–2022 province aggregate/,
  );
  // The per-cell layer exists now, so the copy no longer says it does not.
  // What it must keep saying is what the layer has not been through: the
  // patches are unreviewed, and nothing on the site is counted from them.
  assert.match(en, /per-cell detected loss patches for 1984–2022/);
  assert.match(en, /have not been expert-reviewed/);
  assert.match(en, /no figure on this site is counted from them/);
  assert.doesNotMatch(en, /not per-cell geometry/);
  assert.match(en, /type="range"/);
  // One year means one annual interval, and the archives hold 1985 through 2022.
  assert.match(en, /min="1985"/);
  assert.match(en, /max="2022"/);
  assert.match(en, /name="year"/);
  for (const label of [
    "Forest change",
    "Recorded harvest",
    "Wildfire",
    "Condition and recovery",
  ])
    assert.match(en, new RegExp(label));
  assert.match(en, /presentation=map&amp;data=chart/);
  assert.match(en, /presentation=list&amp;data=chart/);
  assert.match(en, /presentation=map&amp;data=table/);
  assert.match(en, /Boundary overlays/);
  for (const label of ["Watersheds", "Federal ridings", "Provincial ridings"])
    assert.match(en, new RegExp(label));
  // The reserve and treaty-area overlays were removed rather than shown as
  // pending. Their sources are authority-blocked, so a "not available yet"
  // label would imply work in progress that is not happening.
  assert.doesNotMatch(en, /Reserves/);
  assert.doesNotMatch(en, /Treaty areas/);
  // The ridings overlays are real layers now, so the blanket unavailable
  // label is gone and each card offers a control instead.
  assert.doesNotMatch(en, /geometry unavailable/);
  assert.match(en, /overlays=federal-ridings/);
  assert.match(en, /overlays=provincial-ridings/);
  // Both admitted reference frameworks are selectable, while their copy
  // still refuses to imply that a forest-loss aggregate was released.
  assert.match(en, /overlays=economic-regions/);
  assert.match(en, /overlays=watersheds/);
  assert.match(en, /not a regional forest-loss aggregate/);
  assert.match(en, /not a watershed forest-loss aggregate/);
  // The provincial layer must never read as national coverage.
  for (const province of [
    "British Columbia",
    "Alberta",
    "Ontario",
    "Québec",
  ])
    assert.match(en, new RegExp(province));
  assert.match(en, /does not take effect until the 43rd legislature ends/);
  assert.match(listTable, /aria-label="List"/);
  assert.match(listTable, /<table/);
  assert.equal((listTable.match(/scope="col"/g) ?? []).length, 6);
  assert.match(listTable, /scope="row"/);
  assert.match(fr, /État et rétablissement/);
  assert.match(fr, /Cette liste, ce graphique et ce tableau/);
  assert.match(fr, /Superpositions de limites/);

  const withOverlay = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      overlays={["federal-ridings"]}
    />,
  );
  assert.match(withOverlay, /Shown on the map/);
  // The active overlay's own control offers to remove it, and every other
  // link on the page carries the selection forward rather than dropping it.
  assert.match(withOverlay, /Hide<\/a>/);
  for (const link of withOverlay.match(/href="\?[^"]*"/g) ?? []) {
    if (/overlays=/.test(link)) continue;
    assert.match(link, /mode=/);
  }
});
test("map/list and chart/table retain evidence, confidence, coverage, provenance, and Unknown is never zero", () => {
  const mapChart = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      mode="forest-change"
      presentation="map"
      data="chart"
    />,
  );
  const listChart = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      mode="recorded-harvest"
      presentation="list"
      data="chart"
    />,
  );
  const listTable = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      mode="condition-recovery"
      presentation="list"
      data="table"
    />,
  );
  assert.match(mapChart, /aria-label="Chart"/);
  assert.doesNotMatch(mapChart, /aria-label="Map"/);
  assert.match(listChart, /Official record/);
  assert.match(listChart, /Source attribution/);
  assert.match(listTable, /No authoritative public record/);
  assert.match(listTable, /Coverage/);
  assert.match(listTable, /Source attribution/);
  assert.equal(/>0<|caused by|logging|deforestation/i.test(listTable), false);
});
test("Explore uses the exact PMTiles release with a GeoJSON/SVG fallback on map routes", async () => {
  const { readFile } = await import("node:fs/promises");
  const map = await readFile(
    new URL("../components/explore/ExploreMapClient.tsx", import.meta.url),
    "utf8",
  );
  const style = await readFile(
    new URL("../lib/explore/map-style.ts", import.meta.url),
    "utf8",
  );
  const enRoute = await readFile(
    new URL("../app/en/explore/page.tsx", import.meta.url),
    "utf8",
  );
  const frRoute = await readFile(
    new URL("../app/fr/explorer/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(map, /fetch\(\s*EXPLORE_PRODUCTION_LAYER\.compatibilityGeoJsonUrl/);
  assert.match(map, /import\("maplibre-gl"\)/);
  assert.match(map, /import\("pmtiles"\)/);
  assert.match(map, /pmtiles:\/\/\$\{EXPLORE_PRODUCTION_LAYER\.url\}/);
  assert.match(map, /addProtocol\("pmtiles", protocol\.tile\)/);
  assert.match(map, /const PMTILES_LOAD_TIMEOUT_MS = 10_000/);
  assert.match(map, /}, PMTILES_LOAD_TIMEOUT_MS\);/);
  assert.ok(
    map.indexOf("pmtilesTimeout = setTimeout") <
      map.indexOf("const initializePmtiles"),
    "the fallback watchdog must start before the optional map libraries load",
  );
  assert.match(map, /"source-layer": EXPLORE_PRODUCTION_LAYER\.sourceLayer/);
  assert.match(map, /data-map-source/);
  assert.match(map, /geojson-fallback/);
  assert.match(map, /<svg\s+viewBox="0 0 1000 500"/);
  assert.match(map, /featurePath\(feature\)/);
  assert.doesNotMatch(map, /sources: \{ fixtures:/);
  assert.match(map, /role=\{state === "error" \? "alert" : "status"\}/);
  assert.match(map, /year >= 2022/);
  assert.match(map, /unavailableYear/);
  assert.match(map, /EXPLORE_PRODUCTION_LAYER\.rows\.map/);
  assert.match(map, /Observed loss \(%\)/);
  assert.match(style, /phase2_province_loss_2020_2022/);
  assert.match(style, /\.pmtiles/);
  assert.match(
    style,
    /101561ed48f511a3e65676fa084ee517c4fa722e14f4a3c844c698b247238505/,
  );
  for (const route of [enRoute, frRoute]) {
    assert.match(route, /presentation === "map" \?\s*\(?\s*<ExploreMapClient/);
    assert.match(route, /mode=\{mode\}\s+year=\{year\}/);
    assert.match(route, /ridingMeasurements=\{ridingMeasurements\}/);
  }
});

test("the map uses fixed hydration-safe status and attribution ids", async () => {
  const mapSource = await (await import("node:fs/promises")).readFile(
    new URL("../components/explore/ExploreMapClient.tsx", import.meta.url),
    "utf8",
  );
  const first = renderToStaticMarkup(
    <ExploreMapClient locale="en" mode="condition-recovery" year={2022} />,
  );
  const second = renderToStaticMarkup(
    <ExploreMapClient locale="en" mode="condition-recovery" year={2022} />,
  );

  // useId() is position-derived, which can differ across the server and client
  // trees for this island. These cross-boundary descriptions must remain fixed.
  assert.doesNotMatch(mapSource, /\buseId\s*\(/);
  assert.match(mapSource, /const STATUS_ID = "explore-map-status"/);
  assert.match(mapSource, /const ATTRIBUTION_ID = "explore-map-attribution"/);
  assert.match(first, /aria-describedby="explore-map-status explore-map-attribution"/);
  assert.match(first, /<p id="explore-map-status"[^>]*role="status"/);
  assert.match(first, /<p id="explore-map-attribution"/);
  assert.equal(first, second, "the server markup must retain the same fixed ids");
});

test("the map identifies active boundary lines and uses the riding readout contract", async () => {
  const mapSource = await (await import("node:fs/promises")).readFile(
    new URL("../components/explore/ExploreMapClient.tsx", import.meta.url),
    "utf8",
  );

  assert.match(mapSource, /aria-label=\{text\[locale\]\.mapPanel\}/);
  assert.match(mapSource, /\{source === "pmtiles" \? \(/);
  assert.match(mapSource, /<legend>\{text\[locale\]\.mapView\}<\/legend>/);
  assert.match(mapSource, /aria-pressed=\{selectedMapView === mapView\}/);
  assert.match(mapSource, /mapRef\.current\?\.fitBounds\(MAP_VIEW_BOUNDS\[mapView\]/);
  for (const mapView of ["national", "bc", "ab", "on", "qc"])
    assert.match(mapSource, new RegExp(`${mapView}:`));
  assert.match(mapSource, /boundaryLineLayerIds\(overlays\)/);
  assert.match(mapSource, /map\?\.on\("mouseenter", layerId/);
  assert.match(mapSource, /map\?\.on\("mouseleave", layerId/);
  assert.match(mapSource, /map\?\.on\("click", layerId/);
  assert.match(mapSource, /properties\?\.\[locale === "fr" \? "name_fr" : "name_en"\]/);
  assert.match(mapSource, /properties\?\.id/);
  assert.match(mapSource, /properties\?\.juris/);
  const measurementsSource = await (await import("node:fs/promises")).readFile(
    new URL("../lib/explore/riding-measurements.ts", import.meta.url),
    "utf8",
  );
  assert.match(measurementsSource, /const tileBoundaryId = `\$\{jurisdiction\}-\$\{boundaryId\}`/);
  assert.match(mapSource, /map\.getCanvas\(\)\.style\.cursor = "pointer"/);
  assert.match(mapSource, /setHoveredBoundary\(null\)/);
  assert.match(mapSource, /setPinnedBoundary\(selection\)/);
  assert.match(mapSource, /className="explore-map-boundary-status" role="status"/);
  assert.match(mapSource, /boundaryReadout\(boundary, ridingMeasurements, locale\)/);
  assert.match(mapSource, /readout\?\.kind === "boundary-only"/);
  assert.match(mapSource, /readout\?\.kind === "riding-measurement"/);
  assert.match(mapSource, /text\[locale\]\.normalizedShare/);
  assert.match(mapSource, /text\[locale\]\.totalLoss/);
});

test("the year control is a real, shareable control rather than a decorative slider", () => {
  const en = renderToStaticMarkup(
    <ExploreView
      events={exploreFixtures}
      locale="en"
      mode="wildfire"
      presentation="list"
      data="table"
      year={1995}
    />,
  );

  // The bug: the slider had no name and no form, so moving it changed nothing and the
  // chosen year could not be linked, bookmarked, or shared.
  assert.match(en, /<form[^>]*\bmethod="get"/);
  assert.match(en, /name="year"/);
  assert.match(en, /value="1995"/);

  // The other selections survive a submit, so changing the year does not silently reset them.
  assert.match(en, /<input type="hidden" name="mode" value="wildfire"\/>/);
  assert.match(en, /<input type="hidden" name="presentation" value="list"\/>/);
  assert.match(en, /<input type="hidden" name="data" value="table"\/>/);

  // Every other control carries the year forward, so no link discards it.
  for (const link of en.match(/href="\?[^"]*"/g) ?? [])
    assert.match(link, /&amp;year=1995/);

  // A year is an interval, and the control has to say so: 1995 is what changed
  // between 1994 and 1995, not a snapshot of 1995.
  assert.match(en, /Change between 1994 and 1995/);
  assert.match(en, /aria-valuetext="Change between 1994 and 1995"/);

  // The ends of the slider are the ends of the record, and the scale marks are
  // years the archives actually cover.
  assert.match(en, /min="1985"/);
  assert.match(en, /max="2022"/);
  for (const tick of [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2022])
    assert.match(en, new RegExp(`<option value="${tick}" label="${tick}">`));

  /*
   * Server markup is the no-JavaScript state, and every enhanced control is inert
   * in it: the step and play buttons are disabled, and the submit button that the
   * island hides once it mounts is still present. A control that looks live and
   * does nothing is the failure this pins down.
   */
  for (const inert of [/class="year-step" disabled=""/, /class="year-play" disabled=""/])
    assert.match(en, inert);
  assert.match(en, /class="btn btn--primary year-submit" type="submit"/);
  assert.doesNotMatch(en, /year-submit[^>]*hidden/);

  const fr = renderToStaticMarkup(
    <ExploreView events={exploreFixtures} locale="fr" year={1995} />,
  );
  assert.match(fr, /Changement entre 1994 et 1995/);
  assert.match(fr, /Ann\u00e9e affich\u00e9e/u);
  assert.match(fr, /Mettre à jour/);
});

test("the year query is parsed defensively and filters fixtures to that year and earlier", async () => {
  const { parseExploreYear, fixturesThroughYear } =
    // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
    await import("../lib/explore/fixtures.ts");
  const { EXPLORE_DEFAULT_YEAR } =
    // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
    await import("../lib/explore/types.ts");
  assert.equal(EXPLORE_DEFAULT_YEAR, 2022);

  assert.equal(parseExploreYear("1995"), 1995);
  // Anything that is not an in-range ASCII four-digit year falls back rather than throwing
  // or producing a year the control could never select.
  for (const bad of [
    undefined,
    "",
    "abc",
    "12",
    "20055",
    "1984",
    "2023",
    " 1995",
    "1995.0",
    "١٩٩٥",
    "-999",
  ]) {
    assert.equal(
      parseExploreYear(bad as string | undefined),
      EXPLORE_DEFAULT_YEAR,
      `parseExploreYear(${JSON.stringify(bad)})`,
    );
  }

  // Fixture years are 1988, 2004, 2012, 2020.
  assert.deepEqual(
    fixturesThroughYear(exploreFixtures, 1987).map(
      (event: { id: string }) => event.id,
    ),
    [],
  );
  assert.deepEqual(
    fixturesThroughYear(exploreFixtures, 1988).map(
      (event: { id: string }) => event.id,
    ),
    ["condition"],
  );
  assert.deepEqual(
    fixturesThroughYear(exploreFixtures, 2012).map(
      (event: { id: string }) => event.id,
    ),
    ["change", "harvest", "condition"],
  );
  assert.equal(
    fixturesThroughYear(exploreFixtures, EXPLORE_DEFAULT_YEAR).length,
    exploreFixtures.length,
  );
});

test("switching language keeps the selected year", async () => {
  const { localeHref } =
    // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
    await import("../lib/locale-navigation.ts");
  const href = localeHref(
    "/en/explore",
    new URLSearchParams("mode=wildfire&year=1995"),
    "en",
  );
  assert.match(href, /^\/fr\/explorer\?/);
  assert.match(href, /year=1995/);
  assert.match(href, /mode=wildfire/);
});
