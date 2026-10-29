import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test"; import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { normalizeSearch, searchPlaces } from "../lib/search/index.ts";
import { SearchPage }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/SearchPage.tsx";
import { PlaceFinder }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/PlaceFinder.tsx";
// @ts-expect-error Node test runner needs extensions.
import { formatSearchShare, searchSite } from "../lib/search/site-search.ts";
// @ts-expect-error Node test runner needs extensions.
import { ridingCompareHref } from "../lib/search/suggest.ts";
test("normalizes aliases and diacritics", () => { assert.equal(normalizeSearch("Québec!") , "quebec"); assert.ok(searchPlaces("alias illustratif d’une municipalite quebecoise").length); });
test("empty and missing results never become zero", () => { assert.deepEqual(searchPlaces(""), []); assert.deepEqual(searchPlaces("not-a-place"), []); });
test("fixture names have bilingual parity", () => { const found = searchPlaces("illustrative"); assert.equal(found.filter((place) => place.name.en).length, found.filter((place) => place.name.fr).length); });
test("renders empty and no-result states plainly and never as zero", () => {
  for (const locale of ["en", "fr"] as const) {
    const empty = renderToStaticMarkup(<SearchPage locale={locale} query="" />);
    const noResult = renderToStaticMarkup(<SearchPage locale={locale} query="not-a-place" />);
    assert.doesNotMatch(empty, />0</);
    assert.match(noResult, /No released place, riding, or community record matches this query|Aucun registre publié de province, de circonscription ou de collectivité ne correspond à cette recherche/);
    assert.doesNotMatch(noResult, />0</);
  }
});
test("renders alias results with locale-correct links and keeps Explore in header navigation", () => {
  const english = renderToStaticMarkup(<SearchPage locale="en" query="Prince George, British Columbia" />);
  const french = renderToStaticMarkup(<SearchPage locale="fr" query="Grand Sudbury" />);
  assert.match(english, /Prince George/);
  assert.match(english, /City/);
  assert.match(english, /href="\/en\/compare\?left=federal-/);
  assert.match(french, /Grand Sudbury/);
  // Results open real place pages, never the illustrative gallery examples.
  assert.match(english, /href="\/en\/places\/1984-2022-v1\/csd-2021\/5953023"/);
  assert.match(french, /href="\/fr\/lieux\/1984-2022-v1\/csd-2021\/3553005"/);
  assert.doesNotMatch(`${english}${french}`, /example-places|exemples-lieux/);
  const header = readFileSync(new URL("../components/site/SiteHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /\["Explore", "\/en\/explore"\]/);
  assert.match(header, /\["Explorer", "\/fr\/explorer"\]/);
});
test("Search exposes one field behind a labelled places or districts scope", () => {
  const places = renderToStaticMarkup(<SearchPage locale="en" scope="places" query="Prince George" />);
  const districts = renderToStaticMarkup(<SearchPage locale="en" scope="districts" query="Abbotsford" />);
  for (const markup of [places, districts]) {
    assert.equal((markup.match(/<input class="input"/g) ?? []).length, 1);
    assert.match(markup, /aria-label="Search scope"/);
    assert.match(markup, /1984 to 2022/);
  }
  assert.match(places, /Prince George/);
  assert.doesNotMatch(places, /Find a federal riding/);
  assert.match(districts, /Find a federal riding/);
  assert.match(districts, /href="\/en\/compare\?left=/);
  assert.doesNotMatch(districts, /<h2>Search places<\/h2>/);
});

test("real place search handles suffixes, bilingual names, dash spelling, gaps, and share display", () => {
  for (const query of ["Prince George, British Columbia", "Prince George British Columbia", "Prince George"]) {
    const result = searchSite(query).results.find((entry) => entry.kind === "community" && entry.id === "5953023");
    assert.ok(result, query);
    assert.equal(result?.type, "CY");
    assert.ok(result?.federal?.length);
    assert.ok(result?.provincial?.length);
  }
  assert.equal(searchSite("Grand Sudbury").results.find((entry) => entry.kind === "community")?.id, "3553005");
  assert.equal(searchSite("Saint-Lin-Laurentides").results.find((entry) => entry.kind === "community")?.id, "2463048");
  assert.equal(searchSite("Saint-Lin-Laurentides").results.find((entry) => entry.kind === "community")?.name, "Saint-Lin–Laurentides");
  const gap = searchSite("L'Ile-Dorval").results.find((entry) => entry.kind === "community");
  assert.equal(gap?.id, "2466092");
  assert.deepEqual(gap?.provincial, []);
  assert.ok(searchSite("Dorval").results.some((entry) => entry.kind === "community" && entry.id === "2466087" && (entry.provincial?.length ?? 0) > 0));
  const partialRiding = renderToStaticMarkup(<SearchPage locale="en" query="Ungava" />);
  assert.match(partialRiding, /At least/);
  assert.doesNotMatch(partialRiding, />0(?: ha)?</);
  assert.match(renderToStaticMarkup(<SearchPage locale="en" query="Prince George" />), /Statistics Canada/);
  assert.match(renderToStaticMarkup(<SearchPage locale="fr" query="Grand Sudbury" />), /Statistique Canada/);
  assert.equal(formatSearchShare(1, "en"), "100% of this place");
  assert.equal(formatSearchShare(0.996, "en"), "over 99% of this place");
  assert.equal(formatSearchShare(0.0092, "en"), "under 1% of this place");
  assert.equal(formatSearchShare(0.0013, "en"), "under 1% of this place");
  assert.match(formatSearchShare(0.6, "fr"), /^60\u00a0?%|^60\s?% de ce lieu$/);
});

test("a community result leads with the place's own figure, before its ridings", () => {
  // Prince George was fully mapped, so its own share and area read first.
  const en = renderToStaticMarkup(<SearchPage locale="en" query="Prince George" />);
  const card = en.slice(en.indexOf(`<h4><a href="/en/places/1984-2022-v1/csd-2021/5953023">Prince George</a></h4>`));
  assert.match(card, /Fully mapped/);
  assert.ok(card.indexOf("Fully mapped") < card.indexOf("Federal ridings"));
  assert.match(card, /of this place\. Whole riding: /);
  // A city the satellite source doesn't reach says so rather than reading as zero.
  const montreal = renderToStaticMarkup(<SearchPage locale="fr" query="Montréal" />);
  assert.match(montreal, /Aucune donnée satellitaire ici/);
  assert.doesNotMatch(montreal, />0(?: ha)?</);
});

test("a federal or a provincial riding result opens in Compare", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<SearchPage locale={locale} query="Prince George" />);
    const compare = locale === "en" ? "/en/compare" : "/fr/comparer";
    // Every riding result opens its own page and also links to Compare, which
    // covers the four provinces' ridings at both levels.
    const places = locale === "en" ? "/en/places" : "/fr/lieux";
    assert.match(markup, new RegExp(`<h4><a href="${places}/1984-2022-v1/federal-2023/59026">Prince George—Peace River—Northern Rockies</a></h4>`));
    assert.match(markup, new RegExp(`<a href="${compare}\\?left=federal-59026">`));
    assert.match(markup, new RegExp(`<h4><a href="${places}/1984-2022-v1/bc-2023/\\d+">Prince George-Mackenzie</a></h4>`));
    assert.match(markup, new RegExp(`<a href="${compare}\\?left=provincial-BC-\\d+">`));
  }
  assert.equal(ridingCompareHref("CA-59001", "en"), "/en/compare?left=federal-59001");
  assert.equal(ridingCompareHref("BC-258", "en"), "/en/compare?left=provincial-BC-258");
  assert.equal(ridingCompareHref("QC-137", "fr"), "/fr/comparer?left=provincial-QC-137");
  assert.equal(ridingCompareHref("NS-1", "en"), null, "no Compare page outside the four provinces");
});

test("a province can be written as its standard abbreviation", () => {
  for (const query of ["Prince George, C.-B.", "Prince George, B.C.", "Prince George, BC", "Prince George, British Columbia"]) {
    assert.ok(searchSite(query).results.some((result: { name: string }) => result.name === "Prince George"), query);
  }
  for (const [query, province] of [["Sudbury, Ont.", "ON"], ["Grande Prairie, Alta.", "AB"], ["Grande Prairie, Alb.", "AB"], ["Rimouski, Que.", "QC"], ["Rimouski, Qc", "QC"]] as const) {
    const results = searchSite(query).results;
    assert.ok(results.length > 0, query);
    assert.ok(results.every((result: { province?: string; id: string }) => result.province === province || result.province === "CA"), `${query} stays in ${province}`);
  }
});

test("search publishes no figure for a riding outside the four provinces", () => {
  for (const query of ["Malpeque", "Cumberland—Colchester", "Desnethé—Missinippi—Churchill River"]) {
    assert.deepEqual(searchSite(query).results.filter((result: { kind: string }) => result.kind === "riding"), [], query);
  }
});

test("the real search module stays out of client modules", () => {
  for (const file of ["../components/search/AddressFinderClient.tsx", "../components/explore/ExploreMapClient.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /search\/site-search/);
  }
});
test("renders the bilingual place finder with a hidden label and compact submit text", () => {
  const en = renderToStaticMarkup(<PlaceFinder locale="en" query="alias illustratif d’une municipalite quebecoise" />);
  const fr = renderToStaticMarkup(<PlaceFinder locale="fr" query="alias illustratif d’une municipalite quebecoise" />);
  assert.match(en, /Search places/);
  assert.match(en, /<label[^>]*class="field-label sr-only"[^>]*id="search-label"[^>]*>Search places<\/label>/);
  assert.match(en, /<input[^>]*aria-labelledby="search-label"/);
  assert.doesNotMatch(en, /<input[^>]*aria-label=/);
  assert.match(en, /<button[^>]*>Find<\/button>/);
  // The illustrative finder links to the gallery examples, never among real places.
  assert.match(en, /href="\/en\/components\/example-places\//);
  assert.match(fr, /Rechercher des lieux/);
  assert.match(fr, /<button[^>]*>Trouver<\/button>/);
  assert.match(fr, /href="\/fr\/composants\/exemples-lieux\//);
});

test("search coverage precedes controls and a missing record is a result with a reason", () => {
  for (const locale of ["en", "fr"] as const) {
    for (const scope of ["places", "districts"] as const) {
      const markup = renderToStaticMarkup(<SearchPage locale={locale} scope={scope} query="not-a-place" />);
      assert.ok(markup.indexOf('class="coverage-note"') > 0 && markup.indexOf('class="coverage-note"') < markup.indexOf('<form'));
      // No result carries a mark here, so there is no key to read.
      assert.doesNotMatch(markup, /class="evidence-(legend|key)"/);
      assert.match(markup, /class="no-record-result"/);
      assert.match(markup, /<strong>– /);
      assert.match(markup, new RegExp(`href="${locale === "en" ? "/en/methods" : "/fr/methodes"}"`));
      assert.doesNotMatch(markup, />0(?: ha)?</);
      // Unknown is stated as the answer before the reason for it, and the panel
      // says what would turn it into a figure rather than stopping at the absence.
      assert.match(markup, /class="no-record-stated"/);
      assert.match(markup, locale === "en" ? /Unknown\. Nothing published answers this yet/ : /Inconnu\. Rien de publi\u00e9 ne r\u00e9pond/);
      assert.match(markup, /class="no-record-remedy-list"/);
      if (scope === "places") {
        // The owner removed every reference to reserves from the site, and the
        // page never promises other places are coming.
        assert.doesNotMatch(markup, /reserve|réserve|aren’t listed yet|pas encore répertoriés/i);
      }
      assert.match(markup, new RegExp(`href="${locale === "en" ? "/en/corrections" : "/fr/corrections"}"`));
    }
  }
});

// @ts-expect-error Node test runner needs extensions.
import { DistrictReadout } from "../components/search/AddressFinderClient.tsx";

test("address results distinguish a missing boundary from a found boundary without a measurement", () => {
  for (const locale of ["en", "fr"] as const) {
    const name = { en: "Example district", fr: "Circonscription exemple" };
    const found = { kind: "single" as const, districtId: "59001", name };
    const empty = renderToStaticMarkup(<DistrictReadout locale={locale} heading="District" lookup={{ kind: "empty" }} linkable={false} />);
    const noMeasurement = renderToStaticMarkup(<DistrictReadout locale={locale} heading="District" lookup={found} linkable={false} />);
    const measured = renderToStaticMarkup(<DistrictReadout locale={locale} heading="District" lookup={found} linkable />);
    assert.match(empty, /class="no-record-result"/);
    assert.match(empty, /no boundary record|aucun registre de limites/);
    // Two Unknown panels can share one address block, so the way-out list stays
    // off here: printed twice on one screen it reads as noise, not as a route.
    assert.doesNotMatch(empty, /class="no-record-remedy-list"/);
    assert.doesNotMatch(noMeasurement, /class="no-record-remedy-list"/);
    assert.ok(noMeasurement.includes(name[locale]));
    assert.match(noMeasurement, /no measurement|aucune mesure/);
    assert.doesNotMatch(noMeasurement, /compare\?left=|comparer\?left=/);
    assert.match(measured, /compare\?left=federal-59001|comparer\?left=federal-59001/);
    assert.doesNotMatch(measured, /class="no-record-result"/);
  }
});

import { cleanSearchQuery } from "../lib/search/query";
import { splitUnknownRows, UNKNOWN_GROUP_MIN } from "../lib/search/unknown-groups";

const WHITESPACE_QUERIES = [" ", "   ", "\u00a0", " \u00a0\t\n ", "\u202f\u2003", "\u200b", "\ufeff "];

test("a query of nothing but whitespace is no query, in both languages", () => {
  for (const query of WHITESPACE_QUERIES) {
    assert.equal(cleanSearchQuery(query), "", JSON.stringify(query));
    assert.deepEqual(searchSite(query).results, [], JSON.stringify(query));
    for (const locale of ["en", "fr"] as const) {
      const markup = renderToStaticMarkup(<SearchPage locale={locale} query={query} />);
      assert.match(markup, locale === "en" ? /Enter a province, riding, or community\./ : /Entrez une province, une circonscription ou une collectivité\./);
      assert.doesNotMatch(markup, /class="no-record-result"|class="search-results"/);
      // The field shows the query as search read it: empty, not a run of spaces.
      assert.match(markup, /<input[^>]*name="q"[^>]*value=""/);
    }
  }
  // Inner runs of any whitespace read as one space; the words are untouched.
  assert.equal(cleanSearchQuery("\u00a0Prince\u00a0\u00a0George "), "Prince George");
  assert.equal(cleanSearchQuery(undefined), "");
  assert.equal(cleanSearchQuery(["Prince George"]), "");
});

test("results rank the exact name first, then measured places, then Unknowns", () => {
  for (const query of ["saint", "lac", "mont", "river", "toronto", "saint jean", "montreal"]) {
    const { results } = searchSite(query);
    for (const kind of ["community", "riding", "province"] as const) {
      const rows = results.filter((result: { kind: string }) => result.kind === kind);
      const exact = rows.filter((row: { score: number }) => row.score === 0).length;
      assert.ok(rows.slice(0, exact).every((row: { score: number }) => row.score === 0), `${query}: exact names lead ${kind}`);
      const rest = rows.slice(exact);
      const firstUnknown = rest.findIndex((row: { unknownReason: string | null }) => row.unknownReason !== null);
      if (firstUnknown >= 0) {
        assert.ok(rest.slice(firstUnknown).every((row: { unknownReason: string | null }) => row.unknownReason !== null), `${query}: no measured ${kind} after an Unknown`);
      }
    }
  }
  // The riding the reader named stays first even though its loss is Unknown.
  const saintJean = searchSite("Saint-Jean").results.filter((result: { kind: string }) => result.kind === "riding");
  assert.equal(saintJean[0]?.name, "Saint-Jean");
  assert.equal(saintJean[0]?.unknownReason, "no-satellite-data");
});

test("many same-reason Unknowns are one counted line that opens to them, never a wall and never 0", () => {
  const cases = [
    { locale: "en", federal: /<summary><span class="mark-glyph mark-glyph--unknown" aria-hidden="true"><\/span><span>18 federal ridings have no satellite data, so their loss is Unknown<\/span><\/summary>/, provincial: /<span>26 provincial ridings have no satellite data, so their loss is Unknown<\/span>/, row: "Loss unknown; no satellite data here" },
    { locale: "fr", federal: /<span>18 circonscriptions fédérales n’ont pas de données satellitaires, donc leur perte est inconnue<\/span>/, provincial: /<span>26 circonscriptions provinciales n’ont pas de données satellitaires, donc leur perte est inconnue<\/span>/, row: "Perte inconnue\u202f; aucune donnée satellitaire ici" },
  ] as const;
  for (const { locale, federal, provincial, row } of cases) {
    const markup = renderToStaticMarkup(<SearchPage locale={locale} query="montreal" />);
    assert.match(markup, federal);
    assert.match(markup, provincial);
    // Each group holds exactly the rows its line counts, and each row keeps its own Unknown.
    const groups = [...markup.matchAll(/<details class="search-unknown-group"><summary>.*?<span>(\d+) [^<]*<\/span><\/summary>(.*?)<\/details>/g)];
    assert.ok(groups.length >= 2);
    for (const [, count, body] of groups) {
      assert.equal((body!.match(/<li>/g) ?? []).length, Number(count));
      assert.equal(body!.split(row).length - 1, Number(count));
    }
    assert.doesNotMatch(markup, /100\s?% of the forest is unknown|100\s?% de la forêt est inconnue/);
    assert.doesNotMatch(markup, />0(?: ha)?</);
    // The city itself is still listed, with its own reason.
    assert.match(markup, locale === "en" ? /No satellite data here\./ : /Aucune donnée satellitaire ici\./);
  }
  // Results, not only a place's ridings, are gathered the same way.
  const saint = renderToStaticMarkup(<SearchPage locale="en" query="saint" />);
  assert.match(saint, /<span>\d+ ridings have no satellite data, so their loss is Unknown<\/span>/);
  assert.match(saint, /\d+ more ridings? (match and aren’t|matches and isn’t) listed here\./);
});

test("Unknowns gather only from the threshold up, and kept rows are never gathered", () => {
  const rows = [
    { id: "a", reason: null }, { id: "b", reason: "no-satellite-data" }, { id: "c", reason: "partly-mapped" },
    { id: "d", reason: "no-satellite-data" }, { id: "e", reason: "partly-mapped" }, { id: "f", reason: "no-satellite-data" },
  ] as const;
  assert.equal(UNKNOWN_GROUP_MIN, 3);
  const split = splitUnknownRows(rows, (row) => row.reason);
  assert.deepEqual(split.listed.map((row) => row.id), ["a", "c", "e"]);
  assert.deepEqual(split.groups.map((group) => [group.reason, group.rows.map((row) => row.id)]), [["no-satellite-data", ["b", "d", "f"]]]);
  const kept = splitUnknownRows(rows, (row) => row.reason, (row) => row.id === "b");
  assert.deepEqual(kept.listed.map((row) => row.id), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(kept.groups, []);
});

test("each result says what it is, where, which figure it shows and over what span", () => {
  const en = renderToStaticMarkup(<SearchPage locale="en" query="Prince George" />);
  const fr = renderToStaticMarkup(<SearchPage locale="fr" query="Prince George" />);
  assert.match(en, /<p class="eyebrow search-result-kind">Community · City · British Columbia<\/p>/);
  assert.match(en, /<p class="eyebrow search-result-kind">Federal riding · British Columbia<\/p>/);
  assert.match(en, /<p class="eyebrow search-result-kind">Provincial riding · British Columbia<\/p>/);
  assert.match(en, /<span class="search-result-figure-label">This community, 1984–2022:<\/span>/);
  assert.match(en, /<span class="search-result-figure-label">Whole riding, 1984–2022:<\/span>/);
  assert.match(en, /Federal ridings it lies in \(figures for 1984–2022\)/);
  assert.match(fr, /<p class="eyebrow search-result-kind">Collectivité · City · Colombie-Britannique<\/p>/);
  assert.match(fr, /<p class="eyebrow search-result-kind">Circonscription fédérale · Colombie-Britannique<\/p>/);
  assert.match(fr, /<p class="eyebrow search-result-kind">Circonscription provinciale · Colombie-Britannique<\/p>/);
  assert.match(fr, /<span class="search-result-figure-label">Cette collectivité, 1984–2022\u202f:<\/span>/);
  assert.match(fr, /<span class="search-result-figure-label">Toute la circonscription, 1984–2022\u202f:<\/span>/);
  const province = renderToStaticMarkup(<SearchPage locale="fr" query="Alberta" />);
  assert.match(province, /<p class="eyebrow search-result-kind">Province<\/p>/);
  assert.match(province, /Toute la province, 1984–2022\u202f:/);
  // The label follows the name in reading order, so heading navigation lands on the name.
  assert.ok(en.indexOf(">Prince George</a></h4>") < en.indexOf("Community · City · British Columbia"));
});

test("same-name places read apart by the federal riding holding most of them", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<SearchPage locale={locale} query="Saint-Elzéar" />);
    const label = locale === "en" ? "Community · Municipalité · Québec · Federal riding: " : "Collectivité · Municipalité · Québec · Circonscription fédérale\u202f: ";
    const metas = [...markup.matchAll(/<p class="eyebrow search-result-kind">([^<]*)<\/p>/g)].map(([, meta]) => meta!).filter((meta) => meta.startsWith(label));
    assert.equal(metas.length, 2, locale);
    assert.notEqual(metas[0], metas[1]);
  }
  // A unique name carries no riding in its label.
  assert.doesNotMatch(renderToStaticMarkup(<SearchPage locale="en" query="Prince George" />), /Community · City · British Columbia · Federal riding/);
});
