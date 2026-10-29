import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { communityPagePath, PLACE_DATA_VERSION, placePageCounts, placePageParams, placePagePath, placePageRecord, ridingPagePath, wholeRecordFigures } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { placeFigure } from "../lib/search/place-figures.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { ridingSearchRow } from "../lib/search/site-search.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { suggestSearch } from "../lib/search/suggest.ts";

const RIDING_PREFIX: Readonly<Record<string, string>> = { "federal-2023": "CA", "bc-2023": "BC", "ab-2019": "AB", "on-2022": "ON", "qc-2026": "QC" };

test("a fully mapped record gives the hectares and the share, with satellite evidence and source", () => {
  // 1,000 cells lost of 10,000 mapped: 90 ha, 10%.
  const figures = wholeRecordFigures({ union: 1000, known: 10000, unknown: 0 }, { locale: "en" });
  assert.equal(figures.coverage, "complete");
  assert.equal(figures.lostIsMinimum, false);
  assert.deepEqual([figures.lost.kind, figures.share.kind], ["figure", "figure"]);
  if (figures.lost.kind !== "figure" || figures.share.kind !== "figure") return;
  assert.ok(Math.abs(figures.lost.value - 90) < 1e-9);
  assert.ok(Math.abs(figures.share.value - 10) < 1e-9);
  assert.equal(figures.lost.evidence, "satellite-observation");
  assert.equal(figures.lost.provenance.licence, "ogl-canada-2.0");
  assert.equal(figures.confidence.level, "medium");
});

test("an unknown share is withheld and the hectares are labelled a minimum", () => {
  for (const locale of ["en", "fr"] as const) {
    // 20 of 100 forest-or-unknown cells have no satellite data: 20%.
    const figures = wholeRecordFigures({ union: 10, known: 80, unknown: 20 }, { locale });
    assert.equal(figures.coverage, "partial-with-unknown");
    assert.equal(figures.lostIsMinimum, true);
    assert.equal(figures.lost.kind, "figure");
    assert.equal(figures.share.kind, "unknown");
    assert.equal(figures.confidence.level, "limited");
    if (figures.share.kind !== "unknown") return;
    assert.match(figures.share.reason[locale], /20/);
    assert.equal(figures.share.coverageGrade, "national-baseline");
  }
  // The same gap under the 1% riding tolerance is still partial; a smaller one is admitted.
  assert.equal(wholeRecordFigures({ union: 10, known: 80, unknown: 20 }, { locale: "en", unknownTolerancePercent: 1 }).coverage, "partial-with-unknown");
  const admitted = wholeRecordFigures({ union: 10, known: 1000, unknown: 5 }, { locale: "en", unknownTolerancePercent: 1 });
  assert.equal(admitted.coverage, "complete");
  assert.ok(admitted.admittedUnknownPercent! > 0 && admitted.admittedUnknownPercent! < 1);
  assert.equal(wholeRecordFigures({ union: 10, known: 1000, unknown: 5 }, { locale: "en" }).coverage, "partial-with-unknown");
});

test("no detected loss in a partly mapped area, no satellite data, or no forest is Unknown, never 0", () => {
  const cases = [
    [{ union: 0, known: 80, unknown: 20 }, "partial-with-unknown", /no satellite data/],
    [{ union: 0, known: 0, unknown: 20 }, "partial-with-unknown", /no satellite data/],
    [{ union: 0, known: 0, unknown: 0 }, "none-mapped", /No forest was mapped/],
  ] as const;
  for (const [cells, coverage, reason] of cases) {
    const figures = wholeRecordFigures(cells, { locale: "en" });
    assert.equal(figures.coverage, coverage);
    assert.equal(figures.lost.kind, "unknown");
    assert.equal(figures.share.kind, "unknown");
    assert.equal(figures.lostIsMinimum, false);
    if (figures.lost.kind === "unknown") assert.match(figures.lost.reason.en, reason);
  }
  assert.throws(() => wholeRecordFigures({ union: 5, known: 4, unknown: 0 }, { locale: "en" }), /cannot exceed/);
  assert.throws(() => wholeRecordFigures({ union: -1, known: 4, unknown: 0 }, { locale: "en" }), /non-negative/);
});

test("every community, in-scope riding and economic region has a page, keyed by edition and official code", () => {
  assert.deepEqual(placePageCounts(), { community: 2291, "federal-riding": 280, "provincial-riding": 431, "economic-region": 44 });
  const params = placePageParams();
  assert.equal(params.length, 3046);
  assert.equal(new Set(params.map(({ geography, code }) => `${geography}/${code}`)).size, params.length);
  for (const { dataVersion, geography, code } of params) {
    assert.equal(dataVersion, PLACE_DATA_VERSION);
    assert.match(code, /^[0-9]+$/);
    const path = placePagePath("en", geography, code);
    assert.doesNotMatch(path, /witness|arbre|t[eé]moin/i);
  }
  assert.equal(placePagePath("en", "csd-2021", "5924034"), "/en/places/1984-2022-v1/csd-2021/5924034");
  assert.equal(placePagePath("fr", "csd-2021", "5924034"), "/fr/lieux/1984-2022-v1/csd-2021/5924034");
  assert.equal(placePageRecord("1984-2022-v0", "csd-2021", "5924034"), undefined);
  assert.equal(placePageRecord(PLACE_DATA_VERSION, "csd-2016", "5924034"), undefined);
  assert.equal(placePageRecord(PLACE_DATA_VERSION, "federal-2023", "10001"), undefined, "ridings outside the four provinces have no page");
});

test("community and riding pages agree with the figures search already shows", () => {
  for (const { dataVersion, geography, code } of placePageParams()) {
    const record = placePageRecord(dataVersion, geography, code)!;
    const figures = wholeRecordFigures(record.cells, { locale: "en", unknownTolerancePercent: record.unknownTolerancePercent });
    for (const related of [record.region, ...record.federal, ...record.provincial, ...record.communities]) {
      if (related) assert.ok(placePageRecord(dataVersion, related.geography, related.code), `${geography}/${code} links to a missing ${related.geography}/${related.code}`);
    }
    if (geography === "er-2021") continue;
    const shown = geography === "csd-2021" ? placeFigure(code) : ridingSearchRow(`${RIDING_PREFIX[geography]}-${code}`);
    assert.ok(shown, `${geography}/${code} is not in search`);
    assert.equal(figures.coverage, shown.coverage, `${geography}/${code} coverage`);
    if (figures.lost.kind === "figure" && !figures.lostIsMinimum) {
      assert.ok(Math.abs(figures.lost.value - shown.observedLossHectares!) < 0.01, `${geography}/${code} hectares`);
    }
  }
});

test("Campbell River links to its region and ridings, and they link back", () => {
  const record = placePageRecord(PLACE_DATA_VERSION, "csd-2021", "5924034")!;
  assert.equal(record.name.en, "Campbell River");
  assert.equal(record.region?.geography, "er-2021");
  assert.ok(record.federal.length > 0 && record.provincial.length > 0);
  const federal = record.federal[0]!;
  const riding = placePageRecord(PLACE_DATA_VERSION, federal.geography, federal.code)!;
  assert.ok(riding.communities.some((community) => community.code === "5924034"));
  assert.equal(riding.compareId, `federal-${federal.code}`);
  const region = placePageRecord(PLACE_DATA_VERSION, "er-2021", record.region!.code)!;
  assert.ok(region.communities.some((community) => community.code === "5924034"));
});

test("a partly mapped riding renders its minimum and an Unknown share with the reason", () => {
  const record = placePageRecord(PLACE_DATA_VERSION, "qc-2026", "117")!;
  for (const locale of ["en", "fr"] as const) {
    const html = renderToStaticMarkup(<RecordPlacePage locale={locale} record={record} />);
    assert.match(html, locale === "en" ? /A minimum/i : /minimum/i);
    assert.match(html, locale === "en" ? /share lost can’t be worked out/ : /la part perdue ne peut donc pas être calculée/);
    assert.match(html, /1984-2022-v1/);
    assert.match(html, /2785c103-9c2d-429b-9f3d-89f5cd9ea94d|Annual High-resolution forest land cover/);
    assert.doesNotMatch(html, />0(?:[.,]0+)?\s?%</);
  }
});

test("search links communities and ridings to their pages and every link resolves", () => {
  const page = suggestSearch("Campbell River", "en");
  const community = page.suggestions.find((suggestion) => suggestion.kind === "community")!;
  assert.equal(community.href, communityPagePath("en", "5924034"));
  for (const href of [community.href, ...community.ridings.map((riding) => riding.href)]) {
    const [, , , dataVersion, geography, code] = href!.split("/");
    assert.ok(placePageRecord(dataVersion!, geography!, code!), href!);
  }
  assert.equal(ridingPagePath("fr", "CA-59001"), "/fr/lieux/1984-2022-v1/federal-2023/59001");
  assert.equal(ridingPagePath("en", "XX-1"), null);
  const province = suggestSearch("British Columbia", "en").suggestions.find((suggestion) => suggestion.kind === "province");
  if (province) assert.equal(province.href, null);
});
