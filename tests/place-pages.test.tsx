import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { LOCATIONS, PLACE_TYPES, PLACES } from "../lib/places/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PlacePage } from "../components/places/PlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { LocationResult } from "../components/places/LocationResult.tsx";

test("illustrative fixtures cover all place types and provinces", () => {
  assert.deepEqual(new Set(PLACES.map((place) => place.type)), new Set(PLACE_TYPES));
  assert.deepEqual(new Set(PLACES.map((place) => place.province)), new Set(["BC", "AB", "ON", "QC"]));
  assert.ok(PLACES.every((place) => place.status === "example"));
});

test("all fixture locale fields and coverage shares are complete", () => {
  assert.equal(PLACES.filter((place) => Boolean(place.name.en)).length, PLACES.filter((place) => Boolean(place.name.fr)).length);
  assert.ok(PLACES.every((place) => Math.abs(place.coverage.reduce((total, item) => total + item.share, 0) - 1) < 0.001));
});

test("annual summaries retain event identifiers and locations are newest first", () => {
  assert.ok(PLACES.every((place) => place.annual.every((summary) => summary.eventIds.every((id) => place.events.some((event) => event.id === id)))));
  assert.ok(LOCATIONS.every((location) => location.events.every((event, index, events) => index === 0 || events[index - 1].year >= event.year)));
});

test("unknown reported values remain non-numeric and routes implement table views", () => {
  assert.ok(PLACES.every((place) => place.stats.some((stat) => stat.kind === "unknown" && !("value" in stat))));
  const route = readFileSync(new URL("../app/en/places/[placeId]/page.tsx", import.meta.url), "utf8");
  assert.match(route, /generateStaticParams\(\)/);
  assert.match(route, /query\.view === "table" \? "table" : "chart"/);
});

test("server markup includes provenance without requiring client code", () => {
  const placePage = readFileSync(new URL("../components/places/PlacePage.tsx", import.meta.url), "utf8");
  const locationResult = readFileSync(new URL("../components/places/LocationResult.tsx", import.meta.url), "utf8");
  assert.match(placePage, /<ReportedValue/);
  assert.match(locationResult, /<ProvenanceBlock/);
});

test("place coverage uses reader labels and confidence reasons are labelled honestly", () => {
  const place = PLACES[0];
  const location = LOCATIONS[0];
  assert.ok(place && location);
  const placeMarkup = renderToStaticMarkup(
    <PlacePage locale="en" place={place} view="chart" />,
  );
  assert.match(placeMarkup, /National baseline: 70%/);
  assert.match(placeMarkup, /National baseline plus local context: 30%/);
  assert.doesNotMatch(placeMarkup, /national-baseline(?:-plus-local-context)?:/);

  const locationMarkup = renderToStaticMarkup(
    <LocationResult locale="en" location={location} places={[place]} />,
  );
  assert.match(locationMarkup, /Why this confidence:/);
  assert.doesNotMatch(locationMarkup, />Limitation:/);
});

test("localized routes use the shared shell and consistent main landmark", () => {
  const routePaths = ["../app/en/places/[placeId]/page.tsx", "../app/fr/lieux/[placeId]/page.tsx", "../app/en/location/[locationId]/page.tsx", "../app/fr/emplacement/[locationId]/page.tsx"];
  for (const path of routePaths) {
    const route = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(route, /SiteShell/);
    assert.match(route, /alternates: \{ languages:/);
  }
  for (const path of ["../components/places/PlacePage.tsx", "../components/places/LocationResult.tsx"]) {
    assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /<main id="main" className="page-wrap[ "]/);
  }
});

test("annual table has a caption and scoped column headers", () => {
  const chart = readFileSync(new URL("../components/places/AnnualChangeChart.tsx", import.meta.url), "utf8");
  assert.match(chart, /<caption>\{title\}<\/caption>/);
  assert.equal((chart.match(/<th scope="col">/g) ?? []).length, 3);
});
