import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkProvinceSeries, validateProvinceSeries } from "../scripts/check-phase2-province-series.mjs";

const readbackBytes = readFileSync(new URL("../data/phase2-province-series-readback.json", import.meta.url));
const readback = JSON.parse(readbackBytes);
const series = () => JSON.parse(readFileSync(new URL("../data/phase2-province-series.json", import.meta.url), "utf8"));
const validate = (next) => validateProvinceSeries(next, readback, readbackBytes);
const bc = (record) => record.provinces.find((province) => province.code === "BC");

/*
 * Some guards can only be reached by editing the readback and the series
 * together. Tampering with the series alone trips the digest binding first,
 * which proves the binding works but leaves the arithmetic guards untested.
 * This drives both sides in lockstep so the arithmetic is what fires.
 */
const inLockstep = (mutate) => {
  const nextSeries = series();
  const nextReadback = JSON.parse(readbackBytes.toString("utf8"));
  mutate(bc(nextSeries), nextReadback.provinces.find((province) => province.code === "BC"));
  const nextBytes = Buffer.from(`${JSON.stringify(nextReadback, null, 2)}\n`);
  // Rebind, so the digest guard passes and the arithmetic guard is reached.
  nextSeries.source.byteLength = nextBytes.byteLength;
  nextSeries.source.sha256 = createHash("sha256").update(nextBytes).digest("hex");
  return () => validateProvinceSeries(nextSeries, nextReadback, nextBytes);
};

test("the series carries all four provinces across 38 intervals from 1984 to 2022", () => {
  const result = checkProvinceSeries();
  assert.equal(result.provinces, 4);
  assert.equal(result.intervals, 38);

  const record = series();
  assert.equal(record.firstYear, 1984);
  assert.equal(record.lastYear, 2022);
  assert.equal(bc(record).intervals[0].fromYear, 1984);
  assert.equal(bc(record).intervals.at(-1).toYear, 2022);
  assert.equal(bc(record).cumulative.observedLossHectares, 10823352.93);
});

test("the cumulative headline is the union measured over the 1984 forest mask", () => {
  /*
   * The percentage is the number a reader will quote. It has to be the union
   * divided by the mask it was measured against, and nothing else, or the
   * headline says something the run never computed.
   */
  const restated = series();
  bc(restated).cumulative.observedLossPercent = 12.5;
  assert.throws(() => validate(restated), /not the union over the 1984 forest mask/);

  assert.throws(
    inLockstep((seriesProvince, readbackProvince) => {
      seriesProvince.cumulative.known1984ForestHectares = 40000000;
      readbackProvince.cumulative.known1984ForestHectares = 40000000;
    }),
    /not the union over the 1984 forest mask/,
  );
});

test("a union can never exceed the sum of the intervals it unions", () => {
  // The one arithmetic impossibility that would prove the method broke.
  assert.throws(
    inLockstep((seriesProvince, readbackProvince) => {
      const impossible = seriesProvince.reconciliation.naiveSumOfPublishedIntervalsHectares + 1;
      const percent = (impossible / seriesProvince.cumulative.known1984ForestHectares) * 100;
      for (const province of [seriesProvince, readbackProvince]) {
        province.cumulative.observedLossHectares = impossible;
        province.cumulative.observedLossPercent = percent;
        province.reconciliation.cumulativeObservedLossHectares = impossible;
        // Keep the stated difference honest, so the impossibility guard is
        // what fires rather than the arithmetic-consistency guard ahead of it.
        province.reconciliation.differenceHectares = -1;
      }
    }),
    /union exceeds the interval sum/,
  );
});

test("the two bases must stay separate and stay explained", () => {
  /*
   * Summing BC's 38 intervals gives about 14.9 million hectares against a
   * cumulative union of about 10.8 million. A reader who adds up the chart
   * lands four million hectares from the headline, so the difference and both
   * of its causes have to travel with the figures.
   */
  const flattened = series();
  const province = bc(flattened);
  const first = province.intervals[0].knownForestedHectares;
  for (const interval of province.intervals) interval.knownForestedHectares = first;
  assert.throws(() => validate(flattened), /denominators do not move/);

  const silent = series();
  bc(silent).reconciliation.causes = [bc(silent).reconciliation.causes[0]];
  assert.throws(() => validate(silent), /must state both reasons/);

  const misstated = series();
  bc(misstated).reconciliation.differenceHectares = 0;
  assert.throws(() => validate(misstated), /stated difference does not match/);

  const unwarned = series();
  unwarned.bases.warning = "The figures are consistent.";
  assert.throws(() => validate(unwarned), /bases do not add up/);
});

test("unknown may never be presented as zero and coverage stays partial", () => {
  const zeroed = series();
  bc(zeroed).unknownRequiredInputHectares = 0;
  assert.throws(() => validate(zeroed), /reports no unknown/);

  const upgraded = series();
  bc(upgraded).coverageGrade = "complete";
  assert.throws(() => validate(upgraded), /coverage grade drifted/);
});

test("the series may not claim admission, release, or review it does not have", () => {
  const admitted = series();
  admitted.claims.admitted = true;
  assert.throws(() => validate(admitted), /claims drifted/);

  const reviewed = series();
  reviewed.claims.expertReviewed = true;
  assert.throws(() => validate(reviewed), /claims drifted/);
});

test("the series is bound to the readback by digest, not by path", () => {
  const drifted = series();
  drifted.source.sha256 = "0".repeat(64);
  assert.throws(() => validate(drifted), /readback digest drifted/);

  const resized = series();
  resized.source.byteLength += 1;
  assert.throws(() => validate(resized), /readback length drifted/);
});

test("interval years stay contiguous adjacent pairs", () => {
  const gapped = series();
  bc(gapped).intervals[5].fromYear = 1999;
  assert.throws(() => validate(gapped), /not contiguous|not an adjacent annual pair/);
});
