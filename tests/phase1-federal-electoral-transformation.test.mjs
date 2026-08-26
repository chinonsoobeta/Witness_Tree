import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EXECUTION_APPROVAL_PATH,
  INPUT_SHA256,
  METHOD_VERSION,
  OUTPUT_LAYER,
  RUNNER_VERSION,
  SPEC_ID,
  canonicalJson,
  expectedOutputRecordId,
  validateExecutionApproval,
} from "../scripts/run-phase1-federal-electoral-transformation.mjs";

test("canonical sidecar JSON is stable and key ordered", () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, c: 3 }, list: [{ b: 2, a: 1 }] }), '{"a":{"c":3,"d":2},"list":[{"a":1,"b":2}],"z":1}');
});

test("output record identity is deterministic and source-bound", () => {
  const properties = { FED_NUM: 24037, ED_NAMEE: "Laurier—Sainte-Marie", ED_NAMEF: "Laurier—Sainte-Marie", REPORDER: "2023" };
  const first = expectedOutputRecordId(0, properties);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, expectedOutputRecordId(0, properties));
  assert.notEqual(first, expectedOutputRecordId(1, properties));
  assert.equal(INPUT_SHA256.length, 64);
  assert.equal(SPEC_ID, "federal-electoral-districts-2023-v1");
  assert.equal(METHOD_VERSION, "phase1-federal-electoral-districts-2023-v1");
  assert.equal(OUTPUT_LAYER, "federal_electoral_districts_2023");
  assert.equal(RUNNER_VERSION, "phase1-federal-electoral-transformation-runner-v1");
});

test("execution authorization is fail-closed when the canonical future record is absent", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "witness-tree-fed-transform-test-"));
  assert.throws(
    () => validateExecutionApproval({ root }),
    new RegExp(`missing future authorization record ${EXECUTION_APPROVAL_PATH.replaceAll(".", "\\.")}`),
  );
  mkdirSync(path.join(root, "data"));
  writeFileSync(path.join(root, EXECUTION_APPROVAL_PATH), "{}\n");
  assert.throws(() => validateExecutionApproval({ root }), /execution authorization record keys are not exact/);
});
