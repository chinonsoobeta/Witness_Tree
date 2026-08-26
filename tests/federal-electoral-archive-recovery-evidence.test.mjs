import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateFederalElectoralArchiveRecoveryEvidence } from "../scripts/check-federal-electoral-archive-recovery-evidence.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const evidence = read("data/federal-electoral-archive-recovery-evidence.json");
const source = read("data/elections-canada-fed-2025-source-ledger.json");
const ledger = read("data/phase1-production-source-ledger.json");

test("federal exact-version evidence binds one retained raw object to two separately admitted ledger rows without inflating its raw-only claims", () => {
  assert.equal(validateFederalElectoralArchiveRecoveryEvidence(evidence, source, ledger), evidence);
  assert.equal(evidence.physicalArtifact.ledgerRows.length, 2);
  assert.equal(evidence.claims.productionEligible, false);
});

test("federal exact-version evidence rejects replacement, checksum, retention, and admission drift", () => {
  const replacement = structuredClone(evidence);
  replacement.operationBoundary.payloadMutationAttempted = true;
  assert.throws(() => validateFederalElectoralArchiveRecoveryEvidence(replacement, source, ledger));
  const checksum = structuredClone(evidence);
  checksum.payload.sha256 = "0".repeat(64);
  assert.throws(() => validateFederalElectoralArchiveRecoveryEvidence(checksum, source, ledger));
  const retention = structuredClone(evidence);
  retention.manifest.retention.mode = "GOVERNANCE";
  assert.throws(() => validateFederalElectoralArchiveRecoveryEvidence(retention, source, ledger));
  const admission = structuredClone(evidence);
  admission.claims.productionAdmission = true;
  assert.throws(() => validateFederalElectoralArchiveRecoveryEvidence(admission, source, ledger));
});
