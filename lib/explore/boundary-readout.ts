import { formatHectares, formatPercent, type Locale } from "@/lib/domain";
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
  observedLossPercent: number | null;
  observedLossHectares: number | null;
  knownObservedSubtotalHectares?: number | null;
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
  if (complete !== (finiteNonNegative(measurement.observedLossPercent) && finiteNonNegative(measurement.observedLossHectares))) {
    throw new Error("Only complete riding coverage may report a total loss and normalized share.");
  }
  if (!complete && (measurement.observedLossPercent !== null || measurement.observedLossHectares !== null)) {
    throw new Error("Incomplete riding coverage must not report a complete loss or share.");
  }
  if (measurement.knownObservedSubtotalHectares !== undefined && measurement.knownObservedSubtotalHectares !== null && !finiteNonNegative(measurement.knownObservedSubtotalHectares)) {
    throw new Error("Known observed subtotal must be a non-negative finite number.");
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
      interval: "2021–2022",
      coverage: copy.unavailable,
      normalizedShare: copy.unknown,
      absoluteLoss: copy.unknown,
    };
  }
  assertMeasurement(measurement);
  const coverage = measurement.coverage === "complete"
    ? copy.complete
    : measurement.coverage === "partial-with-unknown"
      ? copy.partial
      : copy.none;
  const complete = measurement.coverage === "complete";
  return {
    kind: "riding-measurement",
    interval: "2021–2022",
    coverage,
    normalizedShare: complete ? formatPercent(measurement.observedLossPercent!, locale) : copy.unknown,
    absoluteLoss: complete ? formatHectares(measurement.observedLossHectares!, locale) : copy.unknown,
    ...(finiteNonNegative(measurement.knownObservedSubtotalHectares)
      ? { knownObservedSubtotal: formatHectares(measurement.knownObservedSubtotalHectares!, locale) }
      : {}),
  };
}
