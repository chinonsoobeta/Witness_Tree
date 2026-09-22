import type { ProvinceSpanId } from "./province-spans";

export type UnmappedReason = Readonly<{
  en: string;
  fr: string;
  basis: readonly string[];
}>;

export const UNMAPPED_REASONS: Readonly<Record<ProvinceSpanId, UnmappedReason>> = {
  "59": {
    en: "mostly shoreline and boundary-edition disagreement against the GeoBC terrestrial boundary",
    fr: "écart surtout lié au littoral et aux différences entre éditions des limites, par comparaison avec la limite terrestre de GeoBC",
    basis: ["findings.britishColumbia.shorelineAndBoundaryEditionDisagreement.hectares"],
  },
  "48": {
    en: "mostly in the prairies and the settled south, outside the forested ecosystems the source maps; the rest lies between 52° and 56° north",
    fr: "écart situé surtout dans les Prairies et les régions habitées du sud, hors des écosystèmes forestiers que la source cartographie; le reste se trouve entre 52° et 56° de latitude nord",
    basis: ["findings.gap.provinceHectares.AB", "findings.gap.distribution.albertaMid52To56NHectares"],
  },
  "35": {
    en: "in the settled south, below 52° north, outside the forested ecosystems the source maps",
    fr: "écart situé dans les régions habitées du sud, sous le 52e parallèle, hors des écosystèmes forestiers que la source cartographie",
    basis: ["findings.gap.distribution.southBelow52NHectares", "findings.gap.provinceHectares.ON"],
  },
  "24": {
    en: "mostly in the far north, beyond the northern limit of the closed-crown forest; the rest is in the settled south",
    fr: "écart situé surtout dans le Grand Nord, au-delà de la limite septentrionale de la forêt fermée; le reste se trouve dans les régions habitées du sud",
    basis: ["findings.gap.distribution.quebecFarNorthHectares", "findings.gap.provinceHectares.QC"],
  },
};
