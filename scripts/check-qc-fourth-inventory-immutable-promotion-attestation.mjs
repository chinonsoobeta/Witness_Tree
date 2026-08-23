import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_PATH = resolve(ROOT, "data/qc-fourth-inventory-immutable-promotion-attestation.json");
const RUNNER_PATH = resolve(ROOT, "scripts/qc-fourth-inventory-immutable-promotion.mjs");
const CAPTURE_PATH = resolve(ROOT, "scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs");
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(?!.*(?:redacted|placeholder|example))[A-Za-z0-9._+=:/-]{8,}$/i;
const COMPOSITE_SHA256 = /^[A-Za-z0-9+/]{43}=-[1-9][0-9]*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const exactKeys = (value, keys, label) => assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} fields drifted`);
const exactUtc = (value) => typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const objectKind = (entry) => entry.id === "canonical-collection-manifest" ? "manifest" : entry.id.startsWith("sheet-") ? "payload" : "evidence";

const pendingClaims = { exactReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false };
const privateClaims = { ...pendingClaims, exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true };

export function validatePendingQcFourthAttestation(record, plan = loadQcFourthInventoryPromotionPreparation()) {
  exactKeys(record, ["schemaVersion", "status", "notice", "privateAttestationSha256", "objectCount", "objects", "claims"], "pending fourth-inventory attestation");
  assert.equal(record.schemaVersion, "witness-tree/qc-fourth-inventory-immutable-promotion-attestation-redacted/1");
  assert.equal(record.status, "awaiting-owner-generated-private-attestation");
  assert.match(record.notice, /no version, upload, account, operator, role, object-key, or provider-checksum identifier/i);
  assert.match(record.notice, /public record alone.*does not prove/i);
  assert.match(record.notice, /owner-generated internally consistent evidence.*not independently signed AWS proof/i);
  assert.equal(record.privateAttestationSha256, null);
  assert.equal(record.objectCount, exactPromotionObjects(plan).length);
  assert.deepEqual(record.objects, []);
  assert.deepEqual(record.claims, pendingClaims);
  return record;
}

function validatePrivateObject(object, entry, plan) {
  exactKeys(object, ["ordinal", "objectId", "objectKind", "key", "versionId", "contentLength", "checksum", "headObjectReadAt", "headResponseSha256", "retention"], `private object ${object.ordinal}`);
  assert.equal(object.ordinal, exactPromotionObjects(plan).findIndex((candidate) => candidate.id === entry.id) + 1);
  assert.equal(object.objectId, entry.id);
  assert.equal(object.objectKind, objectKind(entry));
  assert.equal(object.key, entry.objectKey);
  assert.match(object.versionId, VERSION);
  assert.equal(object.contentLength, entry.byteLength);
  assert.ok(exactUtc(object.headObjectReadAt));
  assert.match(object.headResponseSha256, SHA256);
  exactKeys(object.checksum, ["algorithm", "type", "providerValue"], `private checksum ${object.ordinal}`);
  assert.equal(object.checksum.algorithm, "SHA256");
  const multipart = entry.byteLength > plan.upload.multipartThresholdBytes;
  assert.equal(object.checksum.type, multipart ? "COMPOSITE" : "FULL_OBJECT");
  if (multipart) assert.match(object.checksum.providerValue, COMPOSITE_SHA256);
  else assert.equal(object.checksum.providerValue, Buffer.from(entry.sha256, "hex").toString("base64"));
  exactKeys(object.retention, ["mode", "retainUntil", "readAt", "responseSha256"], `private retention ${object.ordinal}`);
  assert.equal(object.retention.mode, "COMPLIANCE");
  assert.equal(object.retention.retainUntil, RETAIN_UNTIL);
  assert.ok(exactUtc(object.retention.readAt));
  assert.match(object.retention.responseSha256, SHA256);
}

export function validatePrivateQcFourthAttestation(record, plan = loadQcFourthInventoryPromotionPreparation(), expected = {}) {
  exactKeys(record, ["schemaVersion", "status", "provenance", "destination", "objects", "claims"], "private fourth-inventory attestation");
  assert.equal(record.schemaVersion, "witness-tree/qc-fourth-inventory-immutable-promotion-attestation-private/1");
  assert.equal(record.status, "owner-run-exact-version-readbacks-complete");
  exactKeys(record.provenance, ["createdAt", "captureCommand", "runnerSha256", "captureScriptSha256", "planSha256", "stateFileSha256", "authentication", "operation"], "private provenance");
  assert.ok(exactUtc(record.provenance.createdAt));
  assert.equal(record.provenance.captureCommand, "node scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs --capture --session-ready --state <mode-600-state> --private-output <new-mode-600-private-output> --redacted-output <new-public-output>");
  assert.equal(record.provenance.runnerSha256, expected.runnerSha256 ?? sha256(readFileSync(RUNNER_PATH)));
  assert.equal(record.provenance.captureScriptSha256, expected.captureScriptSha256 ?? sha256(readFileSync(CAPTURE_PATH)));
  assert.equal(record.provenance.planSha256, expected.planSha256 ?? sha256(JSON.stringify(plan)));
  assert.match(record.provenance.stateFileSha256, SHA256);
  assert.equal(record.provenance.authentication, "owner-supplied-temporary-mfa-role-session");
  assert.equal(record.provenance.operation, "read-only-exact-version-head-checksum-bytes-and-retention-capture");
  assert.deepEqual(record.destination, { bucket: plan.bucket, region: plan.region, retention: plan.retention });
  const entries = exactPromotionObjects(plan);
  assert.equal(record.objects.length, 62);
  for (const [index, entry] of entries.entries()) validatePrivateObject(record.objects[index], entry, plan);
  assert.equal(new Set(record.objects.map((object) => object.key)).size, 62);
  assert.deepEqual(record.claims, privateClaims);
  return record;
}

export function redactQcFourthAttestation(privateRecord, privateBytes, plan = loadQcFourthInventoryPromotionPreparation(), expected = {}) {
  validatePrivateQcFourthAttestation(privateRecord, plan, expected);
  return {
    schemaVersion: "witness-tree/qc-fourth-inventory-immutable-promotion-attestation-redacted/1",
    status: "owner-private-pair-required-for-verification",
    notice: "This redacted record exposes no version, upload, account, operator, role, object-key, or provider-checksum identifier and cannot prove remote state by itself. Verification requires the exact owner-owned mode-600 private attestation bound below. A passing pair is owner-generated internally consistent evidence, not independently signed AWS proof.",
    privateAttestationSha256: sha256(privateBytes),
    provenance: {
      createdAt: privateRecord.provenance.createdAt,
      runnerSha256: privateRecord.provenance.runnerSha256,
      captureScriptSha256: privateRecord.provenance.captureScriptSha256,
      planSha256: privateRecord.provenance.planSha256,
      stateFileSha256: privateRecord.provenance.stateFileSha256,
      operation: privateRecord.provenance.operation
    },
    objectCount: privateRecord.objects.length,
    objects: privateRecord.objects.map((object) => ({
      ordinal: object.ordinal,
      objectBindingSha256: sha256(`${object.objectId}\0${object.key}`),
      versionIdSha256: sha256(object.versionId),
      contentLength: object.contentLength,
      checksum: { algorithm: object.checksum.algorithm, type: object.checksum.type, providerValueSha256: sha256(object.checksum.providerValue), headResponseSha256: object.headResponseSha256 },
      retention: { mode: object.retention.mode, retainUntil: object.retention.retainUntil, responseSha256: object.retention.responseSha256 }
    })),
    claims: pendingClaims
  };
}

export function validateQcFourthAttestationPair(privatePath, publicRecord, plan = loadQcFourthInventoryPromotionPreparation(), expected = {}) {
  const metadata = lstatSync(privatePath);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "private attestation must be a regular file");
  assert.equal(metadata.uid, process.getuid(), "private attestation must be owner-owned");
  assert.equal(metadata.mode & 0o777, 0o600, "private attestation must be mode 600");
  assert.equal(metadata.nlink, 1, "private attestation must not have hard-link aliases");
  const bytes = readFileSync(privatePath);
  const privateRecord = JSON.parse(bytes);
  const redacted = redactQcFourthAttestation(privateRecord, bytes, plan, expected);
  assert.deepEqual(publicRecord, redacted, "public record is not the exact identifier-free redaction of the digest-bound private attestation");
  return { privateRecord, publicRecord };
}

if (process.argv[1]?.endsWith(basename(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args[0] === "--pair") {
    assert.equal(args.length, 3, "Usage: --pair <mode-600-private-attestation> <redacted-public-record>");
    validateQcFourthAttestationPair(resolve(args[1]), readJson(resolve(args[2])));
    console.log("QC fourth-inventory private/redacted attestation pair passed; no transformation, ingestion, release, or production admission was claimed.");
  } else {
    assert.equal(args.length, 0, "Usage: checker [--pair private public]");
    validatePendingQcFourthAttestation(readJson(PUBLIC_PATH));
    console.log("QC fourth-inventory post-run attestation remains pending; no immutable credit or downstream state changed.");
  }
}
