/**
 * The map position for a place's bounding box, and the Explore address that
 * opens it.
 *
 * The hash `#map=<zoom>/<lat>/<lng>` (zoom to two decimals, latitude and
 * longitude to four) is a contract with Explore, which reads it to open on the
 * same view. The view fits the box into a nominal Explore frame of 960 × 600
 * pixels with 40 pixels of padding, on Web Mercator with 512-pixel tiles, the
 * projection and tile size the map uses.
 */

export type PlaceExtent = readonly [west: number, south: number, east: number, north: number];
export type PlaceMapView = Readonly<{ zoom: number; latitude: number; longitude: number }>;

const FRAME = { width: 960, height: 600, padding: 40 } as const;
const TILE = 512;
/** Explore draws loss patches to zoom 14; a point-sized place opens one step short of that. */
const MAX_ZOOM = 13;
const MIN_ZOOM = 2;

const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
const latitudeOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

export function placeMapView(extent: PlaceExtent): PlaceMapView {
  const [west, south, east, north] = extent;
  if (!(west <= east && south <= north) || [west, east].some((x) => x < -180 || x > 180) || [south, north].some((y) => y < -85 || y > 85)) {
    throw new Error("A place extent must be a west, south, east, north box in degrees.");
  }
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const zoomX = east > west ? Math.log2(((FRAME.width - 2 * FRAME.padding) * 360) / (TILE * (east - west))) : Infinity;
  const zoomY = top > bottom ? Math.log2(((FRAME.height - 2 * FRAME.padding) * 2 * Math.PI) / (TILE * (top - bottom))) : Infinity;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)));
  return { zoom, latitude: latitudeOf((top + bottom) / 2), longitude: (west + east) / 2 };
}

/** `#map=<zoom>/<lat>/<lng>`, as Explore reads it. */
export function mapHash(view: PlaceMapView) {
  return `#map=${view.zoom.toFixed(2)}/${view.latitude.toFixed(4)}/${view.longitude.toFixed(4)}`;
}
