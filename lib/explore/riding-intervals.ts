import source from "@/data/phase3-riding-interval-measurements.json";
import type { BoundaryMeasurementCoverage, RidingBoundaryMeasurement } from "./boundary-readout";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
  intervalWindowIndex,
  type ExploreInterval,
} from "./interval";

/**
 * Reads the checked-in interval measurements.
 *
 * This module holds every span for every district, which is far more than any
 * one reader asks for, so it stays on the server: the route resolves the span
 * from the URL and hands the client only that span's numbers. Keeping it out of
 * `lib/explore/index.ts` is what keeps it out of the browser bundle, and
 * `scripts/check-interval-release.mjs` fails the build if either changes.
 */

const CLAIMS = {
  admitted: false,
  released: false,
  productionEligible: false,
  externalAction: false,
} as const;

const EXPECTED_COUNTS = {
  CA: 343,
  BC: 93,
  AB: 87,
  ON: 124,
  QC: 127,
} as const;

const OVERLAY_FOR = (jurisdiction: string) =>
  jurisdiction === "CA" ? "federal-ridings" : "provincial-ridings";

type District = Readonly<{
  overlay: RidingBoundaryMeasurement["overlay"];
  jurisdiction: string;
  boundaryId: string;
  unmappedCells: number;
  /** Running totals, so a span's summed figure is one subtraction. */
  annualLossPrefix: readonly number[];
  knownForestCellsByStartYear: readonly number[];
  unknownCellsByStartYear: readonly number[];
  /** Cumulative along the closing year, already summed out of the deltas. */
  unionLossCells: readonly number[];
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactClaims = (value: unknown) =>
  object(value) &&
  Object.keys(value).length === 4 &&
  Object.entries(CLAIMS).every(([key, expected]) => value[key] === expected);

const counts = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0);

/**
 * Fails closed before any interval number reaches a page.
 *
 * The build step already checked these invariants against the aggregates it
 * read. Checking them again here is deliberate: this runs against the bytes
 * that are actually committed, so a truncated or hand-edited file is caught by
 * the code that consumes it rather than by the code that wrote it.
 */
export function parseRidingIntervalRelease(value: unknown): readonly District[] {
  if (
    !object(value) ||
    value.schema !== "witness-tree/phase3-riding-interval-measurements/1" ||
    value.cellHectares !== 0.09 ||
    value.firstYear !== EXPLORE_INTERVAL_FIRST_YEAR ||
    value.lastYear !== EXPLORE_INTERVAL_LAST_YEAR ||
    value.annualStepCount !== EXPLORE_ANNUAL_STEP_COUNT ||
    value.spanCount !== EXPLORE_INTERVAL_COUNT ||
    value.summedPercentAllowed !== false ||
    value.netChangeIncluded !== false ||
    !exactClaims(value.claims) ||
    !Array.isArray(value.jurisdictions) ||
    value.jurisdictions.length !== 5
  ) {
    throw new Error("Riding interval measurements have an invalid release envelope.");
  }

  const districts: District[] = [];
  const seen = new Set<string>();
  for (const entry of value.jurisdictions) {
    if (!object(entry) || typeof entry.jurisdiction !== "string" || !(entry.jurisdiction in EXPECTED_COUNTS)) {
      throw new Error("Riding interval measurements name an unexpected jurisdiction.");
    }
    const jurisdiction = entry.jurisdiction as keyof typeof EXPECTED_COUNTS;
    if (!Array.isArray(entry.districts) || entry.districts.length !== EXPECTED_COUNTS[jurisdiction]) {
      throw new Error(`Riding interval measurements have an invalid ${jurisdiction} count.`);
    }
    const overlay = OVERLAY_FOR(jurisdiction);
    for (const candidate of entry.districts) {
      if (
        !object(candidate) ||
        typeof candidate.boundaryId !== "string" ||
        candidate.boundaryId.trim() === "" ||
        typeof candidate.unmappedCells !== "number" ||
        !Number.isInteger(candidate.unmappedCells) ||
        candidate.unmappedCells < 0 ||
        !counts(candidate.annualLossCells, EXPLORE_ANNUAL_STEP_COUNT) ||
        !counts(candidate.knownForestCellsByStartYear, EXPLORE_ANNUAL_STEP_COUNT) ||
        !counts(candidate.unknownCellsByStartYear, EXPLORE_ANNUAL_STEP_COUNT) ||
        !counts(candidate.unionLossCellDeltas, EXPLORE_INTERVAL_COUNT)
      ) {
        throw new Error("A riding interval measurement has an invalid contract.");
      }
      // Boundary tiles namespace every identifier with its jurisdiction, and the
      // aggregates carry the authority's raw id. Join on the tile form.
      const boundaryId = `${jurisdiction}-${candidate.boundaryId}`;
      if (seen.has(boundaryId)) throw new Error(`Duplicate riding interval measurement ${boundaryId}.`);
      seen.add(boundaryId);

      const annualLossPrefix = [0];
      for (const step of candidate.annualLossCells) annualLossPrefix.push(annualLossPrefix.at(-1)! + step);

      const unionLossCells: number[] = [];
      let running = 0;
      let index = 0;
      for (let start = 0; start < EXPLORE_ANNUAL_STEP_COUNT; start += 1) {
        running = 0;
        for (let end = start; end < EXPLORE_ANNUAL_STEP_COUNT; end += 1) {
          running += candidate.unionLossCellDeltas[index];
          const summed = annualLossPrefix[end + 1] - annualLossPrefix[start];
          if (running > summed || running > candidate.knownForestCellsByStartYear[start]) {
            throw new Error(`Riding interval measurement ${boundaryId} breaks a span invariant.`);
          }
          unionLossCells.push(running);
          index += 1;
        }
      }

      districts.push({
        overlay,
        jurisdiction,
        boundaryId,
        unmappedCells: candidate.unmappedCells,
        annualLossPrefix,
        knownForestCellsByStartYear: candidate.knownForestCellsByStartYear,
        unknownCellsByStartYear: candidate.unknownCellsByStartYear,
        unionLossCells,
      });
    }
  }
  return districts;
}

const districts = parseRidingIntervalRelease(source);
const CELL_HECTARES = 0.09;
const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;

/** A district's numbers for one span, as the map and the readout want them. */
export type RidingIntervalMeasurement = RidingBoundaryMeasurement &
  Readonly<{
    fromYear: number;
    toYear: number;
    /** Annual losses added together. It has no denominator and never carries a percentage. */
    summedLossHectares: number;
  }>;

/**
 * Resolves every district for one span.
 *
 * A district reports a share of its own forest only when the whole district was
 * mapped, which is the same rule the annual product has always applied. Where
 * part of the district is unmapped the observed subtotal is still reported,
 * because withholding a number that was measured is its own kind of error; what
 * is withheld is the share, because its denominator is not known.
 */
export function ridingIntervalMeasurements(
  interval: ExploreInterval,
): readonly RidingIntervalMeasurement[] {
  const start = interval.fromYear - EXPLORE_INTERVAL_FIRST_YEAR;
  const end = interval.toYear - EXPLORE_INTERVAL_FIRST_YEAR - 1;
  const window = intervalWindowIndex(interval);
  return districts.map((district) => {
    const union = district.unionLossCells[window];
    const known = district.knownForestCellsByStartYear[start];
    const unknown = district.unknownCellsByStartYear[start];
    const summed = district.annualLossPrefix[end + 1] - district.annualLossPrefix[start];
    const coverage: BoundaryMeasurementCoverage =
      unknown > 0 || district.unmappedCells > 0
        ? "partial-with-unknown"
        : known === 0
          ? "none-mapped"
          : "complete";
    const complete = coverage === "complete";
    return {
      overlay: district.overlay,
      jurisdiction: district.jurisdiction,
      boundaryId: district.boundaryId,
      coverage,
      fromYear: interval.fromYear,
      toYear: interval.toYear,
      observedLossPercent: complete ? (union / known) * 100 : null,
      observedLossHectares: complete ? hectares(union) : null,
      knownObservedSubtotalHectares: hectares(union),
      summedLossHectares: hectares(summed),
    };
  });
}
