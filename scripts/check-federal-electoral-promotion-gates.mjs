import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFederalElectoralPromotionIam } from "./check-federal-electoral-promotion-iam.mjs";
import { validateFederalLiveIamEvidence } from "./check-federal-electoral-live-iam-evidence.mjs";
import { validateArchiveOperationsReadiness } from "./check-archive-operations-readiness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RETENTION = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readBytes = (path) => readFileSync(path);
const readJson = (path) => JSON.parse(readBytes(path));
const rootPath = (path) => resolve(ROOT, path);
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...expected].sort(), `${label} fields drifted`);

function validateReadinessPackage(readinessPackage, readiness, requireReady) {
  exactKeys(readinessPackage, ["schemaVersion", "status", "ownerApprovalRef", "canonicalReadiness", "evidenceFiles", "claims"], "readiness owner-evidence package");
  assert.equal(readinessPackage.schemaVersion, "witness-tree/federal-electoral-archive-readiness-owner-evidence/1");
  assert.deepEqual(readinessPackage.canonicalReadiness, { path: "data/archive-operations-readiness.json", sha256: sha256Bytes(readBytes(rootPath("data/archive-operations-readiness.json"))) });
  assert.deepEqual(readinessPackage.claims, requireReady
    ? { executionReady: true, remoteMutationAuthorized: true, recoveryAuthorized: false, productionEligible: false }
    : { executionReady: false, remoteMutationAuthorized: false, recoveryAuthorized: false, productionEligible: false });
  if (!requireReady) {
    assert.equal(readinessPackage.status, "blocked-canonical-readiness-not-approved");
    assert.equal(readinessPackage.ownerApprovalRef, null);
    assert.deepEqual(readinessPackage.evidenceFiles, []);
    return;
  }
  assert.equal(readinessPackage.status, "owner-approved-file-evidence-complete");
  assert.equal(readinessPackage.ownerApprovalRef, "data/phase1-phase3-owner-approvals-2026-08-21.json#/phase1/archiveApprovals/0");
  const expected = readiness.controls.flatMap((control) => control.evidence.map((evidence, index) => ({ controlId: control.id, prerequisiteIndex: index, path: evidence.path, sha256: evidence.sha256 })));
  assert.deepEqual(readinessPackage.evidenceFiles, expected, "readiness evidence inventory is not exact");
  for (const evidence of readinessPackage.evidenceFiles) {
    assert.match(evidence.path, /^data\/federal-electoral-archive-readiness-evidence\/[a-z0-9._-]+\.json$/);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
    assert.equal(sha256Bytes(readBytes(rootPath(evidence.path))), evidence.sha256, `${evidence.controlId} evidence file digest drifted`);
  }
}

export function validateFederalExecutionGates({ plan, approvalRecord, iamDesired, ownerPacket, readiness, readinessPackage, liveIamEvidencePath, requireLive = true, requireReady = false }) {
  assert.equal(plan.schemaVersion, "witness-tree/elections-canada-fed-2025-promotion-preparation/1");
  assert.equal(plan.status, "blocked-preparation-only");
  assert.equal(plan.sourceLedger, "data/elections-canada-fed-2025-source-ledger.json");
  assert.equal(plan.profile, "data/elections-canada-fed-2025-profile.json");
  assert.equal(plan.archiveOperationsReadiness, "data/archive-operations-readiness.json");
  assert.equal(plan.snapshot.sourceId, "elections-canada-federal-electoral-districts-45th-general-election-2025-shp");
  assert.equal(plan.snapshot.sourceVersion, "FederalElectoralDistricts_2025_SHP.zip");
  assert.equal(plan.snapshot.remoteKeyVersion, "federal-electoral-districts-2025-shp");
  assert.equal(plan.snapshot.localPath, "../Witness_Tree-data/raw/elections-canada-federal-electoral-districts/2026-08-14/FederalElectoralDistricts_2025_SHP.zip");
  assert.equal(plan.snapshot.byteLength, 10301648);
  assert.equal(plan.snapshot.sha256, "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93");
  assert.deepEqual(plan.deterministicRemoteNames, {
    payloadKey: "raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/payload/federalelectoraldistricts_2025_shp.zip",
    manifestKey: "raw/elections-canada-federal-electoral-districts-45th-general-election-2025-shp/federal-electoral-districts-2025-shp/2026-08-14T17-42-35Z/4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93/manifest.json",
    notice: "These are deterministic names only, derived locally by lib/archive-staging. They do not assert that a bucket, object, or version exists."
  });
  assert.deepEqual(plan.retentionDecision, {
    state: "separate-owner-approval-recorded-execution-evidence-pending",
    requiredBeforeAnyRemoteAction: [
      "Archive-operations readiness must be unblocked with the required access, logging, lifecycle, legal-hold, and recovery evidence.",
      "An owner must separately approve a named Canadian destination and an upload identity limited to this exact payload and rebuildable sidecar.",
      "Before compliance retention is considered, an owner must separately approve the exact retain-until instant and a live provider read-back procedure."
    ],
    prohibitedInference: "A deterministic name, a local checksum, a requested upload, or a planned retention period is not remote, immutable, or production evidence."
  });
  assert.equal(plan.recoveryBoundary.replicaCreated, false);
  assert.equal(plan.recoveryBoundary.replicaAuthorized, false);
  assert.equal(plan.recoveryBoundary.recoveryCreditEligible, false);
  assert.equal(plan.recoveryBoundary.ownerAuthorizationRequired, true);
  assert.equal(plan.executionGates.iamDesiredState, "data/federal-electoral-promotion-iam-desired-state.json");
  assert.equal(plan.executionGates.readinessOwnerEvidence, "data/federal-electoral-archive-readiness-owner-evidence.json");
  assert.equal(plan.executionGates.liveIamEvidenceManifest, "/private/tmp/witness-tree-federal-electoral-iam-live-evidence/manifest.json");
  assert.equal(plan.executionGates.ownerPacket, "data/phase1-owner-approval-packet.json#/exactBindings/federal-electoral-archive");
  assert.equal(plan.executionGates.ownerApproval, "data/phase1-phase3-owner-approvals-2026-08-21.json#/phase1/archiveApprovals/0");

  const ledger = readJson(rootPath(plan.sourceLedger));
  const profile = readJson(rootPath(plan.profile));
  const planReadiness = readJson(rootPath(plan.archiveOperationsReadiness));
  assert.equal(ledger.source.id, plan.snapshot.sourceId);
  assert.equal(ledger.source.sourceVersion, plan.snapshot.sourceVersion);
  assert.equal(ledger.source.localPath, plan.snapshot.localPath);
  assert.equal(ledger.source.http.contentLength, plan.snapshot.byteLength);
  assert.equal(ledger.source.sha256, plan.snapshot.sha256);
  assert.equal(ledger.source.immutableObjectStorage, false);
  assert.equal(ledger.source.productionEligible, false);
  assert.equal(profile.productionEligible, false);
  assert.equal(planReadiness.status, "blocked");
  assert.equal(planReadiness.productionEligible, false);

  assert.equal(approvalRecord.schemaVersion, "witness-tree/phase1-phase3-owner-approvals/1");
  const approval = approvalRecord.phase1.archiveApprovals.find(({ id }) => id === "federal-electoral-archive");
  assert.ok(approval, "the exact federal owner approval is missing");
  exactKeys(approval, ["id", "status", "rows", "canonicalBlockRef", "bindingRef", "sourceScopeDecision", "retention", "preflight", "ownerCommand", "executionBoundary"], "federal owner approval");
  assert.match(approval.status, /^approved-owner-local-/);
  assert.deepEqual(approval.rows, ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.equal(approval.sourceScopeDecision, "accept");
  assert.deepEqual(approval.retention, RETENTION);
  assert.equal(approval.preflight, "zsh scripts/run-phase1-approved-promotion.sh --preflight");
  assert.equal(approval.ownerCommand, "zsh scripts/run-phase1-approved-promotion.sh --run-federal");
  assert.match(approval.executionBoundary, /Owner-local MFA is required/i);
  assert.match(approval.executionBoundary, /not execution or archive evidence/i);

  assert.ok(ownerPacket, "the canonical owner packet is required");
  assert.equal(ownerPacket.schemaVersion, "witness-tree/phase1-owner-approval-packet/1");
  assert.equal(ownerPacket.status, "template-not-approved");
  const ownerBinding = ownerPacket.exactBindings?.["federal-electoral-archive"];
  assert.ok(ownerBinding, "the canonical federal owner-packet binding is missing");
  assert.deepEqual({ rows: ownerBinding.rows, stagedAcquisitionId: ownerBinding.stagedAcquisitionId, sourceVersion: ownerBinding.sourceVersion, localPath: ownerBinding.localPath, byteLength: ownerBinding.byteLength, sha256: ownerBinding.sha256, profile: ownerBinding.profile, payloadKey: ownerBinding.payloadKey, manifestKey: ownerBinding.manifestKey, bucket: ownerBinding.bucket, region: ownerBinding.region, retention: ownerBinding.retention, profileName: ownerBinding.profileName, proposedRole: ownerBinding.proposedRole }, {
    rows: ["fed-2023-ridings", "elections-canada-45th-files"], stagedAcquisitionId: plan.snapshot.sourceId, sourceVersion: plan.snapshot.sourceVersion, localPath: plan.snapshot.localPath, byteLength: plan.snapshot.byteLength, sha256: plan.snapshot.sha256, profile: plan.profile, payloadKey: plan.deterministicRemoteNames.payloadKey, manifestKey: plan.deterministicRemoteNames.manifestKey, bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", retention: RETENTION, profileName: "WitnessTreeArchiveOperator", proposedRole: "WitnessTreeArchivePromotionUploader"
  }, "federal owner-packet binding drifted");
  assert.equal(approval.bindingRef, "data/phase1-owner-approval-packet.json#/exactBindings/federal-electoral-archive");
  assert.equal(ownerBinding.proposedRole, iamDesired.roleName, "federal IAM desired role is not the owner-approved role");

  assert.ok(readiness, "archive operations readiness is required");
  validateArchiveOperationsReadiness(readiness);
  validateReadinessPackage(readinessPackage, readiness, requireReady);
  if (requireReady) {
    assert.equal(readiness.status, "ready", "federal execution cannot arm while archive operations readiness is blocked");
    assert.match(readiness.notice, /ready/i, "ready archive operations must carry an affirmative readiness notice");
    assert.doesNotMatch(readiness.notice, /remain(?:s)? blocked|every control.*blocked/i, "ready archive operations retain a contradictory blocked notice");
    assert.equal(readiness.archive.resourceState, "configured-no-objects");
    assert.equal(readiness.archive.provider, "AWS S3");
    assert.equal(readiness.archive.region, "ca-central-1");
    assert.equal(readiness.decisions.recoveryCopy.state, "approved");
    assert.equal(readiness.decisions.replication.state, "approved-canadian");
    for (const [name, decision] of Object.entries(readiness.decisions)) assert.doesNotMatch(decision.reason, /\bno\b|not configured|unapproved|pending|placeholder/i, `${name} readiness decision retains a blocked reason`);
    const prerequisites = new Map(planReadiness.controls.map((control) => [control.id, control.requiredEvidence]));
    for (const control of readiness.controls) {
      assert.equal(control.state, "evidenced", `${control.id} readiness evidence is missing`);
      assert.deepEqual(control.requiredEvidence, prerequisites.get(control.id), `${control.id} exact readiness prerequisites drifted`);
      assert.equal(control.evidence.length, control.requiredEvidence.length, `${control.id} must carry exactly one record for every prerequisite`);
      for (const [index, evidence] of control.evidence.entries()) {
        assert.equal(evidence.kind, control.requiredEvidence[index], `${control.id} evidence is not ordered and bound to its exact prerequisite`);
        assert.equal(evidence.reviewerRole, control.ownerRole, `${control.id} evidence reviewer is not the named owner role`);
        exactKeys(evidence, ["kind", "capturedAt", "path", "sha256", "reviewerRole"], `${control.id} evidence`);
        assert.match(evidence.path, /^data\/federal-electoral-archive-readiness-evidence\/[a-z0-9._-]+\.json$/, `${control.id} evidence path is not canonical`);
        assert.match(evidence.sha256, /^[a-f0-9]{64}$/, `${control.id} evidence SHA-256 is malformed`);
      }
    }
  }

  validateFederalElectoralPromotionIam(iamDesired, plan);
  if (requireLive) {
    assert.ok(liveIamEvidencePath, "a separate file-backed live IAM evidence manifest is required");
    validateFederalLiveIamEvidence(liveIamEvidencePath, iamDesired, plan);
  }
  return { status: requireLive ? "live-gates-passed" : "static-gates-passed" };
}

export function loadFederalExecutionGateInputs({ planPath, approvalPath, iamPath, ownerPacketPath, readinessPath, readinessPackagePath, liveIamPath } = {}) {
  const planFile = planPath ?? rootPath("data/elections-canada-fed-2025-promotion-preparation.json");
  const approvalFile = approvalPath ?? rootPath("data/phase1-phase3-owner-approvals-2026-08-21.json");
  const iamFile = iamPath ?? rootPath("data/federal-electoral-promotion-iam-desired-state.json");
  const ownerPacketFile = ownerPacketPath ?? rootPath("data/phase1-owner-approval-packet.json");
  const readinessFile = readinessPath ?? rootPath("data/archive-operations-readiness.json");
  const readinessPackageFile = readinessPackagePath ?? rootPath("data/federal-electoral-archive-readiness-owner-evidence.json");
  return {
    planPath: planFile,
    approvalPath: approvalFile,
    iamPath: iamFile,
    ownerPacketPath: ownerPacketFile,
    readinessPath: readinessFile,
    readinessPackagePath: readinessPackageFile,
    liveIamPath: liveIamPath ?? "/private/tmp/witness-tree-federal-electoral-iam-live-evidence/manifest.json",
    plan: readJson(planFile),
    approvalRecord: readJson(approvalFile),
    iamDesired: readJson(iamFile),
    ownerPacket: readJson(ownerPacketFile),
    readiness: readJson(readinessFile),
    readinessPackage: readJson(readinessPackageFile)
  };
}

export function runFederalExecutionGates(options = {}) {
  const inputs = loadFederalExecutionGateInputs(options);
  const result = validateFederalExecutionGates({ ...inputs, liveIamEvidencePath: options.requireLive === false ? undefined : inputs.liveIamPath, requireLive: options.requireLive !== false, requireReady: options.requireReady === true });
  return {
    ...result,
    planSha256: sha256Bytes(readBytes(inputs.planPath)),
    approvalSha256: sha256Bytes(readBytes(inputs.approvalPath)),
    iamDesiredSha256: sha256Bytes(readBytes(inputs.iamPath)),
    liveIamSha256: options.requireLive === false ? null : sha256Bytes(readBytes(inputs.liveIamPath))
  };
}

if (process.argv[1]?.endsWith("check-federal-electoral-promotion-gates.mjs")) {
  try {
    const args = process.argv.slice(2);
    const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
    const result = runFederalExecutionGates({ planPath: value("--plan"), approvalPath: value("--approval"), iamPath: value("--iam"), ownerPacketPath: value("--owner-packet"), readinessPath: value("--readiness"), readinessPackagePath: value("--readiness-package"), liveIamPath: value("--live-iam"), requireLive: args.includes("--require-live"), requireReady: args.includes("--require-ready") });
    console.log(`${result.status}; plan, owner approval, IAM desired state, and recovery boundary passed without remote mutation.`);
  } catch {
    console.error("Federal execution gate failed without exposing provider values; no mutation was authorized.");
    process.exitCode = 1;
  }
}
