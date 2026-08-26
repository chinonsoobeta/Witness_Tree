import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkPhase0FoundationsExitStatus, validatePhase0FoundationsExitStatus } from "../scripts/check-phase0-foundations-exit-status.mjs";
import { checkPhase3FrontendFoundationExitStatus, validatePhase3FrontendFoundationExitStatus } from "../scripts/check-phase3-frontend-foundation-exit-status.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"));
const phase0 = () => load("phase0-foundations-exit-status.json");
const phase3 = () => load("phase3-frontend-foundation-exit-status.json");

test("the recorded Phase 0 and Phase 3 status pass their own contract", async () => {
  const zero = await checkPhase0FoundationsExitStatus();
  assert.equal(zero.totalCriteria, 7);
  assert.equal(zero.completedCriteria, 4);
  assert.equal(zero.phaseComplete, false);
  const three = await checkPhase3FrontendFoundationExitStatus();
  assert.equal(three.totalCriteria, 5);
  assert.equal(three.completedCriteria, 4);
  assert.equal(three.phaseComplete, false);
});

test("a pass cannot be claimed without checksum-bound evidence", async () => {
  const record = await phase0();
  const criterion = record.exitCriteria.find((item) => item.status === "fail");
  criterion.status = "pass";
  delete criterion.blockedBy;
  await assert.rejects(() => validatePhase0FoundationsExitStatus(record), /requires checksum-bound local evidence/);
});

test("evidence drift fails the gate", async () => {
  const record = await phase3();
  const criterion = record.exitCriteria.find((item) => item.status === "pass");
  criterion.evidence[0].sha256 = "0".repeat(64);
  await assert.rejects(() => validatePhase3FrontendFoundationExitStatus(record), /checksum does not match/);
});

test("evidence cannot be read from outside the repository", async () => {
  const record = await phase3();
  const criterion = record.exitCriteria.find((item) => item.status === "pass");
  criterion.evidence[0].path = "../outside.json";
  await assert.rejects(() => validatePhase3FrontendFoundationExitStatus(record), /must remain inside the repository/);
});

test("a failing criterion must name its blocker and may not carry completion evidence", async () => {
  const missingBlocker = await phase0();
  delete missingBlocker.exitCriteria.find((item) => item.status === "fail").blockedBy;
  await assert.rejects(() => validatePhase0FoundationsExitStatus(missingBlocker), /blocked on the owner or on engineering/);

  const withEvidence = await phase0();
  withEvidence.exitCriteria.find((item) => item.status === "fail").evidence = [];
  await assert.rejects(() => validatePhase0FoundationsExitStatus(withEvidence), /must not carry evidence of completion/);
});

test("the percentage and completion flag are derived, never asserted", async () => {
  const inflated = await phase0();
  inflated.percentage = 100;
  await assert.rejects(() => validatePhase0FoundationsExitStatus(inflated), /percentage must equal/);

  const claimed = await phase3();
  claimed.phaseComplete = true;
  await assert.rejects(() => validatePhase3FrontendFoundationExitStatus(claimed), /must be derived from the criteria/);
});

test("criteria must match the published plan wording exactly", async () => {
  const renamed = await phase3();
  renamed.exitCriteria[0].title = "Budgets pass";
  await assert.rejects(() => validatePhase3FrontendFoundationExitStatus(renamed), /must exactly match the published plan wording/);

  const dropped = await phase0();
  dropped.exitCriteria.pop();
  await assert.rejects(() => validatePhase0FoundationsExitStatus(dropped), /exactly the 7 published exit criteria/);
});

test("every unmet criterion is listed as a blocker", async () => {
  const record = await phase0();
  record.ownerBlockers.pop();
  await assert.rejects(() => validatePhase0FoundationsExitStatus(record), /must list exactly its unmet criteria/);
});
