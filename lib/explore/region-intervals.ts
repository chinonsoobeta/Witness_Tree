import source from "@/data/phase3-economic-region-interval-measurements.json";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
  type ExploreInterval,
} from "./interval";
import { decodeIntervalArea, intervalSpanFigures, type DecodedIntervalArea } from "./interval-spans";
import type { RidingIntervalMeasurement } from "./riding-intervals";

/**
 * Reads the economic-region interval measurements.
 *
 * Each region is the sum of the census subdivisions inside it, measured with
 * the same method as the ridings (scripts/build-place-region-measurements.mjs).
 * Like the riding table it holds every span, so it stays on the server:
 * scripts/check-interval-release.mjs fails the build if a client module imports
 * it.
 */

const CLAIMS = {
  admitted: false,
  released: false,
  productionEligible: false,
  externalAction: false,
} as const;

const REGION_COUNT = 44;

/**
 * The owner decided on 2026-09-27 that a region with less than 1% of its
 * forest unmapped is treated as fully measured. The share is taken over the
 * mapped forest and the readout names the unmapped share beside it. Ridings
 * and census subdivisions keep the strict rule.
 */
export const REGION_UNKNOWN_TOLERANCE_PERCENT = 1;

type Region = DecodedIntervalArea & Readonly<{ boundaryId: string }>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactClaims = (value: unknown) =>
  object(value) &&
  Object.keys(value).length === 4 &&
  Object.entries(CLAIMS).every(([key, expected]) => value[key] === expected);

/** Fails closed before any region number reaches a page. */
export function parseRegionIntervalRelease(value: unknown): readonly Region[] {
  if (
    !object(value) ||
    value.schema !== "witness-tree/phase3-economic-region-interval-measurements/1" ||
    value.boundaryEdition !== "statcan-2021-economic-regions" ||
    value.cellHectares !== 0.09 ||
    value.firstYear !== EXPLORE_INTERVAL_FIRST_YEAR ||
    value.lastYear !== EXPLORE_INTERVAL_LAST_YEAR ||
    value.annualStepCount !== EXPLORE_ANNUAL_STEP_COUNT ||
    value.spanCount !== EXPLORE_INTERVAL_COUNT ||
    value.summedPercentAllowed !== false ||
    !exactClaims(value.claims) ||
    !Array.isArray(value.regions) ||
    value.regions.length !== REGION_COUNT
  ) {
    throw new Error("Economic-region interval measurements have an invalid release envelope.");
  }
  const seen = new Set<string>();
  return value.regions.map((candidate) => {
    // The overlay tiles key each region by its Statistics Canada DGUID, with
    // the national namespace in front.
    if (!object(candidate) || typeof candidate.boundaryId !== "string" || !/^2021S0500\d{4}$/.test(candidate.boundaryId)) {
      throw new Error("An economic-region interval measurement has an invalid contract.");
    }
    const boundaryId = `CA-${candidate.boundaryId}`;
    if (seen.has(boundaryId)) throw new Error(`Duplicate economic-region measurement ${boundaryId}.`);
    seen.add(boundaryId);
    return { boundaryId, ...decodeIntervalArea(candidate, `Economic-region measurement ${boundaryId}`) };
  });
}

const regions = parseRegionIntervalRelease(source);

/** Every economic region for one span, keyed as the overlay's features are. */
export function regionIntervalMeasurements(interval: ExploreInterval): readonly RidingIntervalMeasurement[] {
  return regions.map((region) => ({
    overlay: "economic-regions",
    jurisdiction: "CA",
    boundaryId: region.boundaryId,
    fromYear: interval.fromYear,
    toYear: interval.toYear,
    ...intervalSpanFigures(region, interval, REGION_UNKNOWN_TOLERANCE_PERCENT),
  }));
}
