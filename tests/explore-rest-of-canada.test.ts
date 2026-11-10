import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * D7: the other provinces are drawn faintly from the federal-riding tiles the
 * site already releases, so the four provinces do not float as islands. No
 * new source host; the territorial ridings, whose areas take in open water,
 * are left out so the land tone never shows sea as land.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
const style = map.match(/const buildStyle = \([\s\S]*?\n\};/)?.[0] ?? "";

test("D7: the land tone reuses the released federal-riding tiles, under everything but the ground", () => {
  assert.match(style, /const ridings = BOUNDARY_OVERLAYS\["federal-ridings"\];/);
  assert.match(style, /sources\[CANADA_LAND_SOURCE_ID\] = \{ type: "vector", url: `pmtiles:\/\/\$\{ridings\.url\}`/);
  assert.match(style, /"source-layer": ridings\.sourceLayer,/);
  const ground = style.indexOf('id: "ground"');
  const land = style.indexOf("id: CANADA_LAND_LAYER_ID");
  const provinces = style.indexOf("sources[EXPLORE_PRODUCTION_LAYER.sourceLayer]");
  assert.ok(ground > -1 && ground < land && land < provinces);
});

test("D7: one flat tone with no edges, and the three territorial ridings left out", () => {
  assert.match(map, /const TERRITORIAL_RIDING_IDS = \["CA-60001", "CA-61001", "CA-62001"\];/);
  assert.match(style, /filter: \["!", \["in", \["get", "id"\], \["literal", TERRITORIAL_RIDING_IDS\]\]\],/);
  assert.match(style, /paint: \{ "fill-color": CANADA_LAND_COLOUR, "fill-outline-color": CANADA_LAND_COLOUR \},/);
  // Its own source id, so the riding outline toggle cannot remove it.
  assert.match(map, /const CANADA_LAND_SOURCE_ID = "canada-land";/);
});
