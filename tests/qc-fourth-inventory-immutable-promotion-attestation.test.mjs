import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { captureQcFourthAttestation } from "../scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs";
import { exactPromotionObjects, qcFourthPlanDigests } from "../scripts/check-qc-fourth-inventory-immutable-promotion.mjs";
import { validatePendingQcFourthAttestation, validateQcFourthAttestationPair } from "../scripts/check-qc-fourth-inventory-immutable-promotion-attestation.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const pending = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-attestation.json", import.meta.url), "utf8"));

function completedState() {
  const objects = {};
  for (const [index, entry] of exactPromotionObjects(plan).entries()) {
    const base = { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, complete: true, versionId: `opaque-v-${String(index + 1).padStart(4, "0")}` };
    if (entry.byteLength > plan.upload.multipartThresholdBytes) {
      const partCount = Math.ceil(entry.byteLength / plan.upload.partSizeBytes);
      const parts = Array.from({ length: partCount }, (_, partIndex) => ({ partNumber: partIndex + 1, etag: `etag-${index + 1}-${partIndex + 1}`, checksumSha256: createHash("sha256").update(`${entry.id}:${partIndex + 1}`).digest("base64") }));
      const composite = `${createHash("sha256").update(Buffer.concat(parts.map((part) => Buffer.from(part.checksumSha256, "base64")))).digest("base64")}-${partCount}`;
      objects[entry.id] = { ...base, method: "multipart", uploadId: `private-upload-${index + 1}`, parts, partSizeBytes: plan.upload.partSizeBytes, partCount, checksumType: "COMPOSITE", checksumSha256: composite, expectedChecksumSha256: composite };
    } else {
      objects[entry.id] = { ...base, method: "single-put", checksumType: "FULL_OBJECT", checksumSha256: Buffer.from(entry.sha256, "hex").toString("base64") };
    }
  }
  const digests = qcFourthPlanDigests(plan);
  const promotionSessions = [{ account: "286853118812", operatorArn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", roleArn: "arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader", roleSessionName: "witness-tree-qc-fourth-approved-promotion", assumedRoleArn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeQcFourthArchivePromotionUploader/witness-tree-qc-fourth-approved-promotion", roleUserId: "AROA_PROMOTION:witness-tree-qc-fourth-approved-promotion", mfaSerialArn: "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator", mfaPresent: true, sessionExpiresAt: "2026-08-23T13:00:00.000Z" }];
  return { schemaVersion: 1, planSha256: digests.planParsedSha256, planFileSha256: digests.planFileSha256, planParsedSha256: digests.planParsedSha256, bucket: plan.bucket, region: plan.region, retentionUntil: "2033-08-12T00:00:00Z", promotionSessions, objects };
}

function fixture() {
  const workspace = mkdtempSync(path.join(tmpdir(), "qc-fourth-attestation-"));
  const statePath = path.join(workspace, "state.json");
  const privatePath = path.join(workspace, "private.json");
  const redactedPath = path.join(workspace, "redacted.json");
  const state = completedState();
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 }); chmodSync(statePath, 0o600);
  return { workspace, state, statePath, privatePath, redactedPath, cleanup: () => rmSync(workspace, { recursive: true, force: true }) };
}

function readbackMock(state, overrides = {}) {
  const calls = [];
  const byKey = new Map(exactPromotionObjects(plan).map((entry) => [entry.objectKey, entry]));
  const value = (args, name) => args[args.indexOf(name) + 1];
  const invoke = (args) => {
    const operation = args[1]; const key = value(args, "--key"); const entry = byKey.get(key); const record = state.objects[entry.id]; calls.push({ operation, key });
    overrides.onCall?.({ operation, key, callCount: calls.length });
    if (operation === "head-object") return { ContentLength: overrides.contentLength ?? entry.byteLength, VersionId: record.versionId, ChecksumType: record.checksumType, ChecksumSHA256: overrides.checksum ?? record.checksumSha256 };
    if (operation === "get-object-retention") return { Retention: { Mode: overrides.retentionMode ?? "COMPLIANCE", RetainUntilDate: overrides.retainUntil ?? "2033-08-12T00:00:00Z" } };
    throw new Error(`Unexpected operation ${operation}`);
  };
  return { calls, invoke };
}

function localPreflight(state) {
  const multipart = exactPromotionObjects(plan).filter((entry) => entry.byteLength > plan.upload.multipartThresholdBytes).map((entry) => {
    const parts = state.objects[entry.id].parts.map((part, index) => ({ partNumber: part.partNumber, byteLength: Math.min(plan.upload.partSizeBytes, entry.byteLength - index * plan.upload.partSizeBytes), checksumSha256: part.checksumSha256 }));
    return { objectId: entry.id, partSizeBytes: plan.upload.partSizeBytes, partCount: parts.length, compositeChecksumSha256: state.objects[entry.id].checksumSha256, parts };
  });
  return { dataRootName: "Witness_Tree-data", sourceCount: 61, payloadCount: 56, evidenceCount: 5, sourceBytes: 16177306782, manifest: { byteLength: plan.canonicalManifest.byteLength, sha256: plan.canonicalManifest.sha256 }, multipart };
}

const identity = {
  Account: "286853118812",
  Arn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeQcFourthArchivePromotionUploader/witness-tree-qc-fourth-approved-promotion",
  UserId: "AROAEXAMPLE:witness-tree-qc-fourth-approved-promotion"
};
const captureEnv = {
  WITNESS_TREE_SESSION_VERIFIED: "1",
  WITNESS_TREE_OPERATOR_ARN: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
  WITNESS_TREE_ROLE_ARN: "arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader",
  WITNESS_TREE_ROLE_SESSION_NAME: "witness-tree-qc-fourth-approved-promotion",
  WITNESS_TREE_SESSION_EXPIRES_AT: "2026-08-23T13:00:00Z",
  WITNESS_TREE_MFA_PRESENT: "true",
  WITNESS_TREE_ASSUMED_ROLE_ARN: identity.Arn,
  WITNESS_TREE_ROLE_USER_ID: identity.UserId,
  WITNESS_TREE_MFA_SERIAL_ARN: "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator"
};

test("canonical fourth-inventory attestation remains explicitly pending", () => {
  assert.equal(validatePendingQcFourthAttestation(pending, plan), pending);
  assert.equal(pending.objectCount, 62);
  assert.equal(pending.claims.immutableObjectStorage, false);
});

test("read-only capture produces an exact 62-object private record and identifier-free digest-bound redaction", () => {
  const item = fixture(); const remote = readbackMock(item.state);
  try {
    const result = captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" });
    assert.equal(result.privateRecord.objects.length, 62);
    assert.equal(remote.calls.filter((call) => call.operation === "head-object").length, 62);
    assert.equal(remote.calls.filter((call) => call.operation === "get-object-retention").length, 62);
    const publicRecord = JSON.parse(readFileSync(item.redactedPath, "utf8"));
    assert.equal(validateQcFourthAttestationPair(item.privatePath, publicRecord, plan).publicRecord, publicRecord);
    const publicBytes = JSON.stringify(publicRecord);
    for (const object of result.privateRecord.objects) {
      assert.equal(publicBytes.includes(object.key), false);
      assert.equal(publicBytes.includes(object.versionId), false);
      assert.equal(publicBytes.includes(object.checksum.providerValue), false);
    }
    assert.equal(publicBytes.includes("private-upload-"), false);
    assert.equal(publicBytes.includes("arn:aws"), false);
    assert.equal(publicRecord.claims.immutableObjectStorage, false);
  } finally { item.cleanup(); }
});

test("capture rejects byte, checksum, and retention drift before publishing either output", () => {
  for (const overrides of [{ contentLength: 1 }, { checksum: Buffer.alloc(32, 0x11).toString("base64") }, { retentionMode: "GOVERNANCE" }, { retainUntil: "2032-08-12T00:00:00Z" }]) {
    const item = fixture(); const remote = readbackMock(item.state, overrides);
    try {
      assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" }));
      assert.equal(existsSync(item.privatePath), false); assert.equal(existsSync(item.redactedPath), false);
    } finally { item.cleanup(); }
  }
});

test("pair validation rejects any public fact not derived from the exact private bytes", () => {
  const item = fixture(); const remote = readbackMock(item.state);
  try {
    captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" });
    const publicRecord = JSON.parse(readFileSync(item.redactedPath, "utf8")); publicRecord.objects[0].contentLength += 1;
    assert.throws(() => validateQcFourthAttestationPair(item.privatePath, publicRecord, plan), /not the exact identifier-free redaction/);
  } finally { item.cleanup(); }
});

test("paired publication loses an output race transactionally without overwriting the winner or leaving a private half-pair", () => {
  const item = fixture();
  const remote = readbackMock(item.state, { onCall: ({ callCount }) => {
    if (callCount === 124) writeFileSync(item.redactedPath, "competing-output\n", { flag: "wx", mode: 0o600 });
  } });
  try {
    assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" }), /private output was rolled back/);
    assert.equal(existsSync(item.privatePath), false);
    assert.equal(readFileSync(item.redactedPath, "utf8"), "competing-output\n");
    assert.equal(existsSync(`${item.privatePath}.next`), false);
    assert.equal(existsSync(`${item.redactedPath}.next`), false);
  } finally { item.cleanup(); }
});

test("publication refuses symlinks and preserves rename and hard-link race evidence", () => {
  {
    const item = fixture(); const target = path.join(item.workspace, "target.json"); writeFileSync(target, "secret-target\n", { mode: 0o600 }); symlinkSync(target, item.privatePath);
    try {
      assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: readbackMock(item.state).invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" }), /private output already exists/);
      assert.equal(readFileSync(target, "utf8"), "secret-target\n"); assert.equal(existsSync(item.redactedPath), false);
    } finally { item.cleanup(); }
  }
  for (const race of ["rename", "hardlink"]) {
    const item = fixture(); const evidence = path.join(item.workspace, `${race}-evidence.json`);
    try {
      const beforeVerify = (output) => {
        if (race === "rename") { renameSync(output, evidence); writeFileSync(output, "racing-replacement\n", { flag: "wx", mode: 0o600 }); }
        else linkSync(output, evidence);
      };
      assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: readbackMock(item.state).invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z", publicationHooks: { private: { beforeVerify } } }), /rollback was not proved/);
      assert.equal(existsSync(evidence), true); assert.equal(existsSync(item.privatePath), true); assert.equal(existsSync(item.redactedPath), false);
      if (race === "rename") assert.equal(readFileSync(item.privatePath, "utf8"), "racing-replacement\n");
    } finally { item.cleanup(); }
  }
});

test("publication fsync, close, and rollback crash points never yield an accepted half-pair", () => {
  for (const hooks of [
    { private: { onFsyncStage: (stage) => { if (stage === "file") throw new Error("simulated crash"); } } },
    { redacted: { onFsyncStage: (stage) => { if (stage === "directory") throw new Error("simulated crash"); } } },
    { redacted: { failClose: (stage) => stage === "output" } }
  ]) {
    const item = fixture();
    try {
      assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: readbackMock(item.state).invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z", publicationHooks: hooks }));
      assert.equal(existsSync(item.privatePath), false); assert.equal(existsSync(item.redactedPath), false);
    } finally { item.cleanup(); }
  }
});

test("pair rollback never unlinks a racing replacement", () => {
  const item = fixture(); const moved = path.join(item.workspace, "owned-private-evidence.json");
  try {
    const hooks = {
      redacted: { beforeOpen: (output) => writeFileSync(output, "competing-redacted\n", { flag: "wx", mode: 0o600 }) },
      rollback: { beforeRollback: (output) => { renameSync(output, moved); writeFileSync(output, "racing-private\n", { flag: "wx", mode: 0o600 }); } }
    };
    assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: readbackMock(item.state).invoke, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z", publicationHooks: hooks }), /private rollback was not proved/);
    assert.equal(readFileSync(item.privatePath, "utf8"), "racing-private\n"); assert.equal(existsSync(moved), true); assert.equal(readFileSync(item.redactedPath, "utf8"), "competing-redacted\n");
  } finally { item.cleanup(); }
});

test("provider errors cannot leak raw text or opaque identifiers", () => {
  const item = fixture(); const secret = "SECRET_PROVIDER_REQUEST_ID_opaque-123";
  try {
    let error;
    try { captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: () => { throw new Error(secret); }, env: captureEnv, identity, localPreflight: localPreflight(item.state), createdAt: "2026-08-23T12:00:00Z" }); } catch (caught) { error = caught; }
    assert.ok(error); assert.equal(String(error).includes(secret), false); assert.equal(String(error.stack).includes(secret), false);
    assert.equal(existsSync(item.privatePath), false); assert.equal(existsSync(item.redactedPath), false);
  } finally { item.cleanup(); }
});
