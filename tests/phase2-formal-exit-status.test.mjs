import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase2FormalExitStatus, validatePhase2FormalExitStatus } from "../scripts/check-phase2-formal-exit-status.mjs";

const readStatus = () => JSON.parse(readFileSync(new URL("../data/phase2-formal-exit-status.json", import.meta.url), "utf8"));

test("Phase 2 formal exit records two exact limited admissions without closing review or comparison", () => {
  assert.deepEqual(checkPhase2FormalExitStatus(), { status: "two-of-four-formal-exit-criteria", completed: 2, total: 4, percentage: 50 });
  assert.match(execFileSync("node", ["scripts/check-phase2-formal-exit-status.mjs"], { encoding: "utf8" }), /is 2\/4/);
});

test("Phase 2 formal exit rejects a future completion flag without canonical completion evidence", () => {
  const future = readStatus();
  future.criteria[1].complete = true;
  future.formalExit = { completed: 3, total: 4, percentage: 75 };
  future.status = "three-of-four-formal-exit-criteria";
  assert.throws(() => validatePhase2FormalExitStatus(future), /Phase 2 criterion completion drifted/);
});

test("Phase 2 formal exit rejects tampered open-evidence pointers and admission flags", () => {
  const pointerTamper = readStatus();
  pointerTamper.criteria[1].evidence = "data/phase2-v21-expert-review-results.template.json";
  assert.throws(() => validatePhase2FormalExitStatus(pointerTamper), /open evidence path drifted/);

  const admissionTamper = readStatus();
  admissionTamper.criteria[0].complete = false;
  admissionTamper.formalExit = { completed: 1, total: 4, percentage: 25 };
  admissionTamper.status = "one-of-four-formal-exit-criteria";
  assert.throws(() => validatePhase2FormalExitStatus(admissionTamper), /Phase 2 criterion completion drifted/);

  const traversal = readStatus();
  traversal.criteria[0].evidence = "data/../package.json";
  traversal.criteria[3].evidence = "data/../package.json";
  assert.throws(() => validatePhase2FormalExitStatus(traversal), /must not traverse directories/i);
});
