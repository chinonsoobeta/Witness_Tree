import assert from "node:assert/strict";
import test from "node:test";
import { reportProvincialMatching }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/phase4/provincial-matching.ts";

const ready = { sourceRightsVerified: true, sourceEvidenceAdmitted: true, sourceTransformationApproved: true, sourceReleaseApproved: true, changeGeometryMaterialized: true };

test("Phase 4 matching produces rates and reasons only for an explicitly runnable nonproduction input", () => {
  const report = reportProvincialMatching(ready, [
    { change: { id: "matched", province: "QC", observationYear: 2020, geometryHectares: 10 }, candidates: [{ id: "official", eventYear: 2020, geometryHectares: 10, intersectionHectares: 5 }] },
    { change: { id: "none", province: "QC", observationYear: 2020, geometryHectares: 10 }, candidates: [] },
  ]);
  assert.deepEqual(report, {
    status: "computed-nonproduction", productionEligible: false,
    counts: { assessedChanges: 2, matchedChanges: 1, unmatchedChanges: 1 },
    matchRate: 0.5, nonMatchRate: 0.5,
    nonMatchReasonDistribution: { "no-official-record-candidates": 1 }, blockers: [],
  });
});

test("Phase 4 matching refuses to convert unadmitted or aggregate-only inputs into numbers", () => {
  const report = reportProvincialMatching({ ...ready, sourceEvidenceAdmitted: false, changeGeometryMaterialized: false }, []);
  assert.equal(report.status, "blocked");
  assert.equal(report.matchRate, null);
  assert.equal(report.nonMatchRate, null);
  assert.equal(report.nonMatchReasonDistribution, null);
  assert.match(report.blockers.join(" "), /not admitted/);
  assert.match(report.blockers.join(" "), /not materialized/);
  assert.throws(() => reportProvincialMatching(ready, []), /at least one assessed change/);
});
