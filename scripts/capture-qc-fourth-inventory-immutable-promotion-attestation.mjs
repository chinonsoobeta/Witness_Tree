import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";
import { redactQcFourthAttestation, sha256, validateQcFourthAttestationPair } from "./check-qc-fourth-inventory-immutable-promotion-attestation.mjs";

const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const COMPOSITE_SHA256 = /^[A-Za-z0-9+/]{43}=-[1-9][0-9]*$/;

function pathExists(file) {
  try { lstatSync(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function readPrivateState(file) {
  const metadata = lstatSync(file);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "promotion state must be a regular non-symlink file");
  assert.equal(metadata.uid, process.getuid(), "promotion state must be owner-owned");
  assert.equal(metadata.mode & 0o777, 0o600, "promotion state must be mode 600");
  assert.equal(metadata.nlink, 1, "promotion state must not have hard-link aliases");
  const bytes = readFileSync(file);
  return { bytes, state: JSON.parse(bytes) };
}

function compositeSha256(parts) {
  const digests = parts.map((part) => Buffer.from(part.checksumSha256, "base64"));
  return `${createHash("sha256").update(Buffer.concat(digests)).digest("base64")}-${parts.length}`;
}

function validateCompletedState(plan, state) {
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.planSha256, sha256(JSON.stringify(plan)));
  assert.equal(state.bucket, plan.bucket);
  assert.equal(state.region, plan.region);
  assert.equal(state.retentionUntil, RETAIN_UNTIL);
  const entries = exactPromotionObjects(plan);
  assert.deepEqual(Object.keys(state.objects).sort(), entries.map((entry) => entry.id).sort(), "promotion state must contain exactly 62 completed objects");
  for (const entry of entries) {
    const record = state.objects[entry.id];
    assert.equal(record.objectKey, entry.objectKey, `${entry.id} state key drifted`);
    assert.equal(record.byteLength, entry.byteLength, `${entry.id} state byte length drifted`);
    assert.equal(record.sha256, entry.sha256, `${entry.id} state SHA-256 drifted`);
    assert.equal(record.complete, true, `${entry.id} is not durably read-back complete`);
    assert.ok(typeof record.versionId === "string" && record.versionId.length > 0 && record.versionId !== "null", `${entry.id} VersionId is missing`);
    const multipart = entry.byteLength > plan.upload.multipartThresholdBytes;
    assert.equal(record.method, multipart ? "multipart" : "single-put", `${entry.id} upload method drifted`);
    assert.equal(record.checksumType, multipart ? "COMPOSITE" : "FULL_OBJECT", `${entry.id} checksum type drifted`);
    if (multipart) {
      assert.ok(Array.isArray(record.parts) && record.parts.length === Math.ceil(entry.byteLength / plan.upload.partSizeBytes), `${entry.id} multipart parts are incomplete`);
      for (const [index, part] of record.parts.entries()) {
        assert.equal(part.partNumber, index + 1, `${entry.id} multipart parts are not contiguous`);
        assert.match(part.checksumSha256, BASE64_SHA256, `${entry.id} multipart part checksum is malformed`);
      }
      const expected = compositeSha256(record.parts);
      assert.match(expected, COMPOSITE_SHA256);
      assert.equal(record.expectedChecksumSha256, expected, `${entry.id} expected composite checksum drifted`);
      assert.equal(record.checksumSha256, expected, `${entry.id} composite checksum drifted`);
    } else {
      const expected = Buffer.from(entry.sha256, "hex").toString("base64");
      assert.equal(record.checksumSha256, expected, `${entry.id} full-object checksum drifted`);
    }
  }
  return entries;
}

function invokeJson(args, env = process.env) {
  const output = execFileSync("aws", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  return output.trim() ? JSON.parse(output) : {};
}

function s3(invoke, env, args) {
  return invoke(["s3api", ...args, "--region", "ca-central-1", "--output", "json"], env);
}

function writeExclusive(file, bytes, mode) {
  assert.ok(path.isAbsolute(file), "attestation output paths must be absolute");
  assert.equal(pathExists(file), false, `${file} already exists`);
  writeFileSync(file, bytes, { flag: "wx", mode });
  const metadata = lstatSync(file);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${file} must remain a regular non-symlink file`);
  assert.equal(metadata.uid, process.getuid(), `${file} must be owner-owned`);
  assert.equal(metadata.mode & 0o777, mode, `${file} mode drifted`);
  assert.equal(metadata.nlink, 1, `${file} must not have hard-link aliases`);
}

export function captureQcFourthAttestation(plan, statePath, privateOutput, redactedOutput, dependencies = {}) {
  assert.notEqual(path.resolve(privateOutput), path.resolve(redactedOutput), "private and redacted outputs must differ");
  assert.equal(pathExists(privateOutput), false, "private output already exists");
  assert.equal(pathExists(redactedOutput), false, "redacted output already exists");
  const { bytes: stateBytes, state } = readPrivateState(statePath);
  const entries = validateCompletedState(plan, state);
  const invoke = dependencies.invoke || invokeJson;
  const env = dependencies.env || process.env;
  const createdAt = dependencies.createdAt || new Date().toISOString().replace(".000Z", "Z");
  const objects = entries.map((entry, index) => {
    const record = state.objects[entry.id];
    const readAt = dependencies.readAt || createdAt;
    const head = s3(invoke, env, ["head-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", record.versionId, "--checksum-mode", "ENABLED"]);
    assert.equal(head.ContentLength, entry.byteLength, `${entry.id} remote byte length drifted`);
    assert.equal(head.VersionId, record.versionId, `${entry.id} remote VersionId drifted`);
    assert.equal(head.ChecksumType, record.checksumType, `${entry.id} remote checksum type drifted`);
    assert.equal(head.ChecksumSHA256, record.checksumSha256, `${entry.id} remote checksum drifted`);
    const retention = s3(invoke, env, ["get-object-retention", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", record.versionId]);
    assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${entry.id} retention is not COMPLIANCE`);
    assert.equal(new Date(retention.Retention?.RetainUntilDate).toISOString(), new Date(RETAIN_UNTIL).toISOString(), `${entry.id} retention date drifted`);
    return {
      ordinal: index + 1,
      objectId: entry.id,
      objectKind: entry.id === "canonical-collection-manifest" ? "manifest" : entry.id.startsWith("sheet-") ? "payload" : "evidence",
      key: entry.objectKey,
      versionId: record.versionId,
      contentLength: entry.byteLength,
      checksum: { algorithm: "SHA256", type: record.checksumType, providerValue: record.checksumSha256 },
      headObjectReadAt: readAt,
      headResponseSha256: sha256(JSON.stringify(head)),
      retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, readAt, responseSha256: sha256(JSON.stringify(retention)) }
    };
  });
  const privateRecord = {
    schemaVersion: "witness-tree/qc-fourth-inventory-immutable-promotion-attestation-private/1",
    status: "owner-run-exact-version-readbacks-complete",
    provenance: {
      createdAt,
      captureCommand: "node scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs --capture --session-ready --state <mode-600-state> --private-output <new-mode-600-private-output> --redacted-output <new-public-output>",
      runnerSha256: sha256(readFileSync(new URL("./qc-fourth-inventory-immutable-promotion.mjs", import.meta.url))),
      captureScriptSha256: sha256(readFileSync(new URL(import.meta.url))),
      planSha256: sha256(JSON.stringify(plan)),
      stateFileSha256: sha256(stateBytes),
      authentication: "owner-supplied-temporary-mfa-role-session",
      operation: "read-only-exact-version-head-checksum-bytes-and-retention-capture"
    },
    destination: { bucket: plan.bucket, region: plan.region, retention: plan.retention },
    objects,
    claims: { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false }
  };
  const privateBytes = Buffer.from(`${JSON.stringify(privateRecord, null, 2)}\n`);
  const redactedRecord = redactQcFourthAttestation(privateRecord, privateBytes, plan);
  writeExclusive(privateOutput, privateBytes, 0o600);
  writeExclusive(redactedOutput, Buffer.from(`${JSON.stringify(redactedRecord, null, 2)}\n`), 0o600);
  validateQcFourthAttestationPair(privateOutput, redactedRecord, plan);
  return { privateRecord, redactedRecord };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  assert.ok(args.includes("--capture") && args.includes("--session-ready"), "Capture requires --capture --session-ready from the owner-local temporary MFA role-session runner");
  assert.ok(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN, "temporary MFA role-session credentials are required");
  const statePath = option(args, "--state"); const privateOutput = option(args, "--private-output"); const redactedOutput = option(args, "--redacted-output");
  assert.ok(statePath && privateOutput && redactedOutput, "Usage: --capture --session-ready --state <mode-600-state> --private-output <new-mode-600-private-output> --redacted-output <new-public-output>");
  captureQcFourthAttestation(loadQcFourthInventoryPromotionPreparation(), path.resolve(statePath), path.resolve(privateOutput), path.resolve(redactedOutput));
  console.log("QC fourth-inventory read-only post-run capture passed. Preserve the private mode-600 record outside Git and submit only its SHA-256 plus the identifier-free redacted record for independent review.");
}
