import { localized } from "./localized";

// The Canada National Forest Inventory definition carries four conditions, not three.
// Version nfi-2 adds the fourth, minimumWidthMetres, which nfi-1 omitted entirely.
//
// Recording a condition is not implementing it, and this one in particular cannot be
// implemented on the 30 m national grid the project's rasters use: the narrowest
// feature a 30 m raster can represent is one cell, already 30 m across, so a 20 m
// test can never fail and a zero it returned would describe the grid rather than the
// land. Measured at the two widths the grid can resolve, the condition is not small:
// opening British Columbia's 2022 FAO forest extent at 60 m removes 1,070,599 ha
// (1.67 percent), which is more than four times what the 1 ha area condition removes.
// See scripts/bc_forest_width_opening.py and docs/VLCE2_FOREST_MASK_DECISION.md.
//
// The condition is recorded here so that the published definition matches the
// definition the project claims to use, and so that any mask built later has to
// confront the gap rather than inherit an incomplete rule silently.

export const FOREST_DEFINITION_VERSION = "nfi-2" as const;

export const FOREST_DEFINITION = Object.freeze({
  version: FOREST_DEFINITION_VERSION,
  minimumAreaHectares: 1,
  minimumCrownClosurePercent: 10,
  minimumMatureTreeHeightMetres: 5,
  minimumWidthMetres: 20,
  source: "Canada National Forest Inventory",
  text: localized(
    "Land of at least 1 hectare and at least 20 metres wide, with at least 10 percent crown closure, carrying trees able to reach 5 metres at maturity.",
    "Terre d’au moins 1 hectare et d’au moins 20 mètres de largeur, présentant un couvert de cimes d’au moins 10 pour cent et portant des arbres capables d’atteindre 5 mètres à maturité.",
  ),
  glossaryPath: Object.freeze({ en: "/en/glossary#forest", fr: "/fr/glossaire#foret" }),
});

export type ForestDenominator = Readonly<{
  kind: "forested-hectares";
  hectares: number;
  referenceYear: number;
  definitionVersion: typeof FOREST_DEFINITION_VERSION;
  boundaryEdition: string;
}>;

export function forestDenominator(
  hectares: number,
  referenceYear: number,
  boundaryEdition: string,
): ForestDenominator {
  if (!Number.isFinite(hectares) || hectares < 0) throw new Error("Forested hectares must be non-negative.");
  if (!boundaryEdition.trim()) throw new Error("Every denominator requires a boundary edition.");
  return Object.freeze({
    kind: "forested-hectares",
    hectares,
    referenceYear,
    definitionVersion: FOREST_DEFINITION_VERSION,
    boundaryEdition,
  });
}

export function percentageOfForest(numeratorHectares: number, denominator: ForestDenominator): number {
  if (denominator.hectares === 0) throw new Error("A percentage cannot be computed without forested hectares.");
  return (numeratorHectares / denominator.hectares) * 100;
}
