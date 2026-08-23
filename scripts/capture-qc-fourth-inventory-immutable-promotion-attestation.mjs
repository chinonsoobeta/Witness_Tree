import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { preflightLocal, recomputeMultipartPartChecksums } from "./qc-fourth-inventory-immutable-promotion.mjs";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation, qcFourthPlanDigests } from "./check-qc-fourth-inventory-immutable-promotion.mjs";
import { redactQcFourthAttestation, sha256, validateQcFourthAttestationPair } from "./check-qc-fourth-inventory-immutable-promotion-attestation.mjs";

const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const COMPOSITE_SHA256 = /^[A-Za-z0-9+/]{43}=-[1-9][0-9]*$/;
const ACCOUNT = "286853118812";
const OPERATOR_PROFILE = "WitnessTreeArchiveOperator";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/${OPERATOR_PROFILE}`;
const PROMOTION_ROLE = "WitnessTreeQcFourthArchivePromotionUploader";
const PROMOTION_ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/${PROMOTION_ROLE}`;
const ROLE_SESSION_NAME = "witness-tree-qc-fourth-approved-promotion";

function pathExists(file) {
  try { lstatSync(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function assertControlledDirectory(directory, label) {
  const metadata = lstatSync(directory);
  assert.ok(metadata.isDirectory() && !metadata.isSymbolicLink(), `${label} must be a non-symlink directory`);
  assert.equal(metadata.uid, process.getuid(), `${label} must be owner-owned`);
  assert.equal(metadata.mode & 0o777, 0o700, `${label} must be mode 700`);
  return path.resolve(directory);
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

function exactUtc(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function normalizeIdentity(identity, environment, createdAt) {
  assert.ok(identity && typeof identity === "object", "The owner-local wrapper did not return an STS identity.");
  assert.equal(identity.Account, ACCOUNT, "The owner-local MFA session is outside the approved AWS account.");
  assert.equal(typeof identity.Arn, "string", "The owner-local role identity ARN is missing.");
  const rolePattern = new RegExp(`^arn:aws:sts::${ACCOUNT}:assumed-role/${PROMOTION_ROLE}/([A-Za-z0-9+=,.@_-]+)$`);
  const match = identity.Arn.match(rolePattern);
  assert.ok(match, "The owner-local MFA session is not the exact approved promotion role.");
  const rawSessionExpiry = environment?.WITNESS_TREE_SESSION_EXPIRES_AT;
  assert.ok(typeof rawSessionExpiry === "string" && Number.isFinite(Date.parse(rawSessionExpiry)), "The owner-local MFA wrapper did not provide a valid session expiry.");
  const sessionExpiresAt = new Date(rawSessionExpiry).toISOString().replace(/\.\d{3}Z$/, "Z");
  assert.ok(exactUtc(sessionExpiresAt), "The owner-local MFA wrapper session expiry could not be normalized to exact UTC.");
  assert.ok(Date.parse(sessionExpiresAt) > Date.parse(createdAt), "The owner-local MFA role session expires before capture.");
  assert.equal(environment?.WITNESS_TREE_SESSION_VERIFIED, "1", "The owner-local MFA wrapper did not attest its exact session.");
  assert.equal(environment?.WITNESS_TREE_OPERATOR_ARN, OPERATOR_ARN, "The owner-local wrapper did not attest the approved operator.");
  assert.equal(environment?.WITNESS_TREE_ROLE_ARN, PROMOTION_ROLE_ARN, "The owner-local wrapper did not attest the approved role.");
  assert.equal(environment?.WITNESS_TREE_ROLE_SESSION_NAME, match[1], "The owner-local wrapper role-session name does not match STS.");
  assert.equal(environment?.WITNESS_TREE_MFA_PRESENT, "true", "The owner-local wrapper did not attest MFA presence.");
  assert.ok(typeof identity.UserId === "string" && identity.UserId.length > 0, "The STS role identity UserId is missing.");
  return { account: identity.Account, operatorArn: OPERATOR_ARN, roleArn: PROMOTION_ROLE_ARN, roleSessionName: match[1], assumedRoleArn: identity.Arn, userId: identity.UserId, mfaPresent: true, sessionExpiresAt };
}

function validateCompletedState(plan, state) {
  const digests = qcFourthPlanDigests(plan);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.planSha256, digests.planParsedSha256);
  assert.equal(state.planParsedSha256, digests.planParsedSha256);
  assert.equal(state.planFileSha256, digests.planFileSha256);
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

function localPreflightEvidence(plan, dependencies) {
  if (dependencies.localPreflight) return dependencies.localPreflight;
  assert.ok(dependencies.dataRoot, "Capture requires the owner-controlled --data-root for local preflight.");
  assert.ok(dependencies.sidecarDir, "Capture requires the owner-controlled --sidecar-dir for canonical manifest verification.");
  const result = preflightLocal(plan, { execute: false, dataRoot: path.resolve(dependencies.dataRoot) });
  const manifestPath = path.join(assertControlledDirectory(path.resolve(dependencies.sidecarDir), "sidecar directory"), "collection-manifest.json");
  const metadata = lstatSync(manifestPath);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "canonical sidecar must be a regular non-symlink file");
  assert.equal(metadata.uid, process.getuid(), "canonical sidecar must be owner-owned");
  assert.equal(metadata.mode & 0o777, 0o600, "canonical sidecar must be mode 600");
  assert.equal(metadata.nlink, 1, "canonical sidecar must not have hard-link aliases");
  assert.deepEqual(readFileSync(manifestPath), result.manifestBytes, "canonical sidecar bytes drifted");
  const sourceById = new Map(result.sources.map((entry) => [entry.id, entry]));
  const multipart = exactPromotionObjects(plan)
    .filter((entry) => entry.byteLength > plan.upload.multipartThresholdBytes)
    .map((entry) => {
      const source = sourceById.get(entry.id);
      assert.ok(source, `${entry.id} is missing from local preflight sources`);
      const recomputed = recomputeMultipartPartChecksums(source, plan.upload.partSizeBytes);
      return { objectId: entry.id, partSizeBytes: recomputed.partSizeBytes, partCount: recomputed.partCount, compositeChecksumSha256: recomputed.compositeChecksumSha256, parts: recomputed.parts };
    });
  return {
    dataRootName: "Witness_Tree-data",
    sourceCount: result.sources.length,
    payloadCount: plan.archiveSet.count,
    evidenceCount: plan.evidenceArtifacts.length,
    sourceBytes: result.sources.reduce((sum, entry) => sum + entry.byteLength, 0),
    manifest: { byteLength: result.manifestBytes.length, sha256: sha256(result.manifestBytes) },
    multipart
  };
}

function identityReadback(invoke, env) {
  return invoke(["sts", "get-caller-identity", "--output", "json"], env);
}

function writeExclusive(file, bytes, mode) {
  assert.ok(path.isAbsolute(file), "attestation output paths must be absolute");
  assert.equal(pathExists(file), false, `${file} already exists`);
  const staged = `${file}.next`;
  assert.equal(pathExists(staged), false, `${file} temporary path already exists`);
  writeFileSync(staged, bytes, { flag: "wx", mode });
  const metadata = lstatSync(staged);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${file} must remain a regular non-symlink file`);
  assert.equal(metadata.uid, process.getuid(), `${file} must be owner-owned`);
  assert.equal(metadata.mode & 0o777, mode, `${file} mode drifted`);
  assert.equal(metadata.nlink, 1, `${file} must not have hard-link aliases`);
  return staged;
}

function publishPair(privateOutput, privateBytes, redactedOutput, redactedBytes) {
  assert.notEqual(path.resolve(privateOutput), path.resolve(redactedOutput), "private and redacted outputs must differ");
  let privateStaged;
  let redactedStaged;
  try {
    privateStaged = writeExclusive(privateOutput, privateBytes, 0o600);
    redactedStaged = writeExclusive(redactedOutput, redactedBytes, 0o600);
  } catch (error) {
    for (const staged of [privateStaged, redactedStaged]) {
      if (!staged) continue;
      try { unlinkSync(staged); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    throw error;
  }
  let privatePublished = false;
  let redactedPublished = false;
  try {
    // link(2) refuses an output that appeared after the precheck; rename(2)
    // would replace it during that race.
    linkSync(privateStaged, privateOutput);
    privatePublished = true;
    unlinkSync(privateStaged);
    linkSync(redactedStaged, redactedOutput);
    redactedPublished = true;
    unlinkSync(redactedStaged);
  } catch (error) {
    try { unlinkSync(privateStaged); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    try { unlinkSync(redactedStaged); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    if (privatePublished) {
      try { unlinkSync(privateOutput); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    if (redactedPublished) {
      try { unlinkSync(redactedOutput); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    throw error;
  }
}

export function captureQcFourthAttestation(plan, statePath, privateOutput, redactedOutput, dependencies = {}) {
  assert.notEqual(path.resolve(privateOutput), path.resolve(redactedOutput), "private and redacted outputs must differ");
  assertControlledDirectory(path.dirname(path.resolve(statePath)), "promotion state parent");
  assertControlledDirectory(path.dirname(path.resolve(privateOutput)), "private attestation parent");
  assertControlledDirectory(path.dirname(path.resolve(redactedOutput)), "redacted attestation parent");
  assert.equal(pathExists(privateOutput), false, "private output already exists");
  assert.equal(pathExists(redactedOutput), false, "redacted output already exists");
  const { bytes: stateBytes, state } = readPrivateState(statePath);
  const entries = validateCompletedState(plan, state);
  const invoke = dependencies.invoke || invokeJson;
  const env = dependencies.env || process.env;
  const createdAt = dependencies.createdAt || new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const localPreflight = localPreflightEvidence(plan, dependencies);
  const identityFacts = normalizeIdentity(dependencies.identity || identityReadback(invoke, env), env, createdAt);
  const localMultipartById = new Map(localPreflight.multipart.map((item) => [item.objectId, item]));
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
    const localMultipart = localMultipartById.get(entry.id);
    return {
      ordinal: index + 1,
      objectId: entry.id,
      objectKind: entry.id === "canonical-collection-manifest" ? "manifest" : entry.id.startsWith("sheet-") ? "payload" : "evidence",
      key: entry.objectKey,
      versionId: record.versionId,
      contentLength: entry.byteLength,
      checksum: { algorithm: "SHA256", type: record.checksumType, providerValue: record.checksumSha256 },
      ...(localMultipart ? { localMultipartVerification: { partSizeBytes: localMultipart.partSizeBytes, partCount: localMultipart.partCount, parts: localMultipart.parts.map(({ partNumber, byteLength, checksumSha256 }) => ({ partNumber, byteLength, checksumSha256 })), compositeChecksumSha256: localMultipart.compositeChecksumSha256 } } : {}),
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
      captureCommand: "scripts/run-qc-fourth-inventory-approved-promotion.sh --capture --state <mode-600-state> --data-root <Witness_Tree-data> --sidecar-dir <mode-700-sidecars> --private-output <new-mode-600-private-output> --redacted-output <new-public-output>",
      runnerSha256: sha256(readFileSync(new URL("./qc-fourth-inventory-immutable-promotion.mjs", import.meta.url))),
      captureScriptSha256: sha256(readFileSync(new URL(import.meta.url))),
      planSha256: qcFourthPlanDigests(plan).planParsedSha256,
      planFileSha256: qcFourthPlanDigests(plan).planFileSha256,
      planParsedSha256: qcFourthPlanDigests(plan).planParsedSha256,
      stateFileSha256: sha256(stateBytes),
      authentication: "owner-local-mfa-role-session-wrapper",
      identity: identityFacts,
      operation: "read-only-exact-version-head-checksum-bytes-and-retention-capture"
    },
    destination: { bucket: plan.bucket, region: plan.region, retention: plan.retention },
    localPreflight: { ...localPreflight, multipart: localPreflight.multipart.map(({ objectId, partSizeBytes, partCount, compositeChecksumSha256 }) => ({ objectId, partSizeBytes, partCount, compositeChecksumSha256 })) },
    objects,
    claims: { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false }
  };
  const privateBytes = Buffer.from(`${JSON.stringify(privateRecord, null, 2)}\n`);
  const redactedRecord = redactQcFourthAttestation(privateRecord, privateBytes, plan);
  publishPair(privateOutput, privateBytes, redactedOutput, Buffer.from(`${JSON.stringify(redactedRecord, null, 2)}\n`));
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
  const statePath = option(args, "--state"); const privateOutput = option(args, "--private-output"); const redactedOutput = option(args, "--redacted-output"); const dataRoot = option(args, "--data-root"); const sidecarDir = option(args, "--sidecar-dir");
  assert.ok(statePath && privateOutput && redactedOutput && dataRoot && sidecarDir, "Usage: --capture --session-ready --state <mode-600-state> --data-root <owner-controlled-Witness_Tree-data> --sidecar-dir <owner-controlled-mode-700-dir> --private-output <new-mode-600-private-output> --redacted-output <new-public-output>");
  captureQcFourthAttestation(loadQcFourthInventoryPromotionPreparation(), path.resolve(statePath), path.resolve(privateOutput), path.resolve(redactedOutput), { dataRoot: path.resolve(dataRoot), sidecarDir: path.resolve(sidecarDir), env: process.env });
  console.log("QC fourth-inventory read-only post-run capture passed. Preserve the private mode-600 record outside Git and submit only its SHA-256 plus the identifier-free redacted record for independent review.");
}
