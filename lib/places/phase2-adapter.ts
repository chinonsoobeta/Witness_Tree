import type { ConfidenceResult, LocalizedString, Provenance } from "@/lib/domain";
import { PLACE_TYPES, type PlaceProvince, type PlaceType, type PublicFigure, type PublicNumber } from "./types";

export const PHASE2_SYNTHETIC_ADAPTER_VERSION = "witness-tree/phase3-phase2-synthetic-adapter/1" as const;

type Phase2Aggregate = Readonly<{
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  boundaryId: string;
  geographyType: PlaceType;
  province: PlaceProvince;
  boundaryEdition: string;
  timeRange: Readonly<{ fromYear: number; toYear: number }>;
  denominator: Readonly<{ kind: "forested-hectares"; hectares: number; referenceYear: number; forestDefinitionVersion: string }>;
  eventHectares: number;
  shareOfFirstYearForest: Readonly<{ kind: "figure"; percent: number }> | Readonly<{ kind: "unknown"; reason: string }>;
  methodVersion: string;
  dataVersion: string;
  coverageGrade: "national-baseline";
  lineageSha256: string;
}>;

export type Phase2SyntheticAggregateDocument = Readonly<{
  schemaVersion: 1;
  batchId: string;
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  aggregates: readonly Phase2Aggregate[];
}>;

export type AdaptedPhase2Aggregate = Readonly<{
  adapterVersion: typeof PHASE2_SYNTHETIC_ADAPTER_VERSION;
  status: "example";
  reviewStatus: "unapproved";
  productionEligible: false;
  boundaryId: string;
  geographyType: PlaceType;
  province: PlaceProvince;
  boundaryEdition: string;
  fromYear: PublicNumber;
  toYear: PublicNumber;
  denominator: PublicNumber;
  denominatorReferenceYear: PublicNumber;
  eventHectares: PublicNumber;
  shareOfFirstYearForest: PublicNumber;
  forestDefinitionVersion: string;
  methodVersion: string;
  dataVersion: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const provinces = new Set<PlaceProvince>(["BC", "AB", "ON", "QC"]);
const unknownReason = (reason: string): LocalizedString => ({ en: reason, fr: "Valeur inconnue dans la sortie synthétique de phase 2; aucune valeur de production n’est revendiquée." });

function finite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
}

function figure(value: number, unit: PublicFigure["unit"], provenance: Provenance, confidence: ConfidenceResult): PublicFigure {
  finite(value, unit);
  return { kind: "figure", value, unit, evidence: "derived-estimate", confidence, coverageGrade: "national-baseline", provenance };
}

export function adaptPhase2SyntheticAggregates(document: Phase2SyntheticAggregateDocument, retrievedDate: string): readonly AdaptedPhase2Aggregate[] {
  if (document.schemaVersion !== 1 || !document.batchId.trim() || document.status !== "example" || document.reviewStatus !== "unapproved" || document.productionEligible !== false || !/^\d{4}-\d{2}-\d{2}$/.test(retrievedDate)) {
    throw new Error("Phase 2 adapter accepts only a dated example, unapproved, nonproduction schema-version-1 document.");
  }
  const ids = new Set<string>();
  return Object.freeze(document.aggregates.map((aggregate) => {
    if (!aggregate.boundaryId.trim() || ids.has(aggregate.boundaryId) || !PLACE_TYPES.includes(aggregate.geographyType) || !provinces.has(aggregate.province) || !aggregate.boundaryEdition.trim() || aggregate.status !== "example" || aggregate.reviewStatus !== "unapproved" || aggregate.productionEligible !== false || aggregate.coverageGrade !== "national-baseline" || !aggregate.methodVersion.trim() || !aggregate.dataVersion.trim() || !aggregate.denominator.forestDefinitionVersion.trim() || !SHA256.test(aggregate.lineageSha256)) {
      throw new Error("Phase 2 synthetic aggregate identity, lineage, coverage, and nonproduction labels are required.");
    }
    for (const [label, value] of Object.entries({ fromYear: aggregate.timeRange.fromYear, toYear: aggregate.timeRange.toYear, denominator: aggregate.denominator.hectares, referenceYear: aggregate.denominator.referenceYear, eventHectares: aggregate.eventHectares })) finite(value, label);
    if (!Number.isSafeInteger(aggregate.timeRange.fromYear) || !Number.isSafeInteger(aggregate.timeRange.toYear) || aggregate.timeRange.fromYear > aggregate.timeRange.toYear || aggregate.denominator.kind !== "forested-hectares" || !Number.isSafeInteger(aggregate.denominator.referenceYear)) throw new Error("Phase 2 synthetic aggregate years and denominator are invalid.");
    ids.add(aggregate.boundaryId);
    const provenance: Provenance = { dataset: `Phase 2 synthetic batch ${document.batchId}`, version: aggregate.dataVersion, retrievedDate, licence: "ogl-canada-2.0", recordUrl: `https://example.local/phase2/${document.batchId}/${aggregate.boundaryId}` };
    const confidence: ConfidenceResult = { level: "limited", ruleId: "CONF-LIMITED-001", reason: { en: "Synthetic unapproved Phase 2 output adapted for contract testing only.", fr: "Sortie synthétique non approuvée de phase 2 adaptée uniquement pour les essais de contrat." } };
    const share: PublicNumber = aggregate.shareOfFirstYearForest.kind === "figure"
      ? figure(aggregate.shareOfFirstYearForest.percent, "%", provenance, confidence)
      : { kind: "unknown", evidence: "unknown", reason: unknownReason(aggregate.shareOfFirstYearForest.reason), coverageGrade: "national-baseline", provenance };
    return Object.freeze({
      adapterVersion: PHASE2_SYNTHETIC_ADAPTER_VERSION, status: "example" as const, reviewStatus: "unapproved" as const, productionEligible: false as const,
      boundaryId: aggregate.boundaryId, geographyType: aggregate.geographyType, province: aggregate.province, boundaryEdition: aggregate.boundaryEdition,
      fromYear: figure(aggregate.timeRange.fromYear, "year", provenance, confidence), toYear: figure(aggregate.timeRange.toYear, "year", provenance, confidence),
      denominator: figure(aggregate.denominator.hectares, "ha", provenance, confidence), denominatorReferenceYear: figure(aggregate.denominator.referenceYear, "year", provenance, confidence),
      eventHectares: figure(aggregate.eventHectares, "ha", provenance, confidence), shareOfFirstYearForest: share,
      forestDefinitionVersion: aggregate.denominator.forestDefinitionVersion, methodVersion: aggregate.methodVersion, dataVersion: aggregate.dataVersion,
    });
  }));
}
