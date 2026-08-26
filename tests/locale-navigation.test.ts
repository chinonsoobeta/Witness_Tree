import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

/** Every page route under app/, as a URL path, so the map cannot drift from the routes that exist. */
function readdirRoutes(dir: URL, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "page.tsx" && prefix) out.push(prefix);
    else if (entry.isDirectory()) out.push(...readdirRoutes(new URL(`${entry.name}/`, dir), `${prefix}/${entry.name}`));
  }
  return out;
}
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

test("every route in the app has a counterpart, so a new page cannot silently fall back to the home page", () => {
  const routes = readdirRoutes(new URL("../app/", import.meta.url));
  assert.equal(routes.length > 30, true, `Expected the full route set, found ${routes.length}.`);
  for (const route of routes) {
    const locale = route.startsWith("/fr") ? "fr" : "en";
    const other = locale === "en" ? "fr" : "en";
    const counterpart = localeCounterpart(route.replace("[placeId]", "sample").replace("[locationId]", "sample"), locale);
    // The bare locale home is the helper's fallback for an unmapped route, so a page that maps to it
    // is indistinguishable from one that is missing. Only the home page itself may return it.
    assert.equal(counterpart === `/${other}`, route === `/${locale}`, `Route ${route} has no counterpart of its own.`);
    // A counterpart must be a real route, and it must map back, or the switch is a one-way trip.
    const back = localeCounterpart(counterpart, other);
    assert.equal(back, route.replace("[placeId]", "sample").replace("[locationId]", "sample"), `Route ${route} does not round-trip.`);
  }
});

test("the language switch is an island, so the header is not shipped to the browser to compute one href", () => {
  const header = readFileSync(new URL("../components/site/SiteHeader.tsx", import.meta.url), "utf8");
  const island = readFileSync(new URL("../components/site/LocaleLink.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(header, /"use client"/);
  assert.match(island, /^"use client";/);
  // useSearchParams suspends during static rendering. Without the boundary every page using this
  // header would opt into client rendering.
  assert.match(header, /<Suspense fallback=/);
});
