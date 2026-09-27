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
test("normalizes aliases and diacritics", () => { assert.equal(normalizeSearch("Québec!") , "quebec"); assert.ok(searchPlaces("alias de municipalite quebecoise").length); });
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
  assert.doesNotMatch(english, /href="\/en\/places\//);
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
  const card = en.slice(en.indexOf("<h4>Prince George</h4>"));
  assert.match(card, /Fully mapped/);
  assert.ok(card.indexOf("Fully mapped") < card.indexOf("Federal ridings"));
  assert.match(card, /of this place\. Whole riding: /);
  // A city the satellite source doesn't reach says so rather than reading as zero.
  const montreal = renderToStaticMarkup(<SearchPage locale="fr" query="Montréal" />);
  assert.match(montreal, /Aucune donnée satellitaire ici/);
  assert.doesNotMatch(montreal, />0(?: ha)?</);
});

test("a federal riding result opens in Compare, and a provincial one names no link", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<SearchPage locale={locale} query="Prince George" />);
    const compare = locale === "en" ? "/en/compare" : "/fr/comparer";
    // The riding's own result card links, as its suggestion and a community's
    // list already did; Compare covers federal ridings only.
    assert.match(markup, new RegExp(`<h4><a href="${compare}\\?left=federal-59026">Prince George—Peace River—Northern Rockies</a></h4>`));
    assert.match(markup, /<h4>Prince George-Mackenzie<\/h4>/);
  }
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
  const en = renderToStaticMarkup(<PlaceFinder locale="en" query="alias de municipalite quebecoise" />);
  const fr = renderToStaticMarkup(<PlaceFinder locale="fr" query="alias de municipalite quebecoise" />);
  assert.match(en, /Search places/);
  assert.match(en, /<label[^>]*class="field-label sr-only"[^>]*id="search-label"[^>]*>Search places<\/label>/);
  assert.match(en, /<input[^>]*aria-labelledby="search-label"/);
  assert.doesNotMatch(en, /<input[^>]*aria-label=/);
  assert.match(en, /<button[^>]*>Find<\/button>/);
  assert.match(en, /href="\/en\/places\//);
  assert.match(fr, /Rechercher des lieux/);
  assert.match(fr, /<button[^>]*>Trouver<\/button>/);
  assert.match(fr, /href="\/fr\/lieux\//);
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
        // The owner decided not to publish reserve or treaty geography, so the
        // page says so plainly and never promises those places are coming.
        assert.match(markup, locale === "en" ? /Witness Tree does not list reserves/ : /Arbre témoin ne répertorie pas séparément les réserves/);
        assert.doesNotMatch(markup, /aren’t listed yet|pas encore répertoriés|reserves, settlements and treaty or agreement lands are approved|limites officielles des réserves/i);
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
