import assert from "node:assert/strict";
import test from "node:test";

import { SEARCH_SUGGEST_PATH, handleSearchSuggest } from "../worker/search-suggest";
import { SUGGESTION_LIMITS, suggestSearch, type SuggestionPage } from "../lib/search/suggest";
import { searchSite } from "../lib/search/site-search";

const ask = (query: string, method = "GET") =>
  handleSearchSuggest(new Request(`https://example.invalid${SEARCH_SUGGEST_PATH}${query}`, { method }));

test("suggestions are the search page's own matches, grouped and trimmed", () => {
  const page = suggestSearch("Prince George", "en");
  const kinds = page.suggestions.map((suggestion) => suggestion.kind);
  assert.deepEqual(kinds, [...kinds].sort((a, b) => ["community", "riding", "province"].indexOf(a) - ["community", "riding", "province"].indexOf(b)));
  const full = searchSite("Prince George").results;
  for (const suggestion of page.suggestions) assert.ok(full.some((result) => result.id === suggestion.id && result.kind === suggestion.kind));
  for (const kind of ["community", "riding", "province"] as const) {
    assert.ok(page.suggestions.filter((suggestion) => suggestion.kind === kind).length <= SUGGESTION_LIMITS[kind]);
  }
  const city = page.suggestions.find((suggestion) => suggestion.kind === "community" && suggestion.name === "Prince George");
  assert.ok(city, "the city itself is suggested");
  assert.equal(city.figure, null, "a community spans ridings, so it carries no single figure");
  assert.match(city.meta, /in 5 ridings$/);
  const federal = city.ridings.filter((riding) => riding.level === "federal");
  assert.equal(federal.length, 2);
  for (const riding of federal) assert.match(riding.compareHref ?? "", /^\/en\/compare\?left=federal-/);
});

test("a riding without a complete figure never shows one, and Unknown is never zero", () => {
  for (const query of ["north", "lac", "saint", "river", "mont"]) {
    for (const suggestion of suggestSearch(query, "en").suggestions) {
      if (suggestion.figure === null) assert.doesNotMatch(suggestion.detail, /^0(\.0+)? ?%/);
      assert.doesNotMatch(suggestion.detail, /\b0 ha\b/);
    }
  }
});

test("French suggestions use French labels and French number formats", () => {
  const page = suggestSearch("Alberta", "fr");
  const province = page.suggestions.find((suggestion) => suggestion.kind === "province");
  assert.ok(province);
  assert.match(province.figure ?? "", /[\u00a0\u202f]%/);
  assert.match(province.detail, /Un minimum/);
});

test("the route answers a short query with nothing and refuses what it cannot answer", async () => {
  const short = await ask("?locale=en&q=a").json() as SuggestionPage;
  assert.deepEqual(short.suggestions, []);
  const response = ask("?locale=fr&q=Prince%20George");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /max-age/);
  const body = await response.json() as SuggestionPage;
  assert.deepEqual(body, JSON.parse(JSON.stringify(suggestSearch("Prince George", "fr"))));
  assert.equal(ask("?q=Prince").status, 400);
  assert.equal(ask(`?locale=en&q=${"x".repeat(101)}`).status, 400);
  assert.equal(ask("?locale=en&q=Prince", "POST").status, 405);
});
