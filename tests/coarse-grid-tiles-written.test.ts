import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { COARSE_GRID_TILES_WRITTEN } from "../lib/shapes/tiles-written";

const record = JSON.parse(readFileSync(new URL("../data/phase6-coarse-grid-tiles.json", import.meta.url), "utf8")) as {
  tilesWritten: number;
  tiles: { tileX: number; tileY: number; file: string }[];
};

test("the written-tile set is exactly the tiles the grid record lists", () => {
  const expected = new Set(record.tiles.map((tile) => `${tile.tileY}-${tile.tileX}`));
  assert.equal(COARSE_GRID_TILES_WRITTEN.size, record.tilesWritten);
  assert.deepEqual([...COARSE_GRID_TILES_WRITTEN].sort(), [...expected].sort());
});
