import release from "@/data/phase3-riding-interval-measurements.json";
import { districtIndexLayer, FEDERAL_LAYER_ID, PROVINCIAL_LAYER_IDS } from "@/lib/districts/index-lookup";
import { EXPLORE_INTERVAL_FIRST_YEAR, EXPLORE_INTERVAL_LAST_YEAR } from "@/lib/explore/interval";
import {
  parseRidingIntervalRelease,
  provincialRidingKnownForestHectares,
  ridingIntervalMeasurements,
} from "@/lib/explore/riding-intervals";
import {
  adaptFederalRidingComparison,
  adaptProvincialRidingComparison,
  byCoveredProvince,
  COVERED_PROVINCES,
  provincialRidingProvince,
  type CoveredProvince,
  type RankingScope,
} from "./real-adapter";
import type { ComparisonPlace, RankedRiding, RankingContext } from "./types";

/*
 * Compare covers the whole record, 1984 to 2022, for federal and provincial
 * ridings alike, from the riding interval release that Explore and the place
 * pages read, so a riding shows the same figure on all three. Names and
 * representation orders come from the district index the address lookup
 * already reads.
 */
const interval = { fromYear: EXPLORE_INTERVAL_FIRST_YEAR, toYear: EXPLORE_INTERVAL_LAST_YEAR } as const;
const dataVersion = release.builtFrom.replace(/^derived\//, "");
const measurements = ridingIntervalMeasurements(interval);

const federalLayer = districtIndexLayer(FEDERAL_LAYER_ID);
if (!federalLayer) throw new Error("No district index layer names the federal ridings.");
const federalNames: ReadonlyMap<string, { en: string; fr: string }> = new Map(federalLayer.legend.map((entry) => [`CA-${entry.districtId}`, entry.name]));
const federalName = (boundaryId: string) => {
  const name = federalNames.get(boundaryId);
  if (!name) throw new Error(`Federal riding ${boundaryId} has no name in the district index.`);
  return name;
};
/** Each federal riding's mapped forest at the span's start, as provincialRidingKnownForestHectares gives it for provincial ones. */
const start = interval.fromYear - EXPLORE_INTERVAL_FIRST_YEAR;
const federalForest: ReadonlyMap<string, number> = new Map(parseRidingIntervalRelease(release)
  .filter((district) => district.jurisdiction === "CA")
  .map((district) => [district.boundaryId, Math.round(district.knownForestCellsByStartYear[start]! * 9) / 100]));
const federalRows = measurements.filter((row) => row.jurisdiction === "CA");
const measuredFederal = new Set(federalRows.map((row) => row.boundaryId));

export const federalRidingComparison = adaptFederalRidingComparison({
  interval,
  dataVersion,
  rows: federalRows.map((row) => ({
    boundaryId: row.boundaryId,
    name: federalName(row.boundaryId),
    coverage: row.coverage,
    observedLossPercent: row.observedLossPercent,
    observedLossHectares: row.observedLossHectares,
    ...(row.admittedUnknownPercent === undefined ? {} : { admittedUnknownPercent: row.admittedUnknownPercent }),
    knownForestedHectares: federalForest.get(row.boundaryId) ?? Number.NaN,
  })),
  outside: [...federalNames.keys()]
    .filter((boundaryId) => !measuredFederal.has(boundaryId))
    .map((boundaryId) => ({ boundaryId, name: federalName(boundaryId) })),
});

const layers = byCoveredProvince((province) => {
  const id = PROVINCIAL_LAYER_IDS.find((layer) => layer.startsWith(`${province.toLowerCase()}-`));
  const layer = id ? districtIndexLayer(id) : null;
  if (!id || !layer) throw new Error(`No district index layer names the ${province} provincial ridings.`);
  const names: ReadonlyMap<string, { en: string; fr: string }> = new Map(layer.legend.map((entry) => [entry.districtId, entry.name]));
  return { edition: Number(id.slice(3)), names };
});
const forest = provincialRidingKnownForestHectares(interval);

export const provincialRidingComparison = adaptProvincialRidingComparison({
  interval,
  dataVersion,
  editions: byCoveredProvince((province) => layers[province].edition),
  rows: measurements
    .filter((row) => row.jurisdiction !== "CA")
    .map((row) => {
      const layer = layers[row.jurisdiction as CoveredProvince];
      const name = layer?.names.get(row.boundaryId.slice(row.jurisdiction.length + 1));
      if (!name) throw new Error(`Provincial riding ${row.boundaryId} has no name in the district index.`);
      return {
        boundaryId: row.boundaryId,
        jurisdiction: row.jurisdiction,
        name,
        coverage: row.coverage,
        observedLossPercent: row.observedLossPercent,
        observedLossHectares: row.observedLossHectares,
        ...(row.admittedUnknownPercent === undefined ? {} : { admittedUnknownPercent: row.admittedUnknownPercent }),
        knownForestedHectares: forest.get(row.boundaryId) ?? Number.NaN,
      };
    }),
});

/** Every riding Compare can show: the four provinces' federal ridings, then their provincial ridings. */
export const comparableRidings: readonly RankedRiding[] = [
  ...federalRidingComparison.comparisonRows,
  ...provincialRidingComparison.rows,
];

/**
 * The rankings that place the chosen ridings: the federal one for a federal
 * riding, and each chosen provincial riding's own province. With no riding
 * chosen, the federal ranking stands in, as it always has.
 */
export function comparisonRankings(places: readonly (ComparisonPlace | null)[]): readonly Readonly<{
  scope: RankingScope;
  rows: readonly RankedRiding[];
  context: RankingContext;
}>[] {
  const provinces = new Set(places.flatMap((place) => {
    const province = place ? provincialRidingProvince(place.id) : null;
    return province ? [province] : [];
  }));
  const federal = places.some((place) => place !== null && provincialRidingProvince(place.id) === null) || provinces.size === 0;
  return [
    ...(federal ? [{
      scope: { level: "federal" as const, nationalTotal: federalRidingComparison.nationalTotal },
      rows: federalRidingComparison.comparisonRows,
      context: federalRidingComparison.context,
    }] : []),
    ...COVERED_PROVINCES.filter((province) => provinces.has(province)).map((province) => ({
      scope: { level: "provincial" as const, province },
      rows: provincialRidingComparison.rowsByProvince[province],
      context: provincialRidingComparison.contexts[province],
    })),
  ];
}
