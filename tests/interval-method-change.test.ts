import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateIntervalMethodChange,
  type IntervalMethodChangeRecord,
  type IntervalReleaseEnvelope,
} from "../lib/pipeline/interval-method-change";
import { methodParameterSha256, validateMethodManifest, type MethodParameterManifest } from "../lib/pipeline/method-manifest";

const root = new URL("../", import.meta.url);
const resolve = (path: string) => fileURLToPath(new URL(path, root));
const read = <T,>(path: string) => JSON.parse(readFileSync(resolve(path), "utf8")) as T;
const onDisk = (path: string) => createHash("sha256").update(readFileSync(resolve(path))).digest("hex");

const record = () => read<IntervalMethodChangeRecord>("data/phase3-interval-method-change.json");
const previous = () => read<MethodParameterManifest>("data/phase2-method-parameters.json");
const next = () => read<MethodParameterManifest>("data/phase3-interval-method-parameters.json");
const release = () => read<IntervalReleaseEnvelope>("data/phase3-riding-interval-measurements.json");

/** Returns whatever the record binds, so a test can reach an arm past the digest checks. */
function bound(candidate: IntervalMethodChangeRecord): (path: string) => string {
  const table = new Map([
    [candidate.manifests.previous.path, candidate.manifests.previous.sha256],
    [candidate.manifests.next.path, candidate.manifests.next.sha256],
    [candidate.releaseNote.path, candidate.releaseNote.sha256],
    [candidate.recomputation.product.path, candidate.recomputation.product.sha256],
  ]);
  return (path) => table.get(path) ?? "";
}

function repin(manifest: MethodParameterManifest, parameters: MethodParameterManifest["parameters"]): MethodParameterManifest {
  return { ...manifest, parameterSha256: methodParameterSha256(parameters), parameters };
}

test("the shipped interval method change gates a real bump against the files on disk", () => {
  const identity = validateIntervalMethodChange(record(), previous(), next(), release(), onDisk);
  assert.equal(identity.methodVersion, "interval-union-and-sum-1984-2022-v1");
  assert.equal(identity.spanCount, 741);
  assert.equal(identity.parameterSha256, validateMethodManifest(next()).parameterSha256);
  // The annual method keeps the canonical hash it was admitted with.
  assert.equal(validateMethodManifest(previous()).parameterSha256, "8d12ff6b6fb10208410bedf5f012e96a9682fdec457cccce688509d2dfa0b8fa");
});

test("every bound file is checked against its digest, not taken on faith", () => {
  for (const mutate of [
    (candidate: IntervalMethodChangeRecord) => ({ ...candidate, releaseNote: { ...candidate.releaseNote, sha256: "0".repeat(64) } }),
    (candidate: IntervalMethodChangeRecord) => ({ ...candidate, recomputation: { ...candidate.recomputation, product: { ...candidate.recomputation.product, sha256: "0".repeat(64) } } }),
    (candidate: IntervalMethodChangeRecord) => ({ ...candidate, manifests: { ...candidate.manifests, previous: { ...candidate.manifests.previous, sha256: "0".repeat(64) } } }),
    (candidate: IntervalMethodChangeRecord) => ({ ...candidate, manifests: { ...candidate.manifests, next: { ...candidate.manifests.next, sha256: "0".repeat(64) } } }),
  ]) {
    assert.throws(() => validateIntervalMethodChange(mutate(record()) as IntervalMethodChangeRecord, previous(), next(), release(), onDisk), /bound to/);
  }
});

test("the span block must be the only parameter that changed", () => {
  const original = next();
  const drifted = repin(original, { ...original.parameters, vectorization: { ...original.parameters.vectorization, connectivity: 8 } });
  const candidate = { ...record(), marker: { ...record().marker, nextParameterSha256: drifted.parameterSha256 } } as IntervalMethodChangeRecord;
  assert.throws(() => validateIntervalMethodChange(candidate, previous(), drifted, release(), bound(candidate)), /only parameter that changed/);
});

test("a bump with no span block, or a previous method that already had one, fails closed", () => {
  const original = next();
  const withoutBlock = { ...original.parameters } as Record<string, unknown>;
  delete withoutBlock.interval;
  const annual = repin(original, withoutBlock as MethodParameterManifest["parameters"]);
  const candidate = { ...record(), marker: { ...record().marker, nextParameterSha256: annual.parameterSha256 } } as IntervalMethodChangeRecord;
  // Removing the block leaves the two methods identical, so the gate refuses the rename first.
  assert.throws(() => validateIntervalMethodChange(candidate, previous(), annual, release(), bound(candidate)), /cannot change|span block/);

  const alreadyInterval = repin(previous(), original.parameters);
  const swapped = { ...record(), marker: { ...record().marker, previousParameterSha256: alreadyInterval.parameterSha256 } } as IntervalMethodChangeRecord;
  assert.throws(() => validateIntervalMethodChange(swapped, alreadyInterval, next(), release(), bound(swapped)), /cannot change|annual one/);
});

test("the shipped table must carry the new version in every jurisdiction", () => {
  const shipped = release();
  const stale: IntervalReleaseEnvelope = {
    ...shipped,
    jurisdictions: shipped.jurisdictions.map((entry, index) => (index === 2 ? { ...entry, methodVersion: "phase2-owner-approved-versioned-nonproduction-v1" } : entry)),
  };
  const candidate = record();
  assert.throws(() => validateIntervalMethodChange(candidate, previous(), next(), stale, bound(candidate)), /still names an older method version/);
  assert.throws(() => validateIntervalMethodChange(candidate, previous(), next(), { ...shipped, jurisdictions: [] }, bound(candidate)), /no jurisdictions/);
});

test("the shipped table must agree with the method on the record it covers and the bans it carries", () => {
  const shipped = release();
  const candidate = record();
  const cases: [Partial<IntervalReleaseEnvelope>, RegExp][] = [
    [{ lastYear: 2021 }, /different record/],
    [{ spanCount: 740 }, /different number of steps or spans/],
    [{ annualStepCount: 37 }, /different number of steps or spans/],
    [{ summedPercentAllowed: true }, /same summed-percentage and net-change bans/],
    [{ netChangeIncluded: true }, /same summed-percentage and net-change bans/],
    [{ claims: { ...shipped.claims, released: true } }, /does not admit, release/],
    [{ claims: { ...shipped.claims, productionEligible: true } }, /does not admit, release/],
  ];
  for (const [patch, message] of cases) {
    assert.throws(() => validateIntervalMethodChange(candidate, previous(), next(), { ...shipped, ...patch }, bound(candidate)), message);
  }
});

test("the release note must be the one the marker names, bilingual, and actually translated", () => {
  const shipped = release();
  for (const [mutate, message] of [
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, releaseNote: { ...candidate.releaseNote, id: "some-other-note" } }), /the marker requires/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, releaseNote: { ...candidate.releaseNote, fr: "  " } }), /bilingual/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, releaseNote: { ...candidate.releaseNote, fr: candidate.releaseNote.en } }), /translated, not duplicated/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, recomputation: { ...candidate.recomputation, reason: "" } }), /derived from and why/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, recomputation: { ...candidate.recomputation, reproduced: { ...candidate.recomputation.reproduced, shippedAnnualTable: "" } } }), /what it reproduced/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, claims: { ...candidate.claims, expertReviewed: true } }), /claim nothing beyond the bump/],
    [(candidate: IntervalMethodChangeRecord) => ({ ...candidate, schemaVersion: "witness-tree/phase3-interval-method-change/2" }), /unknown schema version/],
  ] as [(candidate: IntervalMethodChangeRecord) => IntervalMethodChangeRecord, RegExp][]) {
    const candidate = mutate(record());
    assert.throws(() => validateIntervalMethodChange(candidate, previous(), next(), shipped, bound(candidate)), message);
  }
});
