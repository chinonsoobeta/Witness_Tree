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
  assert.doesNotMatch(places, /Find a federal electoral district/);
  assert.match(districts, /Find a federal electoral district/);
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
  assert.equal(formatSearchShare(1, "en"), "100 percent");
  assert.equal(formatSearchShare(0.996, "en"), "over 99 percent");
  assert.equal(formatSearchShare(0.0092, "en"), "under 1 percent");
  assert.equal(formatSearchShare(0.0013, "en"), "under 1 percent");
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
      assert.ok(markup.indexOf('class="coverage-statement"') < markup.indexOf('<form'));
      assert.match(markup, /class="evidence-legend"/);
      assert.match(markup, /class="no-record-result"/);
      assert.match(markup, /<strong>– /);
      assert.match(markup, new RegExp(`href="${locale === "en" ? "/en/methods" : "/fr/methodes"}"`));
      assert.doesNotMatch(markup, />0(?: ha)?</);
      // Unknown is stated as the answer before the reason for it, and the panel
      // says what would turn it into a figure rather than stopping at the absence.
      assert.match(markup, /class="no-record-stated"/);
      assert.match(markup, locale === "en" ? /Unknown\. Nothing has been published/ : /Inconnu\. Rien n\u2019a \u00e9t\u00e9 publi\u00e9/);
      assert.match(markup, /class="no-record-remedy-list"/);
      if (scope === "places") {
        assert.match(markup, locale === "en" ? /Reserves, settlements, and treaty or agreement lands are not listed yet/ : /Les réserves, les établissements et les terres visées par un traité ou une entente ne sont pas encore répertoriés/);
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
