import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { HomeSearch }
// @ts-expect-error Node test runner needs extensions.
from "../components/site/HomeSearch.tsx";
import { SearchSuggest }
// @ts-expect-error Node test runner needs extensions.
from "../components/search/SearchSuggest.tsx";

/*
 * The home field holds an empty submission and says why (audit 2026-10-28, UX 8).
 * The behaviour itself runs in the browser spec tests/browser/home-and-header.spec.ts;
 * this pins what the server sends: a live region that exists before its words do,
 * no `required` attribute, and the search page's own field left as it was.
 */
test("the home field carries an empty live region for its hint and is not `required`", () => {
  for (const locale of ["en", "fr"] as const) {
    const markup = renderToStaticMarkup(<HomeSearch locale={locale} />);
    assert.match(markup, /<p id="[^"]+-hint" class="search-suggest-hint" aria-live="polite"><\/p>/, locale);
    assert.doesNotMatch(markup, /\brequired\b/, locale);
    assert.doesNotMatch(markup, /aria-describedby/, locale);
  }
});

test("a search field without a hint renders no hint region", () => {
  const markup = renderToStaticMarkup(<SearchSuggest locale="en" action="/en/search" label="Search" submitLabel="Search" className="search-page-field" />);
  assert.doesNotMatch(markup, /search-suggest-hint/);
});
