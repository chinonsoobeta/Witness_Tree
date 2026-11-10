import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { BOUNDARY_OVERLAYS } from "../lib/explore/boundaries.ts";

/*
 * F5: watershed lines have their own style, heavier and dash-dot, so they are
 * not mistaken for region or riding borders; the legend keys every outline
 * that is on with a sample of its line.
 */
const map = readFileSync(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");

test("F5: the watershed line is the only dash-dot and the only heavier line", () => {
  const styles = Object.values(BOUNDARY_OVERLAYS).map((overlay: { id: string; colour?: string; dash?: readonly number[]; weight?: number }) => ({
    id: overlay.id,
    style: JSON.stringify([overlay.colour, overlay.dash ?? null, overlay.weight ?? 1]),
  }));
  assert.equal(new Set(styles.map((entry) => entry.style)).size, styles.length, "every outline has its own style");
  assert.deepEqual([...(BOUNDARY_OVERLAYS.watersheds.dash ?? [])], [5, 2, 1, 2]);
  assert.equal(BOUNDARY_OVERLAYS.watersheds.weight, 1.8);
  for (const overlay of Object.values(BOUNDARY_OVERLAYS) as { id: string; dash?: readonly number[]; weight?: number }[]) {
    if (overlay.id === "watersheds") continue;
    assert.ok((overlay.dash?.length ?? 0) <= 2, `${overlay.id} is solid or a plain dash`);
    assert.equal(overlay.weight ?? 1, 1);
  }
});

test("F5: the key shows a sample line for each outline that is on, drawn as the map draws it", () => {
  const key = map.match(/<div className="explore-map-key-boundaries">[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(key, /\{overlays\.map\(\(id\) => \{/);
  assert.match(key, /const width = 1\.5 \* \(overlay\.weight \?\? 1\);/);
  assert.match(key, /stroke=\{overlay\.colour \?\? EXPLORE_MAP_COLOURS\.ink\}/);
  assert.match(key, /strokeDasharray=\{overlay\.dash \? overlay\.dash\.map\(\(part\) => part \* width\)\.join\(" "\) : undefined\}/);
  assert.match(key, /stroke=\{BOUNDARY_CASING_COLOUR\}/);
  assert.match(key, /aria-hidden="true"/);
  // The label stays as text beside the sample (tests/browser/fallback.spec.ts reads it).
  assert.match(key, /<\/svg>\n\s+\{overlay\.label\[locale\]\}/);
});
