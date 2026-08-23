import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateCheckpoint } from "./check-current-wildfire-promotion-checkpoint.mjs";
import { rollbackExclusivePublication, writeExclusiveMode600 } from "./assemble-qc-immutable-promotion-attestation.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const PLAN_PATH = resolve(ROOT, "data/current-wildfire-immutable-promotion-preparation.json");
const RUNNER_PATH = resolve(ROOT, "scripts/run-current-wildfire-approved-promotion.sh");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields drifted`);

function ownerFile(path, label) {
  const metadata = lstatSync(path);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${label} must be a regular non-symlink file`);
  assert.equal(metadata.uid, process.getuid(), `${label} must be owner-owned`);
  assert.equal(metadata.mode & 0o777, 0o600, `${label} must be mode 600`);
  assert.equal(metadata.nlink, 1, `${label} must not have hard-link aliases`);
  return metadata;
}

function ownerBytes(path, label) { const before = ownerFile(path, label); const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const opened = fstatSync(fd); assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino); const bytes = readFileSync(fd); const after = fstatSync(fd); assert.equal(after.dev, opened.dev); assert.equal(after.ino, opened.ino); assert.equal(after.size, opened.size); return bytes; } finally { closeSync(fd); } }

function publicObjects(checkpoint) {
  return checkpoint.objects.map((object) => ({
    artifactId: object.artifactId,
    sourceId: object.sourceId,
    objectKind: object.kind,
    keySha256: hash(object.key),
    versionIdSha256: hash(object.ack.VersionId),
    contentLength: object.bytes,
    checksumSha256: hash(object.ack.ChecksumCRC64NVME),
    rawResponseSha256s: {
      putObject: hash(object.ack.rawResponse),
      headObject: hash(object.head.rawResponse),
      ...(object.kind === "payload" ? { putObjectRetention: hash(object.retention.putResponse), getObjectRetention: hash(object.retention.getResponse) } : {})
    },
    retention: object.kind === "payload" ? { mode: object.retention.Mode, retainUntil: object.retention.RetainUntilDate } : "not-authorized-rebuildable-sidecar"
  }));
}

export function privateAttestation(checkpointPath) {
  const checkpointBytes = ownerBytes(checkpointPath, "checkpoint");
  const checkpoint = validateCheckpoint(JSON.parse(checkpointBytes));
  assert.equal(checkpoint.status, "completed", "checkpoint is not complete");
  assert.ok(checkpoint.objects.every((object) => object.status === "complete"), "checkpoint has incomplete object boundaries");
  return {
    schemaVersion: "witness-tree/current-wildfire-promotion-attestation-private/1",
    status: "owner-run-exact-version-readbacks-complete",
    provenance: {
      createdAt: checkpoint.updatedAt,
      accountId: "286853118812",
      operatorArn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
      roleArn: "arn:aws:iam::286853118812:role/WitnessTreeCurrentWildfirePromotionUploader",
      checkpointSha256: hash(checkpointBytes),
      planSha256: hash(readFileSync(PLAN_PATH)),
      runnerSha256: hash(readFileSync(RUNNER_PATH)),
      authentication: "fresh-mfa-owner-session",
      identityRawResponses: checkpoint.identitySessions
    },
    destination: { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" },
    checkpoint,
    recoveryReplicaProof: {
      status: "not-proved-not-authorized-by-this-run",
      externalCallsPerformedByAssembler: false,
      requiredContract: ["distinct recovery bucket", "exact recovery version identifiers", "exact content lengths", "FULL_OBJECT CRC64NVME responses", "primary-to-recovery digest equality", "REPLICA status", "payload COMPLIANCE retention readback"]
    },
    claims: { exactVersionReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, recoveryReplicaVerified: false, ownerAdmission: false, transformed: false, ingested: false, productionEligible: false }
  };
}

export function redact(privateRecord, privateBytes) {
  return {
    schemaVersion: "witness-tree/current-wildfire-promotion-attestation-redacted/1",
    status: "owner-private-pair-required-for-verification",
    notice: "This redacted record contains only digest cross-links. It is internally checkable only with the exact owner-owned mode-600 private attestation and is not independently signed AWS proof. It does not prove a recovery replica or downstream admission.",
    privateAttestationSha256: hash(privateBytes),
    provenance: {
      createdAt: privateRecord.provenance.createdAt,
      checkpointSha256: privateRecord.provenance.checkpointSha256,
      planSha256: privateRecord.provenance.planSha256,
      runnerSha256: privateRecord.provenance.runnerSha256,
      identityResponseSha256s: privateRecord.provenance.identityRawResponses.map((session) => ({ operator: hash(session.operatorRaw), role: hash(session.roleRaw) }))
    },
    objects: publicObjects(privateRecord.checkpoint),
    responseInventory: privateRecord.checkpoint.responseInventory.map(({ name, byteLength, sha256 }) => ({ name, byteLength, sha256 })),
    recoveryReplicaProof: privateRecord.recoveryReplicaProof,
    claims: { ...privateRecord.claims, exactVersionReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false }
  };
}

export function validatePair(privatePath, publicPath) {
  const privateBytes = ownerBytes(privatePath, "private attestation"); const publicBytes = ownerBytes(publicPath, "redacted attestation"); const privateRecord = JSON.parse(privateBytes);
  exactKeys(privateRecord, ["checkpoint", "claims", "destination", "provenance", "recoveryReplicaProof", "schemaVersion", "status"], "private attestation");
  assert.equal(privateRecord.schemaVersion, "witness-tree/current-wildfire-promotion-attestation-private/1");
  assert.equal(privateRecord.provenance.planSha256, hash(readFileSync(PLAN_PATH)));
  assert.equal(privateRecord.provenance.runnerSha256, hash(readFileSync(RUNNER_PATH)));
  assert.deepEqual(privateRecord.destination, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  validateCheckpoint(privateRecord.checkpoint);
  assert.equal(privateRecord.checkpoint.status, "completed");
  assert.deepEqual(privateRecord.provenance.identityRawResponses, privateRecord.checkpoint.identitySessions);
  assert.equal(privateRecord.checkpoint.objects.length, 8);
  for (const object of privateRecord.checkpoint.objects) {
    assert.equal(object.status, "complete");
    JSON.parse(object.ack.rawResponse); JSON.parse(object.head.rawResponse);
    if (object.kind === "payload") { JSON.parse(object.retention.putResponse); JSON.parse(object.retention.getResponse); }
  }
  const publicRecord = JSON.parse(publicBytes);
  assert.deepEqual(publicRecord, redact(privateRecord, privateBytes), "redacted record is not the exact digest-bound projection of the private attestation");
  return { privateRecord, publicRecord };
}

export function publishPair(checkpointPath, privatePath, publicPath, hooks = {}) {
  const privateOutput = resolve(privatePath); const publicOutput = resolve(publicPath);
  assert.notEqual(privateOutput, publicOutput, "attestation paths must be distinct");
  const record = privateAttestation(resolve(checkpointPath));
  const privatePublication = writeExclusiveMode600(privateOutput, record, hooks.private); let publicPublication;
  try {
    const privateBytes = ownerBytes(privateOutput, "private attestation");
    publicPublication = writeExclusiveMode600(publicOutput, redact(record, privateBytes), hooks.public);
    const pair = validatePair(privateOutput, publicOutput);
    ownerBytes(privateOutput, "post-publish private attestation"); ownerBytes(publicOutput, "post-publish redacted attestation");
    return pair;
  } catch {
    const publicRolledBack = publicPublication ? rollbackExclusivePublication(publicPublication, hooks.publicRollback) : true;
    const privateRolledBack = rollbackExclusivePublication(privatePublication, hooks.privateRollback ?? hooks.rollback);
    if (!publicRolledBack || !privateRolledBack) throw new Error("attestation pair publication failed; rollback was not proved and replacements were preserved for inspection");
    throw new Error("attestation pair publication failed; both owned outputs were rolled back");
  }
}

if (process.argv[1]?.endsWith("assemble-current-wildfire-promotion-attestation.mjs")) {
  assert.equal(process.argv.length, 5, "Usage: assembler <completed-private-checkpoint> <new-private-attestation> <new-redacted-attestation>");
  publishPair(process.argv[2], process.argv[3], process.argv[4]);
  console.log("Wrote an owner-only exact-response attestation and its redacted digest-bound pair; recovery replication and downstream admission remain unproved.");
}
