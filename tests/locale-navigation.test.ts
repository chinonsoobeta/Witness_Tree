import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node test runner needs extensions.
import { localeCounterpart, localeHref } from "../lib/locale-navigation.ts";

test("maps static and dynamic routes to their locale counterpart", () => {
  assert.equal(localeCounterpart("/en/search", "en"), "/fr/recherche");
  assert.equal(localeCounterpart("/fr/methodes", "fr"), "/en/methods");
  assert.equal(localeCounterpart("/en/places/example", "en"), "/fr/lieux/example");
  assert.equal(localeCounterpart("/fr/emplacement/example", "fr"), "/en/location/example");
});

test("preserves only safe query parameters on locale changes", () => {
  const query = new URLSearchParams("q=cedar&view=table&redirect=https%3A%2F%2Fevil.example");
  assert.equal(localeHref("/en/search", query, "en"), "/fr/recherche?q=cedar&view=table");
});

test("shared navigation exposes localized search and dynamic pages publish record-specific alternates", () => {
  const header = readFileSync(new URL("../components/site/SiteHeader.tsx", import.meta.url), "utf8");
  const placeRoute = readFileSync(new URL("../app/en/places/[placeId]/page.tsx", import.meta.url), "utf8");
  const locationRoute = readFileSync(new URL("../app/fr/emplacement/[locationId]/page.tsx", import.meta.url), "utf8");
  assert.match(header, /\["Search", "\/en\/search"\]/);
  assert.match(header, /\["Recherche", "\/fr\/recherche"\]/);
  assert.match(placeRoute, /\/en\/places\/\$\{placeId\}/);
  assert.match(placeRoute, /\/fr\/lieux\/\$\{placeId\}/);
  assert.match(locationRoute, /\/en\/location\/\$\{locationId\}/);
  assert.match(locationRoute, /\/fr\/emplacement\/\$\{locationId\}/);
});
