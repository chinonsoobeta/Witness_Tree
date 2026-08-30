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
test("renders a bilingual Explore finder that preserves controls and labels illustrative results", () => {
  const parameters = [{ name: "mode", value: "forest-change" }, { name: "presentation", value: "list" }, { name: "data", value: "table" }, { name: "year", value: "2022" }];
  const en = renderToStaticMarkup(<PlaceFinder locale="en" query="alias de municipalite quebecoise" context="explore" parameters={parameters} />);
  const fr = renderToStaticMarkup(<PlaceFinder locale="fr" query="alias de municipalite quebecoise" context="explore" />);
  assert.match(en, /Find a district or place/);
  assert.match(en, /Illustrative directory only\. These results are not admitted measurements\./);
  assert.match(en, /name="mode" value="forest-change"/);
  assert.match(en, /name="presentation" value="list"/);
  assert.match(en, /href="\/en\/places\//);
  assert.match(fr, /Trouver une circonscription ou un lieu/);
  assert.match(fr, /Répertoire illustratif seulement\. Ces résultats ne sont pas des mesures admises\./);
  assert.match(fr, /href="\/fr\/lieux\//);
});
