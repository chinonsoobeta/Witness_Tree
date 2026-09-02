import { formatHectares, formatPercent, SUM_TERM, type Locale } from "@/lib/domain";
import type { BoundaryOverlayId } from "./boundaries";

export type BoundaryMeasurementCoverage =
  | "complete"
  | "partial-with-unknown"
  | "none-mapped";

export type BoundarySelection = Readonly<{
  overlay: BoundaryOverlayId;
  boundaryId: string;
  name: string;
  jurisdiction: string;
}>;

/** A local riding measurement, keyed exactly as its boundary feature is. */
export type RidingBoundaryMeasurement = Readonly<{
  overlay: "federal-ridings" | "provincial-ridings";
  boundaryId: string;
  jurisdiction: string;
  coverage: BoundaryMeasurementCoverage;
  /** The span this row measures. Every number below is scoped to it. */
  fromYear: number;
  toYear: number;
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  knownObservedSubtotalHectares?: number | null;
  /**
   * The span's yearly losses added together, in hectares.
   *
   * Reported only where it exceeds the forest lost at least once, because
   * where the two agree a second identical figure teaches the reader nothing
   * and invites them to read a distinction into numbers that do not differ.
   */
  summedLossHectares?: number | null;
}>;

export type BoundaryReadout =
  | Readonly<{ kind: "boundary-only"; note: string }>
  | Readonly<{
      kind: "riding-measurement";
      interval: string;
      coverage: string;
      normalizedShare: string;
      absoluteLoss: string;
      knownObservedSubtotal?: string;
      summedLossLabel?: string;
      summedLoss?: string;
    }>;

const words = {
  en: {
    boundaryOnly: "Reference boundary only. No forest-loss measurement is available for this geography.",
    complete: "Complete mapped coverage",
    partial: "Partial mapped coverage; unknown area remains",
    none: "No mapped coverage",
    unavailable: "No local riding measurement",
    unknown: "Unknown",
  },
  fr: {
    boundaryOnly: "Limite de référence seulement. Aucune mesure de perte forestière n’est disponible pour cette géographie.",
    complete: "Couverture cartographiée complète",
    partial: "Couverture cartographiée partielle; une zone inconnue demeure",
    none: "Aucune couverture cartographiée",
    unavailable: "Aucune mesure locale pour cette circonscription",
    unknown: "Inconnu",
  },
} as const;

const isRidingOverlay = (overlay: BoundaryOverlayId): overlay is RidingBoundaryMeasurement["overlay"] =>
  overlay === "federal-ridings" || overlay === "provincial-ridings";

const finiteNonNegative = (value: number | null | undefined) =>
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0;

function assertMeasurement(measurement: RidingBoundaryMeasurement) {
  const complete = measurement.coverage === "complete";
  if (!Number.isInteger(measurement.fromYear) || !Number.isInteger(measurement.toYear) ||
    measurement.toYear <= measurement.fromYear) {
    throw new Error("A riding measurement must name a span that ends after it starts.");
  }
  if (complete !== (finiteNonNegative(measurement.observedLossPercent) && finiteNonNegative(measurement.observedLossHectares))) {
    throw new Error("Only complete riding coverage may report a total loss and normalized share.");
  }
  if (!complete && (measurement.observedLossPercent !== null || measurement.observedLossHectares !== null)) {
    throw new Error("Incomplete riding coverage must not report a complete loss or share.");
  }
  if (measurement.knownObservedSubtotalHectares !== undefined && measurement.knownObservedSubtotalHectares !== null && !finiteNonNegative(measurement.knownObservedSubtotalHectares)) {
    throw new Error("Known observed subtotal must be a non-negative finite number.");
  }
  if (measurement.summedLossHectares !== undefined && measurement.summedLossHectares !== null) {
    if (!finiteNonNegative(measurement.summedLossHectares)) {
      throw new Error("A summed loss must be a non-negative finite number.");
    }
    // A cell lost twice counts twice in the sum and once in the union, so the
    // sum can only ever be the larger of the two. A sum below the union means
    // the two figures were measured over different windows.
    if (finiteNonNegative(measurement.knownObservedSubtotalHectares) &&
      measurement.summedLossHectares < measurement.knownObservedSubtotalHectares!) {
      throw new Error("A summed loss cannot fall below the forest lost at least once.");
    }
  }
}

/**
 * Produces the map readout without knowing where the measurements came from.
 * The boundary id, jurisdiction and overlay form the join key so a federal
 * district can never accidentally receive a provincial measurement.
 */
export function boundaryReadout(
  selection: BoundarySelection,
  measurements: readonly RidingBoundaryMeasurement[],
  locale: Locale,
  interval: Readonly<{ fromYear: number; toYear: number }>,
): BoundaryReadout {
  const copy = words[locale];
  if (!isRidingOverlay(selection.overlay)) return { kind: "boundary-only", note: copy.boundaryOnly };

  const measurement = measurements.find((candidate) =>
    candidate.overlay === selection.overlay &&
    candidate.boundaryId === selection.boundaryId &&
    candidate.jurisdiction === selection.jurisdiction,
  );
  if (!measurement) {
    return {
      kind: "riding-measurement",
      interval: `${interval.fromYear}–${interval.toYear}`,
      coverage: copy.unavailable,
      normalizedShare: copy.unknown,
      absoluteLoss: copy.unknown,
    };
  }
  assertMeasurement(measurement);
  // A row measured over a different span than the one on screen would put the
  // wrong number under the right heading, which is worse than showing nothing.
  if (measurement.fromYear !== interval.fromYear || measurement.toYear !== interval.toYear) {
    throw new Error("A riding measurement was resolved for a different span than the one on display.");
  }
  const coverage = measurement.coverage === "complete"
    ? copy.complete
    : measurement.coverage === "partial-with-unknown"
      ? copy.partial
      : copy.none;
  const complete = measurement.coverage === "complete";
  const summedExceedsUnion =
    finiteNonNegative(measurement.summedLossHectares) &&
    finiteNonNegative(measurement.knownObservedSubtotalHectares) &&
    measurement.summedLossHectares! > measurement.knownObservedSubtotalHectares!;
  return {
    kind: "riding-measurement",
    interval: `${measurement.fromYear}–${measurement.toYear}`,
    coverage,
    normalizedShare: complete ? formatPercent(measurement.observedLossPercent!, locale) : copy.unknown,
    absoluteLoss: complete ? formatHectares(measurement.observedLossHectares!, locale) : copy.unknown,
    ...(finiteNonNegative(measurement.knownObservedSubtotalHectares)
      ? { knownObservedSubtotal: formatHectares(measurement.knownObservedSubtotalHectares!, locale) }
      : {}),
    ...(summedExceedsUnion
      ? {
          summedLossLabel: SUM_TERM[locale],
          summedLoss: formatHectares(measurement.summedLossHectares!, locale),
        }
      : {}),
  };
}
