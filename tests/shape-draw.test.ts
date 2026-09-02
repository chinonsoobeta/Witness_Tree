import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCorner,
  cornerFromPoint,
  rectangleFromCorners,
  removeLastCorner,
  ringFromEdges,
  roundCoordinate,
} from "../lib/shapes/draw";
import { shapeCoverage, ShapeError, MAX_SHAPE_HECTARES } from "../lib/shapes/coverage";

test("a rectangle does not depend on which corner was clicked first", () => {
  const a = cornerFromPoint(45.4, -75.72);
  const b = cornerFromPoint(45.44, -75.66);
  // All four click orders, including the two that start from a corner the
  // reader would call the wrong one, describe the same rectangle.
  const orders = [
    rectangleFromCorners(a, b),
    rectangleFromCorners(b, a),
    rectangleFromCorners({ latitude: a.latitude, longitude: b.longitude }, { latitude: b.latitude, longitude: a.longitude }),
    rectangleFromCorners({ latitude: b.latitude, longitude: a.longitude }, { latitude: a.latitude, longitude: b.longitude }),
  ];
  for (const edges of orders) assert.deepEqual(edges, orders[0]);
  assert.equal(orders[0].north, 45.44);
  assert.equal(orders[0].south, 45.4);
  assert.equal(orders[0].west, -75.72);
  assert.equal(orders[0].east, -75.66);
});

test("two clicks in the same place enclose nothing, and are refused as such", () => {
  const point = cornerFromPoint(49.25, -123.1);
  const edges = rectangleFromCorners(point, point);
  assert.equal(edges.north, edges.south);
  assert.equal(edges.west, edges.east);
  // The refusal comes from the measurement's own rule, not from a second rule
  // written here that could drift away from it. Four corners in one place are
  // one corner, so the shape is refused for having too few rather than for
  // enclosing nothing: the more exact of the two things that are wrong with it.
  assert.throws(
    () => shapeCoverage(ringFromEdges(edges)),
    (error: unknown) => error instanceof ShapeError && error.kind === "too-few-vertices",
  );
});

test("corners that look collinear on screen still enclose a real sliver on the grid", () => {
  // A line of constant latitude is a straight line to a reader and a curve on
  // the projected grid, so three corners along one enclose a thin lens rather
  // than nothing. This is pinned rather than refused: the shape is real, and
  // the honest thing is to measure it and say how little of it is certain.
  const alongAParallel = [
    cornerFromPoint(49.2, -123.2),
    cornerFromPoint(49.2, -123.1),
    cornerFromPoint(49.2, -123.0),
  ];
  const coverage = shapeCoverage(alongAParallel);
  assert.ok(coverage.areaHectares > 0, "the sliver was flattened to nothing");
  assert.ok(coverage.areaHectares < 10, `the sliver is ${coverage.areaHectares} ha, far more than a curve's width`);
  // Nothing about such a shape is certain: it fills no block, so the low end of
  // its answer is zero and the high end is every block it grazes. The reader is
  // told that, rather than being handed a single number that looks measured.
  assert.equal(coverage.interiorBlocks, 0, "a sliver cannot fill a 960 m block");
  assert.equal(coverage.edgeBlocks, coverage.blocks.length);
  for (const block of coverage.blocks) assert.ok(block.fraction < 1);
});

test("a rectangle that does enclose something measures the blocks it covers", () => {
  const coverage = shapeCoverage(ringFromEdges(rectangleFromCorners(cornerFromPoint(49.2, -123.2), cornerFromPoint(49.3, -123.0))));
  assert.ok(coverage.blocks.length > 0, "a real rectangle covers no blocks");
  assert.ok(coverage.areaHectares > 0);
  assert.ok(coverage.areaHectares < MAX_SHAPE_HECTARES);
  assert.equal(coverage.blocks.length, coverage.interiorBlocks + coverage.edgeBlocks);
  // A rectangle in latitude and longitude is not square to a projected grid, so
  // its covered blocks must shift from row to row. A shape that came back
  // axis-aligned would mean the projection had been skipped.
  const byRow = new Map<number, number[]>();
  for (const block of coverage.blocks) {
    const row = byRow.get(block.gy) ?? [];
    row.push(block.gx);
    byRow.set(block.gy, row);
  }
  const firstColumns = [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([, columns]) => Math.min(...columns));
  assert.ok(new Set(firstColumns).size > 1, "the covered blocks are square to the grid, so nothing was projected");
  // Every fraction is a real share of a block, and an interior block is whole.
  for (const block of coverage.blocks) {
    assert.ok(block.fraction > 0 && block.fraction <= 1, `a block is covered by ${block.fraction} of the shape`);
  }
  assert.equal(coverage.blocks.filter((block) => block.fraction === 1).length, coverage.interiorBlocks);
});

test("corners are added in order and stop at the cap the measurement enforces", () => {
  let corners: readonly { latitude: number; longitude: number }[] = [];
  for (let index = 0; index < 4; index += 1) {
    const added = appendCorner(corners, cornerFromPoint(45 + index * 0.01, -75), 4);
    assert.ok(added, `corner ${index + 1} was refused below the cap`);
    assert.equal(added.index, index + 1, "the announced position is not the corner's own");
    corners = added.corners;
  }
  assert.equal(corners.length, 4);
  // At the cap the list stops rather than silently dropping the oldest corner,
  // which would change the shape the reader drew without saying so.
  assert.equal(appendCorner(corners, cornerFromPoint(46, -75), 4), null);
  assert.equal(corners.length, 4);
});

test("removing works from the end and is a no-op on an empty list", () => {
  const one = cornerFromPoint(45, -75);
  const two = cornerFromPoint(46, -76);
  const removed = removeLastCorner([one, two]);
  assert.ok(removed);
  assert.deepEqual(removed.corners, [one]);
  assert.equal(removed.index, 2, "the announcement names the corner that went");
  assert.equal(removeLastCorner([]), null);
});

test("a corner is rounded to about a metre, far finer than the answer", () => {
  const corner = cornerFromPoint(45.123456789, -75.987654321);
  assert.equal(corner.latitude, 45.12346);
  assert.equal(corner.longitude, -75.98765);
  assert.equal(roundCoordinate(0.1 + 0.2), 0.3, "a rounded coordinate still carries a float's error");
  // One ten-thousandth of a degree of latitude is about 11 m; the record
  // answers in 960 m squares, so rounding here can never move a block.
  const metresPerDegree = 111_320;
  assert.ok((0.5 / 10 ** 5) * metresPerDegree < 960 / 100);
});

test("the ring a rectangle encloses runs once around it without repeating a corner", () => {
  const ring = ringFromEdges(rectangleFromCorners(cornerFromPoint(45.4, -75.72), cornerFromPoint(45.44, -75.66)));
  assert.equal(ring.length, 4);
  assert.equal(new Set(ring.map((corner) => `${corner.latitude},${corner.longitude}`)).size, 4);
  assert.deepEqual(ring[0], { latitude: 45.44, longitude: -75.72 });
  assert.deepEqual(ring[2], { latitude: 45.4, longitude: -75.66 });
});
