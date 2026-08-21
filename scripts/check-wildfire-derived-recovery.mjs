import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { manifestKey, sidecarFor, validate as validatePlan } from "./prepare-wildfire-derived-immutable-promotion.mjs";
import { DEFAULT_DATA_ROOT, validateLocalArtifacts } from "./check-wildfire-derived-readback.mjs";

const PLAN = validatePlan();

export const ACCOUNT = "286853118812";
export const PROFILE = PLAN.mfaGatedExecution.operatorProfile;
export const ROLE = PLAN.mfaGatedExecution.proposedRole;
export const REGION = PLAN.destination.region;
export const BUCKET = PLAN.destination.bucket;
export const RETAIN_UNTIL = PLAN.mfaGatedExecution.recommendedRetainUntil;
export const APPROVAL_SCHEMA = "witness-tree/wildfire-derived-recovery-approval/1";
export const STATE_SCHEMA = "witness-tree/wildfire-derived-recovery-state/1";
export const EVIDENCE_SCHEMA = "witness-tree/wildfire-derived-recovery-evidence/1";

const EXCLUSIONS = Object.freeze([
  "no-bc-payload-upload",
  "no-overwrite-existing-key",
  "no-delete",
  "no-multipart",
  "no-bypass-governance",
  "no-legal-hold",
  "no-other-key",
  "no-iam-change",
  "no-production-inference",
  "no-phase2"
]);

const sorted = (value) => [...value].sort();
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validSha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validCrc64 = (value) => typeof value === "string" && /^[A-Za-z0-9+/]{11}=$/.test(value);
const validVersion = (value) => typeof value === "string" && value.length > 0 && value.length <= 1024 && !/\s/.test(value);
const exactPrefix = `arn:aws:s3:::${BUCKET}/`;

function artifacts(plan = PLAN) {
  return plan.artifacts.map((artifact) => ({
    id: artifact.id,
    sourceId: artifact.sourceId,
    byteLength: artifact.byteLength,
    sha256: artifact.sha256,
    payloadKey: artifact.payloadKey,
    manifestKey: manifestKey(artifact),
    manifestByteLength: Buffer.byteLength(sidecarFor(artifact)),
    manifestSha256: sha256(sidecarFor(artifact))
  }));
}

function expectedObjects(plan = PLAN) {
  const [bc, ontario] = artifacts(plan);
  return {
    bcPayload: { key: bc.payloadKey, byteLength: bc.byteLength },
    bcManifest: { key: bc.manifestKey, byteLength: bc.manifestByteLength },
    ontarioPayload: { key: ontario.payloadKey, byteLength: ontario.byteLength },
    ontarioManifest: { key: ontario.manifestKey, byteLength: ontario.manifestByteLength }
  };
}

export function approvalTemplate(plan = PLAN) {
  return {
    schemaVersion: APPROVAL_SCHEMA,
    status: "owner-pending",
    approved: false,
    account: ACCOUNT,
    role: ROLE,
    profile: PROFILE,
    region: REGION,
    bucket: BUCKET,
    retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, payloadsOnly: true },
    operations: {
      reuseExistingBcPayloadVersion: true,
      createBcManifest: true,
      uploadOntarioPayload: true,
      uploadOntarioManifest: true,
      retainExistingBcPayload: true,
      retainOntarioPayload: true
    },
    exclusions: [...EXCLUSIONS],
    productionEligible: false,
    phase2: false,
    artifacts: artifacts(plan).map(({ id, sourceId, byteLength, sha256: digest, payloadKey, manifestKey: sidecarKey, manifestByteLength, manifestSha256 }) => ({
      id,
      sourceId,
      byteLength,
      sha256: digest,
      payloadKey,
      manifestKey: sidecarKey,
      manifestByteLength,
      manifestSha256
    }))
  };
}

export function stateTemplate(plan = PLAN) {
  const bc = expectedObjects(plan).bcPayload;
  return {
    schemaVersion: STATE_SCHEMA,
    status: "owner-private",
    account: ACCOUNT,
    role: ROLE,
    profile: PROFILE,
    region: REGION,
    bucket: BUCKET,
    source: "exact owner read-only head; keep this file private",
    bcPayload: {
      key: bc.key,
      versionId: "REPLACE_WITH_PRIVATE_VERSION_ID",
      byteLength: bc.byteLength,
      checksumType: "FULL_OBJECT",
      checksumCRC64NVME: "REPLACE_WITH_PRIVATE_CRC64NVME"
    },
    reuseExistingBcPayload: true,
    noBcPayloadUpload: true,
    productionEligible: false,
    phase2: false
  };
}

export function validateApproval(approval, plan = PLAN) {
  assert.ok(approval && typeof approval === "object" && !Array.isArray(approval), "recovery approval is malformed");
  assert.deepEqual(sorted(Object.keys(approval)), sorted(Object.keys(approvalTemplate(plan))), "recovery approval contains an unexpected field");
  const expected = approvalTemplate(plan);
  assert.equal(approval.schemaVersion, APPROVAL_SCHEMA, "recovery approval schema is not recognized");
  assert.equal(approval.status, "owner-approved", "explicit recovery approval is absent");
  assert.equal(approval.approved, true, "explicit recovery approval is absent");
  for (const field of ["account", "role", "profile", "region", "bucket", "retention", "operations", "exclusions", "productionEligible", "phase2", "artifacts"]) {
    assert.deepEqual(approval[field], expected[field], `recovery approval ${field} is not exact`);
  }
  return true;
}

export function validateState(state, plan = PLAN) {
  assert.ok(state && typeof state === "object" && !Array.isArray(state), "private recovery state is malformed");
  assert.deepEqual(sorted(Object.keys(state)), sorted(Object.keys(stateTemplate(plan))), "private recovery state contains an unexpected field");
  const expected = stateTemplate(plan);
  assert.equal(state.schemaVersion, STATE_SCHEMA, "private recovery state schema is not recognized");
  assert.equal(state.status, "owner-private", "private recovery state status is not exact");
  for (const field of ["account", "role", "profile", "region", "bucket", "source", "reuseExistingBcPayload", "noBcPayloadUpload", "productionEligible", "phase2"]) {
    assert.deepEqual(state[field], expected[field], `private recovery state ${field} is not exact`);
  }
  assert.deepEqual(state.bcPayload?.key, expected.bcPayload.key, "private state BC payload key is not exact");
  assert.equal(state.bcPayload?.byteLength, expected.bcPayload.byteLength, "private state BC payload bytes are not exact");
  assert.equal(state.bcPayload?.checksumType, "FULL_OBJECT", "private state BC payload checksum type is not exact");
  assert.equal(validVersion(state.bcPayload?.versionId) && !state.bcPayload.versionId.startsWith("REPLACE_WITH_"), true, "private state BC payload version is missing");
  assert.equal(validCrc64(state.bcPayload?.checksumCRC64NVME), true, "private state BC payload CRC64NVME is missing or malformed");
  return true;
}

function expectedIamResources(plan = PLAN) {
  return artifacts(plan).flatMap((artifact) => [artifact.payloadKey, artifact.manifestKey]).map((key) => `${exactPrefix}${key}`);
}

export function validateIamAttestation(attestation, plan = PLAN) {
  assert.ok(attestation && typeof attestation === "object" && !Array.isArray(attestation), "applied IAM attestation is malformed");
  assert.equal(attestation.schemaVersion, "witness-tree/wildfire-derived-readback-iam-attestation/1", "applied IAM attestation schema is not recognized");
  assert.equal(attestation.applied, true, "applied IAM attestation is not applied");
  assert.equal(attestation.status, "applied", "applied IAM attestation status is not exact");
  assert.equal(attestation.account, ACCOUNT, "applied IAM attestation account is outside the approved account");
  assert.equal(attestation.role, ROLE, "applied IAM attestation role is not exact");
  assert.equal(attestation.policyName, "WitnessTreeWildfireDerivedExactObjects", "applied IAM attestation policy is not exact");
  assert.equal(attestation.profile, "default", "applied IAM attestation profile is not exact");
  assert.equal(attestation.region, REGION, "applied IAM attestation region is not exact");
  assert.equal(attestation.noCredentials, true, "applied IAM attestation may not retain credentials");
  assert.equal(attestation.noObjectVersionIds, true, "applied IAM attestation may not retain object version IDs");
  assert.equal(attestation.noUploadIds, true, "applied IAM attestation may not retain upload IDs");
  assert.equal(validSha(attestation.readbackPolicySha256), true, "applied IAM attestation policy SHA is malformed");
  assert.equal(attestation.accessAnalyzer?.findings, 0, "applied IAM attestation has analyzer findings");
  assert.equal(attestation.delta?.Sid, "ExactDerivedVersionedReadbacks", "applied IAM delta Sid is not exact");
  assert.equal(attestation.delta?.Effect, "Allow", "applied IAM delta is not allow-only");
  assert.deepEqual(attestation.delta?.Action, ["s3:GetObjectVersion"], "applied IAM delta action is not exact");
  assert.deepEqual(sorted(attestation.delta?.Resource ?? []), sorted(expectedIamResources(plan)), "applied IAM delta resources are not exact");
  return true;
}

export function validateObjectHead(head, objectName, state, plan = PLAN) {
  const expected = expectedObjects(plan)[objectName];
  assert.ok(expected, "object name is outside the exact recovery scope");
  assert.ok(head && typeof head === "object" && !Array.isArray(head), `${objectName} head is malformed`);
  assert.equal(head.ContentLength, expected.byteLength, `${objectName} byte length is not exact`);
  assert.equal(head.ChecksumType, "FULL_OBJECT", `${objectName} checksum type is not FULL_OBJECT`);
  assert.equal(validCrc64(head.ChecksumCRC64NVME), true, `${objectName} CRC64NVME checksum is absent or malformed`);
  assert.equal(validVersion(head.VersionId), true, `${objectName} concrete version is absent`);
  if (objectName === "bcPayload") {
    assert.equal(head.VersionId, state.bcPayload.versionId, "BC payload version changed from the private state");
    assert.equal(head.ChecksumCRC64NVME, state.bcPayload.checksumCRC64NVME, "BC payload checksum changed from the private state");
  }
  return true;
}

export function validatePutAck(ack) {
  assert.ok(ack && typeof ack === "object" && !Array.isArray(ack), "PutObject acknowledgement is malformed");
  assert.equal(validVersion(ack.VersionId), true, "PutObject acknowledgement has no concrete version");
  assert.equal(validCrc64(ack.ChecksumCRC64NVME), true, "PutObject acknowledgement has no CRC64NVME checksum");
  return true;
}

export function validateRetention(retention, label = "payload") {
  assert.ok(retention && typeof retention === "object" && !Array.isArray(retention), `${label} retention readback is malformed`);
  assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${label} retention mode is not COMPLIANCE`);
  assert.equal(Date.parse(retention.Retention?.RetainUntilDate ?? ""), Date.parse(RETAIN_UNTIL), `${label} retention date is not exact`);
  return true;
}

export function validateRecoveryPreflight(approval, state, attestation, dataRoot = DEFAULT_DATA_ROOT, plan = PLAN) {
  validateApproval(approval, plan);
  validateState(state, plan);
  validateIamAttestation(attestation, plan);
  validateLocalArtifacts(dataRoot);
  return true;
}

export function buildEvidence(approval, state, heads, retention, plan = PLAN) {
  validateApproval(approval, plan);
  validateState(state, plan);
  for (const name of ["bcPayload", "bcManifest", "ontarioPayload", "ontarioManifest"]) validateObjectHead(heads[name], name, state, plan);
  validateRetention(retention.bcPayload, "BC payload");
  validateRetention(retention.ontarioPayload, "Ontario payload");
  const expected = expectedObjects(plan);
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    status: "completed",
    account: ACCOUNT,
    role: ROLE,
    profile: PROFILE,
    region: REGION,
    bucket: BUCKET,
    retainUntil: RETAIN_UNTIL,
    existingBcPayloadVersionReused: true,
    noBcPayloadUpload: true,
    objects: Object.fromEntries(Object.entries(expected).map(([name, object]) => [name, {
      source: name === "bcPayload" ? "preexisting" : "created-by-exact-recovery",
      key: object.key,
      head: heads[name]
    }])),
    retention: { bcPayload: retention.bcPayload, ontarioPayload: retention.ontarioPayload },
    exclusions: [...EXCLUSIONS],
    productionEligible: false,
    phase2: false
  };
}

export function validateEvidence(evidence, approval, state, plan = PLAN) {
  assert.ok(evidence && typeof evidence === "object" && !Array.isArray(evidence), "recovery evidence is malformed");
  assert.deepEqual(sorted(Object.keys(evidence)), sorted(["schemaVersion", "status", "account", "role", "profile", "region", "bucket", "retainUntil", "existingBcPayloadVersionReused", "noBcPayloadUpload", "objects", "retention", "exclusions", "productionEligible", "phase2"]), "recovery evidence contains an unexpected field");
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA, "recovery evidence schema is not recognized");
  assert.equal(evidence.status, "completed", "recovery evidence is not complete");
  assert.equal(evidence.account, ACCOUNT, "recovery evidence account is outside the approved account");
  assert.equal(evidence.role, ROLE, "recovery evidence role is not exact");
  assert.equal(evidence.profile, PROFILE, "recovery evidence profile is not exact");
  assert.equal(evidence.region, REGION, "recovery evidence region is not exact");
  assert.equal(evidence.bucket, BUCKET, "recovery evidence bucket is not exact");
  assert.equal(evidence.retainUntil, RETAIN_UNTIL, "recovery evidence retention date is not exact");
  assert.equal(evidence.existingBcPayloadVersionReused, true, "recovery evidence does not prove BC payload reuse");
  assert.equal(evidence.noBcPayloadUpload, true, "recovery evidence does not prove BC payload upload exclusion");
  assert.deepEqual(evidence.exclusions, [...EXCLUSIONS], "recovery evidence exclusions are incomplete or changed");
  assert.equal(evidence.productionEligible, false, "recovery evidence may not claim production eligibility");
  assert.equal(evidence.phase2, false, "recovery evidence may not claim Phase 2");
  const expected = expectedObjects(plan);
  for (const name of Object.keys(expected)) {
    assert.deepEqual(evidence.objects?.[name]?.key, expected[name].key, `${name} evidence key is not exact`);
    assert.equal(evidence.objects?.[name]?.source, name === "bcPayload" ? "preexisting" : "created-by-exact-recovery", `${name} evidence source is not exact`);
    validateObjectHead(evidence.objects[name].head, name, state, plan);
  }
  validateRetention(evidence.retention?.bcPayload, "BC payload");
  validateRetention(evidence.retention?.ontarioPayload, "Ontario payload");
  assert.equal(evidence.objects.bcPayload.head.VersionId, state.bcPayload.versionId, "evidence BC payload version is not the saved version");
  return true;
}

export function writeEvidence(path, evidence) {
  assert.equal(isAbsolute(path), true, "evidence path must be absolute");
  assert.equal(existsSync(path), false, "evidence path already exists; refusing overwrite");
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  assert.equal((statSync(path).mode & 0o777), 0o600, "recovery evidence is not mode 600");
  return path;
}

function main() {
  const mode = process.argv[2];
  if (mode === "--approval-template") {
    console.log(`${JSON.stringify(approvalTemplate(), null, 2)}\n`);
    return;
  }
  if (mode === "--state-template") {
    console.log(`${JSON.stringify(stateTemplate(), null, 2)}\n`);
    return;
  }
  if (mode === "--preflight") {
    const [approvalPath, statePath, attestationPath, dataRoot = DEFAULT_DATA_ROOT] = process.argv.slice(3);
    validateRecoveryPreflight(readJson(approvalPath), readJson(statePath), readJson(attestationPath), dataRoot);
    console.log("Derived wildfire recovery preflight passed: exact owner approval, private BC version state, applied IAM attestation, and local artifacts verified.");
    return;
  }
  if (mode === "--validate-bc-head") {
    const [headPath, statePath] = process.argv.slice(3);
    validateObjectHead(readJson(headPath), "bcPayload", readJson(statePath));
    console.log("BC payload exact versioned head passed.");
    return;
  }
  if (mode === "--validate-head") {
    const [headPath, objectName, statePath] = process.argv.slice(3);
    validateObjectHead(readJson(headPath), objectName, readJson(statePath));
    console.log(`${objectName} exact versioned head passed.`);
    return;
  }
  if (mode === "--validate-ack") {
    validatePutAck(readJson(process.argv[3]));
    console.log("PutObject acknowledgement passed.");
    return;
  }
  if (mode === "--validate-retention") {
    validateRetention(readJson(process.argv[3]));
    console.log("Payload COMPLIANCE retention readback passed.");
    return;
  }
  if (mode === "--write-evidence") {
    const [approvalPath, statePath, bcPayloadPath, bcManifestPath, ontarioPayloadPath, ontarioManifestPath, bcRetentionPath, ontarioRetentionPath, evidencePath] = process.argv.slice(3);
    const approval = readJson(approvalPath);
    const state = readJson(statePath);
    const heads = {
      bcPayload: readJson(bcPayloadPath),
      bcManifest: readJson(bcManifestPath),
      ontarioPayload: readJson(ontarioPayloadPath),
      ontarioManifest: readJson(ontarioManifestPath)
    };
    const evidence = buildEvidence(approval, state, heads, { bcPayload: readJson(bcRetentionPath), ontarioPayload: readJson(ontarioRetentionPath) });
    writeEvidence(evidencePath, evidence);
    console.log("Derived wildfire recovery evidence written owner-only mode 600.");
    return;
  }
  throw new Error("usage");
}

if (process.argv[1]?.endsWith("check-wildfire-derived-recovery.mjs")) {
  try {
    main();
  } catch {
    console.error("Derived wildfire recovery check failed closed; no TOTP or AWS mutation was authorized.");
    process.exitCode = 65;
  }
}
