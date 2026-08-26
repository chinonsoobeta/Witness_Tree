import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import test from "node:test"; import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Node test runner needs extensions.
import { normalizeSearch, searchPlaces } from "../lib/search/index.ts";
import { SearchPage }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/SearchPage.tsx";
test("normalizes aliases and diacritics", () => { assert.equal(normalizeSearch("Québec!") , "quebec"); assert.ok(searchPlaces("alias de municipalite quebecoise").length); });
test("empty and missing results never become zero", () => { assert.deepEqual(searchPlaces(""), []); assert.deepEqual(searchPlaces("not-a-place"), []); });
test("fixture names have bilingual parity", () => { const found = searchPlaces("illustrative"); assert.equal(found.filter((place) => place.name.en).length, found.filter((place) => place.name.fr).length); });
test("renders empty and no-result states with en dash and never a zero", () => {
  for (const locale of ["en", "fr"] as const) {
    const empty = renderToStaticMarkup(<SearchPage locale={locale} query="" />);
    const noResult = renderToStaticMarkup(<SearchPage locale={locale} query="not-a-place" />);
    assert.doesNotMatch(empty, />0</);
    assert.match(noResult, /–/);
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
