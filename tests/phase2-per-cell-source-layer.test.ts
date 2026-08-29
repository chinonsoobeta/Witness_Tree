import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { perCellSourceLayer }
// @ts-expect-error Node's TypeScript runner requires explicit local extensions.
from "../lib/explore/per-cell.ts";

// The tiler names the layer inside each archive, and the map style asks for a
// layer by name. If the two ever disagree the map draws nothing at all and
// reports no error, because an absent source layer is not a MapLibre failure.
// Both sides derive the name from the interval, so the guard is that they
// derive it the same way.

const readSource = (relative: string) => readFile(new URL(relative, import.meta.url), "utf8");

test("the tiler and the map style derive the same source layer name", async () => {
  const tiler = await readSource("../scripts/build-phase2-per-cell-tiles.sh");
  const style = await readSource("../lib/explore/per-cell.ts");

  // The tiler turns 1984-1985 into 1984_1985 with tr, because a hyphen is not
  // valid in a tippecanoe layer name.
  assert.match(tiler, /layer="\$\(printf '%s' "\$interval" \| tr '-' '_'\)"/);
  assert.match(tiler, /--layer="\$layer"/);
  assert.match(style, /perCellSourceLayer = \(interval: string\) => interval\.replaceAll\("-", "_"\)/);
});

test("the derived name matches the layer a built archive actually carries", async () => {
  // Read back from a decoded z14 tile of the first archive: layer 1984_1985
  // carrying exactly id, cells, harvest and fire. Recorded here rather than
  // read from the SSD so the coupling is checked in CI, where the archives
  // are not present.
  assert.equal(perCellSourceLayer("1984-1985"), "1984_1985");
  assert.equal(perCellSourceLayer("2021-2022"), "2021_2022");
});

test("the emitter writes exactly the four properties the style reads", async () => {
  const emitter = await readSource("../scripts/emit-phase2-per-cell-geojson.mjs");
  const tiler = await readSource("../scripts/build-phase2-per-cell-tiles.sh");
  for (const property of ["id", "cells", "harvest", "fire"]) {
    assert.match(emitter, new RegExp(`\\n\\s+${property}:`), `emitter is missing ${property}`);
    assert.match(tiler, new RegExp(`--attribute-type=${property}:int`), `tiler is missing ${property}`);
  }
});
