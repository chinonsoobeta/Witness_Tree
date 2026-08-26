import assert from "node:assert/strict";
import test from "node:test";
import { validatePhase1NationalArchiveFinalizationAudit } from "../scripts/check-phase1-national-archive-finalization-audit.mjs";

test("national archive audit records completed MPU heads while keeping immutable credit fail-closed", () => {
  const audit = validatePhase1NationalArchiveFinalizationAudit();
  assert.equal(audit.liveReadOnly.multipart.canopy.openUploadCount, 0);
  assert.equal(audit.liveReadOnly.multipart.canopy.completionStatus, "completed");
  assert.equal(audit.liveReadOnly.multipart.canopy.partCount, 155);
  assert.equal(audit.postCompletionOperationalTruth.multipartCompleted, true);
  assert.equal(audit.postCompletionOperationalTruth.primaryAndRecovery.payload.bytes, 10347564066);
  assert.equal(audit.postCompletionOperationalTruth.primaryAndRecovery.sidecar.bytes, 459);
  assert.equal(audit.postCompletionOperationalTruth.archiveCredit, false);
  assert.equal(audit.postCompletionOperationalTruth.versionedReadback.performed, false);
  assert.equal(audit.offlineMultipartReproduction.afterFix.uploadPartCalled, false);
  assert.equal(audit.claims.remoteMutationPerformed, false);
});

test("national archive audit rejects state mutation, invalid completion fields, or exposed identifiers", () => {
  const mutation = structuredClone(validatePhase1NationalArchiveFinalizationAudit());
  mutation.liveReadOnly.mutationsPerformed.push("complete-multipart-upload");
  assert.throws(() => validatePhase1NationalArchiveFinalizationAudit(mutation));
  const invalidParts = structuredClone(validatePhase1NationalArchiveFinalizationAudit());
  invalidParts.offlineMultipartReproduction.afterFix.completionPartsFields.push("Size");
  assert.throws(() => validatePhase1NationalArchiveFinalizationAudit(invalidParts));
  const exposed = structuredClone(validatePhase1NationalArchiveFinalizationAudit());
  exposed.liveReadOnly.multipart.canopy.uploadId = "redacted";
  assert.throws(() => validatePhase1NationalArchiveFinalizationAudit(exposed));
  const credited = structuredClone(validatePhase1NationalArchiveFinalizationAudit());
  credited.postCompletionOperationalTruth.archiveCredit = true;
  assert.throws(() => validatePhase1NationalArchiveFinalizationAudit(credited));
  const retained = structuredClone(validatePhase1NationalArchiveFinalizationAudit());
  retained.postCompletionOperationalTruth.retention.primaryPayload = "present";
  assert.throws(() => validatePhase1NationalArchiveFinalizationAudit(retained));
});
