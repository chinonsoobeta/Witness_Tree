import assert from "node:assert/strict";
import test from "node:test";
import { traceRings, subtractCover } from "../lib/phase2/rings.mjs";

const runsOf = (...triples) => Uint32Array.from(triples.flat());
const cellsIn = (rings) => {
  let area = 0;
  for (const ring of rings) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    }
  }
  return area / 2;
};

test("subtractCover returns the uncovered pieces of an interval", () => {
  const got = [];
  subtractCover(0, 10, [2, 4, 7, 8], (a, b) => got.push([a, b]));
  assert.deepEqual(got, [[0, 2], [4, 7], [8, 10]]);
  const none = [];
  subtractCover(3, 6, [0, 9], (a, b) => none.push([a, b]));
  assert.deepEqual(none, []);
});

test("a single cell traces one square ring wound interior-on-right", () => {
  const rings = traceRings(runsOf([5, 3, 3]), 1);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0], [[3, 5], [4, 5], [4, 6], [3, 6], [3, 5]]);
});

test("a rectangle collapses to four corners", () => {
  const rings = traceRings(runsOf([0, 0, 3], [1, 0, 3], [2, 0, 3]), 12);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.equal(cellsIn(rings), 12);
});

test("an L keeps its notch instead of squaring it off", () => {
  const rings = traceRings(runsOf([0, 0, 0], [1, 0, 1]), 3);
  assert.equal(rings.length, 1);
  assert.equal(cellsIn(rings), 3);
  assert.equal(rings[0].length, 7); // six corners, closed
});

test("a ring around a gap yields a hole with negative area", () => {
  const rings = traceRings(
    runsOf([0, 0, 2], [1, 0, 0], [1, 2, 2], [2, 0, 2]),
    8,
  );
  assert.equal(rings.length, 2);
  assert.equal(cellsIn(rings), 8);
  const areas = rings.map((ring) => cellsIn([ring]));
  assert.deepEqual(areas.slice().sort((a, b) => b - a), [9, -1]);
});

test("a corner touch splits into two rings rather than one crossing ring", () => {
  // Two cells meeting only at a corner, joined into one component by a path
  // that leaves and returns; the tracer must not weld them at the vertex.
  const rings = traceRings(runsOf([0, 0, 0], [1, 1, 1]), 2);
  assert.equal(cellsIn(rings), 2);
  assert.equal(rings.length, 2);
});

test("a disagreement between the rings and the cell count throws", () => {
  assert.throws(() => traceRings(runsOf([0, 0, 3]), 3), /does not equal/);
});

test("vertices are never moved off the grid lines", () => {
  const rings = traceRings(runsOf([9, 4, 7], [10, 5, 9], [11, 4, 4]), 4 + 5 + 1);
  for (const ring of rings) {
    for (const [x, y] of ring) {
      assert.equal(Number.isInteger(x), true);
      assert.equal(Number.isInteger(y), true);
    }
  }
});
