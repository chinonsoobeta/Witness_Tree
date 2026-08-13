import { validateCorrection } from "./policy";
import { CORRECTION_CLASSES, type CaseStatus, type CorrectionCase, type CorrectionClass } from "./types";

const OUTCOMES: readonly CaseStatus[] = ["submitted", "acknowledged", "resolved", "rejected"];

export type CorrectionMetrics = Readonly<{
  publishable: true;
  completedCaseCount: number;
  resolvedCaseCount: number;
  resolvedCaseMedianDurationMs: number;
  volumesByClass: Readonly<Record<CorrectionClass, number>>;
  volumesByOutcome: Readonly<Record<CaseStatus, number>>;
  unresolvedCriticalCount: number;
}>;

export type InsufficientCorrectionMetrics = Readonly<{
  publishable: false;
  reason: "illustrative-cases" | "no-completed-cases" | "no-resolved-cases";
}>;

export type CorrectionMetricsResult = CorrectionMetrics | InsufficientCorrectionMetrics;

function counts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = ordered.length / 2;
  return ordered.length % 2 === 0 ? (ordered[middle - 1]! + ordered[middle]!) / 2 : ordered[Math.floor(middle)]!;
}

/** Produces aggregate-only metrics; it retains and reveals no case-level data. */
export function correctionMetrics(cases: readonly CorrectionCase[]): CorrectionMetricsResult {
  if (cases.some((caseFile) => caseFile.statusKind !== "production")) return Object.freeze({ publishable: false, reason: "illustrative-cases" });

  const validated = cases.map(validateCorrection);
  const completed = validated.filter((caseFile) => caseFile.status === "resolved" || caseFile.status === "rejected");
  if (!completed.length) return Object.freeze({ publishable: false, reason: "no-completed-cases" });

  const resolved = validated.filter((caseFile) => caseFile.status === "resolved");
  if (!resolved.length) return Object.freeze({ publishable: false, reason: "no-resolved-cases" });

  const volumesByClass = counts(CORRECTION_CLASSES);
  const volumesByOutcome = counts(OUTCOMES);
  for (const caseFile of validated) {
    volumesByClass[caseFile.classification]++;
    volumesByOutcome[caseFile.status]++;
  }

  return Object.freeze({
    publishable: true,
    completedCaseCount: completed.length,
    resolvedCaseCount: resolved.length,
    resolvedCaseMedianDurationMs: median(resolved.map((caseFile) => caseFile.resolvedAt!.getTime() - caseFile.submittedAt.getTime())),
    volumesByClass: Object.freeze(volumesByClass),
    volumesByOutcome: Object.freeze(volumesByOutcome),
    unresolvedCriticalCount: validated.filter((caseFile) => caseFile.classification === "critical" && !["resolved", "rejected"].includes(caseFile.status)).length,
  });
}
