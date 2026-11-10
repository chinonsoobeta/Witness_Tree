import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * D6: the region and province shading fades under the loss patches as they
 * appear, so the grey "neither recorded" patches show; the hatching for land
 * with no data does not fade.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("D6: the fade runs from the patch archive's first zoom to just past readable, keeping a quarter", () => {
  assert.match(map, /const PATCH_FADE_KEEP = 0\.25;/);
  assert.match(map, /"interpolate",\n\s+\["linear"\],\n\s+\["zoom"\],\n\s+EXPLORE_PER_CELL_LAYER\.minZoom,\n\s+opacity,\n\s+PATCH_READABLE_ZOOM \+ 0\.5,\n\s+opacity \* PATCH_FADE_KEEP,/);
});

test("D6: the fade follows the patch layer, and is whole again where no patches are drawn", () => {
  const swap = map.match(/function swapPerCellLayer\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(swap, /map\.setPaintProperty\(REGION_FILL_LAYER_ID, "fill-opacity", years \? patchFade\(1\) : 1\);/);
  assert.match(swap, /map\.setPaintProperty\(PROVINCE_FILL_LAYER_ID, "fill-opacity", years \? patchFade\(0\.88\) : 0\.88\);/);
  assert.ok(swap.indexOf("fill-opacity") < swap.indexOf("if (!years) return;"));
  // A style built with patches already in it fades the same way.
  assert.match(map, /"fill-opacity": patches \? patchFade\(1\) : 1,/);
  assert.match(map, /"fill-opacity": patches \? patchFade\(0\.88\) : 0\.88,/);
  // The hatching that marks a minimum is left as it was.
  const hatch = map.match(/id: REGION_HATCH_LAYER_ID,[\s\S]*?\n {2}\},/)?.[0] ?? "";
  assert.doesNotMatch(hatch, /opacity/);
});
