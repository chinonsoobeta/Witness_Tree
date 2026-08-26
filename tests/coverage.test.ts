import assert from "node:assert/strict";
import test from "node:test";

import { forestDenominator } from "../lib/domain/forest";
import { CANADIAN_JURISDICTION_CODES } from "../lib/domain/coverage";
import { aggregateDetectedChange, coverageShares, geometryContainsPoint, resolveCoverage, validateCoverageFeature } from "../lib/coverage/resolve";
import { coverageFeatures, coverageFixtures } from "../lib/coverage/fixtures";
import type { CoverageFeature, ForestAggregateInput } from "../lib/coverage/types";

test("resolves all Canadian jurisdictions and illustrative polygons while keeping Quebec north of 52 at national baseline", () => {
  assert.deepEqual(
    coverageFixtures.map((item) => resolveCoverage(item).grade),
    ["enhanced-local-records", "national-baseline-plus-local-context", "extended-record-sparse-official-matching", "national-baseline"],
  );
  for (const province of CANADIAN_JURISDICTION_CODES) {
    assert.equal(resolveCoverage({ province, longitude: -100, latitude: 45, year: 2020, boundaryEdition: "example-2023" }).grade, "national-baseline");
  }
  assert.equal(resolveCoverage({ ...coverageFixtures[0]!, longitude: -123 }).grade, "national-baseline");
  assert.equal(geometryContainsPoint(coverageFeatures[0]!.geometry, [-125, 50]), true);
  assert.equal(geometryContainsPoint(coverageFeatures[0]!.geometry, [-123, 50]), false);
  const polygonWithHole: CoverageFeature = {
    ...coverageFeatures[0]!,
    id: "example-hole",
    geometry: { type: "Polygon", coordinates: [
      [[-126, 49], [-124, 49], [-124, 51], [-126, 51], [-126, 49]],
      [[-125.5, 49.5], [-124.5, 49.5], [-124.5, 50.5], [-125.5, 50.5], [-125.5, 49.5]],
    ] },
  };
  assert.equal(geometryContainsPoint(polygonWithHole.geometry, [-125, 50]), false);
  assert.equal(resolveCoverage({ ...coverageFixtures[0]!, features: [{ ...coverageFeatures[0]!, id: "z-low", grade: "national-baseline-plus-local-context", priority: 1 }, { ...coverageFeatures[0]!, id: "a-high", grade: "enhanced-local-records", priority: 2 }] }).grade, "enhanced-local-records");
  assert.equal(resolveCoverage({ ...coverageFixtures[0]!, boundaryEdition: "different-edition" }).grade, "national-baseline");
  assert.throws(() => resolveCoverage({ ...coverageFixtures[0]!, latitude: 999 }), /Latitude/);
  assert.throws(() => resolveCoverage({ ...coverageFixtures[0]!, longitude: 999 }), /Longitude/);
  assert.throws(() => resolveCoverage({ ...coverageFixtures[0]!, year: 1983 }), /Year/);
  assert.throws(() => resolveCoverage({ ...coverageFixtures[0]!, year: new Date().getUTCFullYear() + 1 }), /Year/);
  const invalidRing = { ...coverageFeatures[0]!, geometry: { type: "Polygon", coordinates: [[[-126, 49], [-124, 49], [-124, 51], [-126, 51]]] } } as unknown as CoverageFeature;
  assert.throws(() => validateCoverageFeature(invalidRing), /closed/);
  assert.throws(() => validateCoverageFeature({ ...coverageFeatures[0]!, boundaryEdition: "" }), /edition/);
  assert.throws(() => validateCoverageFeature({ ...coverageFeatures[0]!, startYear: 2021, endYear: 2020 }), /period/);
  assert.throws(() => validateCoverageFeature({ ...coverageFeatures[0]!, grade: "invalid" as never }), /grade/);
});

test("aggregation uses the first-year forest denominator and carries complete calculation context", () => {
  const denominator = forestDenominator(100, 2000, "edition");
  const result = aggregateDetectedChange({ detectedChangeHectares: 10, denominator, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2022 }, boundaryApplication: "period-contemporaneous" });
  assert.deepEqual(result, { kind: "figure", value: 10, unit: "%", denominator, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2022 }, boundaryApplication: "period-contemporaneous" });

  const unknown = aggregateDetectedChange({ detectedChangeHectares: 0, denominator: forestDenominator(0, 2000, "edition"), coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "current-applied-to-historic" });
  assert.equal(unknown.kind, "unknown");
  if (unknown.kind === "unknown") assert.ok(unknown.reason.en.trim() && unknown.reason.fr.trim());
  assert.equal(unknown.boundaryApplication, "current-applied-to-historic");
  assert.equal(aggregateDetectedChange({ detectedChangeHectares: 0, coverageGrade: "not-applicable", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" }).kind, "unknown");
  assert.equal(aggregateDetectedChange({ detectedChangeHectares: 1, denominator, coverageGrade: "extended-record-sparse-official-matching", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" }).kind, "unknown");
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: 101, denominator, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" }), /exceed/);
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: 1, denominator: forestDenominator(100, 2001, "edition"), coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2022 }, boundaryApplication: "period-contemporaneous" }), /first year/);
});

test("weighted coverage shares sum to one and corrupt fractions fail", () => {
  const shares = coverageShares([{ grade: "national-baseline", forestedHectares: 25 }, { grade: "enhanced-local-records", forestedHectares: 75 }]);
  assert.equal(shares["national-baseline"]! + shares["enhanced-local-records"]!, 1);
  assert.throws(() => coverageShares([{ grade: "national-baseline", forestedHectares: -1 }]), /non-negative/);
});

test("runtime validation rejects unsupported provinces, invalid ranges, non-finite hectares, and invalid grades", () => {
  const denominator = forestDenominator(2, 2000, "edition");
  assert.throws(() => resolveCoverage({ ...coverageFixtures[0]!, province: "XX" as never }), /province/);
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: Number.NaN, denominator, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" }), /Finite/);
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: 1, denominator, coverageGrade: "invalid" as never, timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" }), /registered/);
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: 1, denominator, coverageGrade: "national-baseline", timeRange: { from: 2022, to: 2000 }, boundaryApplication: "period-contemporaneous" }), /range/);
  assert.throws(() => aggregateDetectedChange({ detectedChangeHectares: 1, denominator, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2000 }, boundaryApplication: undefined as never }), /boundary-application/);
  assert.throws(() => coverageShares([{ grade: "national-baseline", forestedHectares: Number.NaN }]), /finite/);
  assert.throws(() => coverageShares([{ grade: "invalid" as never, forestedHectares: 1 }]), /registered/);
});

// @ts-expect-error Land area is never an aggregation input.
const landAreaInput: ForestAggregateInput = { detectedChangeHectares: 1, landAreaHectares: 10, coverageGrade: "national-baseline", timeRange: { from: 2000, to: 2000 }, boundaryApplication: "period-contemporaneous" };
void landAreaInput;
