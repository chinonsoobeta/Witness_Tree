import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase1ExitStatus, validatePhase1ExitStatus } from "../scripts/check-phase1-exit-status.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/phase1-exit-status.json", import.meta.url), "utf8"));

test("Phase 1 exit status derives the current unweighted 2/4 result", () => {
  assert.deepEqual(checkPhase1ExitStatus(), { status: "incomplete", passed: 2, total: 4, ratio: "2/4" });
});

test("Phase 1 exit status rejects a premature completion or stale tracker in formal coverage", () => {
  const premature = read();
  premature.formalExit.status = "complete";
  assert.throws(() => validatePhase1ExitStatus(premature, { verifyHashes: false }), /Complete status/);

  const staleAsExit = read();
  staleAsExit.formalExit.ratio = "39.2741935%";
  assert.throws(() => validatePhase1ExitStatus(staleAsExit, { verifyHashes: false }), /ratio/);
});

test("Phase 1 exit status rejects a tampered evidence binding", () => {
  const tampered = read();
  tampered.formalExit.gates[0].evidence[0].sha256 = "0".repeat(64);
  assert.throws(() => validatePhase1ExitStatus(tampered), /no longer matches/);
});
