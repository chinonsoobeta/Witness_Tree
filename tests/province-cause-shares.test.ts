import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { CAUSE_BREAKS, CAUSE_RAMPS, causeBand, provinceCauseColours, provinceCauseShares } from "../lib/explore/province-cause-shares.ts";

test("harvest and fire shades are per-year shares of the forest, so a span of any length reads on one scale", () => {
  const annual = provinceCauseShares("fire", 2021, 2022);
  // Ontario's 2022 fire rate is about twenty times Quebec's; both are real, both shade.
  assert.ok(annual["35"]! > annual["24"]! * 10);
  const whole = provinceCauseShares("harvest", 1984, 2022);
  for (const share of Object.values(whole)) assert.ok(share !== null && share > 0 && share < 1, "per-year harvest is a fraction of a percent");
});

test("the bands follow the published breaks, and a share that can't be computed gets no band", () => {
  assert.deepEqual([...CAUSE_BREAKS], [0.1, 0.25, 0.5, 1]);
  assert.equal(causeBand(0.05), 0);
  assert.equal(causeBand(0.1), 1);
  assert.equal(causeBand(0.3), 2);
  assert.equal(causeBand(0.99), 3);
  assert.equal(causeBand(1), 4);
  assert.equal(causeBand(null), null);
  assert.equal(causeBand(-1), null);
});

test("each province gets one colour from its cause's ramp", () => {
  for (const cause of ["harvest", "fire"] as const) {
    assert.equal(CAUSE_RAMPS[cause].length, 5);
    const colours = provinceCauseColours(cause, 2021, 2022);
    assert.deepEqual(Object.keys(colours).sort(), ["24", "35", "48", "59"]);
    for (const colour of Object.values(colours)) assert.ok(CAUSE_RAMPS[cause].includes(colour), colour);
  }
});

test("the map shades provinces in harvest and wildfire modes, with a legend on the same breaks", async () => {
  const map = await readFile(new URL("../components/explore/ExploreMapClient.tsx", import.meta.url), "utf8");
  assert.match(map, /mode === "recorded-harvest" \? "harvest" : mode === "wildfire" \? "fire" : null/);
  assert.match(map, /buildStyle\(shading, null, overlays/);
  assert.match(map, /provinceFillColour\(fromYear, year, shading\)/);
  assert.match(map, /causeLegendCaption: "Average share of the forest per year"/);
  assert.match(map, /causeLegendCaption: "Part moyenne de la forêt par année"/);
});
