import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test"; import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { normalizeSearch, searchPlaces } from "../lib/search/index.ts";
import { SearchPage }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/SearchPage.tsx";
import { PlaceFinder }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/PlaceFinder.tsx";
test("normalizes aliases and diacritics", () => { assert.equal(normalizeSearch("Québec!") , "quebec"); assert.ok(searchPlaces("alias de municipalite quebecoise").length); });
test("empty and missing results never become zero", () => { assert.deepEqual(searchPlaces(""), []); assert.deepEqual(searchPlaces("not-a-place"), []); });
test("fixture names have bilingual parity", () => { const found = searchPlaces("illustrative"); assert.equal(found.filter((place) => place.name.en).length, found.filter((place) => place.name.fr).length); });
test("renders empty and no-result states plainly and never as zero", () => {
  for (const locale of ["en", "fr"] as const) {
    const empty = renderToStaticMarkup(<SearchPage locale={locale} query="" />);
    const noResult = renderToStaticMarkup(<SearchPage locale={locale} query="not-a-place" />);
    assert.doesNotMatch(empty, />0</);
    assert.match(noResult, /No illustrative place record matches this query|Aucun dossier de lieu illustratif ne correspond à cette recherche/);
    assert.doesNotMatch(noResult, />0</);
  }
});
test("renders alias results with locale-correct links and keeps Explore in header navigation", () => {
  assert.match(renderToStaticMarkup(<SearchPage locale="en" query="alias de municipalite quebecoise" />), /href="\/en\/places\//);
  assert.match(renderToStaticMarkup(<SearchPage locale="fr" query="alias de municipalite quebecoise" />), /href="\/fr\/lieux\//);
  const header = readFileSync(new URL("../components/site/SiteHeader.tsx", import.meta.url), "utf8");
  assert.match(header, /\["Explore", "\/en\/explore"\]/);
  assert.match(header, /\["Explorer", "\/fr\/explorer"\]/);
});
test("Search exposes one field behind a labelled places or districts scope", () => {
  const places = renderToStaticMarkup(<SearchPage locale="en" scope="places" query="illustrative" />);
  const districts = renderToStaticMarkup(<SearchPage locale="en" scope="districts" query="Abbotsford" />);
  for (const markup of [places, districts]) {
    assert.equal((markup.match(/<input class="input"/g) ?? []).length, 1);
    assert.match(markup, /aria-label="Search scope"/);
    assert.match(markup, /Place results are illustrative fixtures/);
  }
  assert.match(places, /href="\/en\/places\//);
  assert.doesNotMatch(places, /Find a federal electoral district/);
  assert.match(districts, /Find a federal electoral district/);
  assert.match(districts, /href="\/en\/compare\?left=/);
  assert.doesNotMatch(districts, /<h2>Search places<\/h2>/);
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
    assert.ok(noMeasurement.includes(name[locale]));
    assert.match(noMeasurement, /no measurement|aucune mesure/);
    assert.doesNotMatch(noMeasurement, /compare\?left=|comparer\?left=/);
    assert.match(measured, /compare\?left=federal-59001|comparer\?left=federal-59001/);
    assert.doesNotMatch(measured, /class="no-record-result"/);
  }
});
