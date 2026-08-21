import assert from "node:assert/strict";
import test from "node:test";

import {
  matchDetectedChange,
  recordedWithoutDetectedChange,
}
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/pipeline/matching.ts";
import { resolvePrecedence, totalPrecedenceHectares }
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "../lib/pipeline/precedence.ts";

test("a 60 percent overlap matches, retains lower-overlap candidates, and a 40 percent overlap does not", () => {
  const detected = { id: "change-1", observationYear: 2000, geometryHectares: 10 };
  const result = matchDetectedChange(detected, [
    { id: "winner", eventYear: 2002, geometryHectares: 10, intersectionHectares: 6 },
    { id: "runner-up", eventYear: 2000, geometryHectares: 10, intersectionHectares: 5 },
  ]);

  assert.equal(result.selectedMatch?.candidate.id, "winner");
  assert.deepEqual(result.rejectedCandidates.map((item) => item.candidate.id), ["runner-up"]);
  assert.equal(result.rejectedCandidates[0]?.reason, "lower-overlap-than-selected");

  const noMatch = matchDetectedChange(detected, [
    { id: "too-small", eventYear: 2000, geometryHectares: 10, intersectionHectares: 4 },
  ]);
  assert.equal(noMatch.selectedMatch, null);
  assert.equal(noMatch.evidenceClass, "satellite-observation");
  assert.ok(noMatch.nonMatchReason);
});

test("matching includes the exact 50 percent boundary and resolves equal overlaps by stable input order", () => {
  const detected = { id: "change-boundary", observationYear: 2000, geometryHectares: 10 };
  const result = matchDetectedChange(detected, [
    { id: "first", eventYear: 2000, geometryHectares: 10, intersectionHectares: 5 },
    { id: "second", eventYear: 2000, geometryHectares: 10, intersectionHectares: 5 },
  ]);
  assert.equal(result.selectedMatch?.candidate.id, "first");
  assert.equal(result.selectedMatch?.overlapShare, 0.5);
  assert.deepEqual(result.rejectedCandidates.map(({ candidate, reason }) => ({ id: candidate.id, reason })), [
    { id: "second", reason: "lower-overlap-than-selected" },
  ]);

  for (const intersectionHectares of [0, 1, 4.999999]) {
    assert.equal(matchDetectedChange(detected, [
      { id: `below-${intersectionHectares}`, eventYear: 2000, geometryHectares: 10, intersectionHectares },
    ]).selectedMatch, null);
  }
});

test("an impossible intersection is rejected as invalid geometry", () => {
  const result = matchDetectedChange(
    { id: "change-geometry", observationYear: 2000, geometryHectares: 10 },
    [{ id: "impossible", eventYear: 2000, geometryHectares: 20, intersectionHectares: 12 }],
  );

  assert.equal(result.selectedMatch, null);
  assert.equal(result.rejectedCandidates[0]?.reason, "invalid-geometry");
  assert.equal(result.rejectedCandidates[0]?.overlapShare, null);
});

test("matching uses a two-year tolerance, widened to three years before 1995", () => {
  assert.equal(matchDetectedChange(
    { id: "historic", observationYear: 1994, geometryHectares: 1 },
    [{ id: "within-three", eventYear: 1997, geometryHectares: 1, intersectionHectares: 1 }],
  ).selectedMatch?.candidate.id, "within-three");
  assert.equal(matchDetectedChange(
    { id: "modern", observationYear: 1995, geometryHectares: 1 },
    [{ id: "outside-two", eventYear: 1998, geometryHectares: 1, intersectionHectares: 1 }],
  ).selectedMatch, null);
});

test("official records without a detected change remain available", () => {
  assert.deepEqual(
    recordedWithoutDetectedChange([{ id: "matched" }, { id: "retained" }], new Set(["matched"])),
    [{ id: "retained" }],
  );
});

test("fire wins a hectare-year once while every event remains available", () => {
  const resolutions = resolvePrecedence([
    { id: "harvest", hectareYearId: "cell-1", year: 2020, hectares: 1, kind: "recorded-harvest", qualifyingRecordedHarvest: true },
    { id: "fire", hectareYearId: "cell-1", year: 2020, hectares: 1, kind: "fire" },
    { id: "change", hectareYearId: "cell-1", year: 2020, hectares: 1, kind: "unmatched-detected-change" },
    { id: "insect", hectareYearId: "cell-2", year: 2020, hectares: 1, kind: "insect-disease" },
    { id: "intervention", hectareYearId: "cell-2", year: 2020, hectares: 1, kind: "other-intervention" },
  ]);

  assert.equal(resolutions[0]?.winner?.id, "fire");
  assert.equal(resolutions[0]?.retainedEvidence.length, 3);
  assert.equal(resolutions[1]?.winner?.id, "insect");
  assert.equal(totalPrecedenceHectares(resolutions), 2);
});

test("precedence rejects duplicate identity and malformed hectare-year measurements", () => {
  const valid = { id: "event", hectareYearId: "cell-1", year: 2020, hectares: 1, kind: "fire" } as const;
  assert.throws(() => resolvePrecedence([valid, valid]), /unique/);
  assert.throws(() => resolvePrecedence([{ ...valid, id: "nan", hectares: Number.NaN }]), /positive finite/);
  assert.throws(() => resolvePrecedence([{ ...valid, id: "negative", hectares: -1 }]), /positive finite/);
  assert.throws(() => resolvePrecedence([{ ...valid, id: "year", year: 2020.5 }]), /integer year/);
  assert.throws(() => resolvePrecedence([{ ...valid, id: "kind", kind: "invalid" as never }]), /registered kind/);
});
