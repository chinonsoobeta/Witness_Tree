import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExploreView,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../components/explore/ExploreView.tsx";
import {
  exploreFixtures,
  // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
} from "../lib/explore/fixtures.ts";

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
    /list, chart, and table use the same verified 2020–2022 province aggregate/,
  );
  // The per-cell layer exists now, so the copy no longer says it does not.
  // What it must keep saying is what the layer has not been through: the
  // patches are unreviewed, and nothing on the site is counted from them.
  assert.match(en, /per-cell detected loss patches for 1984–2022/);
  assert.match(en, /have not been expert-reviewed/);
  assert.match(en, /no figure on this site is counted from them/);
  assert.doesNotMatch(en, /not per-cell geometry/);
  assert.match(en, /type="range"/);
  assert.match(en, /min="1984"/);
  assert.match(en, /max="2026"/);
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
  // Watersheds stays listed because it is genuinely planned, and it has to
  // say why it is not here rather than showing a bare label.
  assert.match(en, /Not available yet/);
  assert.match(en, /No authoritative national watershed edition/);
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
  }
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

  const fr = renderToStaticMarkup(
    <ExploreView events={exploreFixtures} locale="fr" year={1995} />,
  );
  assert.match(fr, /Afficher les exemples illustratifs jusqu/);
  assert.match(fr, /Mettre à jour/);
});

test("the year query is parsed defensively and filters fixtures to that year and earlier", async () => {
  const { parseExploreYear, fixturesThroughYear } =
    // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
    await import("../lib/explore/fixtures.ts");
  const { EXPLORE_DEFAULT_YEAR } =
    // @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
    await import("../lib/explore/types.ts");
  assert.equal(EXPLORE_DEFAULT_YEAR, 2026);

  assert.equal(parseExploreYear("1995"), 1995);
  // Anything that is not an in-range ASCII four-digit year falls back rather than throwing
  // or producing a year the control could never select.
  for (const bad of [
    undefined,
    "",
    "abc",
    "12",
    "20055",
    "1983",
    "2027",
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
