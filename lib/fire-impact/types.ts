import type { ConfidenceResult, CoverageGrade, Figure, LocalizedString, Provenance } from "../domain";
import type { ForestDenominator } from "../domain/forest";

export type FireImpactInput = Readonly<{
  status: "example";
  perimeter: Readonly<{ id: string; hectares: number; observedDate: string; sourceDate: string; provenance: Provenance }>;
  intersection: Readonly<{ geometryResultId: string; perimeterId: string; hectares: number; mappedMatureForestHectares: number; sourceProvenance: Provenance }>;
  denominator: ForestDenominator;
  forestDefinition: Readonly<{ version: string; text: LocalizedString }>;
  boundaryEdition: string;
  dataVersion: string;
  methodVersion: string;
  coverageGrade: CoverageGrade;
  confidence: ConfidenceResult;
}>;

export type FireImpactSummary = FireImpactInput & Readonly<{
  evidence: "derived-estimate";
  estimatedIntersectedMatureForest: Figure;
  statement: LocalizedString;
  limitation: LocalizedString;
}>;
