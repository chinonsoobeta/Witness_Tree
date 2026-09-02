/**
 * Which coarse-grid blocks a drawn shape covers, and by how much.
 *
 * The shipped grid answers questions per 960 m block, so a drawn shape is
 * answered by the blocks it covers.  A block wholly inside the shape
 * contributes its counts exactly.  A block the boundary crosses contributes
 * the exact polygon/block intersection fraction, which is the same treatment
 * the annual zonal fractional correction applies at 30 m: the difference is
 * the resolution, not the method, and the caller is told which it received.
 *
 * Everything here works in projected Lambert metres, because that is the
 * space the counts were aggregated in.  Doing the geometry in longitude and
 * latitude would measure a different shape than the one that was counted.
 */
import {
  BLOCK_METRES,
  GRID_BLOCK_HEIGHT,
  GRID_BLOCK_WIDTH,
  projectToGrid,
  type ProjectedPoint,
} from "../grid/lambert";
import { CANONICAL_GRID } from "../grid/conformance";

/** A drawn vertex, in the order the person drew it. */
export type GeographicPoint = Readonly<{ latitude: number; longitude: number }>;

export type BlockCoverage = Readonly<{
  gx: number;
  gy: number;
  /** 1 for a block wholly inside the shape, and (0, 1) where the edge cuts it. */
  fraction: number;
}>;

export type ShapeCoverage = Readonly<{
  blocks: readonly BlockCoverage[];
  /** Shape area from its own geometry, before any block rounding. */
  areaHectares: number;
  /** Blocks the boundary crosses, which are the only inexact contributors. */
  edgeBlocks: number;
  interiorBlocks: number;
  /** Shape area that fell outside the national grid, in hectares. */
  outsideGridHectares: number;
}>;

/** A block is 92.16 ha, so a whole block is the smallest exact unit available. */
export const BLOCK_HECTARES = (BLOCK_METRES * BLOCK_METRES) / 10_000;

/**
 * The largest shape the coarse grid will answer.  Two million hectares is
 * about a fifth of a large federal riding's landmass and roughly 21,000
 * blocks, which stays inside a worker's time and memory budget while being
 * far larger than any shape a person draws by hand.
 */
export const MAX_SHAPE_HECTARES = 2_000_000;

/**
 * The most blocks a single measurement will visit.  A solid shape at the area
 * cap is about 21,700 blocks; the headroom above that is for thin shapes,
 * which cover little area while reaching across many rows.
 */
export const MAX_SHAPE_BLOCKS = 60_000;

/** Fewer than three distinct vertices does not enclose any area. */
export const MIN_SHAPE_VERTICES = 3;

/** Refuses shapes the grid cannot answer, rather than answering them badly. */
export class ShapeError extends Error {
  readonly kind:
    | "too-few-vertices"
    | "not-finite"
    | "off-grid"
    | "too-large"
    | "too-spread-out"
    | "no-area";

  constructor(kind: ShapeError["kind"], message: string) {
    super(message);
    this.name = "ShapeError";
    this.kind = kind;
  }
}

type Vertex = readonly [number, number];

function shoelaceArea(ring: readonly Vertex[]): number {
  let doubled = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    doubled += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubled) / 2;
}

/**
 * Sutherland-Hodgman clip of a convex-or-concave ring against one half-plane.
 * Clipping against the four sides of a block yields the exact intersection
 * polygon for a simple ring, which is what the fraction is measured from.
 */
function clipHalfPlane(
  ring: readonly Vertex[],
  inside: (point: Vertex) => boolean,
  intersect: (a: Vertex, b: Vertex) => Vertex,
): Vertex[] {
  const output: Vertex[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentIn = inside(current);
    const previousIn = inside(previous);
    if (currentIn) {
      if (!previousIn) output.push(intersect(previous, current));
      output.push(current);
    } else if (previousIn) {
      output.push(intersect(previous, current));
    }
  }
  return output;
}

function clipToBox(
  ring: readonly Vertex[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Vertex[] {
  const atX = (x: number) => (a: Vertex, b: Vertex): Vertex => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + t * (b[1] - a[1])];
  };
  const atY = (y: number) => (a: Vertex, b: Vertex): Vertex => {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  };
  let clipped: Vertex[] = [...ring];
  clipped = clipHalfPlane(clipped, (p) => p[0] >= minX, atX(minX));
  if (clipped.length === 0) return clipped;
  clipped = clipHalfPlane(clipped, (p) => p[0] <= maxX, atX(maxX));
  if (clipped.length === 0) return clipped;
  clipped = clipHalfPlane(clipped, (p) => p[1] >= minY, atY(minY));
  if (clipped.length === 0) return clipped;
  return clipHalfPlane(clipped, (p) => p[1] <= maxY, atY(maxY));
}

function projectRing(points: readonly GeographicPoint[]): Vertex[] {
  const ring: Vertex[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      throw new ShapeError("not-finite", "A drawn point was not a finite coordinate.");
    }
    if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
      throw new ShapeError("not-finite", "A drawn point was outside the range of coordinates.");
    }
    const projected: ProjectedPoint = projectToGrid(point.latitude, point.longitude);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      throw new ShapeError("not-finite", "A drawn point did not project onto the national grid.");
    }
    ring.push([projected.x, projected.y]);
  }
  // A closing vertex repeating the first is common in drawn output and would
  // add a zero-length edge, so it is dropped rather than special-cased later.
  while (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) ring.pop();
    else break;
  }
  return ring;
}

/**
 * The blocks a drawn shape covers, each with the fraction of the block the
 * shape encloses.  Throws rather than returning a partial answer when the
 * shape is unanswerable.
 */
export function shapeCoverage(points: readonly GeographicPoint[]): ShapeCoverage {
  const ring = projectRing(points);
  if (ring.length < MIN_SHAPE_VERTICES) {
    throw new ShapeError("too-few-vertices", "A shape needs at least three separate corners.");
  }

  const areaMetres = shoelaceArea(ring);
  if (areaMetres <= 0) {
    throw new ShapeError("no-area", "The drawn shape does not enclose any area.");
  }
  const areaHectares = areaMetres / 10_000;
  if (areaHectares > MAX_SHAPE_HECTARES) {
    throw new ShapeError("too-large", "The drawn shape is larger than this tool will measure.");
  }

  const [originX, , , originY] = CANONICAL_GRID.geotransform;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of ring) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const firstGy = Math.floor((originY - maxY) / BLOCK_METRES);
  const lastGy = Math.floor((originY - minY) / BLOCK_METRES);

  const blocks: BlockCoverage[] = [];
  let interiorBlocks = 0;
  let edgeBlocks = 0;
  let coveredMetres = 0;

  // Scanning the bounding box would visit millions of blocks for a long thin
  // diagonal shape that covers only a few thousand.  Clipping the ring to one
  // row's band first gives that row's real column span, so the work follows
  // the shape rather than the box around it.
  for (let gy = firstGy; gy <= lastGy; gy += 1) {
    const blockMaxY = originY - gy * BLOCK_METRES;
    const blockMinY = blockMaxY - BLOCK_METRES;
    const band = clipToBox(ring, -Infinity, blockMinY, Infinity, blockMaxY);
    if (band.length < 3) continue;

    let bandMinX = Infinity;
    let bandMaxX = -Infinity;
    for (const [x] of band) {
      if (x < bandMinX) bandMinX = x;
      if (x > bandMaxX) bandMaxX = x;
    }
    const firstGx = Math.floor((bandMinX - originX) / BLOCK_METRES);
    const lastGx = Math.floor((bandMaxX - originX) / BLOCK_METRES);

    for (let gx = firstGx; gx <= lastGx; gx += 1) {
      const blockMinX = originX + gx * BLOCK_METRES;
      const blockMaxX = blockMinX + BLOCK_METRES;
      // The band is already inside this row, so only the two vertical cuts
      // remain.  Clipping the band rather than the whole ring also keeps the
      // per-block work proportional to the part of the shape that is here.
      const clipped = clipToBox(band, blockMinX, -Infinity, blockMaxX, Infinity);
      if (clipped.length < 3) continue;
      const overlap = shoelaceArea(clipped);
      if (overlap <= 0) continue;
      const fraction = Math.min(1, overlap / (BLOCK_METRES * BLOCK_METRES));
      coveredMetres += overlap;
      // A block off the national grid has no counts to contribute, but its
      // area is still reported so a shape drawn past the edge says so.
      if (gx < 0 || gy < 0 || gx >= GRID_BLOCK_WIDTH || gy >= GRID_BLOCK_HEIGHT) continue;
      if (fraction >= 1 - 1e-9) {
        interiorBlocks += 1;
        blocks.push({ gx, gy, fraction: 1 });
      } else {
        edgeBlocks += 1;
        blocks.push({ gx, gy, fraction });
      }
      if (blocks.length > MAX_SHAPE_BLOCKS) {
        throw new ShapeError("too-spread-out", "The drawn shape reaches across too much of the map to measure at once.");
      }
    }
  }

  if (blocks.length === 0) {
    throw new ShapeError("off-grid", "The drawn shape does not fall on the mapped area.");
  }

  let onGridMetres = 0;
  for (const block of blocks) onGridMetres += block.fraction * BLOCK_METRES * BLOCK_METRES;
  const outsideGridHectares = Math.max(0, (coveredMetres - onGridMetres) / 10_000);

  return { blocks, areaHectares, edgeBlocks, interiorBlocks, outsideGridHectares };
}
