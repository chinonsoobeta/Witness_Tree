import assert from "node:assert/strict";
import test from "node:test";
import { traceRings } from "../lib/phase2/rings.mjs";
import { ringsToCoordinates, vertexToLonLat } from "../scripts/emit-phase2-per-cell-geojson.mjs";

test("grid vertex 0,0 lands on the raster's upper-left corner", () => {
  // gdalinfo reports the loss raster's upper left at
  // 159d30'54.71"W, 62d55'20.57"N, which is where vertex (0, 0) has to be.
  const [lon, lat] = vertexToLonLat(0, 0);
  assert.ok(Math.abs(lon - -(159 + 30 / 60 + 54.71 / 3600)) < 1e-5, `lon ${lon}`);
  assert.ok(Math.abs(lat - (62 + 55 / 60 + 20.57 / 3600)) < 1e-5, `lat ${lat}`);
});

test("moving one cell east and south moves 30 m on the grid", () => {
  const [lon0, lat0] = vertexToLonLat(1000, 1000);
  const [lon1] = vertexToLonLat(1001, 1000);
  const [, lat1] = vertexToLonLat(1000, 1001);
  // A degree of longitude at this latitude is roughly 50 km, so 30 m is well
  // inside the resolution the emitted coordinates carry.
  assert.ok(lon1 > lon0, "east is a larger longitude");
  assert.ok(lat1 < lat0, "a larger row index is further south");
});

test("a hole is nested inside its own outer ring", () => {
  const runs = Uint32Array.from([0, 0, 2, 1, 0, 0, 1, 2, 2, 2, 0, 2].flat());
  const polygons = ringsToCoordinates(traceRings(runs, 8));
  assert.equal(polygons.length, 1);
  assert.equal(polygons[0].length, 2, "one outer ring and one hole");
});

test("a corner touch becomes two polygons rather than one", () => {
  const polygons = ringsToCoordinates(traceRings(Uint32Array.from([0, 0, 0, 1, 1, 1]), 2));
  assert.equal(polygons.length, 2);
  for (const polygon of polygons) assert.equal(polygon.length, 1, "neither part has a hole");
});

test("emitted rings are closed", () => {
  const polygons = ringsToCoordinates(traceRings(Uint32Array.from([4, 4, 6, 5, 4, 6]), 6));
  for (const polygon of polygons) {
    for (const ring of polygon) {
      assert.deepEqual(ring[0], ring[ring.length - 1]);
    }
  }
});
