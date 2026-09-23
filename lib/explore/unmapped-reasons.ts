import type { ProvinceSpanId } from "./province-spans";

export type UnmappedReason = Readonly<{
  en: string;
  fr: string;
  basis: readonly string[];
}>;

export const UNMAPPED_REASONS: Readonly<Record<ProvinceSpanId, UnmappedReason>> = {
  "59": {
    en: "mostly along the shoreline, where different versions of the provincial boundary disagree",
    fr: "surtout le long du littoral, où différentes versions de la limite provinciale ne concordent pas",
    basis: ["findings.britishColumbia.shorelineAndBoundaryEditionDisagreement.hectares"],
  },
  "48": {
    en: "mostly in the prairies and the settled south, outside the forest areas the source maps; the rest lies between 52° and 56° north",
    fr: "surtout dans les Prairies et le sud habité, hors des zones forestières que la source cartographie; le reste se trouve entre 52° et 56° de latitude nord",
    basis: ["findings.gap.provinceHectares.AB", "findings.gap.distribution.albertaMid52To56NHectares"],
  },
  "35": {
    en: "in the settled south, below 52° north, outside the forest areas the source maps",
    fr: "dans le sud habité, sous le 52e parallèle, hors des zones forestières que la source cartographie",
    basis: ["findings.gap.distribution.southBelow52NHectares", "findings.gap.provinceHectares.ON"],
  },
  "24": {
    en: "mostly in the far north, beyond where dense forest ends; the rest is in the settled south",
    fr: "surtout dans le Grand Nord, au-delà de la limite de la forêt dense; le reste se trouve dans le sud habité",
    basis: ["findings.gap.distribution.quebecFarNorthHectares", "findings.gap.provinceHectares.QC"],
  },
};
