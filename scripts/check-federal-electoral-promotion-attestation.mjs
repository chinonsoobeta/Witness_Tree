import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLAN_PATH = resolve(ROOT, "data/elections-canada-fed-2025-promotion-preparation.json");
const RUNNER_PATH = resolve(ROOT, "scripts/run-federal-electoral-approved-promotion.sh");
const APPROVAL_PATH = resolve(ROOT, "data/phase1-phase3-owner-approvals-2026-08-21.json");
const IAM_DESIRED_PATH = resolve(ROOT, "data/federal-electoral-promotion-iam-desired-state.json");
const SHA256 = /^[a-f0-9]{64}$/;
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const VERSION = /^(?!.*(?:redacted|placeholder|example|fabricated|version-[0-9]))(?!null$)[A-Za-z0-9._+=:/-]{8,}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/;
const ACCOUNT = "286853118812";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeFederalElectoralPromotionUploader`;
const ROLE_IDENTITY_ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/WitnessTreeFederalElectoralPromotionUploader/witness-tree-federal-electoral-promotion`;
const SOURCE = "elections-canada-federal-electoral-districts-45th-general-election-2025-shp";
const BYTES = 10301648;
const LOCAL_SHA = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const hashFile = (path) => hash(readFileSync(path));
const expectedManifestBytes = (plan) => Buffer.from(`${JSON.stringify({ schemaVersion: 1, sourceId: SOURCE, payloadKey: plan.deterministicRemoteNames.payloadKey, byteLength: BYTES, sha256: LOCAL_SHA, checksumAlgorithm: "SHA256", checksumSha256: Buffer.from(LOCAL_SHA, "hex").toString("base64"), notice: "Approved raw primary-only payload; no recovery, transformation, ingestion, release, or production admission." }, null, 2)}\n`);
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value ?? {}).sort(), [...expected].sort(), `${label} fields drifted`);
const exactUtc = (value, label) => { assert.equal(typeof value, "string", `${label} is not a string`); assert.match(value, UTC, `${label} is not a strong UTC timestamp`); assert.equal(new Date(value).toISOString(), value, `${label} is not canonical UTC`); return value; };

function validateChecksum(value, label) {
  exactKeys(value, ["algorithm", "type", "providerValue", "localValue"], label);
  assert.equal(value.algorithm, "SHA256"); assert.equal(value.type, "FULL_OBJECT");
  assert.match(value.providerValue, BASE64_SHA256, `${label} provider checksum is malformed`); assert.match(value.localValue, BASE64_SHA256, `${label} local checksum is malformed`);
  assert.equal(value.providerValue, value.localValue, `${label} provider checksum is not locally computed`);
}

function validateObject(value, label, expectedKey, expectedBytes) {
  exactKeys(value, ["key", "versionId", "contentLength", "checksum", "headObjectReadAt", "headResponseSha256", "versionListResponseSha256"], label);
  assert.equal(value.key, expectedKey); assert.match(value.versionId, VERSION, `${label} version is malformed`); assert.equal(Number.isSafeInteger(value.contentLength) && value.contentLength > 0, true, `${label} byte length is invalid`); assert.equal(value.contentLength, expectedBytes);
  validateChecksum(value.checksum, `${label} checksum`); exactUtc(value.headObjectReadAt, `${label} headObjectReadAt`); assert.match(value.headResponseSha256, SHA256); assert.match(value.versionListResponseSha256, SHA256);
}

function validateRawResponse(value, label) {
  exactKeys(value, ["name", "byteLength", "sha256"], label); assert.match(value.name, /^[A-Za-z0-9._-]+$/, `${label} name is unsafe`); assert.equal(Number.isSafeInteger(value.byteLength) && value.byteLength >= 0, true); assert.match(value.sha256, SHA256, `${label} digest is malformed`);
}

function expectedRecoveryBoundary() {
  return { primaryOnly: true, replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false, meaning: "No recovery-bucket operation was authorized or proved. Primary exact-version evidence remains non-credit until separate recovery authorization and proof exist." };
}

export function validatePrivateFederalAttestation(value, plan = readJson(PLAN_PATH), expected = {}) {
  exactKeys(value, ["schemaVersion", "status", "provenance", "operator", "assumedRole", "artifact", "rawResponses", "rawResponseBundleSha256", "recoveryBoundary", "claims"], "private attestation");
  assert.equal(value.schemaVersion, "witness-tree/federal-electoral-promotion-attestation-private/1"); assert.equal(value.status, "owner-run-primary-exact-version-readbacks-complete");
  exactKeys(value.provenance, ["createdAt", "captureCommand", "accountId", "operatorArn", "roleArn", "roleIdentityArn", "runnerSha256", "planSha256", "approvalSha256", "iamDesiredSha256", "liveIamSha256", "authentication", "operation"], "private provenance");
  exactUtc(value.provenance.createdAt, "provenance.createdAt"); assert.equal(value.provenance.captureCommand, "zsh scripts/run-phase1-approved-promotion.sh --run-federal"); assert.equal(value.provenance.accountId, ACCOUNT); assert.equal(value.provenance.operatorArn, OPERATOR_ARN); assert.equal(value.provenance.roleArn, ROLE_ARN); assert.equal(value.provenance.roleIdentityArn, ROLE_IDENTITY_ARN);
  for (const field of ["runnerSha256", "planSha256", "approvalSha256", "iamDesiredSha256", "liveIamSha256"]) { assert.match(value.provenance[field], SHA256, `${field} is malformed`); }
  assert.equal(value.provenance.runnerSha256, expected.runnerSha256 ?? hashFile(RUNNER_PATH)); assert.equal(value.provenance.planSha256, expected.planSha256 ?? hashFile(PLAN_PATH)); assert.equal(value.provenance.approvalSha256, expected.approvalSha256 ?? hashFile(APPROVAL_PATH)); assert.equal(value.provenance.iamDesiredSha256, expected.iamDesiredSha256 ?? hashFile(IAM_DESIRED_PATH));
  assert.equal(value.provenance.authentication, "fresh-mfa-owner-session"); assert.equal(value.provenance.operation, "primary-only-exact-version-head-checksum-retention-capture");
  exactKeys(value.operator, ["Account", "Arn"], "operator"); assert.deepEqual(value.operator, { Account: ACCOUNT, Arn: OPERATOR_ARN }); exactKeys(value.assumedRole, ["Account", "Arn"], "assumed role"); assert.deepEqual(value.assumedRole, { Account: ACCOUNT, Arn: ROLE_IDENTITY_ARN });
  exactKeys(value.artifact, ["sourceId", "byteLength", "localSha256", "localDescriptor", "payload", "manifest", "retention"], "artifact"); assert.equal(value.artifact.sourceId, SOURCE); assert.equal(value.artifact.byteLength, BYTES); assert.equal(value.artifact.localSha256, LOCAL_SHA);
  exactKeys(value.artifact.localDescriptor, ["stableCopy", "sourceDevice", "sourceInode", "byteLength", "sha256", "checksum"], "local descriptor"); assert.equal(value.artifact.localDescriptor.stableCopy, true); assert.equal(value.artifact.localDescriptor.byteLength, BYTES); assert.equal(value.artifact.localDescriptor.sha256, LOCAL_SHA); assert.equal(Number.isSafeInteger(value.artifact.localDescriptor.sourceDevice), true); assert.equal(Number.isSafeInteger(value.artifact.localDescriptor.sourceInode), true); validateChecksum(value.artifact.localDescriptor.checksum, "local descriptor checksum");
  const expectedPayloadChecksum = Buffer.from(LOCAL_SHA, "hex").toString("base64");
  assert.equal(value.artifact.localDescriptor.checksum.providerValue, expectedPayloadChecksum, "local descriptor checksum is not derived from the approved local SHA-256"); assert.equal(value.artifact.localDescriptor.checksum.localValue, expectedPayloadChecksum, "local descriptor local checksum is not derived from the approved local SHA-256");
  validateObject(value.artifact.payload, "payload", plan.deterministicRemoteNames.payloadKey, BYTES); assert.equal(value.artifact.payload.checksum.providerValue, expectedPayloadChecksum, "payload provider checksum is not bound to the approved local SHA-256"); assert.equal(value.artifact.payload.checksum.localValue, expectedPayloadChecksum, "payload local checksum is not bound to the approved local SHA-256");
  const manifestBytes = expectedManifestBytes(plan); const expectedManifestSha256 = hash(manifestBytes); const expectedManifestChecksum = Buffer.from(expectedManifestSha256, "hex").toString("base64");
  validateObject(value.artifact.manifest, "manifest", plan.deterministicRemoteNames.manifestKey, manifestBytes.length); assert.equal(value.artifact.manifest.checksum.providerValue, expectedManifestChecksum, "manifest provider checksum is not bound to the deterministic local manifest"); assert.equal(value.artifact.manifest.checksum.localValue, expectedManifestChecksum, "manifest local checksum is not bound to the deterministic local manifest");
  exactKeys(value.artifact.retention, ["mode", "retainUntil", "readAt", "responseSha256"], "retention"); assert.equal(value.artifact.retention.mode, "COMPLIANCE"); assert.equal(value.artifact.retention.retainUntil, RETAIN_UNTIL); exactUtc(value.artifact.retention.readAt, "retention.readAt"); assert.match(value.artifact.retention.responseSha256, SHA256);
  assert.equal(value.rawResponses.length >= 12, true, "raw response digest set is incomplete"); for (const [index, response] of value.rawResponses.entries()) validateRawResponse(response, `raw response ${index}`); assert.equal(new Set(value.rawResponses.map(({ name }) => name)).size, value.rawResponses.length, "raw response names are duplicated"); assert.match(value.rawResponseBundleSha256, SHA256); assert.equal(value.rawResponseBundleSha256, hash(`${JSON.stringify(value.rawResponses)}\n`));
  assert.deepEqual(value.recoveryBoundary, expectedRecoveryBoundary()); assert.deepEqual(value.claims, { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, recoveryReplicaVerified: false, immutableArchiveCreditEligible: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false });
  return value;
}

export function redactFederalAttestation(value, privateBytes, plan = readJson(PLAN_PATH), expected = {}) {
  validatePrivateFederalAttestation(value, plan, expected);
  return {
    schemaVersion: "witness-tree/federal-electoral-promotion-attestation-redacted/1", status: "owner-private-pair-required-for-verification", notice: "This redacted record exposes no provider version, key, identity, or checksum value. Verification requires the exact owner-owned mode-600 private pair. It remains primary-only evidence and cannot claim recovery or source-ledger credit.", privateAttestationSha256: hash(privateBytes),
    provenance: { createdAt: value.provenance.createdAt, runnerSha256: value.provenance.runnerSha256, planSha256: value.provenance.planSha256, approvalSha256: value.provenance.approvalSha256, iamDesiredSha256: value.provenance.iamDesiredSha256, liveIamSha256: value.provenance.liveIamSha256, rawResponseBundleSha256: value.rawResponseBundleSha256, operation: value.provenance.operation },
    operator: { account: value.operator.Account, arnSha256: hash(value.operator.Arn) }, assumedRole: { account: value.assumedRole.Account, arnSha256: hash(value.assumedRole.Arn) },
    artifact: { sourceId: value.artifact.sourceId, byteLength: value.artifact.byteLength, localSha256: value.artifact.localSha256, localDescriptor: { stableCopy: true, sourceDevice: value.artifact.localDescriptor.sourceDevice, sourceInode: value.artifact.localDescriptor.sourceInode, byteLength: value.artifact.localDescriptor.byteLength, sha256: value.artifact.localDescriptor.sha256, checksumSha256: hash(value.artifact.localDescriptor.checksum.providerValue) }, payload: { keySha256: hash(value.artifact.payload.key), versionIdSha256: hash(value.artifact.payload.versionId), contentLength: value.artifact.payload.contentLength, checksumSha256: hash(value.artifact.payload.checksum.providerValue), headResponseSha256: value.artifact.payload.headResponseSha256, versionListResponseSha256: value.artifact.payload.versionListResponseSha256 }, manifest: { keySha256: hash(value.artifact.manifest.key), versionIdSha256: hash(value.artifact.manifest.versionId), contentLength: value.artifact.manifest.contentLength, checksumSha256: hash(value.artifact.manifest.checksum.providerValue), headResponseSha256: value.artifact.manifest.headResponseSha256, versionListResponseSha256: value.artifact.manifest.versionListResponseSha256 }, retention: value.artifact.retention },
    rawResponses: value.rawResponses.map(({ name, byteLength, sha256 }) => ({ name, byteLength, sha256 })), recoveryBoundary: value.recoveryBoundary, claims: { ...value.claims, exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, recoveryReplicaVerified: false, immutableArchiveCreditEligible: false }
  };
}

export function validateRedactedFederalAttestation(value, plan = readJson(PLAN_PATH), expected = {}) {
  exactKeys(value, ["schemaVersion", "status", "notice", "privateAttestationSha256", "provenance", "operator", "assumedRole", "artifact", "rawResponses", "recoveryBoundary", "claims"], "redacted attestation"); assert.equal(value.schemaVersion, "witness-tree/federal-electoral-promotion-attestation-redacted/1"); assert.equal(value.status, "owner-private-pair-required-for-verification"); assert.match(value.notice, /primary-only evidence/i); assert.match(value.notice, /cannot claim recovery or source-ledger credit/i); assert.match(value.privateAttestationSha256, SHA256);
  exactKeys(value.provenance, ["createdAt", "runnerSha256", "planSha256", "approvalSha256", "iamDesiredSha256", "liveIamSha256", "rawResponseBundleSha256", "operation"], "redacted provenance"); exactUtc(value.provenance.createdAt, "redacted createdAt"); for (const field of ["runnerSha256", "planSha256", "approvalSha256", "iamDesiredSha256", "liveIamSha256", "rawResponseBundleSha256"]) assert.match(value.provenance[field], SHA256); assert.equal(value.provenance.runnerSha256, expected.runnerSha256 ?? hashFile(RUNNER_PATH)); assert.equal(value.provenance.planSha256, expected.planSha256 ?? hashFile(PLAN_PATH)); assert.equal(value.provenance.approvalSha256, expected.approvalSha256 ?? hashFile(APPROVAL_PATH)); assert.equal(value.provenance.iamDesiredSha256, expected.iamDesiredSha256 ?? hashFile(IAM_DESIRED_PATH)); assert.equal(value.provenance.operation, "primary-only-exact-version-head-checksum-retention-capture");
  for (const [label, identity] of [["operator", value.operator], ["assumedRole", value.assumedRole]]) { exactKeys(identity, ["account", "arnSha256"], `${label} redaction`); assert.equal(identity.account, ACCOUNT); assert.match(identity.arnSha256, SHA256); }
  exactKeys(value.artifact, ["sourceId", "byteLength", "localSha256", "localDescriptor", "payload", "manifest", "retention"], "redacted artifact"); assert.equal(value.artifact.sourceId, SOURCE); assert.equal(value.artifact.byteLength, BYTES); assert.equal(value.artifact.localSha256, LOCAL_SHA); exactKeys(value.artifact.localDescriptor, ["stableCopy", "sourceDevice", "sourceInode", "byteLength", "sha256", "checksumSha256"], "redacted local descriptor"); assert.equal(value.artifact.localDescriptor.stableCopy, true); assert.equal(value.artifact.localDescriptor.byteLength, BYTES); assert.equal(value.artifact.localDescriptor.sha256, LOCAL_SHA); assert.match(value.artifact.localDescriptor.checksumSha256, SHA256);
  for (const [label, object, key] of [["payload", value.artifact.payload, plan.deterministicRemoteNames.payloadKey], ["manifest", value.artifact.manifest, plan.deterministicRemoteNames.manifestKey]]) { exactKeys(object, ["keySha256", "versionIdSha256", "contentLength", "checksumSha256", "headResponseSha256", "versionListResponseSha256"], `redacted ${label}`); assert.equal(object.keySha256, hash(key)); assert.match(object.versionIdSha256, SHA256); assert.equal(Number.isSafeInteger(object.contentLength) && object.contentLength > 0, true); assert.match(object.checksumSha256, SHA256); assert.match(object.headResponseSha256, SHA256); assert.match(object.versionListResponseSha256, SHA256); }
  exactKeys(value.artifact.retention, ["mode", "retainUntil", "readAt", "responseSha256"], "redacted retention"); assert.equal(value.artifact.retention.mode, "COMPLIANCE"); assert.equal(value.artifact.retention.retainUntil, RETAIN_UNTIL); exactUtc(value.artifact.retention.readAt, "redacted retention.readAt"); assert.match(value.artifact.retention.responseSha256, SHA256);
  assert.equal(value.rawResponses.length >= 12, true); for (const [index, response] of value.rawResponses.entries()) validateRawResponse(response, `redacted raw response ${index}`); assert.equal(value.provenance.rawResponseBundleSha256, hash(`${JSON.stringify(value.rawResponses)}\n`)); assert.deepEqual(value.recoveryBoundary, expectedRecoveryBoundary()); assert.deepEqual(value.claims, { exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, sourceLedgerCreditChanged: false, recoveryReplicaVerified: false, immutableArchiveCreditEligible: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false }); return value;
}

export function validateFederalAttestationPair(privatePath, publicRecord, plan = readJson(PLAN_PATH), expected = {}) {
  const metadata = lstatSync(privatePath); assert.equal(metadata.isFile(), true, "private attestation must be a regular file"); assert.equal(metadata.isSymbolicLink(), false, "private attestation cannot be a symlink"); assert.equal(metadata.nlink, 1, "private attestation cannot have a hard-link alias"); assert.equal(metadata.uid, process.getuid(), "private attestation must be owner-owned"); assert.equal(metadata.mode & 0o777, 0o600, "private attestation must be mode 600"); const privateBytes = readFileSync(privatePath); const privateRecord = JSON.parse(privateBytes); const redacted = redactFederalAttestation(privateRecord, privateBytes, plan, expected); assert.deepEqual(publicRecord, redacted, "public record is not the exact digest-bound redaction of the private record"); return { privateRecord, publicRecord };
}

if (process.argv[1]?.endsWith(basename(import.meta.url))) {
  try { const args = process.argv.slice(2); assert.equal(args[0], "--pair"); assert.equal(args.length, 3, "Usage: checker --pair <private> <public>"); validateFederalAttestationPair(resolve(args[1]), readJson(resolve(args[2]))); console.log("Federal private/public attestation pair passed exact digest-bound validation; recovery, source-ledger credit, transformation, ingestion, release, and production admission remain false."); } catch { console.error("Federal electoral attestation validation failed without exposing provider values."); process.exitCode = 1; }
}
