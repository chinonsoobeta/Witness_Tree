import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BOUNDARY_OVERLAYS } from "../lib/explore/boundaries";
import { EXPLORE_MAP_COLOURS } from "../lib/explore/map-style";

/*
 * F2 of the 2026-11-10 review: every boundary outline has a light casing
 * drawn under it, so a dark line reads on the darkest loss class as well as
 * on the light ground.
 */

const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test("each outline gets a casing layer, drawn after the fills and before the lines", () => {
  const casing = map.indexOf("id: `${sourceId}-casing`");
  const fill = map.indexOf("id: `${sourceId}-fill`");
  const line = map.indexOf("id: `${sourceId}-line`");
  assert.ok(casing > 0 && fill > 0 && line > 0);
  assert.ok(fill < casing && casing < line, "fills, then casings, then lines");
  // The casing is wider than the line at every zoom stop.
  assert.match(map, /"line-color": BOUNDARY_CASING_COLOUR,\n\s*"line-width": \["interpolate", \["linear"\], \["zoom"\], 0, 1\.6, 5, 2\.2, 10, 3\.6\]/);
  assert.match(map, /"line-width": \["interpolate", \["linear"\], \["zoom"\], 0, 0\.4, 5, 0\.7, 10, 1\.4\]/);
});

test("the casing is light against the darkest class, and every outline colour reads on it", () => {
  const colour = map.match(/const BOUNDARY_CASING_COLOUR = "(#[0-9a-f]{6})";/)?.[1];
  assert.ok(colour);
  assert.ok(contrast(colour, EXPLORE_MAP_COLOURS.loss4) >= 7, "casing on the darkest class");
  assert.ok(contrast(colour, EXPLORE_MAP_COLOURS.loss3) >= 4.5, "casing on the second-darkest class");
  for (const overlay of Object.values(BOUNDARY_OVERLAYS)) {
    const line = overlay.colour ?? EXPLORE_MAP_COLOURS.ink;
    assert.ok(contrast(line, colour) >= 4.5, `${overlay.id} line on its casing`);
  }
});
