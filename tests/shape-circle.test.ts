import assert from "node:assert/strict";
import test from "node:test";

import {
  CIRCLE_RADII_KM,
  CIRCLE_VERTICES,
  CircleQueryError,
  DEFAULT_CIRCLE_RADIUS_KM,
  circlePolygon,
  circleResultHref,
  parseCircleQuery,
} from "../lib/shapes/circle";
import { MAX_SHAPE_BLOCKS, MAX_SHAPE_HECTARES, shapeCoverage } from "../lib/shapes/coverage";
import { tileForBlock } from "../lib/shapes/tiles";
import { MAX_SHAPE_TILES, MAX_SHAPE_VERTICES, handleShapeMeasure } from "../worker/shape";

/*
 * The area is measured independently of how the circle was built: each vertex
 * is put through the ellipsoidal cylindrical equal-area projection (GRS80),
 * whose plane area is the area on the ellipsoid, and the ring is closed with
 * the shoelace formula. A 64-sided polygon inscribed in a circle holds
 * 64/(2 pi) * sin(2 pi / 64), about 99.84%, of the circle's area.
 */
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const radians = (value: number) => (value * Math.PI) / 180;

function authalicQ(latitude: number): number {
  const sine = Math.sin(radians(latitude));
  return (1 - E2) * (sine / (1 - E2 * sine * sine) - (1 / (2 * E)) * Math.log((1 - E * sine) / (1 + E * sine)));
}

function ellipsoidAreaSquareMetres(ring: readonly { latitude: number; longitude: number }[]): number {
  const points = ring.map((point) => [A * radians(point.longitude), (A * authalicQ(point.latitude)) / 2] as const);
  let doubled = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubled) / 2;
}

test("a circle's polygon holds pi r squared within half a percent at three latitudes", () => {
  for (const latitude of [43, 55, 60]) {
    for (const radiusKm of CIRCLE_RADII_KM) {
      const ring = circlePolygon({ latitude, longitude: -100 }, radiusKm);
      const expected = Math.PI * (radiusKm * 1000) ** 2;
      const ratio = ellipsoidAreaSquareMetres(ring) / expected;
      assert.ok(Math.abs(ratio - 1) < 0.005, `${radiusKm} km at ${latitude}N is ${(ratio * 100).toFixed(3)}% of pi r squared`);
    }
  }
});

test("a 10 km circle at 55 north is as wide in metres as it is tall", () => {
  const ring = circlePolygon({ latitude: 55, longitude: -120 }, 10);
  const north = ring[0];
  const east = ring[CIRCLE_VERTICES / 4];
  const south = ring[CIRCLE_VERTICES / 2];
  const west = ring[(3 * CIRCLE_VERTICES) / 4];
  // In degrees the circle is squashed: it spans far more longitude than latitude.
  const widthDegrees = east.longitude - west.longitude;
  const heightDegrees = north.latitude - south.latitude;
  assert.ok(widthDegrees > 1.6 * heightDegrees, "the circle was built in degrees, not metres");
  assert.equal(north.longitude, -120);
  assert.ok(Math.abs(east.latitude - 55) < 1e-9);
});

test("every circle stays inside the shape endpoint's vertex, area, block and tile limits", async () => {
  for (const radiusKm of CIRCLE_RADII_KM) {
    const ring = circlePolygon({ latitude: 49.25, longitude: -123.1 }, radiusKm);
    assert.equal(ring.length, CIRCLE_VERTICES);
    assert.ok(ring.length <= MAX_SHAPE_VERTICES);
    const coverage = shapeCoverage(ring);
    assert.ok(coverage.areaHectares < MAX_SHAPE_HECTARES);
    assert.ok(coverage.blocks.length < MAX_SHAPE_BLOCKS);
    const tiles = new Set(coverage.blocks.map((block) => {
      const tile = tileForBlock(block.gx, block.gy);
      return `${tile.tileX},${tile.tileY}`;
    }));
    assert.ok(tiles.size <= MAX_SHAPE_TILES, `${tiles.size} tiles`);
  }
  // The endpoint itself takes the circle unchanged. No tile is served here,
  // so the answer is about acceptance, not about figures.
  const response = await handleShapeMeasure(
    new Request("https://example.test/api/shape/measure", {
      method: "POST",
      body: JSON.stringify({ points: circlePolygon({ latitude: 55, longitude: -122 }, 25), startYear: 2000, endYear: 2022 }),
    }),
    { COARSE_GRID_BASE: "https://grid.example.test/" },
    { fetch: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch },
  );
  assert.equal(response.status, 200);
});

test("the result link carries only a rounded centre and a radius", () => {
  assert.equal(
    circleResultHref("en", { latitude: 49.282729, longitude: -123.120738, radiusKm: 10 }),
    "/en/explore/draw?shape=circle&lat=49.283&lon=-123.121&r=10",
  );
  assert.equal(
    circleResultHref("fr", { latitude: 46.8139, longitude: -71.208, radiusKm: 25 }),
    "/fr/explorer/dessiner?shape=circle&lat=46.814&lon=-71.208&r=25",
  );
});

test("the result link builder refuses address text in any form", () => {
  const address = "24 Sussex Drive, Ottawa";
  const refusals: unknown[] = [
    address,
    { latitude: 45.444, longitude: -75.694, radiusKm: 10, label: address },
    { latitude: 45.444, longitude: -75.694, radiusKm: 10, query: address },
    { latitude: address, longitude: -75.694, radiusKm: 10 },
    { latitude: 45.444, longitude: address, radiusKm: 10 },
    { latitude: "45.444", longitude: "-75.694", radiusKm: 10 },
    { latitude: 45.444, longitude: -75.694, radiusKm: "10" },
    { latitude: 45.444, longitude: -75.694, radiusKm: 7 },
    { latitude: 45.444, longitude: -75.694 },
    [45.444, -75.694, 10],
    null,
  ];
  for (const input of refusals) {
    assert.throws(() => circleResultHref("en", input), CircleQueryError, JSON.stringify(input));
  }
});

test("a circle is read back from the page address as numbers or not at all", () => {
  assert.deepEqual(parseCircleQuery({ shape: "circle", lat: "49.2827", lon: "-123.1207", r: "25" }), {
    centre: { latitude: 49.283, longitude: -123.121 },
    radiusKm: 25,
  });
  assert.deepEqual(parseCircleQuery({ shape: "circle" }), { centre: null, radiusKm: DEFAULT_CIRCLE_RADIUS_KM });
  assert.deepEqual(parseCircleQuery({ shape: "circle", lat: "24 Sussex Drive", lon: "-75.7", r: "7" }), {
    centre: null,
    radiusKm: DEFAULT_CIRCLE_RADIUS_KM,
  });
  assert.equal(parseCircleQuery({ shape: "rectangle", lat: "45", lon: "-75" }), null);
  assert.equal(parseCircleQuery({}), null);
});
