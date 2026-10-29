// A link the page cannot follow is said out loud, never quietly replaced.
//
// Audit 2026-10-28, B1 and B11: Explore and the harvest-and-fire chart builder
// used to swap a bad year, view or province for a default and show the result
// as if it were what the link asked for. These tests hold each class of bad
// input to the same rule: the value is read strictly, the default is used, and
// the page names what it ignored and what it shows instead, in both languages.
import assert from "node:assert/strict";
import test from "node:test";
import type { Context, ReactElement } from "react";
import { renderToStaticMarkup as renderElement } from "react-dom/server";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { ExploreView } from "../components/explore/ExploreView";
import { HarvestFirePage } from "../components/transparency/HarvestFirePage";
import { exploreFixtures } from "../lib/explore/fixtures";
import { exploreHref, quotedQueryValue, readExploreQuery, type ExploreRouteQuery } from "../lib/explore/href";
import { readHarvestFireQuery } from "../lib/harvest-fire";

// The year control reads the app router; the framework mounts it around every
// real render. Nothing here navigates, so the methods only have to exist.
const stubRouter = Object.fromEntries(
  ["push", "replace", "back", "forward", "refresh", "prefetch"].map((method) => [method, () => {}]),
) as unknown as AppRouterInstance;
const RouterContext: Context<AppRouterInstance | null> = AppRouterContext;
const render = (element: ReactElement) =>
  renderElement(<RouterContext.Provider value={stubRouter}>{element}</RouterContext.Provider>);

const DEFAULT_SPAN = { fromYear: 2021, toYear: 2022 };

/* ---------- Explore: parsing ---------- */

test("Explore reads a valid span exactly and ignores nothing", () => {
  for (const [query, span] of [
    [{}, DEFAULT_SPAN],
    [{ year: "1995" }, { fromYear: 1994, toYear: 1995 }],
    [{ from: "1990", year: "1998" }, { fromYear: 1990, toYear: 1998 }],
    [{ from: "1984", year: "2022" }, { fromYear: 1984, toYear: 2022 }],
    [{ from: "1990" }, { fromYear: 1990, toYear: 2022 }],
    [{ year: "", from: "" }, DEFAULT_SPAN],
  ] as const) {
    const read = readExploreQuery(query);
    assert.deepEqual(read.interval, span, JSON.stringify(query));
    assert.deepEqual(read.ignored, [], JSON.stringify(query));
  }
});

test("Explore falls back to the default span for a malformed year and says which", () => {
  for (const bad of ["abc", "12", "20055", " 1995", "1995.0", "١٩٩٥", "-999", "0x7C6"]) {
    const read = readExploreQuery({ year: bad });
    assert.deepEqual(read.interval, DEFAULT_SPAN, bad);
    assert.deepEqual(read.ignored, [{ parameter: "year", value: bad, reason: "malformed" }], bad);
  }
  const from = readExploreQuery({ from: "nineteen", year: "1998" });
  assert.deepEqual(from.interval, DEFAULT_SPAN);
  assert.deepEqual(from.ignored, [{ parameter: "from", value: "nineteen", reason: "malformed" }]);
  // A repeated parameter is read as the address writes it, and is not a year.
  const repeated = readExploreQuery({ year: ["1990", "1995"] });
  assert.deepEqual(repeated.interval, DEFAULT_SPAN);
  assert.deepEqual(repeated.ignored, [{ parameter: "year", value: "1990,1995", reason: "malformed" }]);
});

test("Explore falls back for a year outside the released range, with each bound checked", () => {
  for (const [query, parameter, value] of [
    [{ year: "1900" }, "year", "1900"],
    [{ year: "1984" }, "year", "1984"],
    [{ year: "2023" }, "year", "2023"],
    [{ from: "1983", year: "1990" }, "from", "1983"],
    [{ from: "2022" }, "from", "2022"],
  ] as const) {
    const read = readExploreQuery(query);
    assert.deepEqual(read.interval, DEFAULT_SPAN, JSON.stringify(query));
    assert.deepEqual(read.ignored, [{ parameter, value, reason: "out-of-range" }], JSON.stringify(query));
  }
  const both = readExploreQuery({ from: "abc", year: "1900" });
  assert.deepEqual(both.ignored.map((item) => item.parameter), ["from", "year"]);
});

test("Explore falls back for an inverted or empty span instead of reordering it", () => {
  const inverted = readExploreQuery({ from: "2022", year: "1985" });
  // 2022 is not a valid first year at all; the range check catches it first.
  assert.deepEqual(inverted.ignored, [{ parameter: "from", value: "2022", reason: "out-of-range" }]);
  for (const [from, year] of [["2010", "2002"], ["1998", "1998"]]) {
    const read = readExploreQuery({ from, year });
    assert.deepEqual(read.interval, DEFAULT_SPAN, `${from}-${year}`);
    assert.deepEqual(read.ignored, [{ parameter: "from", value: from, reason: "inverted", lastYear: year }]);
  }
});

test("Explore names an unknown view or boundary layer and keeps the valid ones", () => {
  const read = readExploreQuery({ mode: "lidar", overlays: "federal-ridings,roads, ,watersheds" });
  assert.equal(read.mode, "forest-change");
  assert.deepEqual([...read.overlays], ["federal-ridings", "watersheds"]);
  assert.deepEqual(read.ignored, [
    { parameter: "mode", value: "lidar", reason: "unknown" },
    { parameter: "overlays", value: "roads", reason: "unknown" },
  ]);
  assert.deepEqual(readExploreQuery({ mode: "wildfire" }).ignored, []);
});

test("the corrected address is the state shown, so a copied link is honest", () => {
  const read = readExploreQuery({ mode: "lidar", year: "abc", overlays: "roads" } satisfies ExploreRouteQuery);
  assert.equal(
    exploreHref({ mode: read.mode, presentation: "map", data: "chart", year: read.interval.toYear, fromYear: read.interval.fromYear, overlays: read.overlays }),
    "?mode=forest-change&presentation=map&data=chart&year=2022",
  );
});

test("a quoted value is bounded so a crafted link cannot write a paragraph", () => {
  assert.equal(quotedQueryValue("abc"), "abc");
  assert.equal(quotedQueryValue("x".repeat(40)), `${"x".repeat(16)}…`);
});

/* ---------- Explore: the notice ---------- */

const explore = (locale: "en" | "fr", query: ExploreRouteQuery) => {
  const read = readExploreQuery(query);
  return render(
    <ExploreView
      events={exploreFixtures}
      locale={locale}
      mode={read.mode}
      year={read.interval.toYear}
      fromYear={read.interval.fromYear}
      overlays={read.overlays}
      ignored={read.ignored}
    />,
  );
};
// The notice's inner text, found by plain string positions rather than a tag
// pattern (CodeQL js/bad-tag-filter); the markup under test is React's own.
const NOTICE_OPEN = '<p class="notice query-notice" role="note">';
const notice = (html: string): string | null => {
  const start = html.indexOf(NOTICE_OPEN);
  if (start < 0) return null;
  const from = start + NOTICE_OPEN.length;
  const end = html.indexOf("</p>", from);
  return end < 0 ? null : html.slice(from, end);
};

test("a valid Explore link shows no notice", () => {
  assert.equal(notice(explore("en", { from: "1990", year: "1998" })), null);
  assert.equal(notice(explore("fr", {})), null);
});

test("each bad Explore year is named in English and French beside the span shown", () => {
  const cases: Array<[ExploreRouteQuery, RegExp, RegExp]> = [
    [{ year: "abc" }, /The last year in this link, “abc”, is not a four-digit year\./, /La dernière année de ce lien, «\u00A0abc\u00A0», n’est pas une année à quatre chiffres\./],
    [{ year: "1900" }, /The last year in this link, 1900, can’t be used: a last year must be from 1985 to 2022\./, /La dernière année de ce lien, 1900, ne peut pas être utilisée\u202F: une dernière année doit se situer entre 1985 et 2022\./],
    [{ from: "1983", year: "1990" }, /The first year in this link, 1983, can’t be used: a first year must be from 1984 to 2021\./, /La première année de ce lien, 1983, ne peut pas être utilisée\u202F: une première année doit se situer entre 1984 et 2021\./],
    [{ from: "2010", year: "2002" }, /The first year in this link, 2010, is not before its last year, 2002\./, /La première année de ce lien, 2010, ne précède pas sa dernière année, 2002\./],
  ];
  for (const [query, english, french] of cases) {
    const en = notice(explore("en", query));
    const fr = notice(explore("fr", query));
    assert.ok(en && fr, JSON.stringify(query));
    assert.match(en, english);
    assert.match(en, /The page shows the default years, 2021–2022, instead\./);
    assert.match(fr, french);
    assert.match(fr, /La page affiche donc les années par défaut, 2021–2022\./);
  }
});

test("an Explore view or layer notice does not claim the years changed", () => {
  const en = notice(explore("en", { mode: "lidar", overlays: "roads", year: "1995" }));
  assert.ok(en);
  assert.match(en, /“lidar” in this link is not one of this page’s views, so it shows “Forest loss”\./);
  assert.match(en, /“roads” in this link is not a boundary layer this map has, so nothing is drawn for it\./);
  assert.doesNotMatch(en, /default years/);
  const fr = notice(explore("fr", { mode: "lidar" }));
  assert.ok(fr);
  assert.match(fr, /«\u00A0lidar\u00A0», dans ce lien, n’est pas l’une des vues de cette page\u202F; elle affiche donc «\u00A0Perte forestière\u00A0»\./);
});

test("a value in the notice is escaped and bounded", () => {
  const html = notice(explore("en", { year: "<script>alert(1)</script>" }));
  assert.ok(html);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /“&lt;script&gt;alert\(1\)…”/);
});

/* ---------- Chart builder: parsing ---------- */

const DEFAULT_CHART = { provinces: ["59", "48", "35", "24"], firstYear: 1985, lastYear: 2022, step: 5, scale: "shared", view: "chart" };

test("the chart builder reads valid parameters exactly and ignores nothing", () => {
  assert.deepEqual(readHarvestFireQuery({}), { query: DEFAULT_CHART, ignored: [] });
  const read = readHarvestFireQuery({ provinces: "24,59", from: "2000", to: "2000", step: "span", scale: "own", view: "table" });
  assert.deepEqual(read.query, { provinces: ["59", "24"], firstYear: 2000, lastYear: 2000, step: "span", scale: "own", view: "table" });
  assert.deepEqual(read.ignored, []);
});

test("the chart builder falls back to 1985–2022 for a malformed, out-of-range or inverted year", () => {
  for (const [query, ignored] of [
    [{ from: "abc" }, [{ parameter: "from", value: "abc", reason: "malformed" }]],
    [{ to: "2020.5" }, [{ parameter: "to", value: "2020.5", reason: "malformed" }]],
    [{ from: "1984" }, [{ parameter: "from", value: "1984", reason: "out-of-range" }]],
    [{ from: "1990", to: "2040" }, [{ parameter: "to", value: "2040", reason: "out-of-range" }]],
    [{ from: "2019", to: "2010" }, [{ parameter: "from", value: "2019", reason: "inverted", lastYear: "2010" }]],
  ] as const) {
    const read = readHarvestFireQuery(query);
    assert.equal(read.query.firstYear, 1985, JSON.stringify(query));
    assert.equal(read.query.lastYear, 2022, JSON.stringify(query));
    assert.deepEqual(read.ignored, ignored, JSON.stringify(query));
  }
});

test("the chart builder names an unknown province, grouping, scale or view", () => {
  const read = readHarvestFireQuery({ provinces: "24,99", step: "7", scale: "log", view: "pie" });
  assert.deepEqual(read.query, { ...DEFAULT_CHART, provinces: ["24"] });
  assert.deepEqual(read.ignored, [
    { parameter: "provinces", value: "99", reason: "unknown" },
    { parameter: "step", value: "7", reason: "unknown" },
    { parameter: "scale", value: "log", reason: "unknown" },
    { parameter: "view", value: "pie", reason: "unknown" },
  ]);
  assert.deepEqual(readHarvestFireQuery({ provinces: "99" }).query.provinces, ["59", "48", "35", "24"]);
});

/* ---------- Chart builder: the notice ---------- */

const chart = (locale: "en" | "fr", raw: Record<string, string>) => {
  const { query, ignored } = readHarvestFireQuery(raw);
  return render(<HarvestFirePage locale={locale} query={query} ignored={ignored} />);
};

test("a valid chart link shows no notice", () => {
  assert.equal(notice(chart("en", { from: "2000", to: "2010" })), null);
});

test("the chart builder notice names each value, the years shown and the address mismatch", () => {
  const en = notice(chart("en", { from: "2019", to: "2010", step: "7", provinces: "99" }));
  assert.ok(en);
  assert.match(en, /The first year in this link, 2019, comes after its last year, 2010\./);
  assert.match(en, /“7” in this link is not a grouping this chart offers, so it uses “Five years”\./);
  assert.match(en, /“99” in this link is not one of the four provinces in this chart, so it is left out\./);
  assert.match(en, /The chart shows the default years, 1985–2022, instead\./);
  assert.match(en, /Your browser’s address still shows the link as it was/);
  const fr = notice(chart("fr", { from: "abc", view: "pie" }));
  assert.ok(fr);
  assert.match(fr, /La première année de ce lien, «\u00A0abc\u00A0», n’est pas une année à quatre chiffres\./);
  assert.match(fr, /«\u00A0pie\u00A0», dans ce lien, n’est pas un affichage offert par cette page\u202F; elle affiche donc «\u00A0Graphiques\u00A0»\./);
  assert.match(fr, /Le graphique affiche donc les années par défaut, 1985–2022\./);
  assert.match(fr, /L’adresse dans votre navigateur montre toujours le lien d’origine/);
  const range = notice(chart("en", { to: "2023" }));
  assert.ok(range);
  assert.match(range, /The last year in this link, 2023, can’t be used: the chart covers 1985 to 2022\./);
});
