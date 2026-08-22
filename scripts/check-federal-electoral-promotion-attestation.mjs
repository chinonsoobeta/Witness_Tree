import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SHA256 = /^[a-f0-9]{64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ACCOUNT = "286853118812";
const OPERATOR = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const SOURCE = "elections-canada-federal-electoral-districts-45th-general-election-2025-shp";
const BYTES = 10301648;
const LOCAL_SHA = "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields drifted`);

function validateObject(value, label, expectedKey) {
  exactKeys(value, ["key", "versionId", "checksumCRC64NVME", "checksumType", "contentLength"], label);
  assert.equal(value.key, expectedKey);
  assert.match(value.versionId, /\S/);
  assert.match(value.checksumCRC64NVME, B64);
  assert.equal(value.checksumType, "FULL_OBJECT");
  assert.ok(Number.isSafeInteger(value.contentLength) && value.contentLength > 0);
}

export function validatePrivateFederalAttestation(value, plan) {
  const keys = plan.deterministicRemoteNames;
  exactKeys(value, ["schemaVersion", "createdAt", "operator", "artifact", "claims"], "private attestation");
  assert.equal(value.schemaVersion, "witness-tree/federal-electoral-promotion-attestation/1");
  assert.match(value.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  exactKeys(value.operator, ["Account", "Arn"], "operator");
  assert.deepEqual(value.operator, { Account: ACCOUNT, Arn: OPERATOR });
  exactKeys(value.artifact, ["sourceId", "byteLength", "localSha256", "payload", "manifest", "retention"], "artifact");
  assert.equal(value.artifact.sourceId, SOURCE);
  assert.equal(value.artifact.byteLength, BYTES);
  assert.equal(value.artifact.localSha256, LOCAL_SHA);
  validateObject(value.artifact.payload, "payload", keys.payloadKey);
  validateObject(value.artifact.manifest, "manifest", keys.manifestKey);
  assert.equal(value.artifact.payload.contentLength, BYTES);
  exactKeys(value.artifact.retention, ["mode", "retainUntil"], "retention");
  assert.deepEqual(value.artifact.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL });
  assert.deepEqual(value.claims, { transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false });
  return value;
}

export function redactFederalAttestation(value) {
  return {
    schemaVersion: "witness-tree/federal-electoral-promotion-attestation-redacted/1",
    createdAt: value.createdAt,
    status: "immutable-source-evidence-only",
    operator: { account: value.operator.Account, arnSha256: hash(value.operator.Arn) },
    artifact: {
      sourceId: value.artifact.sourceId,
      byteLength: value.artifact.byteLength,
      localSha256: value.artifact.localSha256,
      payload: { keySha256: hash(value.artifact.payload.key), versionIdSha256: hash(value.artifact.payload.versionId), checksumSha256: hash(value.artifact.payload.checksumCRC64NVME), checksumType: value.artifact.payload.checksumType, contentLength: value.artifact.payload.contentLength },
      manifest: { keySha256: hash(value.artifact.manifest.key), versionIdSha256: hash(value.artifact.manifest.versionId), checksumSha256: hash(value.artifact.manifest.checksumCRC64NVME), checksumType: value.artifact.manifest.checksumType, contentLength: value.artifact.manifest.contentLength },
      retention: value.artifact.retention,
    },
    claims: value.claims,
  };
}

export function validateRedactedFederalAttestation(value, plan) {
  const keys = plan.deterministicRemoteNames;
  exactKeys(value, ["schemaVersion", "createdAt", "status", "operator", "artifact", "claims"], "redacted attestation");
  assert.equal(value.schemaVersion, "witness-tree/federal-electoral-promotion-attestation-redacted/1");
  assert.match(value.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(value.status, "immutable-source-evidence-only");
  exactKeys(value.operator, ["account", "arnSha256"], "redacted operator");
  assert.equal(value.operator.account, ACCOUNT);
  assert.match(value.operator.arnSha256, SHA256);
  exactKeys(value.artifact, ["sourceId", "byteLength", "localSha256", "payload", "manifest", "retention"], "redacted artifact");
  assert.equal(value.artifact.sourceId, SOURCE);
  assert.equal(value.artifact.byteLength, BYTES);
  assert.equal(value.artifact.localSha256, LOCAL_SHA);
  assert.equal(value.artifact.payload.keySha256, hash(keys.payloadKey));
  assert.equal(value.artifact.manifest.keySha256, hash(keys.manifestKey));
  for (const item of [value.artifact.payload, value.artifact.manifest]) {
    exactKeys(item, ["keySha256", "versionIdSha256", "checksumSha256", "checksumType", "contentLength"], "redacted object");
    for (const field of ["keySha256", "versionIdSha256", "checksumSha256"]) assert.match(item[field], SHA256);
    assert.equal(item.checksumType, "FULL_OBJECT");
  }
  assert.equal(value.artifact.payload.contentLength, BYTES);
  assert.ok(Number.isSafeInteger(value.artifact.manifest.contentLength) && value.artifact.manifest.contentLength > 0);
  exactKeys(value.artifact.retention, ["mode", "retainUntil"], "redacted retention");
  assert.deepEqual(value.artifact.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL });
  exactKeys(value.claims, ["transformed", "ingested", "released", "productionAdmission", "productionEligible"], "redacted claims");
  assert.deepEqual(value.claims, { transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false });
  return value;
}

if (process.argv[1]?.endsWith("check-federal-electoral-promotion-attestation.mjs")) {
  try {
    const plan = JSON.parse(readFileSync(new URL("../data/elections-canada-fed-2025-promotion-preparation.json", import.meta.url)));
    const publicValue = JSON.parse(readFileSync(process.argv[2]));
    validateRedactedFederalAttestation(publicValue, plan);
    if (process.argv[3]) {
      const privateValue = validatePrivateFederalAttestation(JSON.parse(readFileSync(process.argv[3])), plan);
      assert.deepEqual(publicValue, redactFederalAttestation(privateValue));
    }
    console.log(process.argv[3] ? "Federal electoral attestation pair passed." : "Federal electoral redacted attestation passed; full verification requires the private pair.");
  } catch {
    console.error("Federal electoral attestation validation failed without exposing private values.");
    process.exitCode = 1;
  }
}
