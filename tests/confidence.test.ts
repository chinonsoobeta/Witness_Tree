import assert from "node:assert/strict";
import test from "node:test";

import { assignConfidence, type ConfidenceInput } from "../lib/domain/confidence";

const cases: readonly Readonly<{ name: string; input: ConfidenceInput; level: string; ruleId: string }>[] = [
  { name: "high", input: { evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: true, requiredAttributesPresent: true }, level: "high", ruleId: "CONF-HIGH-001" },
  { name: "medium", input: { evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: true, dateUncertaintyYears: 2, requiredAttributesPresent: true }, level: "medium", ruleId: "CONF-MEDIUM-001" },
  { name: "limited", input: { evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: true, inventoryAgeAtEventYears: 6, requiredAttributesPresent: true }, level: "limited", ruleId: "CONF-LIMITED-001" },
  { name: "unknown", input: { evidenceClass: "unknown", authoritativeRecord: false, geometryResolved: false, eventDateResolvedToYear: false, requiredAttributesPresent: false }, level: "unknown", ruleId: "CONF-UNKNOWN-001" },
];

test("every confidence rule has a stable identifier and generated bilingual explanation", () => {
  for (const item of cases) {
    const result = assignConfidence(item.input);
    assert.equal(result.level, item.level, item.name);
    assert.equal(result.ruleId, item.ruleId, item.name);
    assert.ok(result.reason.en.trim(), `${item.name} English reason`);
    assert.ok(result.reason.fr.trim(), `${item.name} French reason`);
  }
  assert.equal(new Set(cases.map((item) => assignConfidence(item.input).ruleId)).size, 4);
});

test("confidence rules fail closed on invalid numeric evidence", () => {
  const base: ConfidenceInput = { evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: true, requiredAttributesPresent: true };
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.throws(() => assignConfidence({ ...base, dateUncertaintyYears: invalid }), /finite, non-negative/);
    assert.throws(() => assignConfidence({ ...base, geometryResolutionMetres: invalid }), /finite, non-negative/);
    assert.throws(() => assignConfidence({ ...base, inventoryAgeAtEventYears: invalid }), /finite, non-negative/);
  }
});

test("high confidence requires an event date resolved to the year", () => {
  const missingDate = assignConfidence({ evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: false, requiredAttributesPresent: true });
  const omittedDate = assignConfidence({ evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, requiredAttributesPresent: true } as ConfidenceInput);
  assert.equal(missingDate.level, "medium");
  assert.equal(omittedDate.level, "medium");
  assert.match(missingDate.reason.en, /not resolved to the year/);
  assert.match(missingDate.reason.fr, /année/);
});

// @ts-expect-error Confidence inputs must state whether the event date is resolved to the year.
const missingDateResolution: ConfidenceInput = { evidenceClass: "official-record", authoritativeRecord: true, geometryResolved: true, requiredAttributesPresent: true };
void missingDateResolution;

test("satellite and derived evidence cannot receive high confidence", () => {
  for (const evidenceClass of ["satellite-observation", "derived-estimate"] as const) {
    const result = assignConfidence({ evidenceClass, authoritativeRecord: true, geometryResolved: true, eventDateResolvedToYear: true, requiredAttributesPresent: true });
    assert.notEqual(result.level, "high");
  }
});
