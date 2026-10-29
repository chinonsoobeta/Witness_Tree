import { assignConfidence } from "@/lib/domain/confidence";
import type { ConfidenceResult } from "@/lib/domain/confidence";
import { localized, type Locale, type LocalizedString } from "@/lib/domain/localized";
import type { Provenance, Reported } from "@/lib/domain/reported";
import type { BoundaryMeasurementCoverage } from "@/lib/explore/boundary-readout";
import { formatUnknownSharePercent } from "@/lib/explore/map-style";

/**
 * Turns one area's 1984 to 2022 cell counts into the figures its page shows.
 *
 * The rule is the one the rest of the site applies (intervalSpanFigures for
 * ridings and regions, placeFigure for communities), restated over plain counts
 * so a page and its search result can never disagree:
 *
 * - All of the area's forest was mapped: the hectares lost at least once, and
 *   their share of the forest mapped in 1984.
 * - Part of it has no satellite data: the hectares detected where it was
 *   mapped, labelled a minimum, and the share Unknown with its reason, because
 *   the denominator is not known. A caller may admit an unknown share below a
 *   tolerance (1% for ridings and regions, by owner decision); the share is
 *   then taken over the mapped forest and the unknown share travels with it.
 * - Nothing was detected where part was mapped, nothing was mapped at all, or
 *   no forest was mapped in 1984: Unknown with its reason, never 0.
 */

const CELL_HECTARES = 0.09;
const hectares = (cells: number) => Math.round(cells * CELL_HECTARES * 100) / 100;

export type WholeRecordCells = Readonly<{
  /** Forest cells lost at least once from 1984 to 2022. */
  union: number;
  /** Forest cells mapped in 1984, the denominator of the share. */
  known: number;
  /** Cells with no satellite data: the larger of the record's unknown and unmapped counts. */
  unknown: number;
}>;

export type WholeRecordFigures = Readonly<{
  coverage: BoundaryMeasurementCoverage;
  /** Hectares lost at least once, or Unknown with its reason. */
  lost: Reported;
  /** True when `lost` counts only the mapped part, so the true figure may be larger. */
  lostIsMinimum: boolean;
  /** Share of the 1984 mapped forest lost at least once, or Unknown with its reason. */
  share: Reported;
  /** Share of the area's forest-or-unknown land with no satellite data; null when there is none of either. */
  unknownSharePercent: number | null;
  /** Set only when a small unknown share was admitted under the caller's tolerance. */
  admittedUnknownPercent?: number;
  knownForestHectares: number;
  confidence: ConfidenceResult;
}>;

/** The satellite source every figure on a place page comes from, as its catalogue names it. */
export function landCoverProvenance(locale: Locale): Provenance {
  return {
    dataset: locale === "en"
      ? "Natural Resources Canada, Annual High-resolution forest land cover for Canada (1984-2022) (VLCE2)"
      : "Ressources naturelles Canada, Couverture forestière annuelle à haute résolution pour le Canada (1984-2022) (VLCE2)",
    version: locale === "en" ? "Published 2025-12-16; no separate version is stated" : "Publiée le 2025-12-16\u202F; aucune version distincte n’est indiquée",
    retrievedDate: "2026-08-12",
    licence: "ogl-canada-2.0",
    recordUrl: `https://open.canada.ca/data/${locale}/dataset/2785c103-9c2d-429b-9f3d-89f5cd9ea94d`,
  };
}

const MEASURED_CONFIDENCE: ConfidenceResult = {
  level: "medium",
  ruleId: "CONF-MEDIUM-001",
  reason: localized(
    "Strong evidence with a material limitation: a satellite detection on a 30 m grid, not an official record, and the accuracy of detected loss has not been measured.",
    "Preuve solide comportant une limite importante : une détection satellitaire sur une grille de 30 m, et non un registre officiel\u202F; l’exactitude de la perte détectée n’a pas été mesurée.",
  ),
};

/** Partial or missing coverage is a documented coverage gap, which the confidence rules mark limited. */
const GAP_CONFIDENCE = assignConfidence({ authoritativeRecord: false, geometryResolved: true, requiredAttributesPresent: true, coverageGap: true });

function unknown(reason: LocalizedString): Reported {
  return { kind: "unknown", evidence: "unknown", reason, coverageGrade: "national-baseline" };
}

function percent(value: number, locale: Locale) {
  return formatUnknownSharePercent(value, locale);
}

export function wholeRecordFigures(
  cells: WholeRecordCells,
  options: Readonly<{ locale: Locale; unknownTolerancePercent?: number }>,
): WholeRecordFigures {
  const { union, known, unknown: unknownCells } = cells;
  for (const value of [union, known, unknownCells]) {
    if (!Number.isInteger(value) || value < 0) throw new Error("Whole-record cell counts must be non-negative integers.");
  }
  if (union > known) throw new Error("Forest lost at least once cannot exceed the forest mapped in 1984.");
  const { locale, unknownTolerancePercent = 0 } = options;
  const provenance = landCoverProvenance(locale);
  const unknownSharePercent = known + unknownCells > 0 ? (unknownCells / (known + unknownCells)) * 100 : null;
  const admitted = unknownCells > 0 && known > 0 && unknownSharePercent! < unknownTolerancePercent;
  const coverage: BoundaryMeasurementCoverage =
    unknownCells > 0 && !admitted ? "partial-with-unknown" : known === 0 ? "none-mapped" : "complete";
  const base = {
    coverage,
    unknownSharePercent,
    knownForestHectares: hectares(known),
    ...(admitted ? { admittedUnknownPercent: unknownSharePercent! } : {}),
  };

  if (coverage === "complete") {
    return {
      ...base,
      lost: { kind: "figure", value: hectares(union), unit: "ha", evidence: "satellite-observation", confidence: MEASURED_CONFIDENCE, provenance },
      lostIsMinimum: false,
      share: { kind: "figure", value: (union / known) * 100, unit: "%", evidence: "satellite-observation", confidence: MEASURED_CONFIDENCE, provenance },
      confidence: MEASURED_CONFIDENCE,
    };
  }

  if (coverage === "none-mapped") {
    const reason = localized(
      "No forest was mapped here in 1984, so this record has no forest-loss figure for it.",
      "Aucune forêt n’était cartographiée ici en 1984\u202F; ce registre n’a donc aucun chiffre de perte forestière pour ce lieu.",
    );
    return { ...base, lost: unknown(reason), lostIsMinimum: false, share: unknown(reason), confidence: GAP_CONFIDENCE };
  }

  if (known === 0) {
    const reason = localized(
      "There is no satellite data here. The source covers only Canada’s forest regions, so any loss here is unknown.",
      "Il n’y a aucune donnée satellitaire ici. La source ne couvre que les régions forestières du Canada, donc toute perte ici est inconnue.",
    );
    return { ...base, lost: unknown(reason), lostIsMinimum: false, share: unknown(reason), confidence: GAP_CONFIDENCE };
  }

  const gap = { en: percent(unknownSharePercent!, "en"), fr: percent(unknownSharePercent!, "fr") };
  const shareReason = localized(
    `${gap.en} of this area’s forest has no satellite data, so the share lost can’t be worked out.`,
    `${gap.fr} de la forêt de cette zone n’a pas de données satellitaires\u202F; la part perdue ne peut donc pas être calculée.`,
  );
  if (union === 0) {
    return {
      ...base,
      lost: unknown(localized(
        `No loss was detected where this area was mapped, but ${gap.en} of its forest has no satellite data, so its loss is unknown.`,
        `Aucune perte n’a été détectée là où cette zone était cartographiée, mais ${gap.fr} de sa forêt n’a pas de données satellitaires\u202F; sa perte est donc inconnue.`,
      )),
      lostIsMinimum: false,
      share: unknown(shareReason),
      confidence: GAP_CONFIDENCE,
    };
  }
  return {
    ...base,
    lost: { kind: "figure", value: hectares(union), unit: "ha", evidence: "satellite-observation", confidence: GAP_CONFIDENCE, provenance },
    lostIsMinimum: true,
    share: unknown(shareReason),
    confidence: GAP_CONFIDENCE,
  };
}
