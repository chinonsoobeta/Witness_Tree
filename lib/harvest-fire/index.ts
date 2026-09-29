import seriesRecord from "@/data/harvest-fire-province-annual-series.json";
import { COVERAGE_GRADES, type CoverageGrade } from "../domain/coverage";
import { formatYearRange, yearRange } from "../domain/year-range";
import type { Locale } from "../domain";

/*
 * Harvest and fire by province and year, 1985 to 2022, from the national
 * satellite record (docs/HARVEST_FIRE_SERIES_DECISION.md).
 *
 * The owner decision lets years be added here, and only here, because each
 * cell carries at most one change year per product: a harvest total or a fire
 * total counts each cell once. Harvest and fire are never added to each other,
 * so nothing in this module does. 1984 has no datable change and stays
 * Unknown. A record that fails validation yields no series at all, so the page
 * shows nothing rather than something the record does not support.
 */

type Localized = Readonly<{ en: string; fr: string }>;

export type HarvestFireProvinceId = "59" | "48" | "35" | "24";

type YearRow = Readonly<{
  year: number;
  coverageGrade?: CoverageGrade;
  harvestCells: number | null;
  fireCells: number | null;
  unknownReason?: Localized;
}>;

export type HarvestFireProvince = Readonly<{
  id: HarvestFireProvinceId;
  code: "BC" | "AB" | "ON" | "QC";
  key: string;
  name: Localized;
  landCells: number;
  unknownCells: number;
  years: readonly YearRow[];
}>;

export type HarvestFireSeries = Readonly<{
  firstYear: number;
  lastYear: number;
  baselineYear: number;
  measure: Localized;
  sumRule: Localized;
  limits: readonly Localized[];
  baselineReason: Localized;
  sources: Readonly<{
    harvest: Readonly<{ title: string; url: string }>;
    fire: Readonly<{ title: string; url: string }>;
    citation: string;
    boundary: string;
    licenceUrl: string;
    attribution: Localized;
  }>;
  provinces: readonly HarvestFireProvince[];
}>;

export const HARVEST_FIRE_PROVINCE_IDS: readonly HarvestFireProvinceId[] = ["59", "48", "35", "24"];

export const HARVEST_FIRE_ROUTES = { en: "/en/data/harvest-and-fire", fr: "/fr/donnees/recolte-et-incendies" } as const;

const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;

export function parseHarvestFireSeries(value: unknown): HarvestFireSeries | null {
  const record = value as {
    schema?: string;
    claims?: Record<string, boolean>;
    firstYear?: number;
    lastYear?: number;
    baselineYear?: number;
    cellHectares?: number;
    sumRule?: { allowed?: string } & Localized;
    measure?: Localized;
    limits?: Localized[];
    sources?: HarvestFireSeries["sources"];
    provinces?: HarvestFireProvince[];
  } | null;
  if (record?.schema !== "witness-tree/harvest-fire-province-annual-series/1") return null;
  if (record.claims?.ownerPublished !== true || record.cellHectares !== 0.09) return null;
  if (record.sumRule?.allowed !== "within-one-product") return null;
  const { firstYear, lastYear, baselineYear } = record;
  if (firstYear !== 1985 || lastYear !== 2022 || baselineYear !== 1984) return null;
  const provinces = record.provinces ?? [];
  if (provinces.map((p) => p.id).join() !== HARVEST_FIRE_PROVINCE_IDS.join()) return null;
  for (const province of provinces) {
    if (!count(province.landCells) || !count(province.unknownCells)) return null;
    const [baseline, ...dated] = province.years;
    if (baseline?.year !== baselineYear || baseline.harvestCells !== null || baseline.fireCells !== null || !baseline.unknownReason) return null;
    if (dated.length !== lastYear - firstYear + 1) return null;
    const valid = dated.every((row, i) => row.year === firstYear + i && count(row.harvestCells) && count(row.fireCells)
      && row.coverageGrade !== undefined && COVERAGE_GRADES.includes(row.coverageGrade));
    if (!valid) return null;
  }
  if (!record.measure || !record.sumRule || !record.limits?.length || !record.sources) return null;
  return {
    firstYear, lastYear, baselineYear,
    measure: record.measure,
    sumRule: { en: record.sumRule.en, fr: record.sumRule.fr },
    limits: record.limits,
    baselineReason: provinces[0].years[0].unknownReason as Localized,
    sources: record.sources,
    provinces,
  };
}

export const HARVEST_FIRE_SERIES = parseHarvestFireSeries(seriesRecord);

/** Exact: a cell is 0.09 ha, so hundredths of a hectare are whole numbers. */
export const cellsToHectares = (cells: number) => (cells * 9) / 100;

export type HarvestFireStep = 1 | 5 | 10 | "span";
export const HARVEST_FIRE_STEPS: readonly HarvestFireStep[] = [1, 5, 10, "span"];

export type HarvestFireBin = Readonly<{
  firstYear: number;
  lastYear: number;
  /** Fewer years than the step names, as 2020 to 2022 in five-year steps. */
  short: boolean;
  harvestHectares: number;
  fireHectares: number;
}>;

/**
 * Totals per interval. Harvest is added only to harvest and fire only to fire;
 * the decision record says why that counts each cell once.
 */
export function harvestFireBins(
  province: HarvestFireProvince,
  firstYear: number,
  lastYear: number,
  step: HarvestFireStep,
): readonly HarvestFireBin[] {
  const length = step === "span" ? lastYear - firstYear + 1 : step;
  const bins: HarvestFireBin[] = [];
  for (let start = firstYear; start <= lastYear; start += length) {
    const end = Math.min(start + length - 1, lastYear);
    const rows = province.years.filter((row) => row.year >= start && row.year <= end);
    bins.push({
      firstYear: start,
      lastYear: end,
      short: end - start + 1 < length,
      harvestHectares: cellsToHectares(rows.reduce((n, row) => n + (row.harvestCells ?? 0), 0)),
      fireHectares: cellsToHectares(rows.reduce((n, row) => n + (row.fireCells ?? 0), 0)),
    });
  }
  return bins;
}

export function binLabel(bin: HarvestFireBin, locale: Locale): string {
  return formatYearRange(yearRange(bin.firstYear, bin.lastYear), locale, "compact");
}

export type HarvestFireScale = "shared" | "own";
export type HarvestFireView = "chart" | "table";

export type HarvestFireQuery = Readonly<{
  provinces: readonly HarvestFireProvinceId[];
  firstYear: number;
  lastYear: number;
  step: HarvestFireStep;
  scale: HarvestFireScale;
  view: HarvestFireView;
}>;

const FIRST = 1985;
const LAST = 2022;

function year(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= FIRST && value <= LAST ? value : fallback;
}

/**
 * The page's state, from its address. Anything unreadable falls back to the
 * default view: all four provinces, 1985 to 2022, five-year steps on one scale.
 * A span shorter than ten years defaults to single years, because five-year
 * steps over a short span would be one or two bars.
 */
export function parseHarvestFireQuery(query: Readonly<Record<string, string | undefined>>): HarvestFireQuery {
  const requested = (query.provinces ?? "").split(",").filter((id): id is HarvestFireProvinceId =>
    (HARVEST_FIRE_PROVINCE_IDS as readonly string[]).includes(id));
  const provinces = HARVEST_FIRE_PROVINCE_IDS.filter((id) => requested.includes(id));
  let firstYear = year(query.from, FIRST);
  let lastYear = year(query.to, LAST);
  if (firstYear > lastYear) [firstYear, lastYear] = [lastYear, firstYear];
  const stepRaw = query.step === "span" ? "span" : Number(query.step);
  const step = HARVEST_FIRE_STEPS.includes(stepRaw as HarvestFireStep)
    ? (stepRaw as HarvestFireStep)
    : lastYear - firstYear + 1 < 10 ? 1 : 5;
  return {
    provinces: provinces.length > 0 ? provinces : HARVEST_FIRE_PROVINCE_IDS,
    firstYear,
    lastYear,
    step,
    scale: query.scale === "own" ? "own" : "shared",
    view: query.view === "table" ? "table" : "chart",
  };
}

export function harvestFireHref(locale: Locale, query: Partial<HarvestFireQuery>): string {
  const params = new URLSearchParams();
  if (query.provinces && query.provinces.length < HARVEST_FIRE_PROVINCE_IDS.length) params.set("provinces", query.provinces.join(","));
  if (query.firstYear !== undefined) params.set("from", String(query.firstYear));
  if (query.lastYear !== undefined) params.set("to", String(query.lastYear));
  if (query.step !== undefined) params.set("step", String(query.step));
  if (query.scale === "own") params.set("scale", "own");
  if (query.view === "table") params.set("view", "table");
  const search = params.toString();
  return search ? `${HARVEST_FIRE_ROUTES[locale]}?${search}` : HARVEST_FIRE_ROUTES[locale];
}

/** A round axis top and its gridlines: steps of 1, 2, 2.5 or 5 times a power of ten. */
export function niceScale(max: number, targetTicks = 5): Readonly<{ top: number; ticks: readonly number[] }> {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) as number;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return { top, ticks };
}

export type HarvestFireChartModel = Readonly<{
  province: HarvestFireProvince;
  bins: readonly HarvestFireBin[];
  top: number;
  ticks: readonly number[];
}>;

/** One chart per chosen province. A shared scale uses the largest bar across all of them. */
export function harvestFireCharts(series: HarvestFireSeries, query: HarvestFireQuery): readonly HarvestFireChartModel[] {
  const charts = query.provinces.map((id) => {
    const province = series.provinces.find((p) => p.id === id) as HarvestFireProvince;
    return { province, bins: harvestFireBins(province, query.firstYear, query.lastYear, query.step) };
  });
  const largest = (bins: readonly HarvestFireBin[]) => Math.max(0, ...bins.flatMap((b) => [b.harvestHectares, b.fireHectares]));
  const shared = niceScale(Math.max(0, ...charts.map((c) => largest(c.bins))));
  return charts.map((chart) => ({ ...chart, ...(query.scale === "shared" ? shared : niceScale(largest(chart.bins))) }));
}

/**
 * Explore's span: from one year to another means the change years after the
 * first and up to the second, so 2021 to 2022 is the change dated 2022.
 * Returns nothing for a span the series does not reach.
 */
export function harvestFireSpanTotals(fromYear: number, toYear: number) {
  const series = HARVEST_FIRE_SERIES;
  if (!series || fromYear >= toYear || fromYear + 1 < series.firstYear || toYear > series.lastYear) return null;
  return series.provinces.map((province) => ({
    province,
    ...harvestFireBins(province, fromYear + 1, toYear, "span")[0],
  }));
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
};

/** The rows on screen, one line per province and interval, in hectares to two decimals. */
export function harvestFireCsv(charts: readonly HarvestFireChartModel[]): string {
  const header = ["province", "first_year", "last_year", "years", "short_interval", "harvest_hectares", "fire_hectares", "unmapped_hectares_unknown"];
  const lines = charts.flatMap(({ province, bins }) => bins.map((bin) => [
    province.code,
    bin.firstYear,
    bin.lastYear,
    bin.lastYear - bin.firstYear + 1,
    bin.short ? "yes" : "no",
    bin.harvestHectares.toFixed(2),
    bin.fireHectares.toFixed(2),
    cellsToHectares(province.unknownCells).toFixed(2),
  ].map(csvCell).join(",")));
  return `${[header.join(","), ...lines].join("\n")}\n`;
}
