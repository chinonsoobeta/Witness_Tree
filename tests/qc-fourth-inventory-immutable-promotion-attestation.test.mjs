import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { captureQcFourthAttestation } from "../scripts/capture-qc-fourth-inventory-immutable-promotion-attestation.mjs";
import { exactPromotionObjects } from "../scripts/check-qc-fourth-inventory-immutable-promotion.mjs";
import { sha256, validatePendingQcFourthAttestation, validateQcFourthAttestationPair } from "../scripts/check-qc-fourth-inventory-immutable-promotion-attestation.mjs";

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
  return { schemaVersion: 1, planSha256: sha256(JSON.stringify(plan)), bucket: plan.bucket, region: plan.region, retentionUntil: "2033-08-12T00:00:00Z", objects };
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
    if (operation === "head-object") return { ContentLength: overrides.contentLength ?? entry.byteLength, VersionId: record.versionId, ChecksumType: record.checksumType, ChecksumSHA256: overrides.checksum ?? record.checksumSha256 };
    if (operation === "get-object-retention") return { Retention: { Mode: overrides.retentionMode ?? "COMPLIANCE", RetainUntilDate: overrides.retainUntil ?? "2033-08-12T00:00:00Z" } };
    throw new Error(`Unexpected operation ${operation}`);
  };
  return { calls, invoke };
}

test("canonical fourth-inventory attestation remains explicitly pending", () => {
  assert.equal(validatePendingQcFourthAttestation(pending, plan), pending);
  assert.equal(pending.objectCount, 62);
  assert.equal(pending.claims.immutableObjectStorage, false);
});

test("read-only capture produces an exact 62-object private record and identifier-free digest-bound redaction", () => {
  const item = fixture(); const remote = readbackMock(item.state);
  try {
    const result = captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: { mocked: "true" }, createdAt: "2026-08-23T12:00:00Z" });
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
      assert.throws(() => captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: { mocked: "true" }, createdAt: "2026-08-23T12:00:00Z" }));
      assert.equal(existsSync(item.privatePath), false); assert.equal(existsSync(item.redactedPath), false);
    } finally { item.cleanup(); }
  }
});

test("pair validation rejects any public fact not derived from the exact private bytes", () => {
  const item = fixture(); const remote = readbackMock(item.state);
  try {
    captureQcFourthAttestation(plan, item.statePath, item.privatePath, item.redactedPath, { invoke: remote.invoke, env: { mocked: "true" }, createdAt: "2026-08-23T12:00:00Z" });
    const publicRecord = JSON.parse(readFileSync(item.redactedPath, "utf8")); publicRecord.objects[0].contentLength += 1;
    assert.throws(() => validateQcFourthAttestationPair(item.privatePath, publicRecord, plan), /not the exact identifier-free redaction/);
  } finally { item.cleanup(); }
});
