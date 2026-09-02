/*
 * The decisions a pointer makes about a shape, kept apart from the map that
 * captures them. A click on a map is hard to prove; what a click means is not,
 * and everything here is the second kind.
 */

export type Corner = Readonly<{ latitude: number; longitude: number }>;
export type Edges = Readonly<{ north: number; south: number; west: number; east: number }>;

// Five decimals is about a metre. The record answers in 960 m squares, so this
// is far finer than any answer it can give, and it keeps a corner field short
// enough to read and to retype.
export const COORDINATE_DECIMALS = 5;

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

export function cornerFromPoint(latitude: number, longitude: number): Corner {
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}

/*
 * A corner is added at the end, and the list stops growing at the same number
 * of vertices the measurement will accept. Refusing here rather than at the
 * request means a reader is never allowed to build a shape that is then thrown
 * away, and the returned index is the corner's position for the announcement.
 */
export function appendCorner(
  corners: readonly Corner[],
  corner: Corner,
  maximum: number,
): { corners: Corner[]; index: number } | null {
  if (corners.length >= maximum) return null;
  const next = [...corners, corner];
  return { corners: next, index: next.length };
}

export function removeLastCorner(
  corners: readonly Corner[],
): { corners: Corner[]; index: number } | null {
  if (corners.length === 0) return null;
  return { corners: corners.slice(0, -1), index: corners.length };
}

/*
 * Two opposite corners become four edges. Which corner was clicked first must
 * not change the rectangle, so each edge is taken from the further of the two
 * rather than from a fixed one.
 *
 * A rectangle drawn across the antimeridian is not built here. The grid this
 * measures covers one country well inside a single hemisphere, and a shape that
 * wrapped would be silently the wrong one rather than refused, so the west edge
 * is always the smaller longitude.
 */
export function rectangleFromCorners(first: Corner, second: Corner): Edges {
  return {
    north: Math.max(first.latitude, second.latitude),
    south: Math.min(first.latitude, second.latitude),
    west: Math.min(first.longitude, second.longitude),
    east: Math.max(first.longitude, second.longitude),
  };
}

/*
 * The ring a set of edges encloses, wound so the corners run in one direction
 * around it. The measurement takes any winding, but a consistent one keeps the
 * drawn outline and the corner fields listing the same shape in the same order.
 */
export function ringFromEdges(edges: Edges): Corner[] {
  return [
    { latitude: edges.north, longitude: edges.west },
    { latitude: edges.north, longitude: edges.east },
    { latitude: edges.south, longitude: edges.east },
    { latitude: edges.south, longitude: edges.west },
  ];
}
