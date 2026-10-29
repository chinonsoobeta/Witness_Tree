import source from "@/data/phase2-federal-riding-latest-comparison.json";
import release from "@/data/phase3-riding-interval-measurements.json";
import { districtIndexLayer, PROVINCIAL_LAYER_IDS } from "@/lib/districts/index-lookup";
import { provincialRidingKnownForestHectares, ridingIntervalMeasurements } from "@/lib/explore/riding-intervals";
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

export const federalRidingComparison = adaptFederalRidingComparison(
  source as Parameters<typeof adaptFederalRidingComparison>[0],
);

/*
 * Provincial ridings over the federal comparison's own span, so the two levels
 * on one page always describe the same years. Names and representation orders
 * come from the district index the address lookup already reads.
 */
const interval = source.context.interval;
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
  dataVersion: release.builtFrom.replace(/^derived\//, ""),
  editions: byCoveredProvince((province) => layers[province].edition),
  rows: ridingIntervalMeasurements(interval)
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
      scope: { level: "federal" as const, nationalTotal: federalRidingComparison.rows.length },
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
