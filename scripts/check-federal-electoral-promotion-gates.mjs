import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFederalElectoralPromotionIam, validateFederalElectoralLiveIamAttestation } from "./check-federal-electoral-promotion-iam.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT = "286853118812";
const RETENTION = { mode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" };
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readBytes = (path) => readFileSync(path);
const readJson = (path) => JSON.parse(readBytes(path));
const rootPath = (path) => resolve(ROOT, path);
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...expected].sort(), `${label} fields drifted`);

export function validateFederalExecutionGates({ plan, approvalRecord, iamDesired, liveIam, requireLive = true }) {
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
  assert.equal(plan.executionGates.ownerApproval, "data/phase1-phase3-owner-approvals-2026-08-21.json#/phase1/archiveApprovals/0");

  const ledger = readJson(rootPath(plan.sourceLedger));
  const profile = readJson(rootPath(plan.profile));
  const readiness = readJson(rootPath(plan.archiveOperationsReadiness));
  assert.equal(ledger.source.id, plan.snapshot.sourceId);
  assert.equal(ledger.source.sourceVersion, plan.snapshot.sourceVersion);
  assert.equal(ledger.source.localPath, plan.snapshot.localPath);
  assert.equal(ledger.source.http.contentLength, plan.snapshot.byteLength);
  assert.equal(ledger.source.sha256, plan.snapshot.sha256);
  assert.equal(ledger.source.immutableObjectStorage, false);
  assert.equal(ledger.source.productionEligible, false);
  assert.equal(profile.productionEligible, false);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionEligible, false);

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

  validateFederalElectoralPromotionIam(iamDesired, plan);
  if (requireLive) {
    assert.ok(liveIam, "a separate live IAM attestation is required before mutation");
    validateFederalElectoralLiveIamAttestation(liveIam, iamDesired, plan);
  }
  return { status: requireLive ? "live-gates-passed" : "static-gates-passed" };
}

export function loadFederalExecutionGateInputs({ planPath, approvalPath, iamPath, liveIamPath } = {}) {
  const planFile = planPath ?? rootPath("data/elections-canada-fed-2025-promotion-preparation.json");
  const approvalFile = approvalPath ?? rootPath("data/phase1-phase3-owner-approvals-2026-08-21.json");
  const iamFile = iamPath ?? rootPath("data/federal-electoral-promotion-iam-desired-state.json");
  return {
    planPath: planFile,
    approvalPath: approvalFile,
    iamPath: iamFile,
    liveIamPath: liveIamPath ?? rootPath("data/federal-electoral-promotion-iam-live-attestation.json"),
    plan: readJson(planFile),
    approvalRecord: readJson(approvalFile),
    iamDesired: readJson(iamFile)
  };
}

export function runFederalExecutionGates(options = {}) {
  const inputs = loadFederalExecutionGateInputs(options);
  let liveIam;
  if (options.requireLive !== false) liveIam = readJson(inputs.liveIamPath);
  const result = validateFederalExecutionGates({ ...inputs, liveIam, requireLive: options.requireLive !== false });
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
    const result = runFederalExecutionGates({ planPath: value("--plan"), approvalPath: value("--approval"), iamPath: value("--iam"), liveIamPath: value("--live-iam"), requireLive: args.includes("--require-live") });
    console.log(`${result.status}; plan, owner approval, IAM desired state, and recovery boundary passed without remote mutation.`);
  } catch {
    console.error("Federal execution gate failed without exposing provider values; no mutation was authorized.");
    process.exitCode = 1;
  }
}
