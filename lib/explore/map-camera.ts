/**
 * Camera arithmetic for the Explore map, kept out of the map component so it
 * can be tested.
 *
 * The map opens framed on one envelope around the four provinces and may not
 * be panned far from it. MapLibre enforces a pan limit by never showing
 * anything outside it, so a limit equal to the envelope fights the framing:
 * the frame's padding, and any frame taller in proportion than the envelope
 * (about 2.4 to 1 in Web Mercator), would have to show ground outside it.
 * MapLibre then zooms in until the view fits, which crops British Columbia
 * and eastern Québec on a desktop and leaves a phone looking at empty northern
 * Manitoba. The pan limit is therefore the envelope widened to whatever the
 * framed view shows, so the whole envelope is always in reach.
 */

export type MapBounds = [west: number, south: number, east: number, north: number];

const MAX_MERCATOR_LATITUDE = 85.051129;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (radians: number) => (radians * 180) / Math.PI;
const mercatorY = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + radians(latitude) / 2));
const latitudeOf = (y: number) => degrees(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
const clampLatitude = (latitude: number) =>
  Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));

/**
 * The smallest pan limit, centred on the envelope, that holds everything the
 * map shows when the envelope is fitted into a frame of this size with this
 * padding. It is never smaller than the envelope. A frame with no size yet
 * gets the envelope itself.
 */
export function panLimitFor(envelope: MapBounds, width: number, height: number, padding: number): MapBounds {
  if (!(width > 0) || !(height > 0)) return envelope;
  const [west, south, east, north] = envelope;
  const x0 = radians(west);
  const x1 = radians(east);
  const y0 = mercatorY(south);
  const y1 = mercatorY(north);
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  // Pixels per radian of Web Mercator when the envelope is fitted inside the
  // padding, as MapLibre's fitBounds does.
  const scale = Math.min(Math.max(width - 2 * padding, 1) / spanX, Math.max(height - 2 * padding, 1) / spanY);
  // A hair of slack so floating-point rounding never leaves the fitted view
  // a fraction of a pixel outside the limit.
  const halfX = (Math.max(spanX, width / scale) / 2) * 1.001;
  const halfY = (Math.max(spanY, height / scale) / 2) * 1.001;
  const centreX = (x0 + x1) / 2;
  const centreY = (y0 + y1) / 2;
  return [
    degrees(centreX - halfX),
    clampLatitude(latitudeOf(centreY - halfY)),
    degrees(centreX + halfX),
    clampLatitude(latitudeOf(centreY + halfY)),
  ];
}
