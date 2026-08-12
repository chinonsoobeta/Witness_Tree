import type { ConfidenceResult, CoverageGrade, EvidenceClass, Locale, Provenance } from "../domain";
export const EXPLORE_MODES = ["detected-change", "official-harvest", "wildfire-perimeter", "insect-mortality"] as const;
export type ExploreMode = (typeof EXPLORE_MODES)[number];
export type ExploreEvent = Readonly<{ id: string; mode: ExploreMode; year: number; name: Record<Locale, string>; evidence: EvidenceClass; confidence: ConfidenceResult; coverageGrade: CoverageGrade; provenance: Provenance; unknownReason?: string }>;
export type ExploreViewMode = "map" | "table";
