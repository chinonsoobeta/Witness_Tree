import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFtaEvents }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/events/normalize.ts";
import { EXAMPLE_FTA_EVENTS }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/events/fixtures.ts";
import { matchDetectedChange }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/pipeline/matching.ts";
import { resolvePrecedence }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/pipeline/precedence.ts";
import { resolveOptionalEnhancementAvailability }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/phase4/optional-enhancement.ts";

const admitted = {
  rightsVerified: true,
  evidenceAdmitted: true,
  coverageGeometryContainsPoint: true,
  coveragePeriodContainsYear: true,
  coverageGrade: "enhanced-local-records" as const,
  boundaryEdition: "bc-2025",
};

test("an admitted enhancement requires rights, admitted evidence, and bounded enhanced geometry", () => {
  assert.deepEqual(resolveOptionalEnhancementAvailability("BC", admitted), {
    kind: "available", province: "BC", boundaryEdition: "bc-2025", coverageGrade: "enhanced-local-records",
  });
  for (const gate of [
    { ...admitted, rightsVerified: false },
    { ...admitted, evidenceAdmitted: false },
    { ...admitted, coverageGeometryContainsPoint: false },
    { ...admitted, coveragePeriodContainsYear: false },
    { ...admitted, coverageGrade: "national-baseline" as const },
  ]) {
    const result = resolveOptionalEnhancementAvailability("QC", gate);
    assert.equal(result.kind, "unavailable");
    if (result.kind === "unavailable") {
      assert.equal(result.reported.kind, "unknown");
      assert.equal("value" in result.reported, false);
      assert.ok(result.reported.reason.en);
      assert.ok(result.reported.reason.fr);
    }
  }
});

test("the Phase 4 boundary keeps lifecycle, matching, precedence, tenure, and subtype policy executable", () => {
  const events = normalizeFtaEvents(EXAMPLE_FTA_EVENTS);
  assert.deepEqual(events.slice(0, 3).map((event) => [event.category, event.tenure, event.subtype]), [
    ["planned", "Crown", "undetermined"], ["authorised", "unknown", "thinning"], ["recorded-harvest", "reserve", "salvage"],
  ]);
  assert.equal(matchDetectedChange(
    { id: "change", observationYear: 2020, geometryHectares: 10 },
    [{ id: "official", eventYear: 2020, geometryHectares: 10, intersectionHectares: 5 }],
  ).selectedMatch?.candidate.id, "official");
  assert.equal(resolvePrecedence([
    { id: "harvest", hectareYearId: "cell", year: 2020, hectares: 1, kind: "recorded-harvest", qualifyingRecordedHarvest: true },
    { id: "fire", hectareYearId: "cell", year: 2020, hectares: 1, kind: "fire" },
  ])[0]?.winner?.id, "fire");
});

test("an unavailable optional source remains safe without a boundary edition, but availability requires one", () => {
  const unavailable = resolveOptionalEnhancementAvailability("BC", { ...admitted, rightsVerified: false, boundaryEdition: null });
  assert.equal(unavailable.kind, "unavailable");
  if (unavailable.kind === "unavailable") assert.equal(unavailable.boundaryEdition, null);
  assert.throws(() => resolveOptionalEnhancementAvailability("BC", { ...admitted, boundaryEdition: " " }), /boundary edition/);
  assert.throws(() => resolveOptionalEnhancementAvailability("AB" as never, admitted), /BC and QC/);
  assert.throws(() => resolveOptionalEnhancementAvailability("BC", { ...admitted, rightsVerified: "yes" as never }), /explicit boolean/);
});
