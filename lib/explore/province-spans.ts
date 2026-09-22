import releaseRecord from "@/data/phase3-province-span-release.json";
import { CELL_HECTARES } from "../domain/loss-vocabulary";
import {
  EXPLORE_ANNUAL_STEP_COUNT,
  EXPLORE_INTERVAL_COUNT,
  EXPLORE_INTERVAL_FIRST_YEAR,
  EXPLORE_INTERVAL_LAST_YEAR,
  intervalMeasurement,
  type ExploreInterval,
  type IntervalMeasurement,
} from "./interval";
import { UNMAPPED_REASONS } from "./unmapped-reasons";

/*
 * The four provinces, for any span from 1984 to 2022.
 *
 * Item C of the 2026-09-18 admission released these figures. They are small
 * enough to ship whole (four provinces, 741 spans, four counts each), so the
 * province panel and the province fill follow the year control with no request
 * at all, and cannot disagree with each other because both read this module.
 */

export type ProvinceSpanId = "59" | "48" | "35" | "24";

type ProvinceSpanEntry = Readonly<{
  id: ProvinceSpanId;
  code: "BC" | "AB" | "ON" | "QC";
  name: Readonly<{ en: string; fr: string }>;
  cells: number;
  unmappedCells: number;
  intervalKnownCells: readonly number[];
  intervalUnionLossCells: readonly number[];
  intervalUnknownCells: readonly number[];
  intervalSummedLossCells: readonly number[];
}>;

type ProvinceSpanRelease = Readonly<{
  schema: string;
  cellHectares: number;
  firstYear: number;
  lastYear: number;
  annualStepCount: number;
  spanCount: number;
  summedPercentAllowed: false;
  claims: Readonly<{ admitted: boolean; released: boolean; expertReviewed: boolean; complete: boolean }>;
  provinces: readonly ProvinceSpanEntry[];
}>;

/** Fails closed: a release this page cannot read correctly is not read at all. */
export function parseProvinceSpanRelease(value: unknown): readonly ProvinceSpanEntry[] {
  const release = value as ProvinceSpanRelease;
  if (
    release?.schema !== "witness-tree/phase3-province-span-release/1" ||
    release.cellHectares !== CELL_HECTARES ||
    release.firstYear !== EXPLORE_INTERVAL_FIRST_YEAR ||
    release.lastYear !== EXPLORE_INTERVAL_LAST_YEAR ||
    release.annualStepCount !== EXPLORE_ANNUAL_STEP_COUNT ||
    release.spanCount !== EXPLORE_INTERVAL_COUNT ||
    release.summedPercentAllowed !== false ||
    release.claims?.admitted !== true ||
    release.claims?.released !== true ||
    release.claims?.expertReviewed !== false ||
    release.claims?.complete !== false ||
    !Array.isArray(release.provinces) ||
    release.provinces.length !== 4
  ) {
    throw new Error("The province span release has an invalid envelope.");
  }
  for (const province of release.provinces) {
    for (const key of ["intervalKnownCells", "intervalUnionLossCells", "intervalUnknownCells", "intervalSummedLossCells"] as const) {
      if (!Array.isArray(province[key]) || province[key].length !== EXPLORE_INTERVAL_COUNT) {
        throw new Error(`${province.code} ${key} does not hold one count per span.`);
      }
    }
  }
  return release.provinces;
}

export const PROVINCE_SPANS = parseProvinceSpanRelease(releaseRecord);

/** One province's answer for one span, with the share of it nobody could see. */
export type ProvinceSpanMeasurement = IntervalMeasurement &
  Readonly<{
    id: ProvinceSpanId;
    code: ProvinceSpanEntry["code"];
    name: ProvinceSpanEntry["name"];
    /** Unknown in the start year, as a share of the whole province. Never folded into the loss share. */
    unknownSharePercent: number;
    /** What the province's unmapped part mostly is, where that is known to differ from unmeasured forest. */
    unmappedCharacter: Readonly<{ en: string; fr: string }>;
  }>;

export function provinceSpanMeasurements(interval: ExploreInterval): readonly ProvinceSpanMeasurement[] {
  return PROVINCE_SPANS.flatMap((province) => {
    const measurement = intervalMeasurement(
      { ...province, boundaryId: province.id, boundaryName: province.name.en },
      interval,
    );
    if (!measurement) return [];
    const unknownCells = (measurement.unknownHectares ?? 0) / CELL_HECTARES;
    return [{
      ...measurement,
      id: province.id,
      code: province.code,
      name: province.name,
      unknownSharePercent: (unknownCells / province.cells) * 100,
      unmappedCharacter: UNMAPPED_REASONS[province.id],
    }];
  });
}

/**
 * The four provinces together. Exact, because the provinces are disjoint by the
 * same centre rule, so each cell is counted in exactly one of them. Never called
 * a national figure: the rest of the country is not in it.
 */
export function fourProvinceSpanMeasurement(interval: ExploreInterval): IntervalMeasurement | null {
  const rows = provinceSpanMeasurements(interval);
  if (rows.length !== 4) return null;
  const sum = (key: "knownForestedHectares" | "unionLossHectares" | "summedLossHectares" | "unknownHectares") =>
    rows.every((row) => row[key] !== null) ? rows.reduce((total, row) => total + (row[key] as number), 0) : null;
  const known = sum("knownForestedHectares");
  const union = sum("unionLossHectares");
  return {
    fromYear: interval.fromYear,
    toYear: interval.toYear,
    knownForestedHectares: known,
    unionLossHectares: union,
    unionLossPercent: known !== null && union !== null && known > 0 ? (union / known) * 100 : null,
    summedLossHectares: sum("summedLossHectares"),
    unknownHectares: sum("unknownHectares"),
  };
}

/*
 * Five classes, because a span can run from one year to thirty-eight and the
 * share grows with it: one annual step sits well under 1 percent, the whole
 * record near 20. Fixed breaks, so a colour means the same share at every span
 * and the reader can compare two spans by colour alone.
 */
export const SPAN_SHARE_BREAKS = [1, 5, 10, 20] as const;

export function spanShareClass(percent: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  let band = 0;
  for (const edge of SPAN_SHARE_BREAKS) if (percent >= edge) band += 1;
  return band as 0 | 1 | 2 | 3 | 4;
}
