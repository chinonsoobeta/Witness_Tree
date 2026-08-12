import { localized } from "./localized";

export const FOREST_DEFINITION_VERSION = "nfi-1" as const;

export const FOREST_DEFINITION = Object.freeze({
  version: FOREST_DEFINITION_VERSION,
  minimumAreaHectares: 1,
  minimumCrownClosurePercent: 10,
  minimumMatureTreeHeightMetres: 5,
  source: "Canada National Forest Inventory",
  text: localized(
    "Land of at least 1 hectare, with at least 10 percent crown closure, carrying trees able to reach 5 metres at maturity.",
    "Terre d’au moins 1 hectare, présentant un couvert de cimes d’au moins 10 pour cent et portant des arbres capables d’atteindre 5 mètres à maturité.",
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
