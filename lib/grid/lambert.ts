/**
 * Forward Lambert Conformal Conic, so a point can be placed on the block grid.
 *
 * The worker has no projection library and cannot open a raster, but resolving
 * an address to a district means turning a latitude and longitude into a block
 * on the canonical grid. That is a closed-form calculation, so it is written
 * out here rather than pulled in.
 *
 * The parameters are not chosen; they are read from CANONICAL_GRID, which is
 * the grid every measured product in this repository is computed on. Snyder's
 * two-standard-parallel formulation, GRS80 on NAD83.
 *
 * A note on datums, because it is a real difference and not a rounding one:
 * addresses arrive as WGS84 and the grid is NAD83. The two differ by roughly a
 * metre in Canada. A block is 960 m, so the difference cannot move a point to
 * another block except within a metre of a block edge, and a point that close
 * to an edge is already reported as sitting near one. The datum shift is
 * therefore not applied, and this comment is the record of that decision.
 */

import { CANONICAL_GRID } from "./conformance";

const SEMI_MAJOR_METRES = 6378137;
const INVERSE_FLATTENING = 298.257222101004;
const LATITUDE_OF_ORIGIN = 49;
const CENTRAL_MERIDIAN = -95;
const STANDARD_PARALLEL_1 = 49;
const STANDARD_PARALLEL_2 = 77;
const FALSE_EASTING = 0;
const FALSE_NORTHING = 0;

/** Pixels per block edge, matching scripts/phase6_coarse_grid_aggregate.py. */
export const BLOCK_PIXELS = 32;
export const BLOCK_METRES = BLOCK_PIXELS * CANONICAL_GRID.pixelSizeMetres;

export const GRID_BLOCK_WIDTH = Math.ceil(CANONICAL_GRID.width / BLOCK_PIXELS);
export const GRID_BLOCK_HEIGHT = Math.ceil(CANONICAL_GRID.height / BLOCK_PIXELS);

const flattening = 1 / INVERSE_FLATTENING;
const eccentricity = Math.sqrt(2 * flattening - flattening * flattening);
const radians = (degrees: number) => (degrees * Math.PI) / 180;

function conformalT(latitude: number): number {
  const sine = Math.sin(latitude);
  const ratio = (1 - eccentricity * sine) / (1 + eccentricity * sine);
  return Math.tan(Math.PI / 4 - latitude / 2) / Math.pow(ratio, eccentricity / 2);
}

function parallelM(latitude: number): number {
  const sine = Math.sin(latitude);
  return Math.cos(latitude) / Math.sqrt(1 - eccentricity * eccentricity * sine * sine);
}

const phi1 = radians(STANDARD_PARALLEL_1);
const phi2 = radians(STANDARD_PARALLEL_2);
const phi0 = radians(LATITUDE_OF_ORIGIN);
const lambda0 = radians(CENTRAL_MERIDIAN);

const m1 = parallelM(phi1);
const m2 = parallelM(phi2);
const t1 = conformalT(phi1);
const t2 = conformalT(phi2);
const cone =
  Math.abs(phi1 - phi2) < 1e-12
    ? Math.sin(phi1)
    : (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const bigF = m1 / (cone * Math.pow(t1, cone));
const rho0 = SEMI_MAJOR_METRES * bigF * Math.pow(conformalT(phi0), cone);

export type ProjectedPoint = Readonly<{ x: number; y: number }>;
export type BlockAddress = Readonly<{ gx: number; gy: number }>;

/** Latitude and longitude in degrees to grid metres. */
export function projectToGrid(latitude: number, longitude: number): ProjectedPoint {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new RangeError("A point needs a finite latitude and longitude.");
  }
  if (latitude <= -90 || latitude >= 90) {
    throw new RangeError("Latitude must be inside the poles.");
  }
  const phi = radians(latitude);
  const rho = SEMI_MAJOR_METRES * bigF * Math.pow(conformalT(phi), cone);

  // Longitude difference is wrapped, so a point does not land on the far side
  // of the cone when it crosses the antimeridian.
  let delta = radians(longitude) - lambda0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const theta = cone * delta;
  return {
    x: FALSE_EASTING + rho * Math.sin(theta),
    y: FALSE_NORTHING + rho0 - rho * Math.cos(theta),
  };
}

/** The block a projected point falls in, or null when it is off the grid. */
export function blockForProjected(point: ProjectedPoint): BlockAddress | null {
  const [originX, , , originY] = CANONICAL_GRID.geotransform;
  const gx = Math.floor((point.x - originX) / BLOCK_METRES);
  const gy = Math.floor((originY - point.y) / BLOCK_METRES);
  if (gx < 0 || gy < 0 || gx >= GRID_BLOCK_WIDTH || gy >= GRID_BLOCK_HEIGHT) return null;
  return { gx, gy };
}

export function blockForPoint(latitude: number, longitude: number): BlockAddress | null {
  return blockForProjected(projectToGrid(latitude, longitude));
}

/** Byte offset of a block in a row-major little-endian uint16 index. */
export function blockByteOffset(block: BlockAddress): number {
  return (block.gy * GRID_BLOCK_WIDTH + block.gx) * 2;
}

/**
 * How far the point sits from the nearest edge of its own block, in metres.
 * The readout uses this to say when an answer is near a boundary rather than
 * inside one.
 */
export function metresFromBlockEdge(point: ProjectedPoint): number {
  const [originX, , , originY] = CANONICAL_GRID.geotransform;
  const acrossBlock = (value: number) => {
    const offset = ((value % BLOCK_METRES) + BLOCK_METRES) % BLOCK_METRES;
    return Math.min(offset, BLOCK_METRES - offset);
  };
  return Math.min(acrossBlock(point.x - originX), acrossBlock(originY - point.y));
}
