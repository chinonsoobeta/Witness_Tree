/**
 * Non-production Phase 2 validation and comparison safeguards.
 *
 * This module plans/reviews validation work; it does not calculate a national
 * result, fetch a source, or turn a source-reported accuracy into a Witness
 * service accuracy claim.
 */
import { PRODUCT_NAME } from "../domain/brand";

export const VALIDATION_PROVINCES = ["BC", "AB", "ON", "QC"] as const;
export type ValidationProvince = typeof VALIDATION_PROVINCES[number];

export type BilingualText = Readonly<{ en: string; fr: string }>;

export type ExpertReviewStatus = "not-started" | "in-review" | "completed";

export type StratifiedSamplePlan = Readonly<{
  fixtureStatus: "synthetic-illustrative-nonproduction";
  fixedSeed: string;
  locationsPerProvince: 100;
  locationsPerStratum: 25;
  candidateCountPerStratum: number;
  strata: readonly string[];
  selectionEvidence: Readonly<{
    algorithm: "sha256-rank-v1";
    candidateIdPattern: string;
    selectedIdsSha256ByProvince: Readonly<Record<ValidationProvince, string>>;
  }>;
  expertReview: Readonly<{
    status: ExpertReviewStatus;
    completedLocationsByProvince: Readonly<Record<ValidationProvince, number>>;
    resultClaims: "none";
  }>;
  productionEligible: false;
}>;

export type HarvestComparison = Readonly<{
  province: ValidationProvince;
  year: number;
  status: "pending" | "computed";
  witnessTreeHectares: number | null;
  provincialPublishedHectares: number | null;
  absoluteDifferenceHectares: number | null;
  relativeDifference: number | null;
  publication: "published";
  explanation: BilingualText;
}>;

export type BurnedAreaComparison = Readonly<{
  year: number;
  status: "pending" | "computed";
  witnessTreeHectares: number | null;
  nbacHectares: number | null;
  absoluteDifferenceHectares: number | null;
  relativeDifference: number | null;
  publication: "published";
  explanation: BilingualText;
}>;

export type NtemsHansenCrossCheck = Readonly<{
  fixtureStatus: "synthetic-illustrative-nonproduction";
  role: "independent-cross-check-not-source";
  status: "not-started" | "completed";
  sampleSize: number;
  resultClaims: "none" | "cross-check-only";
  productionEligible: false;
}>;

export type SourceReportedAccuracy = Readonly<{
  sourceProduct: string;
  sourceReportedFigure: string;
  role: "source-reported-context-not-product-accuracy";
  witnessTreeProductAccuracyClaim: false;
}>;

function assertBilingual(value: BilingualText, label: string): void {
  if (!value || !value.en?.trim() || !value.fr?.trim()) throw new Error(`${label} requires English and French text.`);
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
}

function assertDigest(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lower-case SHA-256 digest.`);
}

function assertProvince(value: string): asserts value is ValidationProvince {
  if (!VALIDATION_PROVINCES.includes(value as ValidationProvince)) throw new Error("Comparison province must be BC, AB, ON, or QC.");
}

function assertDifferenceRow(
  row: HarvestComparison | BurnedAreaComparison,
  label: string,
  referenceLabel: string,
): void {
  if (!Number.isInteger(row.year) || row.year < 1984) throw new Error(`${label} year must be an integer no earlier than 1984.`);
  if (row.publication !== "published") throw new Error(`${label} comparisons cannot hide a gap; every row must be published.`);
  assertBilingual(row.explanation, `${label} explanation`);
  const reference = "provincialPublishedHectares" in row ? row.provincialPublishedHectares : row.nbacHectares;
  if (row.status === "pending") {
    if (row.witnessTreeHectares !== null || reference !== null || row.absoluteDifferenceHectares !== null || row.relativeDifference !== null) {
      throw new Error(`${label} pending rows must publish the missing comparison as null, not invent values.`);
    }
    return;
  }
  assertFiniteNonNegative(row.witnessTreeHectares as number, `${label} service hectares`);
  assertFiniteNonNegative(reference as number, `${label} ${referenceLabel} hectares`);
  assertFiniteNonNegative(row.absoluteDifferenceHectares as number, `${label} absolute difference`);
  if (!Number.isFinite(row.relativeDifference as number)) throw new Error(`${label} relative difference must be finite.`);
  const actualReference = reference as number;
  const actualWitnessTree = row.witnessTreeHectares as number;
  const expectedAbsolute = Math.abs(actualWitnessTree - actualReference);
  if (row.absoluteDifferenceHectares !== expectedAbsolute) throw new Error(`${label} absolute difference must be derived from both published areas.`);
  const expectedRelative = actualReference === 0 ? 0 : (actualWitnessTree - actualReference) / actualReference;
  if (row.relativeDifference !== expectedRelative) throw new Error(`${label} relative difference must use the published reference area.`);
}

/** Validates a synthetic or real sampling plan without claiming review results. */
export function assertStratifiedSamplePlan(plan: StratifiedSamplePlan): StratifiedSamplePlan {
  if (plan.fixtureStatus !== "synthetic-illustrative-nonproduction" || plan.productionEligible !== false) {
    throw new Error("This validation plan is synthetic, illustrative, non-production, and never production eligible.");
  }
  if (!plan.fixedSeed.trim() || plan.locationsPerProvince !== 100 || plan.locationsPerStratum !== 25 || !Number.isSafeInteger(plan.candidateCountPerStratum) || plan.candidateCountPerStratum < 25) {
    throw new Error("The plan requires a fixed seed, 100 locations per province, 25 per stratum, and at least 25 candidates per stratum.");
  }
  if (!Array.isArray(plan.strata) || plan.strata.length !== 4 || plan.strata.some((stratum) => !stratum.trim())) throw new Error("The plan requires four named strata.");
  if (plan.locationsPerStratum * plan.strata.length !== plan.locationsPerProvince) throw new Error("The stratum allocation must exactly total 100 locations per province.");
  if (plan.selectionEvidence?.algorithm !== "sha256-rank-v1" || !plan.selectionEvidence.candidateIdPattern?.trim()) throw new Error("The plan requires the fixed SHA-256 ranking selection evidence.");
  for (const province of VALIDATION_PROVINCES) assertDigest(plan.selectionEvidence.selectedIdsSha256ByProvince?.[province], `${province} selected-ID evidence`);
  if (!["not-started", "in-review", "completed"].includes(plan.expertReview?.status) || plan.expertReview.resultClaims !== "none") {
    throw new Error("Expert review must have an explicit status and cannot invent results.");
  }
  for (const province of VALIDATION_PROVINCES) {
    const count = plan.expertReview.completedLocationsByProvince?.[province];
    if (!Number.isSafeInteger(count) || count < 0 || count > 100) throw new Error(`${province} completed review count must be between zero and 100.`);
    if (plan.expertReview.status === "not-started" && count !== 0) throw new Error("A not-started review cannot report completed locations.");
  }
  return plan;
}

export function assertHarvestComparison(row: HarvestComparison): HarvestComparison {
  assertProvince(row.province);
  assertDifferenceRow(row, `${row.province} harvest comparison`, "provincial published");
  return row;
}

export function assertBurnedAreaComparison(row: BurnedAreaComparison): BurnedAreaComparison {
  assertDifferenceRow(row, "NBAC burned-area comparison", "NBAC");
  return row;
}

export function assertNtemsHansenCrossCheck(crossCheck: NtemsHansenCrossCheck): NtemsHansenCrossCheck {
  if (crossCheck.fixtureStatus !== "synthetic-illustrative-nonproduction" || crossCheck.role !== "independent-cross-check-not-source" || crossCheck.productionEligible !== false) {
    throw new Error(`Hansen must be labelled an independent cross-check, never a ${PRODUCT_NAME.en} source.`);
  }
  if (!Number.isSafeInteger(crossCheck.sampleSize) || crossCheck.sampleSize <= 0) throw new Error("The cross-check requires a positive sample size.");
  if (crossCheck.status === "not-started" && crossCheck.resultClaims !== "none") throw new Error("An unstarted cross-check cannot claim a result.");
  return crossCheck;
}

export function assertSourceReportedAccuracy(accuracy: SourceReportedAccuracy): SourceReportedAccuracy {
  if (!accuracy.sourceProduct?.trim() || !accuracy.sourceReportedFigure?.trim() || accuracy.role !== "source-reported-context-not-product-accuracy" || accuracy.witnessTreeProductAccuracyClaim !== false) {
    throw new Error(`Source-reported accuracy must remain source context, not a ${PRODUCT_NAME.en} product-accuracy claim.`);
  }
  return accuracy;
}
