import { COVERAGE_GRADES, EVIDENCE_CLASSES, LICENCE_IDS, type ConfidenceResult, type CoverageGrade, type LocalizedString, type Provenance } from "../domain";
import { FOREST_DEFINITION_VERSION, type ForestDenominator } from "../domain/forest";
import type { FireImpactInput, FireImpactSummary } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const limitation = Object.freeze({
  en: "A reported fire perimeter is not a damage or mortality map.",
  fr: "Un périmètre d’incendie déclaré n’est pas une carte des dommages ou de mortalité.",
});

function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

function date(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`${label} must be an ISO date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be an ISO date.`);
}

function finiteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be finite and non-negative.`);
}

function localized(value: unknown, label: string): asserts value is LocalizedString {
  if (!value || typeof value !== "object" || typeof (value as LocalizedString).en !== "string" || !(value as LocalizedString).en.trim() || typeof (value as LocalizedString).fr !== "string" || !(value as LocalizedString).fr.trim()) throw new Error(`${label} requires English and French text.`);
}

function provenance(value: unknown, label: string): asserts value is Provenance {
  const candidate = value as Partial<Provenance>;
  if (!candidate || typeof candidate !== "object") throw new Error(`${label} provenance is required.`);
  nonempty(candidate.dataset, `${label} dataset`); nonempty(candidate.version, `${label} version`); date(candidate.retrievedDate, `${label} retrieval date`);
  if (!LICENCE_IDS.includes(candidate.licence as never)) throw new Error(`${label} requires a registered licence.`);
}

function denominator(value: unknown): asserts value is ForestDenominator {
  const candidate = value as Partial<ForestDenominator>;
  if (!candidate || candidate.kind !== "forested-hectares") throw new Error("A forested-hectare denominator is required.");
  finiteNonNegative(candidate.hectares, "Denominator hectares");
  if (candidate.hectares === 0) throw new Error("A fire impact summary requires a non-zero forest denominator.");
  if (!Number.isInteger(candidate.referenceYear) || !candidate.boundaryEdition?.trim() || candidate.definitionVersion !== FOREST_DEFINITION_VERSION) throw new Error("The forest denominator requires its registered definition version and boundary edition.");
}

function confidence(value: unknown): asserts value is ConfidenceResult {
  const candidate = value as Partial<ConfidenceResult>;
  const rules = { high: "CONF-HIGH-001", medium: "CONF-MEDIUM-001", limited: "CONF-LIMITED-001", unknown: "CONF-UNKNOWN-001" } as const;
  if (!candidate || !candidate.level || candidate.ruleId !== rules[candidate.level]) throw new Error("A registered matching confidence level and rule are required.");
  localized(candidate.reason, "Confidence reason");
}

export function validateFireImpactInput(candidate: unknown): FireImpactInput {
  const input = candidate as Partial<FireImpactInput>;
  if (!input || input.status !== "example") throw new Error("Fire impact summaries are example-only.");
  if (!input.perimeter || !input.intersection) throw new Error("Perimeter and supplied intersection result are required.");
  nonempty(input.perimeter.id, "Perimeter id"); finiteNonNegative(input.perimeter.hectares, "Perimeter hectares"); date(input.perimeter.observedDate, "Observed date"); date(input.perimeter.sourceDate, "Source date");
  if (input.perimeter.sourceDate < input.perimeter.observedDate) throw new Error("Perimeter source date cannot predate its observed date.");
  provenance(input.perimeter.provenance, "Perimeter");
  nonempty(input.intersection.geometryResultId, "Intersection result id"); nonempty(input.intersection.perimeterId, "Intersection perimeter id");
  if (input.intersection.perimeterId !== input.perimeter.id) throw new Error("Intersection result must name its perimeter.");
  finiteNonNegative(input.intersection.hectares, "Intersection hectares"); finiteNonNegative(input.intersection.mappedMatureForestHectares, "Mapped mature forest hectares");
  if (input.intersection.hectares > input.perimeter.hectares || input.intersection.hectares > input.intersection.mappedMatureForestHectares) throw new Error("Intersection hectares are out of range.");
  provenance(input.intersection.sourceProvenance, "Mapped mature forest"); denominator(input.denominator);
  if (!input.forestDefinition || input.forestDefinition.version !== FOREST_DEFINITION_VERSION) throw new Error("The registered forest definition is required.");
  localized(input.forestDefinition.text, "Forest definition"); nonempty(input.boundaryEdition, "Boundary edition"); nonempty(input.dataVersion, "Data version"); nonempty(input.methodVersion, "Method version");
  if (input.boundaryEdition !== input.denominator.boundaryEdition) throw new Error("Top-level and denominator boundary editions must match.");
  if (!COVERAGE_GRADES.includes(input.coverageGrade as CoverageGrade)) throw new Error("A registered coverage grade is required.");
  confidence(input.confidence);
  return Object.freeze(input as FireImpactInput);
}

export function deriveFireImpactSummary(candidate: unknown): FireImpactSummary {
  const input = validateFireImpactInput(candidate);
  const hectares = input.intersection.hectares;
  return Object.freeze({
    ...input,
    evidence: "derived-estimate",
    estimatedIntersectedMatureForest: { kind: "figure" as const, value: hectares, unit: "ha" as const, evidence: "derived-estimate" as const, confidence: input.confidence, provenance: input.intersection.sourceProvenance },
    statement: { en: `The reported perimeter intersects an estimated ${hectares} hectares of mapped mature forest.`, fr: `Le périmètre déclaré recoupe environ ${hectares} hectares de forêt mature cartographiée.` },
    limitation,
  });
}

export function validateFireImpactSummary(candidate: unknown): FireImpactSummary {
  const summary = candidate as Partial<FireImpactSummary>;
  const input = validateFireImpactInput(summary);
  const estimate = summary.estimatedIntersectedMatureForest as unknown as { kind?: string; value?: unknown; unit?: unknown; evidence?: unknown; confidence?: unknown; provenance?: unknown } | undefined;
  if (estimate?.kind === "unknown") throw new Error("Unknown cannot carry a numeric fire-impact area.");
  if (summary.evidence !== "derived-estimate" || !EVIDENCE_CLASSES.includes(summary.evidence)) throw new Error("Fire impact area is a derived estimate.");
  if (!estimate || estimate.kind !== "figure" || estimate.unit !== "ha" || estimate.evidence !== "derived-estimate") throw new Error("Fire impact area must be a derived hectare Figure.");
  finiteNonNegative(estimate.value, "Derived estimate hectares"); confidence(estimate.confidence); provenance(estimate.provenance, "Derived estimate");
  if (estimate.value !== input.intersection.hectares) throw new Error("Reported area must equal the supplied intersection result, not the whole perimeter.");
  localized(summary.statement, "Derived estimate statement");
  if (!summary.statement.en.includes("intersects an estimated") || !summary.statement.fr.includes("recoupe environ") || /\b(destroyed|destruction)\b/i.test(summary.statement.en) || /\b(détruit|destruction)\b/i.test(summary.statement.fr)) throw new Error("A fire perimeter must not be presented as damage or destruction.");
  if (summary.limitation?.en !== limitation.en || summary.limitation.fr !== limitation.fr) throw new Error("Every fire impact summary must state that a perimeter is not a damage or mortality map.");
  return Object.freeze(summary as FireImpactSummary);
}
