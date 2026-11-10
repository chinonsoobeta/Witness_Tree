import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import overlayRelease from "../data/census-subdivision-overlay-release.json";
import { EXPLORE_COVERAGE_SPAN } from "../lib/explore";
import { boundaryPlacePagePath, boundarySelectionKey } from "../lib/explore/place-links";
import { regionIntervalMeasurements } from "../lib/explore/region-intervals";
import { ridingIntervalMeasurements } from "../lib/explore/riding-intervals";
import { placePageCounts, placePageRecord, PLACE_DATA_VERSION } from "../lib/place-pages";
import { PLACE_NAME_INDEX } from "../lib/search/place-names";

// The address ends in /<data version>/<geography>/<code>; the record behind it must exist.
function recordBehind(path: string | null) {
  assert.ok(path, "a measured boundary has a page");
  const [, , , dataVersion, geography, code] = path.split("/");
  return placePageRecord(dataVersion, geography, decodeURIComponent(code));
}

test("every riding and region the map measures links to a real place page, in both languages", () => {
  const rows = [...ridingIntervalMeasurements(EXPLORE_COVERAGE_SPAN), ...regionIntervalMeasurements(EXPLORE_COVERAGE_SPAN)];
  const counts = placePageCounts();
  assert.equal(rows.length, counts["federal-riding"] + counts["provincial-riding"] + counts["economic-region"]);
  const kinds = { "federal-ridings": "federal-riding", "provincial-ridings": "provincial-riding", "economic-regions": "economic-region" } as const;
  for (const row of rows) {
    const en = boundaryPlacePagePath("en", row, true);
    const fr = boundaryPlacePagePath("fr", row, true);
    assert.equal(recordBehind(en)?.kind, kinds[row.overlay as keyof typeof kinds], boundarySelectionKey(row));
    assert.ok(en!.startsWith(`/en/places/${PLACE_DATA_VERSION}/`));
    assert.ok(fr!.startsWith(`/fr/lieux/${PLACE_DATA_VERSION}/`));
    assert.equal(recordBehind(fr), recordBehind(en));
  }
});

test("every city and town drawn on the map links to its page", () => {
  assert.equal(overlayRelease.tiles.featureCount, PLACE_NAME_INDEX.places.length);
  assert.equal(overlayRelease.figures.reduce((sum, file) => sum + file.placeCount, 0), placePageCounts().community);
  for (const place of PLACE_NAME_INDEX.places) {
    const record = recordBehind(boundaryPlacePagePath("en", { overlay: "census-subdivisions", boundaryId: `CA-${place.id}` }, true));
    assert.equal(record?.kind, "community", place.id);
  }
});

test("no link where there is no page", () => {
  // Watersheds are reference outlines only.
  assert.equal(boundaryPlacePagePath("en", { overlay: "watersheds", boundaryId: "CA-01" }, true), null);
  // A boundary the record does not measure, such as a federal riding outside the four provinces.
  assert.equal(boundaryPlacePagePath("en", { overlay: "federal-ridings", boundaryId: "CA-10001" }, false), null);
  assert.equal(placePageRecord(PLACE_DATA_VERSION, "federal-2023", "10001"), undefined);
  assert.equal(boundaryPlacePagePath("fr", { overlay: "census-subdivisions", boundaryId: "CA-5924034" }, false), null);
  // An id in a shape the tiles never carry.
  assert.equal(boundaryPlacePagePath("en", { overlay: "economic-regions", boundaryId: "CA-5910" }, true), null);
});

test("the pinned readout carries the link, and only for the pinned boundary", () => {
  const source = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
  assert.match(source, /const placePageHref = pinnedBoundary && activeBoundaryKey === boundarySelectionKey\(pinnedBoundary\)/);
  assert.match(source, /\? placeMeasurement !== null\s*: measuredBoundaryKeys\?\.has\(boundarySelectionKey\(pinnedBoundary\)\) \?\? false/);
  assert.match(source, /<a className="explore-map-place-link" href=\{placePageHref\}>\{text\[locale\]\.placePage\}<\/a>/);
  assert.match(source, /placePage: "Open this place’s page"/);
  assert.match(source, /placePage: "Ouvrir la page de ce lieu"/);
  const view = readFileSync(new URL("../components/explore/ExploreView.tsx", import.meta.url), "utf8");
  assert.match(view, /new Set\(ridingMeasurements\.map\(boundarySelectionKey\)\)/);
  assert.match(view, /measuredBoundaryKeys=\{measuredBoundaryKeys\}/);
});
