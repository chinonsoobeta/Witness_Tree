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
    /** The province's whole area on the grid, in hectares. */
    areaHectares: number;
    /** Forest mapped in the start year, as a share of the whole province. */
    forestSharePercent: number | null;
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
      areaHectares: province.cells * CELL_HECTARES,
      forestSharePercent: measurement.knownForestedHectares === null ? null : (measurement.knownForestedHectares / (province.cells * CELL_HECTARES)) * 100,
      unmappedCharacter: UNMAPPED_REASONS[province.id],
    }];
  });
}

/**
 * The rows as the pages show them. The owner decided on 2026-09-27 that the
 * site's English copy spells Québec. The released record keeps the spelling it
 * was released with, and so do the downloads that
 * scripts/publish-province-span-downloads.mts builds from provinceSpanMeasurements,
 * so the name changes here and nowhere upstream.
 */
export function provinceSpanDisplayRows(interval: ExploreInterval): readonly ProvinceSpanMeasurement[] {
  return provinceSpanMeasurements(interval).map((row) => (row.code === "QC" ? { ...row, name: { ...row.name, en: "Québec" } } : row));
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

/*
 * Class edges that follow the length of the span on display.
 *
 * The fixed breaks above put almost every region in the palest class for one
 * year and in the two darkest for the whole record, so the map said little at
 * either end. These edges were chosen from the checked-in figures: for every
 * span of each length, the shares of the 17 map regions
 * (forestRegionFigures in region-intervals.ts) were pooled, and each row's
 * edges sit near that pool's quintiles, rounded to plain numbers. At every
 * length no class then holds more than about a third of the regions
 * (tests/explore-span-classes.test.tsx checks this against the same data).
 *
 * A colour therefore means "how this region compares at this span length",
 * and the legend always prints the edges in use. During Play the edges of the
 * whole record are held for the whole run, so the frames can be compared and
 * the map darkens steadily.
 */
export const SPAN_SHARE_BREAKS_BY_LENGTH: readonly Readonly<{ maxYears: number; breaks: readonly [number, number, number, number] }>[] = [
  { maxYears: 1, breaks: [0.5, 0.75, 1, 2] },
  { maxYears: 3, breaks: [1, 1.5, 2.5, 4] },
  { maxYears: 7, breaks: [2, 3, 5, 8] },
  { maxYears: 15, breaks: [4, 6, 8, 12] },
  { maxYears: 25, breaks: [6, 10, 14, 20] },
  { maxYears: EXPLORE_INTERVAL_LAST_YEAR - EXPLORE_INTERVAL_FIRST_YEAR, breaks: [10, 15, 20, 25] },
];

/** The class edges for a span, from its length in years. */
export function spanShareBreaks(interval: ExploreInterval): readonly [number, number, number, number] {
  const years = interval.toYear - interval.fromYear;
  const row = SPAN_SHARE_BREAKS_BY_LENGTH.find((entry) => years <= entry.maxYears) ?? SPAN_SHARE_BREAKS_BY_LENGTH[SPAN_SHARE_BREAKS_BY_LENGTH.length - 1]!;
  return row.breaks;
}

/** The edges of the whole record, held through a Play run. */
export const WHOLE_RECORD_SHARE_BREAKS = spanShareBreaks({ fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR });

/** The class of a share on the given edges; a missing share has no class. */
export function spanShareClassOn(percent: number | null, breaks: readonly number[]): 0 | 1 | 2 | 3 | 4 | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  let band = 0;
  for (const edge of breaks) if (percent >= edge) band += 1;
  return band as 0 | 1 | 2 | 3 | 4;
}
