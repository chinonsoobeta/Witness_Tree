import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkPhase0ExternalCheckpoints, validatePhase0ExternalCheckpoints } from "../scripts/check-phase0-external-checkpoints.mjs";

const record = JSON.parse(await readFile(new URL("../data/phase0-external-checkpoints.json", import.meta.url), "utf8"));
const clone = () => structuredClone(record);

test("all ten Phase 0 external checkpoints remain bilingual, evidence-bound, and non-admitting", () => {
  const validated = validatePhase0ExternalCheckpoints(clone());
  assert.equal(validated.checkpoints.length, 10);
  for (const checkpoint of validated.checkpoints) {
    assert.equal(checkpoint.evidenceAvailable, checkpoint.status === "complete");
    assert.equal(checkpoint.productionDataAdmission, false);
  }
  assert.equal(validated.checkpoints.filter((checkpoint) => checkpoint.status === "complete").length, 3);
  for (const id of ["editorial-definition-signoff", "accountable-owners-and-escalation"]) {
    const checkpoint = validated.checkpoints.find((item) => item.id === id);
    assert.equal(checkpoint.primaryArtifact.path, "docs/OWNER_GOVERNANCE_DECISION.md");
    assert.equal(checkpoint.primaryArtifact.approver, "Project owner — approval recorded in Codex thread on 2026-08-25");
  }
  assert.equal(validated.checkpoints.find((item) => item.id === "legal-signoff").status, "pending");
  assert.equal(validated.checkpoints.find((item) => item.id === "legal-signoff").evidenceAvailable, false);
  assert.equal(validated.checkpoints.find((item) => item.id === "engagement-route-and-response-proof").status, "blocked");
});

test("a checkpoint cannot be complete without an artifact hash, date, and approver", () => {
  const missingArtifact = clone();
  missingArtifact.checkpoints[0] = { ...missingArtifact.checkpoints[0], status: "complete", evidenceAvailable: true };
  delete missingArtifact.checkpoints[0].primaryArtifact;
  assert.throws(() => validatePhase0ExternalCheckpoints(missingArtifact), /primary artifact/);

  const malformedArtifact = clone();
  malformedArtifact.checkpoints[0] = { ...malformedArtifact.checkpoints[0], status: "complete", evidenceAvailable: true, primaryArtifact: { path: "docs/signoff.pdf", sha256: "bad", date: "2026-8-25", approver: "reviewer" } };
  assert.throws(() => validatePhase0ExternalCheckpoints(malformedArtifact), /SHA-256/);
});

test("checkpoint records reject credentials, MFA material, and production-data admission", () => {
  const sensitive = clone();
  sensitive.checkpoints[0].approvalLanguage = "Approve with MFA code.";
  assert.throws(() => validatePhase0ExternalCheckpoints(sensitive), /credentials or MFA/);

  for (const id of ["mistik-honorarium-request-response", "mistik-domain-registration", "witness-tree-domain-registration"]) {
    const admission = clone();
    const checkpoint = admission.checkpoints.find((entry) => entry.id === id);
    checkpoint.productionDataAdmission = true;
    assert.throws(() => validatePhase0ExternalCheckpoints(admission), /cannot admit production data/);
  }
});

test("completed remote evidence is present and checksum-bound", async () => {
  assert.deepEqual(await checkPhase0ExternalCheckpoints(new URL("..", import.meta.url).pathname), { checkpoints: 10 });
});
