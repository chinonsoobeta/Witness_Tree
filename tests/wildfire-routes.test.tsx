import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WildfireView }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../components/wildfire/WildfireView.tsx";

const officialDestinations = [
  ["BC Wildfire Service", "https://wildfiresituation.nrs.gov.bc.ca/map"],
  ["Alberta Wildfire", "https://www.alberta.ca/wildfire-status"],
  ["Ontario Aviation, Forest Fire and Emergency Services", "https://www.ontario.ca/page/forest-fires"],
  ["Société de protection des forêts contre le feu (SOPFEU)", "https://www.sopfeu.qc.ca/en/map/"],
] as const;

const requiredSafetyFields = [
  "Source updated",
  "Last successful",
  "Source agency",
  "Next scheduled refresh",
  "Official emergency information",
] as const;

export function validateWildfireRouteSource(source: string) {
  for (const field of requiredSafetyFields) {
    if (!source.includes(field)) throw new Error(`Missing wildfire field: ${field}`);
  }
}

test("the public wildfire page is an agency directory, not a product feed", () => {
  const english = renderToStaticMarkup(<WildfireView locale="en" />);
  assert.match(english, /does not publish a live wildfire feed/);
  assert.match(english, /call 911/);
  for (const [agency, url] of officialDestinations) {
    assert.ok(english.includes(agency));
    assert.ok(english.includes(url));
  }
  validateWildfireRouteSource(english);
  assert.match(english, /Unavailable; no live feed is connected/);
  assert.match(english, /None; no live refresh has run/);
  assert.match(english, /Not scheduled/);
  for (const fixtureField of [
    "Illustrative Provincial Wildfire Agency",
    "Illustrative fixture",
    "Illustrative derived estimate",
  ]) {
    assert.doesNotMatch(english, new RegExp(fixtureField));
  }
});

test("removing a required safety field fails the blocking validator", () => {
  assert.throws(
    () => validateWildfireRouteSource(requiredSafetyFields.slice(0, -1).join(" ")),
    /Official emergency information/,
  );
});

test("the French directory uses the official French destinations where available", () => {
  const french = renderToStaticMarkup(<WildfireView locale="fr" />);
  assert.match(french, /ne publie pas de flux en direct/);
  assert.match(french, /composez le 911/);
  assert.match(french, /Services d’urgence, d’aviation et de lutte contre les feux de forêt de l’Ontario/);
  assert.match(french, /https:\/\/www\.ontario\.ca\/fr\/page\/incendies-de-foret/);
  assert.match(french, /https:\/\/www\.sopfeu\.qc\.ca\/carte\//);
});

test("locale routes no longer import or pass the illustrative feed", async () => {
  const routes = await Promise.all([
    readFile(new URL("../app/en/wildfire/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/fr/incendies/page.tsx", import.meta.url), "utf8"),
  ]);
  for (const route of routes) {
    assert.doesNotMatch(route, /ILLUSTRATIVE_WILDFIRE_FEED|feed=/);
    assert.match(route, /<WildfireView locale=/);
  }
});
