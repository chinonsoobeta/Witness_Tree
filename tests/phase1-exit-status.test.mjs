import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase1ExitStatus, validatePhase1ExitStatus } from "../scripts/check-phase1-exit-status.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/phase1-exit-status.json", import.meta.url), "utf8"));

test("Phase 1 exit status derives the current unweighted 2/3 result after the archive gate was removed", () => {
  assert.deepEqual(checkPhase1ExitStatus(), { status: "incomplete", passed: 2, total: 3, ratio: "2/3" });
});

test("the archive gate leaves the count only by the owner's recorded scope decision", () => {
  const decision = JSON.parse(readFileSync(new URL("../data/phase-scope-decision-2026-09-26.json", import.meta.url), "utf8"));
  const withoutRemoval = { ...decision, removedCriteria: decision.removedCriteria.filter((item) => item.phase !== 1) };
  assert.throws(() => validatePhase1ExitStatus(read(), { verifyHashes: false, decision: withoutRemoval }), /four gates less those|Removed gates/);
  const ledgerRemoved = { ...decision, removedCriteria: [...decision.removedCriteria, { phase: 1, criterion: "complete-production-ledger", reason: "An attempt to remove a gate this phase does not allow." }] };
  assert.throws(() => validatePhase1ExitStatus(read(), { verifyHashes: false, decision: ledgerRemoved }), /does not allow complete-production-ledger/);
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
