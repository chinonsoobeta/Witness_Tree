import type { RidingBoundaryMeasurement } from "./boundary-readout";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR, type ExploreInterval } from "./interval";
import { decodeIntervalArea, intervalSpanFigures, type DecodedIntervalArea } from "./interval-spans";

/**
 * Census-subdivision figures for the map, fetched only when a reader points at
 * a subdivision.
 *
 * Every span for 2,291 places is about 7 MB, too much for the page or the
 * worker, so it is published per province beside the layer's tiles and read
 * one province at a time. The files are gzip-encoded at rest, and the browser
 * decodes them. Nothing here holds figures itself, so it is safe in a browser
 * bundle.
 */

// Pinned to the immutable release published by
// scripts/publish-census-subdivision-overlay-release.mjs. Only these names are
// written here, not the whole record, to keep the record out of the browser
// bundle; scripts/check-census-subdivision-overlay.mjs fails if they drift from
// data/census-subdivision-overlay-release.json.
export const CENSUS_SUBDIVISION_RELEASE = Object.freeze({
  releaseId: "dfba0ca5796496c84703f9602da6507a6b5a2f8f5dbc7e450a8790e2073e6482",
  base: "https://d3g1406o0uekin.cloudfront.net/releases/census-subdivision-overlay-v1/dfba0ca5796496c84703f9602da6507a6b5a2f8f5dbc7e450a8790e2073e6482",
  tiles: "census-subdivisions-v1.pmtiles",
  sourceLayer: "census_subdivisions",
  figures: Object.freeze({
    BC: "census-subdivisions-BC.json",
    AB: "census-subdivisions-AB.json",
    ON: "census-subdivisions-ON.json",
    QC: "census-subdivisions-QC.json",
  }) as Readonly<Record<string, string>>,
});

const PROVINCE_FOR_PRUID: Readonly<Record<string, string>> = { "59": "BC", "48": "AB", "35": "ON", "24": "QC" };

/** The province file a subdivision's figures are in, from its CSDUID prefix. */
export function censusSubdivisionProvince(boundaryId: string): string | null {
  const match = /^CA-(\d{2})\d{5}$/.exec(boundaryId);
  return match ? PROVINCE_FOR_PRUID[match[1]] ?? null : null;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export type CensusSubdivisionFigures = ReadonlyMap<string, unknown>;

/**
 * Checks a province file's envelope and indexes its places by the tile id.
 * Each place is decoded, and its span invariants checked, only when it is
 * asked for.
 */
export function parseCensusSubdivisionFile(value: unknown, province: string): CensusSubdivisionFigures {
  if (
    !object(value) ||
    value.schema !== "witness-tree/census-subdivision-interval-measurements/1" ||
    value.province !== province ||
    value.cellHectares !== 0.09 ||
    value.firstYear !== EXPLORE_INTERVAL_FIRST_YEAR ||
    value.lastYear !== EXPLORE_INTERVAL_LAST_YEAR ||
    !Array.isArray(value.places)
  ) {
    throw new Error(`The ${province} census-subdivision figures have an invalid envelope.`);
  }
  const places = new Map<string, unknown>();
  for (const place of value.places) {
    if (!object(place) || typeof place.boundaryId !== "string" || !/^\d{7}$/.test(place.boundaryId)) {
      throw new Error(`The ${province} census-subdivision figures hold an invalid place.`);
    }
    places.set(`CA-${place.boundaryId}`, place);
  }
  return places;
}

const decoded = new WeakMap<object, DecodedIntervalArea>();

/** One subdivision's figures for one span, or null when the file has no such place. */
export function censusSubdivisionMeasurement(
  figures: CensusSubdivisionFigures,
  boundaryId: string,
  interval: ExploreInterval,
): RidingBoundaryMeasurement | null {
  const place = figures.get(boundaryId);
  if (!object(place)) return null;
  let area = decoded.get(place);
  if (!area) {
    area = decodeIntervalArea(place, `Census subdivision ${boundaryId}`);
    decoded.set(place, area);
  }
  return {
    overlay: "census-subdivisions",
    jurisdiction: "CA",
    boundaryId,
    fromYear: interval.fromYear,
    toYear: interval.toYear,
    ...intervalSpanFigures(area, interval),
  };
}

const requests = new Map<string, Promise<CensusSubdivisionFigures>>();

/** Fetches a province's file once per page; a failed fetch may be retried. */
export function loadCensusSubdivisionFigures(province: string): Promise<CensusSubdivisionFigures> {
  const fileName = CENSUS_SUBDIVISION_RELEASE.figures[province];
  if (!fileName) return Promise.reject(new Error(`No census-subdivision figures for ${province}.`));
  let request = requests.get(province);
  if (!request) {
    request = fetch(`${CENSUS_SUBDIVISION_RELEASE.base}/${fileName}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Census-subdivision figures returned HTTP ${response.status}.`);
        return response.json();
      })
      .then((body) => parseCensusSubdivisionFile(body, province));
    request.catch(() => requests.delete(province));
    requests.set(province, request);
  }
  return request;
}
