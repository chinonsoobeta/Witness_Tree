import { harvestFireSpanTotals } from "@/lib/harvest-fire";
import { EXPLORE_MAP_COLOURS } from "./map-style";
import { provinceSpanMeasurements, type ProvinceSpanId } from "./province-spans";

/*
 * Recorded harvest and recorded fire as a share of each province's forest, for
 * the Explore map's harvest and wildfire modes. Without it those modes opened
 * on bare outlines: their patches only draw from zoom 8.
 *
 * The numerator is the national harvest (or fire) change-year record for the
 * span's change years, the same series /en/data/harvest-and-fire publishes;
 * each 30 m cell carries at most one harvest year and one fire year, so the
 * years add up without counting a cell twice. The denominator is the forest
 * mapped at the span's start, the same one the forest-loss shading uses.
 *
 * The shade is the average share per year, so a one-year span and the whole
 * record read on one scale: a longer span raises the plain share with every
 * year it adds, and harvest or fire in any one year is a fraction of a
 * percent, which the forest-loss breaks would paint as one flat band.
 */

/** Band edges, in percent of the forest per year. */
export const CAUSE_BREAKS = [0.1, 0.25, 0.5, 1] as const;

export function causeBand(perYear: number | null): 0 | 1 | 2 | 3 | 4 | null {
  if (perYear === null || !Number.isFinite(perYear) || perYear < 0) return null;
  const index = CAUSE_BREAKS.findIndex((edge) => perYear < edge);
  return (index === -1 ? 4 : index) as 0 | 1 | 2 | 3 | 4;
}

export type ProvinceCause = "harvest" | "fire";

/** Average percent of the forest at the span's start per year, per province, or null where it can't be computed. */
export function provinceCauseShares(cause: ProvinceCause, fromYear: number, toYear: number): Readonly<Record<ProvinceSpanId, number | null>> {
  const totals = harvestFireSpanTotals(fromYear, toYear);
  const forest = Object.fromEntries(provinceSpanMeasurements({ fromYear, toYear }).map((row) => [row.id, row.knownForestedHectares]));
  const shares = {} as Record<ProvinceSpanId, number | null>;
  for (const id of ["59", "48", "35", "24"] as const) {
    const row = totals?.find((entry) => entry.province.id === id);
    const known = forest[id];
    const hectares = row ? (cause === "harvest" ? row.harvestHectares : row.fireHectares) : null;
    shares[id] = hectares === null || !known || toYear <= fromYear ? null : ((hectares / known) * 100) / (toYear - fromYear);
  }
  return shares;
}

const mix = (from: string, to: string, weight: number) => {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * weight).toString(16).padStart(2, "0")).join("")}`;
};

/** Five bands per cause, from nearly ground to the full mode colour. */
export const CAUSE_RAMPS: Readonly<Record<ProvinceCause, readonly string[]>> = {
  harvest: [0.14, 0.32, 0.52, 0.74, 1].map((weight) => mix(EXPLORE_MAP_COLOURS.ground, EXPLORE_MAP_COLOURS.harvest, weight)),
  fire: [0.14, 0.32, 0.52, 0.74, 1].map((weight) => mix(EXPLORE_MAP_COLOURS.ground, EXPLORE_MAP_COLOURS.wildfire, weight)),
};

/** One colour per province; a share that can't be computed gets the ground, not the lightest band. */
export function provinceCauseColours(cause: ProvinceCause, fromYear: number, toYear: number): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(provinceCauseShares(cause, fromYear, toYear)).map(([id, share]) => {
    const band = causeBand(share);
    return [id, band === null ? EXPLORE_MAP_COLOURS.ground : CAUSE_RAMPS[cause][band]!];
  }));
}
