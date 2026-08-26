import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sidecarFor, validateQcImmutablePromotionPreparation } from "./prepare-qc-immutable-promotion.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_PATH = resolve(ROOT, "data/qc-immutable-promotion-attestation.json");
const PLAN_PATH = resolve(ROOT, "data/qc-immutable-promotion-preparation.json");
const RUNNER_PATH = resolve(ROOT, "scripts/run-qc-approved-multipart-promotion.sh");
const CAPTURE_PATH = resolve(ROOT, "scripts/capture-qc-immutable-promotion-attestation.sh");
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(?!.*(?:redacted|placeholder|example|fabricated|version-[0-9]))[A-Za-z0-9._+=:/-]{8,}$/i;
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const COMPOSITE_SHA256 = /^[A-Za-z0-9+/]{43}=-[1-9][0-9]*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const hash = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields drifted`);
const exactUtc = (value) => typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");

export function validatePendingQcAttestation(record, plan = readJson(PLAN_PATH)) {
  validateQcImmutablePromotionPreparation(plan);
  exactKeys(record, ["schemaVersion", "status", "notice", "privateAttestationSha256", "objects", "claims"], "pending public attestation");
  assert.equal(record.schemaVersion, "witness-tree/qc-immutable-promotion-attestation-redacted/1");
  assert.equal(record.status, "awaiting-owner-generated-private-attestation");
  assert.match(record.notice, /public record alone.*does not prove/i);
  assert.match(record.notice, /owner-attested internally consistent evidence.*not independently signed AWS proof/i);
  assert.equal(record.privateAttestationSha256, null);
  assert.deepEqual(record.objects, []);
  assert.deepEqual(record.claims, { exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false });
  return record;
}

export function validateCapturedQcAttestation(record, plan = readJson(PLAN_PATH), expected = {}) {
  validateQcImmutablePromotionPreparation(plan);
  exactKeys(record, ["schemaVersion", "status", "notice", "privateAttestationSha256", "provenance", "objects", "recoveryBoundary", "claims"], "captured public attestation");
  assert.equal(record.schemaVersion, "witness-tree/qc-immutable-promotion-attestation-redacted/1");
  assert.equal(record.status, "owner-private-pair-required-for-verification");
  assert.match(record.notice, /exposes no version or upload identifier/i);
  assert.match(record.notice, /owner-attested internally consistent evidence.*not independently signed AWS proof/i);
  assert.match(record.privateAttestationSha256, SHA256);
  exactKeys(record.provenance, ["createdAt", "runnerSha256", "captureScriptSha256", "planSha256", "operation"], "captured public provenance");
  assert.ok(exactUtc(record.provenance.createdAt));
  assert.equal(record.provenance.runnerSha256, expected.runnerSha256 ?? hash(readFileSync(RUNNER_PATH)));
  assert.equal(record.provenance.captureScriptSha256, expected.captureScriptSha256 ?? hash(readFileSync(CAPTURE_PATH)));
  assert.equal(record.provenance.planSha256, expected.planSha256 ?? hash(readFileSync(PLAN_PATH)));
  assert.equal(record.provenance.operation, "read-only-exact-version-head-and-payload-retention-capture");
  assert.equal(record.objects.length, plan.artifacts.length * 2);
  assert.deepEqual(record.objects.map(({ artifactId, objectKind }) => [artifactId, objectKind]), plan.artifacts.flatMap(({ id }) => [[id, "payload"], [id, "manifest"]]));
  for (const artifact of plan.artifacts) {
    for (const object of record.objects.filter(({ artifactId }) => artifactId === artifact.id)) {
      exactKeys(object, ["artifactId", "productionSourceId", "objectKind", "keySha256", "versionIdSha256", "contentLength", "providerChecksumSha256", "headResponseSha256", "retention"], "captured public object");
      assert.equal(object.productionSourceId, artifact.productionSourceId);
      assert.ok(["payload", "manifest"].includes(object.objectKind));
      assert.equal(object.keySha256, hash(object.objectKind === "payload" ? artifact.payloadKey : artifact.manifestKey));
      assert.match(object.versionIdSha256, SHA256);
      assert.match(object.providerChecksumSha256, SHA256);
      assert.match(object.headResponseSha256, SHA256);
      if (object.objectKind === "payload") {
        assert.equal(object.contentLength, artifact.byteLength);
        exactKeys(object.retention, ["mode", "retainUntil", "responseSha256"], "captured payload retention");
        assert.equal(object.retention.mode, plan.mfaGatedExecution.retentionMode);
        assert.equal(object.retention.retainUntil, plan.mfaGatedExecution.recommendedRetainUntil);
        assert.match(object.retention.responseSha256, SHA256);
      } else {
        assert.equal(object.contentLength, Buffer.byteLength(sidecarFor(plan, artifact)));
        assert.equal(object.retention, "not-authorized-rebuildable-sidecar");
      }
    }
  }
  assert.equal(new Set(record.objects.map(({ versionIdSha256 }) => versionIdSha256)).size, record.objects.length);
  assert.deepEqual(record.recoveryBoundary, { multipartResumeStatePreserved: true, replicaCreated: false, replicaAuthorized: false, meaning: "Private multipart state supports interrupted-run diagnosis/resume only; no recovery replica was approved or proved." });
  assert.deepEqual(record.claims, { exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false });
  return record;
}

function validatePrivateObject(object, artifact, plan) {
  exactKeys(object, ["artifactId", "productionSourceId", "objectKind", "key", "versionId", "contentLength", "checksum", "headObjectReadAt", "headResponseSha256", "retention"], `private ${object.objectKind}`);
  assert.equal(object.artifactId, artifact.id);
  assert.equal(object.productionSourceId, artifact.productionSourceId);
  assert.ok(["payload", "manifest"].includes(object.objectKind));
  assert.equal(object.key, object.objectKind === "payload" ? artifact.payloadKey : artifact.manifestKey);
  assert.match(object.versionId, VERSION);
  assert.ok(exactUtc(object.headObjectReadAt));
  assert.match(object.headResponseSha256, SHA256);
  exactKeys(object.checksum, ["algorithm", "type", "providerValue"], "private checksum");
  assert.equal(object.checksum.algorithm, "SHA256");
  if (object.objectKind === "payload") {
    assert.equal(object.contentLength, artifact.byteLength);
    assert.equal(object.checksum.type, "COMPOSITE");
    assert.match(object.checksum.providerValue, COMPOSITE_SHA256);
    exactKeys(object.retention, ["mode", "retainUntil", "readAt", "responseSha256"], "payload retention");
    assert.equal(object.retention.mode, plan.mfaGatedExecution.retentionMode);
    assert.equal(object.retention.retainUntil, plan.mfaGatedExecution.recommendedRetainUntil);
    assert.ok(exactUtc(object.retention.readAt));
    assert.match(object.retention.responseSha256, SHA256);
  } else {
    const sidecar = sidecarFor(plan, artifact);
    assert.equal(object.contentLength, Buffer.byteLength(sidecar));
    assert.equal(object.checksum.type, "FULL_OBJECT");
    assert.match(object.checksum.providerValue, BASE64_SHA256);
    assert.equal(object.checksum.providerValue, Buffer.from(hash(sidecar), "hex").toString("base64"));
    assert.equal(object.retention, "not-authorized-rebuildable-sidecar");
  }
}

export function validatePrivateQcAttestation(record, plan = readJson(PLAN_PATH), expected = {}) {
  validateQcImmutablePromotionPreparation(plan);
  exactKeys(record, ["schemaVersion", "status", "provenance", "destination", "objects", "recoveryBoundary", "claims"], "private attestation");
  assert.equal(record.schemaVersion, "witness-tree/qc-immutable-promotion-attestation-private/1");
  assert.equal(record.status, "owner-run-exact-version-readbacks-complete");
  exactKeys(record.provenance, ["createdAt", "captureCommand", "accountId", "operatorArn", "roleArn", "runnerSha256", "captureScriptSha256", "planSha256", "stateFileSha256s", "authentication", "operation"], "provenance");
  assert.ok(exactUtc(record.provenance.createdAt));
  assert.equal(record.provenance.captureCommand, "zsh scripts/capture-qc-immutable-promotion-attestation.sh --capture <mode-600-private-output> <redacted-public-output>");
  assert.equal(record.provenance.accountId, "286853118812");
  assert.equal(record.provenance.operatorArn, "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator");
  assert.equal(record.provenance.roleArn, "arn:aws:iam::286853118812:role/WitnessTreeQcArchivePromotionUploader");
  assert.equal(record.provenance.authentication, "fresh-mfa-owner-session");
  assert.equal(record.provenance.operation, "read-only-exact-version-head-and-payload-retention-capture");
  assert.equal(record.provenance.runnerSha256, expected.runnerSha256 ?? hash(readFileSync(RUNNER_PATH)));
  assert.equal(record.provenance.captureScriptSha256, expected.captureScriptSha256 ?? hash(readFileSync(CAPTURE_PATH)));
  assert.equal(record.provenance.planSha256, expected.planSha256 ?? hash(readFileSync(PLAN_PATH)));
  assert.equal(record.provenance.stateFileSha256s.length, 2);
  for (const state of record.provenance.stateFileSha256s) {
    exactKeys(state, ["artifactId", "sha256"], "state digest");
    assert.match(state.sha256, SHA256);
  }
  assert.deepEqual(record.destination, plan.destination);
  assert.equal(record.objects.length, 4);
  for (const artifact of plan.artifacts) {
    const objects = record.objects.filter((object) => object.artifactId === artifact.id);
    assert.deepEqual(objects.map((object) => object.objectKind).sort(), ["manifest", "payload"]);
    for (const object of objects) validatePrivateObject(object, artifact, plan);
  }
  assert.equal(new Set(record.objects.map((object) => object.versionId)).size, 4);
  assert.deepEqual(record.provenance.stateFileSha256s.map(({ artifactId }) => artifactId).sort(), plan.artifacts.map(({ id }) => id).sort());
  assert.deepEqual(record.recoveryBoundary, { multipartResumeStatePreserved: true, replicaCreated: false, replicaAuthorized: false, meaning: "Private multipart state supports interrupted-run diagnosis/resume only; no recovery replica was approved or proved." });
  assert.deepEqual(record.claims, { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false });
  return record;
}

export function redactQcAttestation(privateRecord, privateBytes, plan = readJson(PLAN_PATH), expected = {}) {
  validatePrivateQcAttestation(privateRecord, plan, expected);
  return {
    schemaVersion: "witness-tree/qc-immutable-promotion-attestation-redacted/1",
    status: "owner-private-pair-required-for-verification",
    notice: "This redacted record exposes no version or upload identifier and cannot prove remote state by itself. Verification requires the exact owner-owned mode-600 private attestation whose SHA-256 is bound below. A passing pair is owner-attested internally consistent evidence, not independently signed AWS proof.",
    privateAttestationSha256: hash(privateBytes),
    provenance: { createdAt: privateRecord.provenance.createdAt, runnerSha256: privateRecord.provenance.runnerSha256, captureScriptSha256: privateRecord.provenance.captureScriptSha256, planSha256: privateRecord.provenance.planSha256, operation: privateRecord.provenance.operation },
    objects: privateRecord.objects.map((object) => ({ artifactId: object.artifactId, productionSourceId: object.productionSourceId, objectKind: object.objectKind, keySha256: hash(object.key), versionIdSha256: hash(object.versionId), contentLength: object.contentLength, providerChecksumSha256: hash(object.checksum.providerValue), headResponseSha256: object.headResponseSha256, retention: object.objectKind === "payload" ? { mode: object.retention.mode, retainUntil: object.retention.retainUntil, responseSha256: object.retention.responseSha256 } : object.retention })),
    recoveryBoundary: privateRecord.recoveryBoundary,
    claims: { ...privateRecord.claims, exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false }
  };
}

export function validateQcAttestationPair(privatePath, publicRecord, plan = readJson(PLAN_PATH), expected = {}) {
  const metadata = lstatSync(privatePath);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "private attestation must be a regular file");
  assert.equal(metadata.uid, process.getuid(), "private attestation must be owner-owned");
  assert.equal(metadata.mode & 0o777, 0o600, "private attestation must be mode 600");
  const bytes = readFileSync(privatePath);
  const privateRecord = JSON.parse(bytes);
  const redacted = redactQcAttestation(privateRecord, bytes, plan, expected);
  assert.deepEqual(publicRecord, redacted, "public record is not the exact redaction of the digest-bound private attestation");
  return { privateRecord, publicRecord };
}

if (process.argv[1]?.endsWith(basename(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args[0] === "--pair") {
    assert.equal(args.length, 3, "Usage: --pair <mode-600-private-attestation> <redacted-public-record>");
    validateQcAttestationPair(resolve(args[1]), readJson(resolve(args[2])));
    console.log("QC private/public attestation pair passed exact fail-closed validation; this does not prove recovery replication, transformation, ingestion, release, or production admission.");
  } else {
    assert.equal(args.length, 0, "Usage: checker [--pair private public]");
    const record = readJson(PUBLIC_PATH);
    if (record.status === "awaiting-owner-generated-private-attestation") {
      validatePendingQcAttestation(record);
      console.log("QC post-run attestation remains pending; no immutable credit or downstream state changed.");
    } else {
      validateCapturedQcAttestation(record);
      console.log("QC redacted attestation passed public schema and exact-plan binding; only --pair performs full private/public verification, and no production admission is implied.");
    }
  }
}
