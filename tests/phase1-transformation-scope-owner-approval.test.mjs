import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1TransformationScopeOwnerApproval } from "../scripts/check-phase1-transformation-scope-owner-approval.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = () => JSON.parse(readFileSync(new URL("../data/phase1-transformation-scope-owner-approval-2026-08-25.json", import.meta.url), "utf8"));

test("records the exact seven-scope owner approval without downstream admission", () => {
  const record = read();
  validatePhase1TransformationScopeOwnerApproval(record, root);
  assert.equal(record.approvedScopes.length, 7);
  assert.equal(record.claims.transformed, false);
  assert.equal(record.claims.productionAdmission, false);
});

test("rejects owner-decision, scope, binding, packet, and downstream-claim tampering", () => {
  const mutations = [
    (record) => { record.ownerDecision.decision = "reject"; },
    (record) => { record.ownerDecision.packet.sha256 = "0".repeat(64); },
    (record) => { record.approvedScopes.pop(); },
    (record) => { record.approvedScopes[0].rows = ["ntems-canopy-cover"]; },
    (record) => { record.approvedScopes[0].specSha256 = "f".repeat(64); },
    (record) => { record.approvedScopes[0].bundleId = "qc-fourth-inventory"; },
    (record) => { record.claims.transformed = true; },
    (record) => { record.decisionBoundary.executionAuthorized = true; },
    (record) => { record.extra = true; },
  ];
  for (const mutate of mutations) {
    const record = read();
    mutate(record);
    assert.throws(() => validatePhase1TransformationScopeOwnerApproval(record, root));
  }
});
