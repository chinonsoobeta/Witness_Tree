import type { LocalizedString, Reported } from "@/lib/domain";

export type IndigenousAreaResult = Readonly<{
  rawRecord: Reported;
  rate: Reported;
  belowMinimumArea: boolean;
  minimumAreaHectares: number;
}>;

function validArea(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number.`);
}

/**
 * Preserve a raw observation for every geography, but decline a rate where the
 * boundary is too small for the configured raster-resolution rule. The caller
 * supplies the threshold because it must be tied to the admitted source grid.
 */
export function applyIndigenousMinimumAreaRule(
  areaHectares: number,
  minimumAreaHectares: number,
  rawRecord: Reported,
  insufficientAreaReason: LocalizedString,
): IndigenousAreaResult {
  validArea(areaHectares, "Area");
  validArea(minimumAreaHectares, "Minimum area");
  if (minimumAreaHectares === 0) throw new Error("Minimum area must be greater than zero.");

  const belowMinimumArea = areaHectares < minimumAreaHectares;
  const rate: Reported = belowMinimumArea
    ? { kind: "unknown", evidence: "unknown", reason: insufficientAreaReason, coverageGrade: "not-applicable" }
    : rawRecord;

  return Object.freeze({ rawRecord, rate, belowMinimumArea, minimumAreaHectares });
}
