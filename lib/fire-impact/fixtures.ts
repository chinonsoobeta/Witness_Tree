import { assignConfidence } from "../domain/confidence";
import { FOREST_DEFINITION, forestDenominator } from "../domain/forest";
import type { FireImpactInput } from "./types";

export const EXAMPLE_FIRE_IMPACT_INPUT: FireImpactInput = Object.freeze({
  status: "example",
  perimeter: { id: "example-fire-perimeter", hectares: 500, observedDate: "2026-08-10", sourceDate: "2026-08-11", provenance: { dataset: "Illustrative reported fire perimeter", version: "example-1", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0" as const, recordUrl: "https://example.local/fire/perimeter" } },
  intersection: { geometryResultId: "example-intersection-result", perimeterId: "example-fire-perimeter", hectares: 120, mappedMatureForestHectares: 180, sourceProvenance: { dataset: "Illustrative mapped mature forest", version: "example-1", retrievedDate: "2026-08-11", licence: "ogl-canada-2.0" as const, recordUrl: "https://example.local/forest/mature" } },
  denominator: forestDenominator(1_000, 2022, "example-boundary-edition"),
  forestDefinition: { version: FOREST_DEFINITION.version, text: FOREST_DEFINITION.text },
  boundaryEdition: "example-boundary-edition",
  dataVersion: "example-data-1",
  methodVersion: "example-method-1",
  coverageGrade: "national-baseline",
  confidence: assignConfidence({ authoritativeRecord: true, geometryResolved: true, requiredAttributesPresent: true }),
});
