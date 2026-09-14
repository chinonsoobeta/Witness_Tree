import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateWildfireScheduledArchiveObservedRuns } from "../scripts/check-wildfire-scheduled-archive-observed-runs.mjs";

const record = JSON.parse(readFileSync(new URL("../data/wildfire-scheduled-archive-observed-runs-2026-09-14.json", import.meta.url), "utf8"));
const firstSuccess = record.runs.findIndex(({ gateOpened }) => gateOpened);
const firstNoOp = record.runs.findIndex(({ gateOpened }) => !gateOpened);

function tampered(change) {
  const copy = structuredClone(record);
  change(copy);
  return copy;
}

test("the recorded runs are three real refreshes and three gated no-ops, with nothing released", async () => {
  assert.equal(await validateWildfireScheduledArchiveObservedRuns(record), record);
  assert.equal(record.classifications.realRefreshSuccesses.count, 3);
  assert.equal(record.classifications.dstGatedNoOpSuccesses.count, 3);
  assert.equal(record.classifications.attemptedRefreshFailures.count, 0);
  assert.equal(record.claims.crossesDaylightSavingTransition, false);
  for (const name of ["transformed", "ingested", "released", "productionEligible"]) assert.equal(record.claims[name], false);
});

test("a run cannot be counted as a refresh by label alone", async () => {
  await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => {
    copy.runs[firstNoOp].gateOpened = true;
  })), /gateOpened contradicts/);
  await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => {
    copy.classifications.realRefreshSuccesses.count = 4;
  })), /derived from each run's steps/);
  await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => {
    copy.runs[firstNoOp].archived = copy.runs[firstSuccess].archived;
  })), /cannot record archived objects/);
});

test("each real refresh must archive the four feeds under a two-year COMPLIANCE lock that read back", async () => {
  const cases = [
    [(run) => { run.archived.pop(); }, /exactly the four owner-approved feeds/],
    [(run) => { run.archived[0].sha256 = "0".repeat(64); }, /does not carry its payload SHA-256/],
    [(run) => { run.archived[0].retainUntil = run.refreshedAt; run.archived[0].readback.retainUntil = run.refreshedAt; }, /less than 729 days/],
    [(run) => { run.archived[1].readback.retentionMode = "GOVERNANCE"; }, /COMPLIANCE lock that was written/],
    [(run) => { run.archived[2].readback.sha256Matches = false; }, /match the payload SHA-256/],
    [(run) => { run.retention.mode = "GOVERNANCE"; }, /COMPLIANCE for P2Y/],
    [(run) => { run.assumedRoleId = "AROAOTHERROLE:wildfire-refresh-1-1"; }, /approved role's session/],
    [(run) => { run.status.versionId = undefined; }, /status version it published/],
  ];
  for (const [change, message] of cases) {
    await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => change(copy.runs[firstSuccess]))), message);
  }
});

test("the record cannot claim a daylight saving crossing or any production step it did not observe", async () => {
  await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => {
    copy.claims.crossesDaylightSavingTransition = true;
  })), /match the run window/);
  for (const name of ["transformed", "ingested", "released", "productionEligible"]) {
    await assert.rejects(validateWildfireScheduledArchiveObservedRuns(tampered((copy) => {
      copy.claims[name] = true;
    })), new RegExp(`cannot claim ${name}`));
  }
});

test("a run window that spans 2026-11-01 must be recorded as crossing daylight saving time", async () => {
  const shifted = tampered((copy) => {
    copy.runs[copy.runs.length - 1].createdAt = "2026-11-02T10:37:55Z";
    copy.observedAt = "2026-11-02T12:00:00Z";
  });
  await assert.rejects(validateWildfireScheduledArchiveObservedRuns(shifted), /match the run window/);
  shifted.claims.crossesDaylightSavingTransition = true;
  assert.equal(await validateWildfireScheduledArchiveObservedRuns(shifted), shifted);
});
