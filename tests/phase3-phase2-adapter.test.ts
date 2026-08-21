import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { PHASE2_SYNTHETIC_ADAPTER_VERSION, adaptPhase2SyntheticAggregates } from "../lib/places/phase2-adapter.ts";

const aggregate = {
  status: "example", reviewStatus: "unapproved", productionEligible: false, boundaryId: "synthetic-bc-province", geographyType: "province", province: "BC", boundaryEdition: "synthetic-boundary-1",
  timeRange: { fromYear: 1984, toYear: 2022 }, denominator: { kind: "forested-hectares", hectares: 100, referenceYear: 1984, forestDefinitionVersion: "synthetic-nfi-1" },
  eventHectares: 5, shareOfFirstYearForest: { kind: "figure", percent: 5 }, methodVersion: "synthetic-method-1", dataVersion: "synthetic-data-1", coverageGrade: "national-baseline", lineageSha256: "a".repeat(64),
} as const;

const document = { schemaVersion: 1, batchId: "synthetic-batch-1", status: "example", reviewStatus: "unapproved", productionEligible: false, aggregates: [aggregate] } as const;

test("versioned adapter maps canonical Phase 2 synthetic output without production claims", () => {
  const [result] = adaptPhase2SyntheticAggregates(document, "2026-08-21");
  assert.equal(result?.adapterVersion, PHASE2_SYNTHETIC_ADAPTER_VERSION);
  assert.equal(result?.status, "example");
  assert.equal(result?.reviewStatus, "unapproved");
  assert.equal(result?.productionEligible, false);
  for (const value of [result?.fromYear, result?.toYear, result?.denominator, result?.denominatorReferenceYear, result?.eventHectares, result?.shareOfFirstYearForest]) {
    assert.equal(value?.kind, "figure");
    assert.equal(Boolean(value?.provenance.dataset), true);
    assert.equal(value?.coverageGrade, "national-baseline");
  }
});

test("adapter fails closed on production, review, schema, lineage and numeric drift", () => {
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, productionEligible: true } as never, "2026-08-21"), /nonproduction/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, reviewStatus: "approved" } as never, "2026-08-21"), /unapproved/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, schemaVersion: 2 } as never, "2026-08-21"), /schema-version-1/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, aggregates: [{ ...aggregate, lineageSha256: "fabricated" }] } as never, "2026-08-21"), /lineage/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, aggregates: [{ ...aggregate, eventHectares: Number.NaN }] } as never, "2026-08-21"), /finite/);
});
