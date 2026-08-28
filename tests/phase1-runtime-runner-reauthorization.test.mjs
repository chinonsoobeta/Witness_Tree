import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => JSON.parse(readFileSync(new URL(relative, root), "utf8"));
const hash = (relative) => createHash("sha256").update(readFileSync(new URL(relative, root))).digest("hex");

test("owner reauthorization binds the exact SSD and resume-capable Phase 1 runners", () => {
  const record = read("data/phase1-runtime-runner-reauthorization-2026-08-28.json");
  assert.equal(record.status, "approved-owner-runner-rebinding");
  assert.equal(record.ownerDecision.decision, "approve");
  assert.deepEqual(record.boundary, {
    externalMutation: false,
    executionScopeExpanded: false,
    historicalEvidenceRewritten: false,
    releaseClaimAdded: false,
    productionAdmissionClaimAdded: false,
  });

  for (const runner of record.runners) assert.equal(runner.sha256, hash(runner.path));
  for (const authorizationPath of record.rebound) {
    const authorization = read(authorizationPath);
    const runner = record.runners.find((candidate) => candidate.path === authorization.runner.path);
    assert.ok(runner, `${authorizationPath} names an unexpected runner`);
    assert.equal(authorization.runner.sha256, runner.sha256);
  }
});
