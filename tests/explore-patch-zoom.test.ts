import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * D4: "Zoom in to see the patches" stays in the chosen province, and the map
 * says where it went whenever that is not simply the map centre.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("D4: a chosen province keeps the zoom inside it; all four zoom as before", () => {
  const target = map.match(/const patchZoomTarget = [\s\S]*?\n\};/)?.[0] ?? "";
  assert.match(target, /if \(chosen\) return insideMapView\(chosen, centre\) \? \{ centre: \[centre\.lng, centre\.lat\], province: null, chosen: true \} : \{ centre: PATCH_FOCUS\[chosen\], province: chosen, chosen: true \};/);
  // With all four, the existing rule decides, and the province is named only
  // when the zoom went to one of its forest points rather than the centre.
  assert.match(target, /const target = patchZoomCentre\(centre\);/);
  assert.match(target, /views\.find\(\(view\) => PATCH_FOCUS\[view\] === target\) \?\? null/);
  assert.match(map, /const target = patchZoomTarget\(map\.getCenter\(\), focusRef\.current\);[\s\S]*?setPatchZoomNote\(target\);/);
});

test("D4: the note is a status line in both languages, cleared when the reader moves the map or picks a province", () => {
  assert.match(map, /patchZoomedCentre: "Zoomed in on the centre of the map\.",/);
  assert.match(map, /patchZoomedChosen: \(province: string\) => `Zoomed in on forest in \$\{province\}, the province you chose\.`,/);
  assert.match(map, /patchZoomedNearest: \(province: string\) => `Zoomed in on forest in \$\{province\}, the province nearest the centre of the map\.`,/);
  assert.match(map, /patchZoomedCentre: "Zoom sur le centre de la carte\.",/);
  assert.match(map, /patchZoomedChosen: \(province: string\) => `Zoom sur une zone forestière de la province choisie\\u202F: \$\{province\}\.`,/);
  assert.match(map, /patchZoomedNearest: \(province: string\) => `Zoom sur une zone forestière de la province la plus proche du centre de la carte\\u202F: \$\{province\}\.`,/);
  assert.match(map, /patchZoomNote && !patchZoomOffered \? \(\n\s+<p className="explore-map-patch-hint explore-map-patch-note" role="status">/);
  assert.match(map, /boundaryJurisdiction\(locale, patchZoomNote\.province\.toUpperCase\(\)\)/);
  assert.match(map, /readerMovedRef\.current = true;\n\s+setPatchZoomNote\(null\);/);
  assert.match(map, /onProvinceChange\?\.\(mapView\);\n\s+setPatchZoomNote\(null\);/);
});
