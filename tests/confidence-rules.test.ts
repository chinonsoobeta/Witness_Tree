import assert from "node:assert/strict"; import test from "node:test";
import { assignConfidence }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/domain/confidence.ts";
import type { ConfidenceInput, ConfidenceResult } from "../lib/domain/confidence";

const DECLARED_RULE_IDS = ["CONF-HIGH-001", "CONF-MEDIUM-001", "CONF-LIMITED-001", "CONF-UNKNOWN-001"] as const;

const authoritative: ConfidenceInput = { authoritativeRecord: true, geometryResolved: true, dateUncertaintyYears: 0, requiredAttributesPresent: true };

// Every reason branch the rule set can reach, not merely one example per rule identifier.
const branches: ReadonlyArray<Readonly<{ label: string; input: ConfidenceInput; ruleId: ConfidenceResult["ruleId"] }>> = [
  { label: "direct authoritative record", input: authoritative, ruleId: "CONF-HIGH-001" },
  { label: "uncertain event date", input: { ...authoritative, dateUncertaintyYears: 4 }, ruleId: "CONF-MEDIUM-001" },
  { label: "partial attribution", input: { ...authoritative, partialAttribution: true }, ruleId: "CONF-MEDIUM-001" },
  { label: "missing required attribute", input: { ...authoritative, requiredAttributesPresent: false }, ruleId: "CONF-MEDIUM-001" },
  { label: "stale inventory vintage", input: { ...authoritative, inventoryAgeAtEventYears: 9 }, ruleId: "CONF-LIMITED-001" },
  { label: "documented coverage gap", input: { ...authoritative, coverageGap: true }, ruleId: "CONF-LIMITED-001" },
  { label: "coarse geometry resolution", input: { ...authoritative, geometryResolutionMetres: 250 }, ruleId: "CONF-LIMITED-001" },
  { label: "no authoritative record integrated", input: { authoritativeRecord: false, geometryResolved: false, requiredAttributesPresent: false }, ruleId: "CONF-UNKNOWN-001" },
];

test("every confidence rule generates an explanation in both languages", () => {
  for (const { label, input, ruleId } of branches) {
    const result = assignConfidence(input) as ConfidenceResult;
    assert.equal(result.ruleId, ruleId, `${label} must resolve to ${ruleId}.`);
    assert.ok(result.reason.en.trim().length > 0, `${label} must generate an English explanation.`);
    assert.ok(result.reason.fr.trim().length > 0, `${label} must generate a French explanation.`);
    assert.notEqual(result.reason.en, result.reason.fr, `${label} must be genuinely translated, not copied across locales.`);
  }
});

test("the rule set is exhaustive: every declared rule identifier is reachable and no other is produced", () => {
  const produced = new Set(branches.map(({ input }) => (assignConfidence(input) as ConfidenceResult).ruleId));
  assert.deepEqual([...produced].sort(), [...DECLARED_RULE_IDS].sort(), "Each declared confidence rule must be reachable, and no undeclared rule may be produced.");
});

test("generated explanations carry the specific limitation, so a reason is never a bare level name", () => {
  const stale = assignConfidence({ ...authoritative, inventoryAgeAtEventYears: 9 }) as ConfidenceResult;
  assert.match(stale.reason.en, /9 years/, "A stale inventory must name the vintage gap in English.");
  assert.match(stale.reason.fr, /9 ans/, "A stale inventory must name the vintage gap in French.");
  const uncertain = assignConfidence({ ...authoritative, dateUncertaintyYears: 4 }) as ConfidenceResult;
  assert.match(uncertain.reason.en, /uncertain by 4 years/, "An uncertain date must name the uncertainty in English.");
  assert.match(uncertain.reason.fr, /4 ans/, "An uncertain date must name the uncertainty in French.");
});

test("unknown is never silently converted into a confident level", () => {
  const unknown = assignConfidence({ authoritativeRecord: false, geometryResolved: false, requiredAttributesPresent: false }) as ConfidenceResult;
  assert.equal(unknown.level, "unknown");
  assert.match(unknown.reason.en, /No authoritative public record/i);
});
