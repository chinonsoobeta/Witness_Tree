import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));

export function validatePhase1NationalArchiveFinalizationAudit(audit = read("data/phase1-national-archive-finalization-audit.json")) {
  assert.equal(audit.schemaVersion, "witness-tree/phase1-national-archive-finalization-audit/1");
  assert.equal(audit.status, "blocked-read-only");
  assert.match(audit.notice, /Redacted.*offline-mock.*read-only.*owner-supplied.*No AWS.*TOTP.*production action/i);
  assert.deepEqual(audit.lineage, { integratedBase: "eca44dd", runnerFix: "62d008f" });
  assert.doesNotMatch(JSON.stringify(audit), /uploadId|versionId|AccessKey|SecretAccess|SessionToken|TOTP\s*[:=]/i);
  assert.deepEqual(audit.localArtifacts, [
    { sourceId: "ntems-forest-harvest", byteLength: 247945479, sha256Match: true },
    { sourceId: "ntems-canopy-height", byteLength: 10347564066, sha256Match: true },
    { sourceId: "fed-2023-ridings-and-elections-canada-45th-files", byteLength: 10301648, sha256Match: true }
  ]);
  assert.equal(audit.liveReadOnly.bucket, "witness-tree-raw-archive-ca-central-1");
  assert.equal(audit.liveReadOnly.region, "ca-central-1");
  assert.deepEqual(audit.liveReadOnly.mutationsPerformed, []);
  const canopy = audit.liveReadOnly.multipart.canopy;
  assert.equal(canopy.exactKey, "raw/nrcan-forest-canopy-height-2022/undeclared/2026-08-14T18-57-22Z/86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124/payload/ca_canopy_height_2022.zip");
  assert.deepEqual({ openUploadCount: canopy.openUploadCount, completionStatus: canopy.completionStatus, partCount: canopy.partCount, isTruncated: canopy.isTruncated, allPartsHaveProviderChecksum: canopy.allPartsHaveProviderChecksum }, { openUploadCount: 0, completionStatus: "completed", partCount: 155, isTruncated: false, allPartsHaveProviderChecksum: true });
  assert.equal(audit.liveReadOnly.multipart.federal.openUploadCount, 0);
  assert.equal(audit.liveReadOnly.multipart.harvest.openUploadCount, 0);
  assert.deepEqual(audit.liveReadOnly.exactHeads, {
    canopy: {
      payloadExists: true,
      manifestExists: true,
      payloadBytes: 10347564066,
      manifestBytes: 459,
      payloadChecksumType: "FULL_OBJECT",
      manifestChecksumType: "FULL_OBJECT",
      payloadChecksumPresent: true,
      manifestChecksumPresent: true,
      exactVersionReadback: false,
      retentionPresent: false,
      recoveryPayloadExists: true,
      recoveryManifestExists: true,
      recoveryPayloadBytes: 10347564066,
      recoveryManifestBytes: 459,
      recoveryPayloadChecksumType: "FULL_OBJECT",
      recoveryManifestChecksumType: "FULL_OBJECT",
      recoveryPayloadChecksumPresent: true,
      recoveryManifestChecksumPresent: true,
      recoveryExactVersionReadback: false,
      recoveryRetentionPresent: false,
      versionedReadbackBlocker: "s3:GetObjectVersion is unavailable to the current approved role; exact-version readback is not proven.",
      archiveCredit: false
    },
    federal: { payloadExists: false, manifestExists: false }
  });
  assert.deepEqual(audit.postCompletionOperationalTruth, {
    status: "multipart-complete-heads-present-retention-and-versioned-readback-blocked",
    multipartCompleted: true,
    primaryAndRecovery: {
      payload: { present: true, bytes: 10347564066, checksumType: "FULL_OBJECT", checksumPresent: true },
      sidecar: { present: true, bytes: 459, checksumType: "FULL_OBJECT", checksumPresent: true }
    },
    retention: { primaryPayload: "absent", recoveryPayload: "absent" },
    versionedReadback: { status: "blocked", permission: "s3:GetObjectVersion unavailable", performed: false },
    archiveCredit: false,
    productionEligible: false
  });
  assert.deepEqual(audit.offlineMultipartReproduction.beforeFix, { status: "reproduced-provider-rejection", completionAttempted: true, rejectedCompletionField: "Size", uploadPartCalled: false, statePartsAfter: 155, stateUnchanged: true, exitStatus: 70 });
  assert.deepEqual(audit.offlineMultipartReproduction.afterFix, {
    status: "mock-completion-and-readbacks-passed",
    completionAttempted: true,
    completionPartsFields: ["PartNumber", "ETag", "ChecksumCRC64NVME"],
    completionResponse: { versionPresent: true, checksumType: "FULL_OBJECT", checksumPresent: true },
    uploadPartCalled: false,
    statePartsAfter: 155,
    stateUnchanged: true,
    requiredReadbacks: ["payload-exact-version", "payload-bytes", "payload-FULL_OBJECT-checksum", "COMPLIANCE-retention", "sidecar-exact-version", "sidecar-bytes", "sidecar-FULL_OBJECT-checksum"],
    exitStatus: 0
  });
  assert.deepEqual(audit.privateResumeState, {
    matchingMode600RecordFoundInControlledRoots: true,
    offlineValidationPassed: true,
    recordContentsReadOrRetained: true,
    recordContentsRetainedInRepository: false,
    recordIdentifiersRecorded: false
  });
  assert.equal(audit.ownerRun.safeCommandAvailable, false);
  assert.equal(audit.ownerRun.command, null);
  assert.equal(audit.ownerRun.blockers.length, 3);
  assert.deepEqual(audit.claims, { canopyMultipartFinalized: false, federalArtifactPromoted: false, harvestPromotionPerformed: false, remoteMutationPerformed: false, productionEligible: false });
  return audit;
}

if (process.argv[1]?.endsWith("check-phase1-national-archive-finalization-audit.mjs")) {
  validatePhase1NationalArchiveFinalizationAudit();
  console.log("Phase 1 national archive finalization audit passed: canopy MPU is complete with redacted primary/recovery heads, exact-version readback and retention remain blocked, and no archive credit or owner-run command is authorized by this evidence.");
}
