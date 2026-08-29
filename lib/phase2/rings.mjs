// Traces the exact rectilinear boundary of a patch from its runs.
//
// This is deliberately not a general polygonizer. The input is a set of whole
// 30 m cells, so every boundary segment lies on a grid line and the output can
// be exact: no tolerance, no simplification, no snapping. The method record
// (data/phase2-per-cell-geometry-method.json) stores simplification "none" for
// the products this writes, and that is only true if this stage never moves a
// vertex.
//
// Direction convention, in grid space where x runs right and y is the row
// index running down: a boundary is walked with the patch interior on the
// right. That makes top edges run +x, bottom edges -x, left edges up and
// right edges down. Under that convention an outer ring has positive shoelace
// area and a hole has negative area, so the signed areas of a patch's rings
// sum to its cell count. traceRings() checks exactly that and throws when it
// does not, which is what turns this from "looks plausible" into a gate.

const X_BITS = 21; // vertex keys pack x into 21 bits: grids up to 2,097,151 wide
const X_LIMIT = 1 << X_BITS;
const key = (x, y) => y * X_LIMIT + x;

/** Directions, indexed so that (index + 1) % 4 is a right turn. */
const RIGHT_X = [1, 0, -1, 0];
const RIGHT_Y = [0, 1, 0, -1];
const EAST = 0, SOUTH = 1, WEST = 2, NORTH = 3;

/**
 * Subtracts a sorted, disjoint list of covering intervals from [lo, hi),
 * calling emit(a, b) for each maximal uncovered piece.
 */
function subtractCover(lo, hi, cover, emit) {
  let at = lo;
  for (let index = 0; index < cover.length; index += 2) {
    const coverLo = cover[index];
    const coverHi = cover[index + 1];
    if (coverHi <= at) continue;
    if (coverLo >= hi) break;
    if (coverLo > at) emit(at, Math.min(coverLo, hi));
    at = Math.max(at, coverHi);
    if (at >= hi) return;
  }
  if (at < hi) emit(at, hi);
}

/**
 * @param {Uint32Array} runs flat (row, x0, x1) triples, sorted by row then x0,
 *   with x1 inclusive, as produced by PatchAccumulator#finish.
 * @param {number} cellCount the patch's cell count, used as the closing check.
 * @returns {number[][][]} rings as arrays of [x, y] grid vertices, each closed,
 *   outer rings first. Coordinates are grid-line integers, not cell centres.
 */
export function traceRings(runs, cellCount) {
  const runCount = runs.length / 3;
  if (runCount === 0) throw new Error("traceRings received a patch with no runs");

  // Row index: rows are already grouped because runs are sorted by row.
  const rowStart = new Map();
  const rowEnd = new Map();
  for (let index = 0; index < runCount; index += 1) {
    const row = runs[index * 3];
    if (!rowStart.has(row)) rowStart.set(row, index);
    rowEnd.set(row, index + 1);
  }
  const coverOf = (row) => {
    const start = rowStart.get(row);
    if (start === undefined) return [];
    const end = rowEnd.get(row);
    const cover = new Array((end - start) * 2);
    for (let index = start; index < end; index += 1) {
      cover[(index - start) * 2] = runs[index * 3 + 1];
      cover[(index - start) * 2 + 1] = runs[index * 3 + 2] + 1;
    }
    return cover;
  };

  // Directed edges, keyed by start vertex. A vertex has at most two outgoing
  // edges, and only where the patch touches itself corner to corner.
  const outgoing = new Map();
  const addEdge = (x0, y0, x1, y1, direction) => {
    const from = key(x0, y0);
    const edge = { x0, y0, x1, y1, direction, used: false };
    const existing = outgoing.get(from);
    if (existing === undefined) outgoing.set(from, edge);
    else if (Array.isArray(existing)) existing.push(edge);
    else outgoing.set(from, [existing, edge]);
  };

  let above = [];
  let below = [];
  let currentRow = null;
  for (let index = 0; index < runCount; index += 1) {
    const row = runs[index * 3];
    const x0 = runs[index * 3 + 1];
    const x1 = runs[index * 3 + 2] + 1; // exclusive right edge
    if (x1 > X_LIMIT) throw new Error(`grid x ${x1} exceeds the ${X_LIMIT} vertex-key limit`);
    if (row !== currentRow) {
      currentRow = row;
      above = coverOf(row - 1);
      below = coverOf(row + 1);
    }
    // Top: the part of this run with nothing of this patch directly above.
    subtractCover(x0, x1, above, (a, b) => addEdge(a, row, b, row, EAST));
    // Bottom: the part with nothing directly below, walked the other way.
    subtractCover(x0, x1, below, (a, b) => addEdge(b, row + 1, a, row + 1, WEST));
    // Runs are maximal within their row, so both ends are always boundary.
    addEdge(x0, row + 1, x0, row, NORTH);
    addEdge(x1, row, x1, row + 1, SOUTH);
  }

  // Stitch. At a corner-touch vertex two edges leave; taking the sharpest
  // right turn keeps the interior on the right and splits the touch into two
  // rings instead of one self-crossing ring.
  const rings = [];
  let signedArea = 0;
  for (const [, start] of outgoing) {
    const seeds = Array.isArray(start) ? start : [start];
    for (const seed of seeds) {
      if (seed.used) continue;
      const ring = [];
      let edge = seed;
      let area = 0;
      while (edge !== undefined && !edge.used) {
        edge.used = true;
        ring.push([edge.x0, edge.y0]);
        area += edge.x0 * edge.y1 - edge.x1 * edge.y0;
        const at = key(edge.x1, edge.y1);
        const next = outgoing.get(at);
        if (next === undefined) break;
        if (!Array.isArray(next)) {
          edge = next;
          continue;
        }
        // Prefer a right turn, then straight on, then a left turn.
        let chosen;
        for (let turn = 1; turn <= 3 && chosen === undefined; turn += 1) {
          const want = (edge.direction + turn) % 4;
          chosen = next.find((candidate) => !candidate.used && candidate.direction === want);
        }
        edge = chosen;
      }
      if (ring.length < 4) throw new Error(`traced a ring with only ${ring.length} vertices`);
      ring.push([ring[0][0], ring[0][1]]);
      signedArea += area / 2;
      rings.push(ring);
    }
  }

  if (signedArea !== cellCount) {
    throw new Error(`ring area ${signedArea} does not equal the patch's ${cellCount} cells`);
  }
  return rings.map(dropCollinear);
}

/** Removes the mid-points of straight stretches; it never moves a vertex. */
function dropCollinear(ring) {
  const out = [ring[0]];
  for (let index = 1; index < ring.length - 1; index += 1) {
    const previous = out[out.length - 1];
    const here = ring[index];
    const next = ring[index + 1];
    const straight =
      (previous[0] === here[0] && here[0] === next[0]) ||
      (previous[1] === here[1] && here[1] === next[1]);
    if (!straight) out.push(here);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

export const RING_DIRECTIONS = { EAST, SOUTH, WEST, NORTH };
export { subtractCover, key as vertexKey };
