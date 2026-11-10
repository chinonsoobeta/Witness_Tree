import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { RecordPlacePage } from "../components/places/RecordPlacePage.tsx";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PLACE_DATA_VERSION, placePageParams, placePageRecord } from "../lib/place-pages/index.ts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { mapHash, placeMapView } from "../lib/place-pages/map-view.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url));
const extents = JSON.parse(read("data/place-extents.json").toString("utf8"));
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("the map hash is #map=<zoom>/<lat>/<lng> with two and four decimals, centred on the box", () => {
  const view = placeMapView([-125.4913, 49.9017, -125.1946, 50.1161]);
  assert.ok(Math.abs(view.longitude - -125.34295) < 1e-9);
  assert.ok(view.latitude > 49.9017 && view.latitude < 50.1161);
  assert.ok(view.zoom > 9 && view.zoom < 11, String(view.zoom));
  assert.equal(mapHash(view), "#map=10.10/50.0090/-125.3430");
  assert.match(mapHash(placeMapView([-139.0523, 50.9655, -123.3922, 60.0001])), /^#map=\d+\.\d{2}\/\d+\.\d{4}\/-\d+\.\d{4}$/);
  assert.equal(placeMapView([-75, 45, -75, 45]).zoom, 13, "a point opens at the closest zoom, not at infinity");
  assert.equal(placeMapView([-141, 41, -52, 84]).zoom, 2, "a box wider than the frame opens at the widest zoom");
  assert.throws(() => placeMapView([-70, 45, -75, 46]), /west, south, east, north/);
});

test("the extents record names its sources and builder by checksum and covers every page once", () => {
  assert.equal(extents.schema, "witness-tree/place-extents/1");
  assert.equal(extents.builtBy.path, "scripts/build-place-extents.mjs");
  assert.equal(extents.builtBy.sha256, sha256(read("scripts/build-place-extents.mjs")), "the record was built by this builder as checked in");
  assert.match(extents.builtOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(extents.claims, { measurement: false, admitted: false, released: false, productionEligible: false, externalAction: false });
  assert.equal(extents.sources.length, 7);
  for (const source of extents.sources) {
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(source.featuresUsed > 0 && source.featuresUsed <= source.features, source.path);
  }
  const params = placePageParams();
  assert.equal(extents.places, params.length);
  assert.equal(Object.keys(extents.extents).length, params.length);
  for (const { dataVersion, geography, code } of params) {
    const box = placePageRecord(dataVersion, geography, code)!.extent;
    assert.deepEqual(box, extents.extents[`${geography}/${code}`]);
    const [west, south, east, north] = box;
    assert.ok(west >= -141 && east <= -52 && south >= 41 && north <= 84 && west < east && south < north, `${geography}/${code}: ${box}`);
  }
});

test("each page has a map that starts as a plain link and opens Explore on the place", () => {
  for (const [geography, code, locale, overlay, featureId] of [
    ["csd-2021", "5924034", "en", "census-subdivisions", "CA-5924034"],
    ["federal-2023", "59031", "fr", "federal-ridings", "CA-59031"],
    ["on-2022", "1", "en", "provincial-ridings", "ON-1"],
    ["er-2021", "5950", "fr", "economic-regions", "CA-2021S05005950"],
  ] as const) {
    const record = placePageRecord(PLACE_DATA_VERSION, geography, code)!;
    assert.equal(record.mapFeatureId, featureId);
    const html = renderToStaticMarkup(<RecordPlacePage record={record} locale={locale} />);
    assert.match(html, /<figure class="place-map" data-state="static">/, "server markup is the no-script state");
    const href = `${locale === "en" ? "/en/explore" : "/fr/explorer"}?overlays=${overlay}&amp;from=1984&amp;year=2022${mapHash(placeMapView(record.extent))}`;
    assert.ok(html.includes(`<a href="${href}">${locale === "en" ? "Open this place on the Explore map" : "Ouvrir ce lieu sur la carte Explorer"}</a>`), `${geography}/${code} links to ${href}`);
    assert.equal((html.match(/\/explor(e|er)\?overlays=/g) ?? []).length, 1, "one Explore link, the map's");
    assert.doesNotMatch(html, /See it on the Explore map|Voir sur la carte Explorer/);
  }
});

test("the map is a client component that loads the map library only when it is reached", () => {
  const source = read("components/places/PlaceMap.tsx").toString("utf8");
  assert.match(source, /^"use client";/);
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /import\("maplibre-gl"\)/);
  assert.doesNotMatch(source, /^import (?!type )[^\n]*from "(maplibre-gl|pmtiles)"/m, "no eager import of the library");
  assert.doesNotMatch(source, /from "[^"]*components\/explore/, "does not import Explore's map");
});
