import assert from "node:assert/strict";
import test from "node:test";
import { deriveFireImpactSummary, validateFireImpactInput, validateFireImpactSummary }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/fire-impact/contract.ts";
import { EXAMPLE_FIRE_IMPACT_INPUT }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/fire-impact/fixtures.ts";

test("derives an example-only mature-forest intersection estimate with complete lineage", () => {
  const summary = deriveFireImpactSummary(EXAMPLE_FIRE_IMPACT_INPUT);
  assert.equal(summary.evidence, "derived-estimate");
  assert.deepEqual(summary.estimatedIntersectedMatureForest, { kind: "figure", value: 120, unit: "ha", evidence: "derived-estimate", confidence: EXAMPLE_FIRE_IMPACT_INPUT.confidence, provenance: EXAMPLE_FIRE_IMPACT_INPUT.intersection.sourceProvenance });
  assert.match(summary.statement.en, /intersects an estimated 120 hectares/);
  assert.match(summary.limitation.en, /not a damage or mortality map/);
  assert.equal(validateFireImpactSummary(summary), summary);
});

test("rejects damage claims, missing lineage, invalid intersections, and mismatched calculations", () => {
  const summary = deriveFireImpactSummary(EXAMPLE_FIRE_IMPACT_INPUT);
  assert.throws(() => validateFireImpactSummary({ ...summary, statement: { ...summary.statement, en: "The fire destroyed 120 hectares." } }), /damage or destruction/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, perimeter: { ...EXAMPLE_FIRE_IMPACT_INPUT.perimeter, provenance: { ...EXAMPLE_FIRE_IMPACT_INPUT.perimeter.provenance, licence: "missing" as never } } }), /licence/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, intersection: { ...EXAMPLE_FIRE_IMPACT_INPUT.intersection, hectares: -1 } }), /finite and non-negative/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, intersection: { ...EXAMPLE_FIRE_IMPACT_INPUT.intersection, hectares: Number.NaN } }), /finite and non-negative/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, intersection: { ...EXAMPLE_FIRE_IMPACT_INPUT.intersection, hectares: 501 } }), /out of range/);
  assert.throws(() => validateFireImpactSummary({ ...summary, estimatedIntersectedMatureForest: { ...summary.estimatedIntersectedMatureForest, value: EXAMPLE_FIRE_IMPACT_INPUT.perimeter.hectares } }), /must equal/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, perimeter: { ...EXAMPLE_FIRE_IMPACT_INPUT.perimeter, observedDate: "2026-02-30" } }), /ISO date/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, perimeter: { ...EXAMPLE_FIRE_IMPACT_INPUT.perimeter, sourceDate: "2026-08-09" } }), /cannot predate/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, confidence: { ...EXAMPLE_FIRE_IMPACT_INPUT.confidence, ruleId: "CONF-MEDIUM-001" } }), /matching confidence/);
  assert.throws(() => validateFireImpactInput({ ...EXAMPLE_FIRE_IMPACT_INPUT, boundaryEdition: "other-edition" }), /boundary editions must match/);
});

test("a geometry-supplied zero is a Figure, while Unknown is never numeric", () => {
  const zero = deriveFireImpactSummary({ ...EXAMPLE_FIRE_IMPACT_INPUT, intersection: { ...EXAMPLE_FIRE_IMPACT_INPUT.intersection, hectares: 0 } });
  assert.equal(zero.estimatedIntersectedMatureForest.kind, "figure");
  assert.equal(zero.estimatedIntersectedMatureForest.value, 0);
  assert.equal(zero.estimatedIntersectedMatureForest.unit, "ha");
  const summary = deriveFireImpactSummary(EXAMPLE_FIRE_IMPACT_INPUT);
  assert.throws(() => validateFireImpactSummary({ ...summary, estimatedIntersectedMatureForest: { kind: "unknown", value: 0 } as never }), /Unknown cannot carry/);
});
