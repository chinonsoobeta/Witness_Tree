/*
 * D5: the map position in the address, as `#map=<zoom>/<lat>/<lng>`, zoom to
 * two decimals and latitude and longitude to four, for example
 * `#map=6.50/53.7267/-127.6476`. Place pages link to Explore with it, so the
 * format is a contract: change it only together with those links.
 */
export type MapHashCamera = Readonly<{ zoom: number; lat: number; lng: number }>;

const MAP_HASH = /^#map=(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/;

export function formatMapHash({ zoom, lat, lng }: MapHashCamera): string {
  return `#map=${zoom.toFixed(2)}/${lat.toFixed(4)}/${lng.toFixed(4)}`;
}

/** The camera a hash names, or null when it names none or one off the globe. */
export function readMapHash(hash: string): MapHashCamera | null {
  const match = MAP_HASH.exec(hash);
  if (!match) return null;
  const [zoom, lat, lng] = match.slice(1).map(Number) as [number, number, number];
  if (zoom < 0 || zoom > 24 || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { zoom, lat, lng };
}
