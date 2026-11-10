import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * D8: in dark theme the map ground is dark. Only what lies outside the figures
 * follows the theme; the classes, hatching and outlines keep their printed
 * colours, the province outlines gain a light track, and exported images keep
 * the light ground under their light caption.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const apply = map.match(/function applyMapGround\([\s\S]*?\n\}/)?.[0] ?? "";

test("D8: the theme follows the reader's choice first, then the system, and is light on the server", () => {
  assert.match(map, /const chosen = document\.documentElement\.getAttribute\("data-theme"\);\n\s+if \(chosen === "light" \|\| chosen === "dark"\) return chosen;\n\s+return window\.matchMedia\(PREFERS_DARK\)\.matches \? "dark" : "light";/);
  assert.match(map, /const readServerMapTheme = \(\): MapTheme => "light";/);
  assert.match(map, /observer\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["data-theme"\] \}\);/);
  assert.match(map, /query\.addEventListener\("change", onChange\);/);
  assert.match(map, /const mapTheme = useSyncExternalStore\(subscribeMapTheme, readMapTheme, readServerMapTheme\);/);
  assert.match(map, /if \(mapReady && map\) applyMapGround\(map, mapTheme\);\n\s+\}, \[mapReady, mapTheme\]\);/);
});

test("D8: only the ground, the other land and the painted-out provinces change colour", () => {
  assert.match(map, /light: \{ ground: EXPLORE_MAP_COLOURS\.ground, land: CANADA_LAND_COLOUR \},/);
  assert.match(map, /dark: \{ ground: "#211e19", land: "#36322b" \},/);
  assert.match(apply, /map\.setPaintProperty\("ground", "background-color", ground\);/);
  assert.match(apply, /for \(const id of \[CANADA_LAND_LAYER_ID, PROVINCE_MASK_LAYER_ID\]\)/);
  for (const kept of ["REGION_FILL_LAYER_ID", "PROVINCE_FILL_LAYER_ID", "REGION_HATCH_LAYER_ID", "PROVINCE_OUTLINE_LAYER_ID"]) {
    assert.doesNotMatch(apply, new RegExp(kept));
  }
  // A province set aside is painted as the other land, not as a hole.
  assert.match(map, /paint: \{ "fill-color": CANADA_LAND_COLOUR, "fill-opacity": 1, "fill-outline-color": CANADA_LAND_COLOUR \},/);
});

test("D8: the province outlines get a light track in dark theme only, under the shading", () => {
  assert.match(apply, /map\.setLayoutProperty\(PROVINCE_CASING_LAYER_ID, "visibility", theme === "dark" \? "visible" : "none"\);/);
  const casing = map.match(/const provinceCasingLayer = [\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(casing, /layout: \{ visibility: "none" \},/);
  assert.match(casing, /"line-color": BOUNDARY_CASING_COLOUR/);
  const style = map.match(/const buildStyle = \([\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(style.indexOf("layers.push(provinceCasingLayer());") < style.indexOf("if (province) {"));
});

test("D8: exported images keep the light ground, and the still map follows the theme", () => {
  assert.match(map, /applyMapGround\(target, "light"\);\n\s+showTimelapseSpan\(/);
  assert.match(map, /<rect className="explore-map-fallback-ground"/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \.explore-map-fallback-ground \{\n {4}fill: #211e19;/);
  assert.match(css, /:root\[data-theme="dark"\] \.explore-map-fallback-ground \{\n {2}fill: #211e19;/);
  assert.match(css, /:root\[data-theme="dark"\] \.explore-map-fallback path \{\n {2}stroke: #f6f7f2;/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \.explore-map-fallback path \{\n {4}stroke: #f6f7f2;/);
});
