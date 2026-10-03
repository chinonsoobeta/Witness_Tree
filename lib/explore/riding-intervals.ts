import source from "@/data/phase3-riding-interval-measurements.json";
import type { RidingBoundaryMeasurement } from "./boundary-readout";
import { COVERED_FEDERAL_DISTRICT_PREFIXES } from "@/lib/comparison/real-adapter";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
  type ExploreInterval,
} from "./interval";
import { decodeIntervalArea, intervalSpanFigures, type DecodedIntervalArea } from "./interval-spans";

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

type District = DecodedIntervalArea & Readonly<{
  overlay: RidingBoundaryMeasurement["overlay"];
  jurisdiction: string;
  boundaryId: string;
}>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactClaims = (value: unknown) =>
  object(value) &&
  Object.keys(value).length === 4 &&
  Object.entries(CLAIMS).every(([key, expected]) => value[key] === expected);

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
      if (!object(candidate) || typeof candidate.boundaryId !== "string" || candidate.boundaryId.trim() === "") {
        throw new Error("A riding interval measurement has an invalid contract.");
      }
      // Boundary tiles namespace every identifier with its jurisdiction, and the
      // aggregates carry the authority's raw id. Join on the tile form.
      const boundaryId = `${jurisdiction}-${candidate.boundaryId}`;
      if (seen.has(boundaryId)) throw new Error(`Duplicate riding interval measurement ${boundaryId}.`);
      seen.add(boundaryId);
      districts.push({
        overlay,
        jurisdiction,
        boundaryId,
        ...decodeIntervalArea(candidate, `Riding interval measurement ${boundaryId}`),
      });
    }
  }
  return districts;
}

const districts = parseRidingIntervalRelease(source);

/** A district's numbers for one span, as the map and the readout want them. */
export type RidingIntervalMeasurement = RidingBoundaryMeasurement &
  Readonly<{
    fromYear: number;
    toYear: number;
    /** Annual losses added together. It has no denominator and never carries a percentage. */
    summedLossHectares: number;
  }>;

function inRecordScope(district: Readonly<{ jurisdiction: string; boundaryId: string }>) {
  return district.jurisdiction !== "CA"
    || COVERED_FEDERAL_DISTRICT_PREFIXES.some((prefix) => district.boundaryId.startsWith(`CA-${prefix}`));
}

/**
 * Resolves every district for one span. The coverage rule is intervalSpanFigures',
 * strict unless a caller admits a small unmapped share.
 */
export function ridingIntervalMeasurements(
  interval: ExploreInterval,
  unknownTolerancePercent = 0,
): readonly RidingIntervalMeasurement[] {
  // The release measures all 343 federal ridings from national data, but the
  // record covers four provinces only (plan: no coverage beyond them in
  // version 1). A federal riding elsewhere is left out here, so no page
  // publishes a figure for it; Compare already applies the same rule.
  return districts.filter(inRecordScope).map((district) => ({
    overlay: district.overlay,
    jurisdiction: district.jurisdiction,
    boundaryId: district.boundaryId,
    fromYear: interval.fromYear,
    toYear: interval.toYear,
    ...intervalSpanFigures(district, interval, unknownTolerancePercent),
  }));
}
