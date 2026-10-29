/*
 * A circle around one point, sent to the shape measurement as a polygon.
 *
 * The measurement takes vertices, so a circle is turned into 64 of them here
 * and nothing changes on the server. Each vertex is placed a true distance in
 * metres from the centre on the GRS80 ellipsoid, using the meridian and
 * prime-vertical radii of curvature at the midpoint of each offset. A circle
 * built in degrees would be squashed: at 55 degrees north a degree of longitude
 * is little more than half a degree of latitude on the ground. Checked against
 * Vincenty's inverse formula, every vertex of a 25 km circle lies within 7 cm
 * of the stated distance up to 62 degrees north, far below the 960 m blocks
 * the grid answers in.
 *
 * Only the centre and the radius ever reach the page's address. The centre is
 * rounded to three decimals, about 100 m, and the address text that may have
 * found it is never a parameter, so a shared result says roughly where and
 * never what was typed.
 */

import type { Locale } from "../domain";
import type { Corner } from "./draw";

export const CIRCLE_RADII_KM = [5, 10, 25] as const;
export type CircleRadiusKm = (typeof CIRCLE_RADII_KM)[number];
export const DEFAULT_CIRCLE_RADIUS_KM: CircleRadiusKm = 10;
export const CIRCLE_VERTICES = 64;
/** Three decimals of a degree is about 110 m of latitude. */
export const CIRCLE_CENTRE_DECIMALS = 3;

const SEMI_MAJOR_METRES = 6378137;
const FLATTENING = 1 / 298.257222101;
const ECCENTRICITY_SQUARED = FLATTENING * (2 - FLATTENING);
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;

function meridianRadius(latitude: number): number {
  const sine = Math.sin(latitude);
  return (SEMI_MAJOR_METRES * (1 - ECCENTRICITY_SQUARED)) / Math.pow(1 - ECCENTRICITY_SQUARED * sine * sine, 1.5);
}

function primeVerticalRadius(latitude: number): number {
  const sine = Math.sin(latitude);
  return SEMI_MAJOR_METRES / Math.sqrt(1 - ECCENTRICITY_SQUARED * sine * sine);
}

export function isCircleRadius(value: unknown): value is CircleRadiusKm {
  return typeof value === "number" && (CIRCLE_RADII_KM as readonly number[]).includes(value);
}

export function roundCentre(value: number): number {
  return Number(value.toFixed(CIRCLE_CENTRE_DECIMALS));
}

/**
 * The circle as a ring of vertices, starting due north and running clockwise.
 * The latitude offset is solved first at the midpoint latitude, then the
 * longitude offset from the same midpoint, twice, which settles both.
 */
export function circlePolygon(centre: Corner, radiusKm: number, vertices: number = CIRCLE_VERTICES): Corner[] {
  if (!Number.isFinite(centre.latitude) || !Number.isFinite(centre.longitude) || Math.abs(centre.latitude) >= 89) {
    throw new RangeError("A circle needs a centre with a finite latitude away from the poles.");
  }
  if (!(radiusKm > 0) || !Number.isInteger(vertices) || vertices < 3) {
    throw new RangeError("A circle needs a positive radius and at least three vertices.");
  }
  const radiusMetres = radiusKm * 1000;
  const latitude0 = radians(centre.latitude);
  const ring: Corner[] = [];
  for (let index = 0; index < vertices; index += 1) {
    const bearing = (2 * Math.PI * index) / vertices;
    const north = radiusMetres * Math.cos(bearing);
    const east = radiusMetres * Math.sin(bearing);
    let middle = latitude0;
    let deltaLatitude = 0;
    let deltaLongitude = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      deltaLatitude = north / meridianRadius(middle);
      middle = latitude0 + deltaLatitude / 2;
      deltaLongitude = east / (primeVerticalRadius(middle) * Math.cos(middle));
    }
    ring.push({
      latitude: centre.latitude + degrees(deltaLatitude),
      longitude: centre.longitude + degrees(deltaLongitude),
    });
  }
  return ring;
}

export class CircleQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircleQueryError";
  }
}

export type CircleQuery = Readonly<{ latitude: number; longitude: number; radiusKm: CircleRadiusKm }>;

const CIRCLE_QUERY_KEYS = ["latitude", "longitude", "radiusKm"];

const DRAW_PATH: Record<Locale, string> = { en: "/en/explore/draw", fr: "/fr/explorer/dessiner" };

export function drawPagePath(locale: Locale): string {
  return DRAW_PATH[locale];
}

/**
 * The shareable address of a circle's result. It takes exactly three numbers
 * and refuses anything else, so a label, a query or any other text that came
 * with the point cannot be carried into a link by accident: an extra field is
 * an error, not something quietly dropped.
 */
export function circleResultHref(locale: Locale, input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CircleQueryError("A circle link needs a centre and a radius.");
  }
  const keys = Object.keys(input);
  if (keys.length !== CIRCLE_QUERY_KEYS.length || !keys.every((key) => CIRCLE_QUERY_KEYS.includes(key))) {
    throw new CircleQueryError("A circle link carries only a latitude, a longitude and a radius.");
  }
  const { latitude, longitude, radiusKm } = input as Record<string, unknown>;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    throw new CircleQueryError("A circle link needs a numeric latitude.");
  }
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    throw new CircleQueryError("A circle link needs a numeric longitude.");
  }
  if (!isCircleRadius(radiusKm)) {
    throw new CircleQueryError("A circle link needs a radius of 5, 10 or 25 km.");
  }
  const lat = latitude.toFixed(CIRCLE_CENTRE_DECIMALS);
  const lon = longitude.toFixed(CIRCLE_CENTRE_DECIMALS);
  return `${DRAW_PATH[locale]}?shape=circle&lat=${lat}&lon=${lon}&r=${radiusKm}`;
}

export type InitialCircle = Readonly<{ centre: Corner | null; radiusKm: CircleRadiusKm }>;

const COORDINATE_TEXT = /^-?\d{1,3}(?:\.\d{1,6})?$/;

function readCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "string" || !COORDINATE_TEXT.test(value)) return null;
  const number = Number(value);
  return Math.abs(number) <= limit ? roundCentre(number) : null;
}

/**
 * Reads a circle back out of the page's address. Anything that is not plainly
 * a number is ignored rather than interpreted, and the centre is rounded to the
 * same three decimals the link was written with.
 */
export function parseCircleQuery(query: Readonly<Record<string, string | string[] | undefined>>): InitialCircle | null {
  if (query.shape !== "circle") return null;
  const radius = typeof query.r === "string" && /^\d{1,2}$/.test(query.r) ? Number(query.r) : Number.NaN;
  const radiusKm = isCircleRadius(radius) ? radius : DEFAULT_CIRCLE_RADIUS_KM;
  const latitude = readCoordinate(query.lat, 90);
  const longitude = readCoordinate(query.lon, 180);
  return {
    centre: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    radiusKm,
  };
}
