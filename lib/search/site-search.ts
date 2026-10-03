import { districtIndexLayer } from "@/lib/districts/index-lookup";
import { provinceSpanMeasurements } from "@/lib/explore/province-spans";
import { ridingIntervalMeasurements, type RidingIntervalMeasurement } from "@/lib/explore/riding-intervals";
import { formatPercent, type Locale } from "@/lib/domain";
import release from "@/data/phase3-riding-interval-measurements.json";
import { placeFigure } from "./place-figures";
import {
  PLACE_NAME_INDEX,
  displayPlaceName,
  indexedPlace,
  placeTypeLabel,
  type IndexedPlace,
} from "./place-names";

const INTERVAL = { fromYear: 1984, toYear: 2022 } as const;
const CELL_HECTARES = 0.09;
const RESULT_LIMIT = 20;

const PROVINCES = [
  { id: "59", code: "BC", en: "British Columbia", fr: "Colombie-Britannique" },
  { id: "48", code: "AB", en: "Alberta", fr: "Alberta" },
  { id: "35", code: "ON", en: "Ontario", fr: "Ontario" },
  { id: "24", code: "QC", en: "Québec", fr: "Québec" },
] as const;

type RawRiding = Readonly<{
  boundaryId: string;
  boundaryName: string;
  knownForestCellsByStartYear: readonly number[];
  unknownCellsByStartYear: readonly number[];
}>;

type RawRelease = Readonly<{
  jurisdictions: readonly Readonly<{ jurisdiction: string; districts: readonly RawRiding[] }>[];
}>;

const normalizeSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replaceAll("--", " ")
  .replace(/[\u2013\u2014-]/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// The standard written abbreviations, English and French, as a reader types
// them after a place name: "Prince George, C.-B." or "Sudbury, Ont.".
const PROVINCE_ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  BC: ["B.C.", "C.-B."],
  AB: ["Alta.", "Alb."],
  ON: ["Ont."],
  QC: ["Que.", "Qc"],
};

const provinceAliases = PROVINCES.flatMap((province) => [
  { value: normalizeSearch(province.en), code: province.code },
  { value: normalizeSearch(province.fr), code: province.code },
  { value: province.code.toLowerCase(), code: province.code },
  ...(PROVINCE_ABBREVIATIONS[province.code] ?? []).map((abbreviation) => ({ value: normalizeSearch(abbreviation), code: province.code })),
]).sort((left, right) => right.value.length - left.value.length);

function splitQuery(query: string) {
  const normalized = normalizeSearch(query);
  for (const alias of provinceAliases) {
    if (normalized === alias.value) return { name: "", code: alias.code };
    if (normalized.endsWith(` ${alias.value}`)) {
      return { name: normalized.slice(0, -(alias.value.length + 1)).trim(), code: alias.code };
    }
  }
  return { name: normalized, code: undefined };
}

export type SearchRidingReference = Readonly<{
  id: string;
  name: string;
  nameFr: string;
  share: number;
}>;

export type SiteSearchResult = Readonly<{
  kind: "province" | "riding" | "community";
  id: string;
  name: string;
  nameFr?: string | null;
  province: string;
  type?: string;
  federal?: readonly SearchRidingReference[];
  provincial?: readonly SearchRidingReference[];
  unionLossHectares?: number | null;
  unionLossPercent?: number | null;
  knownForestedHectares?: number | null;
  unknownHectares?: number | null;
  unknownSharePercent?: number | null;
  unmappedCharacter?: Readonly<{ en: string; fr: string }>;
  coverage?: RidingIntervalMeasurement["coverage"];
  observedLossHectares?: number | null;
  observedLossPercent?: number | null;
  knownObservedSubtotalHectares?: number | null;
  score: number;
}>;

export type SiteSearchPage = Readonly<{
  results: readonly SiteSearchResult[];
  more: Readonly<Record<SiteSearchResult["kind"], number>>;
}>;

/** How much of a place lies in one riding, such as "60% of this place". */
export function formatSearchShare(share: number, locale: Locale) {
  const amount = share >= 1
    ? formatPercent(100, locale)
    : share > 0.99
      ? `${locale === "en" ? "over" : "plus de"} ${formatPercent(99, locale)}`
      : share < 0.01
        ? `${locale === "en" ? "under" : "moins de"} ${formatPercent(1, locale)}`
        : formatPercent(Math.max(1, Math.round(share * 100)), locale);
  return locale === "en" ? `${amount} of this place` : `${amount} de ce lieu`;
}

const rawRidings = (release as RawRelease).jurisdictions.flatMap((jurisdiction) =>
  jurisdiction.districts.map((district) => ({ ...district, jurisdiction: jurisdiction.jurisdiction })),
);
const rawRidingById = new Map(rawRidings.map((riding) => [`${riding.jurisdiction}-${riding.boundaryId}`, riding]));
const ridingMeasurements = ridingIntervalMeasurements(INTERVAL);

function ridingName(id: string) {
  const separator = id.indexOf("-");
  const jurisdiction = id.slice(0, separator);
  const districtId = id.slice(separator + 1);
  const layerId = jurisdiction === "CA"
    ? "federal-2023"
    : `${jurisdiction.toLowerCase()}-${jurisdiction === "QC" ? "2026" : jurisdiction === "AB" ? "2019" : jurisdiction === "ON" ? "2022" : "2023"}`;
  const entry = districtIndexLayer(layerId)?.legend.find((district) => district.districtId === districtId);
  const raw = rawRidingById.get(id);
  return entry?.name ?? { en: raw?.boundaryName ?? districtId, fr: raw?.boundaryName ?? districtId };
}

function ridingReference(id: string, share: number): SearchRidingReference {
  const name = ridingName(id);
  return { id, name: name.en, nameFr: name.fr, share };
}

const provinceRows = provinceSpanMeasurements(INTERVAL);
const provinceById = new Map(provinceRows.map((row) => [row.id, row]));

const ridingSearchRows = ridingMeasurements.map((measurement) => {
  const raw = rawRidingById.get(measurement.boundaryId);
  const known = raw ? raw.knownForestCellsByStartYear[0]! * CELL_HECTARES : null;
  const unknown = raw ? raw.unknownCellsByStartYear[0]! * CELL_HECTARES : null;
  const total = known !== null && unknown !== null ? known + unknown : null;
  return {
    ...measurement,
    name: ridingName(measurement.boundaryId),
    knownForestedHectares: known,
    unknownHectares: unknown,
    unknownSharePercent: total && total > 0 ? (unknown! / total) * 100 : null,
  };
});
const ridingById = new Map(ridingSearchRows.map((row) => [row.boundaryId, row]));

function scoreName(name: string, needle: string) {
  const value = normalizeSearch(name);
  if (value === needle) return 0;
  if (value.startsWith(needle)) return 1;
  if (value.split(" ").some((word) => word.startsWith(needle))) return 2;
  return value.includes(needle) ? 3 : 99;
}

function scoreNames(names: readonly string[], needle: string) {
  return Math.min(...names.map((name) => scoreName(name, needle)));
}

function placeRidingReferences(place: IndexedPlace, layer: "federal" | "provincial") {
  return place[layer].map(({ id, share }) => ridingReference(id, share));
}

function resultKindOrder(kind: SiteSearchResult["kind"]) {
  return kind === "province" ? 0 : kind === "riding" ? 1 : 2;
}

export function searchSite(query: string): SiteSearchPage {
  const { name, code } = splitQuery(query);
  if (!name && !code) return { results: [], more: { province: 0, riding: 0, community: 0 } };
  const results: SiteSearchResult[] = [];

  for (const province of PROVINCES) {
    const score = scoreNames([province.en, province.fr], name || normalizeSearch(province.en));
    if (score < 99 && (!code || code === province.code)) {
      const row = provinceById.get(province.id)!;
      results.push({
        kind: "province",
        id: province.id,
        name: province.en,
        nameFr: province.fr,
        province: province.code,
        unionLossHectares: row.unionLossHectares,
        unionLossPercent: row.unionLossPercent,
        knownForestedHectares: row.knownForestedHectares,
        unknownHectares: row.unknownHectares,
        unknownSharePercent: row.unknownSharePercent,
        unmappedCharacter: row.unmappedCharacter,
        score,
      });
    }
  }

  for (const row of ridingSearchRows) {
    const province = row.jurisdiction === "CA" ? undefined : row.jurisdiction;
    const score = scoreNames([row.name.en, row.name.fr], name);
    const provinceNumber = code === "QC" ? "24" : code === "ON" ? "35" : code === "AB" ? "48" : code === "BC" ? "59" : undefined;
    const provinceMatch = !code || code === province || (row.jurisdiction === "CA" && provinceNumber !== undefined && row.boundaryId.startsWith(`CA-${provinceNumber}`));
    if (score < 99 && provinceMatch) {
      results.push({
        kind: "riding",
        id: row.boundaryId,
        name: row.name.en,
        nameFr: row.name.fr,
        province: province ?? "CA",
        coverage: row.coverage,
        observedLossHectares: row.observedLossHectares,
        observedLossPercent: row.observedLossPercent,
        knownObservedSubtotalHectares: row.knownObservedSubtotalHectares,
        knownForestedHectares: row.knownForestedHectares,
        unknownHectares: row.unknownHectares,
        unknownSharePercent: row.unknownSharePercent,
        score,
      });
    }
  }

  for (const place of PLACE_NAME_INDEX.places) {
    if (code && place.province !== code) continue;
    const score = scoreNames([place.name, ...(place.nameFr ? [place.nameFr] : [])], name);
    if (score < 99) {
      results.push({
        kind: "community",
        id: place.id,
        name: displayPlaceName(place, "en"),
        nameFr: displayPlaceName(place, "fr"),
        province: place.province,
        type: place.type,
        federal: placeRidingReferences(place, "federal"),
        provincial: placeRidingReferences(place, "provincial"),
        score,
      });
    }
  }

  const groups = (Object.keys({ province: 0, riding: 0, community: 0 }) as SiteSearchResult["kind"][])
    .map((kind) => [kind, results.filter((result) => result.kind === kind)
      .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))] as const);
  const more = Object.fromEntries(groups.map(([kind, group]) => [kind, Math.max(0, group.length - RESULT_LIMIT)])) as Record<SiteSearchResult["kind"], number>;
  const limited = groups.flatMap(([, group]) => group.slice(0, RESULT_LIMIT));
  limited.sort((left, right) => left.score - right.score || resultKindOrder(left.kind) - resultKindOrder(right.kind) || left.name.localeCompare(right.name));
  return { results: limited, more };
}

export function provinceSearchRows() { return provinceRows; }
export function ridingSearchRow(id: string) { return ridingById.get(id); }
export function indexedPlaceForSearch(id: string): IndexedPlace | undefined { return indexedPlace(id); }
export function searchAttribution(locale: Locale) { return PLACE_NAME_INDEX.attribution[locale]; }
export function searchPlaceTypeLabel(type: string, locale: Locale) { return placeTypeLabel(type, locale); }

const FEDERAL_PROVINCE_BY_NUMBER: Readonly<Record<string, string>> = { "24": "QC", "35": "ON", "48": "AB", "59": "BC" };

export type WholeRecordRidingRank = Readonly<{
  id: string;
  name: Readonly<{ en: string; fr: string }>;
  province: string;
  lossPercent: number;
  lossHectares: number;
}>;

/**
 * The mapped forest a riding needs, in 1984, to be ranked by share of forest
 * lost. Below it, a city riding's few hundred hectares of woodland lead the
 * list on a single development, which says little about forests.
 */
export const WHOLE_RECORD_RANK_FLOOR_HECTARES = 50_000;

/**
 * Ridings ranked by the share of their mapped forest detected as lost at least
 * once from 1984 to 2022. Only ridings mapped in full, with at least the floor
 * above, are ranked: a partly mapped riding has no known denominator. Ties
 * break on hectares, then name, so the order never depends on input order.
 */
export function ridingsByWholeRecordLoss(level: "federal" | "provincial", limit: number, province?: string): readonly WholeRecordRidingRank[] {
  return ridingSearchRows
    .filter((row) => (level === "federal" ? row.jurisdiction === "CA" : row.jurisdiction !== "CA"))
    .filter((row) => row.coverage === "complete" && row.observedLossPercent !== null && row.observedLossHectares !== null)
    .filter((row) => row.knownForestedHectares !== null && row.knownForestedHectares >= WHOLE_RECORD_RANK_FLOOR_HECTARES)
    .map((row) => ({
      id: row.boundaryId,
      name: row.name,
      province: row.jurisdiction === "CA" ? FEDERAL_PROVINCE_BY_NUMBER[row.boundaryId.slice(3, 5)] ?? "CA" : row.jurisdiction,
      lossPercent: row.observedLossPercent!,
      lossHectares: row.observedLossHectares!,
    }))
    .filter((row) => province === undefined || row.province === province)
    .sort((a, b) => b.lossPercent - a.lossPercent || b.lossHectares - a.lossHectares || a.name.en.localeCompare(b.name.en))
    .slice(0, limit);
}

/**
 * The census types that name a city: City in British Columbia, Alberta and
 * Ontario, and Ville or Cité in Québec. Towns, villages and other
 * municipalities are left out.
 */
const CITY_TYPES: ReadonlySet<string> = new Set(["CY", "C", "CV", "V"]);

/**
 * The mapped forest a city needs to be ranked by share of forest lost. Half the
 * fully mapped cities have less; below it, a few hundred hectares of urban
 * woodland lead the list on the city's own growth, which says little about
 * forests.
 */
export const CITY_RANK_FLOOR_HECTARES = 5_000;

/**
 * Cities ranked the same way as the ridings above, from each place's own
 * 1984 to 2022 figure: only cities mapped in full, with at least the floor,
 * are ranked, and ties break on hectares, then name.
 */
export function citiesByWholeRecordLoss(limit: number, province?: string): readonly WholeRecordRidingRank[] {
  return PLACE_NAME_INDEX.places
    .filter((place) => CITY_TYPES.has(place.type) && (province === undefined || place.province === province))
    .flatMap((place) => {
      const figure = placeFigure(place.id);
      if (!figure || figure.coverage !== "complete" || figure.observedLossPercent === null || figure.observedLossHectares === null) return [];
      if (figure.knownForestedHectares < CITY_RANK_FLOOR_HECTARES) return [];
      return [{
        id: place.id,
        name: { en: displayPlaceName(place, "en"), fr: displayPlaceName(place, "fr") },
        province: place.province,
        lossPercent: figure.observedLossPercent,
        lossHectares: figure.observedLossHectares,
      }];
    })
    .sort((a, b) => b.lossPercent - a.lossPercent || b.lossHectares - a.lossHectares || a.name.en.localeCompare(b.name.en))
    .slice(0, limit);
}
