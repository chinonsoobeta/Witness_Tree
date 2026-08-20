import assert from "node:assert/strict";
import test from "node:test";
import { validatePhase1NationalArchiveFinalizationAudit } from "../scripts/check-phase1-national-archive-finalization-audit.mjs";

test("national archive audit records the 155-part live prefix and redacted offline proof", () => {
  const audit = validatePhase1NationalArchiveFinalizationAudit();
  assert.equal(audit.liveReadOnly.multipart.canopy.partCount, 155);
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
});
