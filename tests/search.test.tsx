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
    assert.match(markup, /Neither is a published release/);
  }
  assert.match(places, /href="\/en\/places\//);
  assert.doesNotMatch(places, /Find a federal electoral district/);
  assert.match(districts, /Find a federal electoral district/);
  assert.match(districts, /href="\/en\/compare\?left=/);
  assert.doesNotMatch(districts, /<h2>Search places<\/h2>/);
});
test("renders the bilingual place finder with its visible label as the accessible name", () => {
  const en = renderToStaticMarkup(<PlaceFinder locale="en" query="alias de municipalite quebecoise" />);
  const fr = renderToStaticMarkup(<PlaceFinder locale="fr" query="alias de municipalite quebecoise" />);
  assert.match(en, /Search places/);
  assert.match(en, /<label[^>]*id="search-label"[^>]*>Search places<\/label>/);
  assert.match(en, /<input[^>]*aria-labelledby="search-label"/);
  assert.doesNotMatch(en, /<input[^>]*aria-label=/);
  assert.match(en, /href="\/en\/places\//);
  assert.match(fr, /Rechercher des lieux/);
  assert.match(fr, /href="\/fr\/lieux\//);
});
