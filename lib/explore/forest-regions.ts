import type { Locale } from "@/lib/domain";

/**
 * The regions the Explore map shades, as the owner named them on 2026-10-03:
 * four or five per province, each the sum of whole Statistics Canada 2021
 * economic regions. The fit is approximate where a familiar name does not
 * follow those lines; the Toronto economic region, for one, also holds Durham,
 * York, Peel and Halton. See docs/FOREST_REGION_SHADING_DECISION.md.
 *
 * Definitions only, so a browser bundle can carry it. The figures are summed
 * on the server from the economic-region interval table.
 */

export type ForestRegionProvince = "BC" | "AB" | "ON" | "QC";

export type ForestRegion = Readonly<{
  id: string;
  province: ForestRegionProvince;
  name: Readonly<Record<Locale, string>>;
  /** Four-digit economic-region codes, as in the 2021 DGUID. */
  economicRegions: readonly string[];
}>;

export const FOREST_REGIONS: readonly ForestRegion[] = [
  { id: "bc-vancouver-island", province: "BC", name: { en: "Vancouver Island", fr: "Île de Vancouver" }, economicRegions: ["5910"] },
  { id: "bc-southwest", province: "BC", name: { en: "Metro Vancouver, Sea-to-Sky and Sunshine Coast", fr: "Grand Vancouver, Sea-to-Sky et Sunshine Coast" }, economicRegions: ["5920"] },
  { id: "bc-interior", province: "BC", name: { en: "Interior", fr: "Intérieur" }, economicRegions: ["5930", "5940", "5950"] },
  { id: "bc-north", province: "BC", name: { en: "North", fr: "Nord" }, economicRegions: ["5960", "5970", "5980"] },
  { id: "ab-south", province: "AB", name: { en: "South", fr: "Sud" }, economicRegions: ["4810", "4830"] },
  { id: "ab-central", province: "AB", name: { en: "Central", fr: "Centre" }, economicRegions: ["4820", "4850", "4860"] },
  { id: "ab-north", province: "AB", name: { en: "North", fr: "Nord" }, economicRegions: ["4870", "4880"] },
  { id: "ab-rockies", province: "AB", name: { en: "Rockies", fr: "Rocheuses" }, economicRegions: ["4840"] },
  { id: "on-gta", province: "ON", name: { en: "Greater Toronto Area", fr: "Région du Grand Toronto" }, economicRegions: ["3530"] },
  { id: "on-southwest", province: "ON", name: { en: "Southwest", fr: "Sud-Ouest" }, economicRegions: ["3540", "3550", "3560", "3570", "3580"] },
  { id: "on-central", province: "ON", name: { en: "Central", fr: "Centre" }, economicRegions: ["3520"] },
  { id: "on-eastern", province: "ON", name: { en: "Eastern Ontario", fr: "Est de l’Ontario" }, economicRegions: ["3510", "3515"] },
  { id: "on-northern", province: "ON", name: { en: "Northern Ontario", fr: "Nord de l’Ontario" }, economicRegions: ["3590", "3595"] },
  { id: "qc-montreal", province: "QC", name: { en: "Greater Montréal Area", fr: "Grand Montréal" }, economicRegions: ["2440", "2445"] },
  { id: "qc-st-lawrence", province: "QC", name: { en: "St. Lawrence River Corridor", fr: "Corridor du Saint-Laurent" }, economicRegions: ["2420", "2425", "2430", "2433", "2435", "2450", "2470"] },
  { id: "qc-maritime", province: "QC", name: { en: "Maritimes", fr: "Régions maritimes" }, economicRegions: ["2410", "2415", "2480"] },
  { id: "qc-north", province: "QC", name: { en: "Laurentians and the North", fr: "Laurentides et le Nord" }, economicRegions: ["2455", "2460", "2465", "2475", "2490"] },
];

/** The overlay tiles key an economic region by its DGUID with the national namespace in front. */
export const economicRegionTileId = (code: string) => `CA-2021S0500${code}`;

/**
 * One region's figures for one span.
 *
 * The share is taken over the forest that was mapped. A region with an
 * unmapped share at or above the regions' 1% tolerance is `partlyMapped`: the
 * map hatches it, and its hectares are a minimum. A region where no forest was
 * mapped at all has no share and is drawn grey.
 */
export type ForestRegionFigure = Readonly<{
  id: string;
  fromYear: number;
  toYear: number;
  mappedSharePercent: number | null;
  partlyMapped: boolean;
  unmappedPercent: number;
  lossHectares: number;
}>;
