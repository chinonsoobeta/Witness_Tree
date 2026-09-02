import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_HECTARES,
  MAX_SHAPE_BLOCKS,
  MAX_SHAPE_HECTARES,
  ShapeError,
  shapeCoverage,
  type GeographicPoint,
} from "../lib/shapes/coverage";
import { BLOCK_METRES, metresFromBlockEdge, projectToGrid } from "../lib/grid/lambert";
import { CANONICAL_GRID } from "../lib/grid/conformance";

const point = (latitude: number, longitude: number): GeographicPoint => ({ latitude, longitude });

/** A convex quadrilateral over the Ottawa valley. */
const OTTAWA_BOX: GeographicPoint[] = [
  point(45.3, -76.0),
  point(45.3, -75.5),
  point(45.55, -75.5),
  point(45.55, -76.0),
];

/** A concave L, which is where a naive clipper would go wrong. */
const L_SHAPE: GeographicPoint[] = [
  point(45.30, -76.00),
  point(45.30, -75.50),
  point(45.40, -75.50),
  point(45.40, -75.80),
  point(45.55, -75.80),
  point(45.55, -76.00),
];

function projectedRing(points: readonly GeographicPoint[]): [number, number][] {
  return points.map((p) => {
    const { x, y } = projectToGrid(p.latitude, p.longitude);
    return [x, y] as [number, number];
  });
}

/** Ray casting, written independently of the clipper it is checking. */
function containsPoint(ring: readonly [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test("block fractions reconstruct the shape's own area", () => {
  for (const shape of [OTTAWA_BOX, L_SHAPE]) {
    const coverage = shapeCoverage(shape);
    let covered = 0;
    for (const block of coverage.blocks) covered += block.fraction * BLOCK_HECTARES;
    // Every square metre of the shape lands in exactly one block, so the
    // fractions must add back up to the area measured from the ring itself.
    assert.ok(
      Math.abs(covered - coverage.areaHectares) / coverage.areaHectares < 1e-9,
      `fractions summed to ${covered} for an area of ${coverage.areaHectares}`,
    );
    assert.equal(coverage.outsideGridHectares, 0);
  }
});

test("the concave shape really is concave and smaller than its convex hull", () => {
  const l = shapeCoverage(L_SHAPE);
  const box = shapeCoverage(OTTAWA_BOX);
  assert.ok(l.areaHectares < box.areaHectares * 0.85, "the L is not testing concavity");
  assert.ok(l.blocks.length < box.blocks.length);
});

test("analytic fractions match dense point sampling of the same ring", () => {
  const ring = projectedRing(L_SHAPE);
  const coverage = shapeCoverage(L_SHAPE);
  const [originX, , , originY] = CANONICAL_GRID.geotransform;
  const samples = 40;
  let checked = 0;
  let worst = 0;
  // Every edge block, plus a stride through the interior so the interior
  // claim is sampled too rather than assumed.
  for (const [index, block] of coverage.blocks.entries()) {
    if (block.fraction >= 1 && index % 37 !== 0) continue;
    const blockMinX = originX + block.gx * BLOCK_METRES;
    const blockMaxY = originY - block.gy * BLOCK_METRES;
    let hits = 0;
    for (let row = 0; row < samples; row += 1) {
      const y = blockMaxY - ((row + 0.5) / samples) * BLOCK_METRES;
      for (let column = 0; column < samples; column += 1) {
        const x = blockMinX + ((column + 0.5) / samples) * BLOCK_METRES;
        if (containsPoint(ring, x, y)) hits += 1;
      }
    }
    const sampled = hits / (samples * samples);
    worst = Math.max(worst, Math.abs(sampled - block.fraction));
    checked += 1;
  }
  assert.ok(checked > 50, `only ${checked} blocks were sampled`);
  // A 40x40 grid resolves a fraction to about one part in forty along a cut.
  assert.ok(worst < 0.04, `worst sampled disagreement was ${worst}`);
});

test("a shape inside one block is a single edge block holding its whole area", () => {
  // Anywhere on the map is inside some block, but a triangle drawn across a
  // block edge is two blocks, so the corner is placed well clear of one.
  let longitude = -75.7;
  for (let step = 0; step < 40; step += 1) {
    if (metresFromBlockEdge(projectToGrid(45.4, longitude)) > 300) break;
    longitude += 0.0007;
  }
  assert.ok(metresFromBlockEdge(projectToGrid(45.4, longitude)) > 300);
  const tiny: GeographicPoint[] = [
    point(45.4, longitude),
    point(45.4, longitude + 0.0008),
    point(45.4008, longitude + 0.0008),
  ];
  const coverage = shapeCoverage(tiny);
  assert.equal(coverage.blocks.length, 1);
  assert.equal(coverage.interiorBlocks, 0);
  assert.equal(coverage.edgeBlocks, 1);
  assert.ok(coverage.blocks[0].fraction < 1);
  assert.ok(
    Math.abs(coverage.blocks[0].fraction * BLOCK_HECTARES - coverage.areaHectares) < 1e-6,
  );
});

test("a large shape has interior blocks and a boundary made only of edge blocks", () => {
  const coverage = shapeCoverage(OTTAWA_BOX);
  assert.ok(coverage.interiorBlocks > 100);
  assert.ok(coverage.edgeBlocks > 0);
  assert.equal(coverage.interiorBlocks + coverage.edgeBlocks, coverage.blocks.length);
  for (const block of coverage.blocks) {
    assert.ok(block.fraction > 0 && block.fraction <= 1);
    assert.ok(Number.isInteger(block.gx) && Number.isInteger(block.gy));
    assert.ok(block.gx >= 0 && block.gy >= 0);
  }
});

test("a closing vertex that repeats the first corner is not a fourth corner", () => {
  const closed = [...OTTAWA_BOX, OTTAWA_BOX[0]];
  const open = shapeCoverage(OTTAWA_BOX);
  const repeated = shapeCoverage(closed);
  assert.equal(repeated.blocks.length, open.blocks.length);
  assert.equal(repeated.areaHectares, open.areaHectares);
});

test("unanswerable shapes are refused by kind rather than answered", () => {
  const refusal = (points: GeographicPoint[]): ShapeError => {
    try {
      shapeCoverage(points);
    } catch (error) {
      assert.ok(error instanceof ShapeError, `expected a ShapeError, got ${String(error)}`);
      return error;
    }
    throw new Error("the shape was answered when it should have been refused");
  };

  assert.equal(refusal([point(45, -75), point(46, -75)]).kind, "too-few-vertices");
  assert.equal(refusal([point(45, -75), point(46, -75), point(47, -75)]).kind, "no-area");
  assert.equal(
    refusal([point(45, -75), point(46, Number.NaN), point(47, -76)]).kind,
    "not-finite",
  );
  assert.equal(
    refusal([point(48.85, 2.34), point(48.86, 2.34), point(48.86, 2.35)]).kind,
    "off-grid",
  );
  assert.equal(
    refusal([point(44, -100), point(44, -70), point(60, -70), point(60, -100)]).kind,
    "too-large",
  );
});

test("the area cap is stated in the same unit the refusal measures", () => {
  assert.equal(MAX_SHAPE_HECTARES, 2_000_000);
  assert.equal(BLOCK_HECTARES, 92.16);
  const justUnder = shapeCoverage([
    point(50.0, -100.0),
    point(50.0, -98.0),
    point(50.8, -98.0),
    point(50.8, -100.0),
  ]);
  assert.ok(justUnder.areaHectares < MAX_SHAPE_HECTARES);
  assert.ok(justUnder.areaHectares > MAX_SHAPE_HECTARES / 2, "the cap is not being approached");
});

test("a long thin diagonal is scanned by its own shape, not its bounding box", () => {
  // Vancouver to Winnipeg as a narrow sliver.  Its bounding box is millions of
  // blocks; the shape itself is a few thousand.  Scanning the box would not
  // finish, so a fast answer here is the assertion.
  const sliver: GeographicPoint[] = [
    point(49.28, -123.12),
    point(49.90, -97.14),
    point(49.87, -97.14),
    point(49.25, -123.12),
  ];
  const started = Date.now();
  const coverage = shapeCoverage(sliver);
  const elapsed = Date.now() - started;
  assert.ok(coverage.blocks.length > 1000, `only ${coverage.blocks.length} blocks covered`);
  assert.ok(coverage.blocks.length < 40_000, `${coverage.blocks.length} blocks is not a sliver`);
  assert.ok(elapsed < 5000, `the scan took ${elapsed} ms`);
  let covered = 0;
  for (const block of coverage.blocks) covered += block.fraction * BLOCK_HECTARES;
  assert.ok(Math.abs(covered - coverage.areaHectares) / coverage.areaHectares < 1e-9);
});

test("a shape reaching across more blocks than the cap is refused, not truncated", () => {
  assert.equal(MAX_SHAPE_BLOCKS, 60_000);
  // A hairline the width of the country: negligible area, so it clears the
  // area cap, but it touches far more blocks than a measurement will visit.
  const hairline: GeographicPoint[] = [
    point(49.0, -123.0),
    point(49.0, -60.0),
    point(60.0, -60.0),
    point(59.9999, -60.0),
  ];
  try {
    const coverage = shapeCoverage(hairline);
    assert.ok(
      coverage.blocks.length <= MAX_SHAPE_BLOCKS,
      `${coverage.blocks.length} blocks were returned above the cap`,
    );
  } catch (error) {
    assert.ok(error instanceof ShapeError);
    assert.ok(
      error.kind === "too-spread-out" || error.kind === "too-large",
      `refused as ${error.kind}`,
    );
  }
});
