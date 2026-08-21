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
  assert.equal(result?.lineageSha256, aggregate.lineageSha256);
  for (const value of [result?.fromYear, result?.toYear, result?.denominator, result?.denominatorReferenceYear, result?.eventHectares, result?.shareOfFirstYearForest]) {
    assert.equal(value?.kind, "figure");
    assert.equal(Boolean(value?.provenance.dataset), true);
    assert.equal(value?.coverageGrade, "national-baseline");
  }
});

test("adapter coordinates reference year, nonnegative areas, share bounds and recomputed arithmetic", () => {
  const run = (replacement: unknown) => adaptPhase2SyntheticAggregates({ ...document, aggregates: [replacement] } as never, "2026-08-21");
  assert.throws(() => run({ ...aggregate, denominator: { ...aggregate.denominator, referenceYear: 1985 } }), /reference year/);
  assert.throws(() => run({ ...aggregate, denominator: { ...aggregate.denominator, hectares: -1 } }), /nonnegative/);
  assert.throws(() => run({ ...aggregate, eventHectares: -1 }), /nonnegative/);
  for (const percent of [-1, 101, 4.9]) assert.throws(() => run({ ...aggregate, shareOfFirstYearForest: { kind: "figure", percent } }), /0\.\.100|consistent/);
  assert.throws(() => run({ ...aggregate, denominator: { ...aggregate.denominator, hectares: 0 }, eventHectares: 0, shareOfFirstYearForest: { kind: "figure", percent: 0 } }), /consistent/);
});

test("adapter requires bilingual Unknown reasons and accepts bounded arithmetic examples", () => {
  const run = (replacement: unknown) => adaptPhase2SyntheticAggregates({ ...document, aggregates: [replacement] } as never, "2026-08-21");
  for (const reason of [{ en: "", fr: "Raison" }, { en: "Reason", fr: "" }]) assert.throws(() => run({ ...aggregate, shareOfFirstYearForest: { kind: "unknown", reason } }), /English and French reasons/);
  const [unknown] = run({ ...aggregate, denominator: { ...aggregate.denominator, hectares: 0 }, eventHectares: 0, shareOfFirstYearForest: { kind: "unknown", reason: { en: "No denominator.", fr: "Aucun dénominateur." } } });
  assert.deepEqual(unknown?.shareOfFirstYearForest.kind === "unknown" ? unknown.shareOfFirstYearForest.reason : null, { en: "No denominator.", fr: "Aucun dénominateur." });
  for (const denominator of [1, 10, 100, 1_000]) for (const fraction of [0, .25, .5, 1]) {
    const eventHectares = denominator * fraction;
    const [adapted] = run({ ...aggregate, denominator: { ...aggregate.denominator, hectares: denominator }, eventHectares, shareOfFirstYearForest: { kind: "figure", percent: fraction * 100 } });
    assert.equal(adapted?.shareOfFirstYearForest.kind === "figure" ? adapted.shareOfFirstYearForest.value : -1, fraction * 100);
  }
});

test("adapter fails closed on production, review, schema, lineage and numeric drift", () => {
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, productionEligible: true } as never, "2026-08-21"), /nonproduction/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, reviewStatus: "approved" } as never, "2026-08-21"), /unapproved/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, schemaVersion: 2 } as never, "2026-08-21"), /schema-version-1/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, aggregates: [{ ...aggregate, lineageSha256: "fabricated" }] } as never, "2026-08-21"), /lineage/);
  assert.throws(() => adaptPhase2SyntheticAggregates({ ...document, aggregates: [{ ...aggregate, eventHectares: Number.NaN }] } as never, "2026-08-21"), /finite/);
});
