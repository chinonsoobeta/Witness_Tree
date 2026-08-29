import assert from "node:assert/strict";
import test from "node:test";
import { inverseLcc } from "../lib/phase2/lcc.mjs";

// Reference points produced by GDAL on the grid's own CRS:
//   gdaltransform -s_srs <grid.proj4> -t_srs EPSG:4269
// The tile writer transforms hundreds of millions of vertices with the JS
// implementation, so these pin it to GDAL rather than to itself.
//
// The target is EPSG:4269 (NAD83 lon/lat), which is the grid's own datum, not
// EPSG:4326. GDAL returns the same lon/lat for both on three of these four
// points and differs by under a metre on the fourth, which is two orders of
// magnitude below the 30 m cell this geometry is built from.
const REFERENCE = [
  [-2660910.524, 2998848.1105, -159.515196346849, 62.9223809043251],
  [0, 0, -95, 49],
  [3157169.476, -851351.89, -61.8820617498609, 34.3112266069301],
  [248129.476, 1073748.11, -90.5990267499469, 58.7162186542419],
];

test("inverseLcc agrees with gdaltransform on the grid reference points", () => {
  for (const [x, y, lon, lat] of REFERENCE) {
    const [gotLon, gotLat] = inverseLcc(x, y);
    // 1e-7 degrees is roughly a centimetre of latitude, far below the 30 m
    // cell this geometry is derived from.
    assert.ok(Math.abs(gotLon - lon) < 1e-7, `lon at ${x},${y}: ${gotLon} vs ${lon}`);
    assert.ok(Math.abs(gotLat - lat) < 1e-7, `lat at ${x},${y}: ${gotLat} vs ${lat}`);
  }
});

test("inverseLcc puts the projection origin on the central meridian", () => {
  const [lon, lat] = inverseLcc(0, 0);
  assert.ok(Math.abs(lon + 95) < 1e-4);
  assert.ok(Math.abs(lat - 49) < 1e-4);
});
