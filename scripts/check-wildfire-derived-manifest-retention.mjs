#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { ACCOUNT, BUCKET, PROFILE, REGION, RETAIN_UNTIL, ROLE, expectedObjects } from "./check-wildfire-derived-recovery.mjs";
import { validateLocalArtifacts } from "./check-wildfire-derived-readback.mjs";

export const APPROVAL_SCHEMA = "witness-tree/wildfire-derived-manifest-retention-approval/1";
export const EVIDENCE_SCHEMA = "witness-tree/wildfire-derived-manifest-retention-evidence/1";
const names = Object.freeze(["bcPayload", "bcManifest", "ontarioPayload", "ontarioManifest"]);
const manifestNames = Object.freeze(["bcManifest", "ontarioManifest"]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const validVersion = (value) => typeof value === "string" && value.length > 0 && value.length <= 1024 && !/\s/.test(value);
const validCrc64 = (value) => typeof value === "string" && /^[A-Za-z0-9+/]{11}=$/.test(value);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const sorted = (value) => [...value].sort();

export function approvalTemplate() {
  return {
    schemaVersion: APPROVAL_SCHEMA, status: "owner-pending", approved: false,
    account: ACCOUNT, role: ROLE, profile: PROFILE, region: REGION, bucket: BUCKET,
    retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL },
    targetObjectNames: [...manifestNames],
    exclusions: ["no-upload", "no-overwrite", "no-delete", "no-multipart", "no-legal-hold", "no-bypass-governance", "no-other-key", "no-iam-change", "no-production-inference", "no-phase2"],
    productionEligible: false, phase2: false
  };
}

export function validateApproval(value) {
  const expected = approvalTemplate();
  assert.deepEqual(sorted(Object.keys(value ?? {})), sorted(Object.keys(expected)), "manifest-retention approval contains an unexpected field");
  assert.equal(value.schemaVersion, APPROVAL_SCHEMA, "manifest-retention approval schema is not recognized");
  assert.equal(value.status, "owner-approved", "explicit manifest-retention approval is absent");
  assert.equal(value.approved, true, "explicit manifest-retention approval is absent");
  for (const key of Object.keys(expected)) if (!["schemaVersion", "status", "approved"].includes(key)) assert.deepEqual(value[key], expected[key], `manifest-retention approval ${key} is not exact`);
  return true;
}

export function validateHead(head, name) {
  const expected = expectedObjects()[name];
  assert.ok(expected, "object is outside the exact manifest-retention scope");
  assert.equal(head?.ContentLength, expected.byteLength, `${name} byte length is not exact`);
  assert.equal(head?.ChecksumType, "FULL_OBJECT", `${name} checksum type is not FULL_OBJECT`);
  assert.equal(validCrc64(head?.ChecksumCRC64NVME), true, `${name} CRC64NVME is absent or malformed`);
  assert.equal(validVersion(head?.VersionId), true, `${name} concrete version is absent`);
  return true;
}

export function validateRetention(value, name) {
  assert.ok(names.includes(name), "retention readback is outside the exact four objects");
  assert.equal(value?.Retention?.Mode, "COMPLIANCE", `${name} retention mode is not COMPLIANCE`);
  assert.equal(Date.parse(value?.Retention?.RetainUntilDate ?? ""), Date.parse(RETAIN_UNTIL), `${name} retention date is not exact`);
  return true;
}

export function buildEvidence(approval, heads, retentions) {
  validateApproval(approval);
  assert.deepEqual(sorted(Object.keys(heads ?? {})), sorted(names), "evidence heads are not the exact four objects");
  assert.deepEqual(sorted(Object.keys(retentions ?? {})), sorted(names), "evidence retention is not the exact four objects");
  for (const name of names) validateHead(heads[name], name);
  for (const name of names) validateRetention(retentions[name], name);
  return {
    schemaVersion: EVIDENCE_SCHEMA, status: "completed", account: ACCOUNT, role: ROLE, profile: PROFILE, region: REGION, bucket: BUCKET,
    retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, objectNames: [...manifestNames] },
    objects: Object.fromEntries(names.map((name) => [name, { key: expectedObjects()[name].key, byteLength: heads[name].ContentLength, checksumType: heads[name].ChecksumType, versionSha256: sha256(heads[name].VersionId), checksumCrc64nvmeSha256: sha256(heads[name].ChecksumCRC64NVME) }])),
    objectRetention: Object.fromEntries(names.map((name) => [name, { mode: retentions[name].Retention.Mode, retainUntil: retentions[name].Retention.RetainUntilDate }])),
    exclusions: approval.exclusions, productionEligible: false, phase2: false
  };
}

export function validateEvidence(evidence, approval) {
  validateApproval(approval);
  assert.deepEqual(sorted(Object.keys(evidence ?? {})), sorted(["schemaVersion", "status", "account", "role", "profile", "region", "bucket", "retention", "objects", "objectRetention", "exclusions", "productionEligible", "phase2"]), "manifest-retention evidence contains an unexpected field");
  assert.equal(evidence.schemaVersion, EVIDENCE_SCHEMA, "manifest-retention evidence schema is not recognized");
  assert.equal(evidence.status, "completed", "manifest-retention evidence is not complete");
  for (const key of ["account", "role", "profile", "region", "bucket"]) assert.equal(evidence[key], approval[key], `manifest-retention evidence ${key} is not exact`);
  assert.deepEqual(evidence.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, objectNames: [...manifestNames] }, "manifest-retention evidence target scope is not exact");
  assert.deepEqual(sorted(Object.keys(evidence.objects ?? {})), sorted(names), "manifest-retention evidence objects are not exact");
  assert.deepEqual(sorted(Object.keys(evidence.objectRetention ?? {})), sorted(names), "manifest-retention evidence retention rows are not exact");
  const expected = expectedObjects();
  for (const name of names) {
    const object = evidence.objects[name];
    assert.deepEqual(sorted(Object.keys(object ?? {})), sorted(["key", "byteLength", "checksumType", "versionSha256", "checksumCrc64nvmeSha256"]), `${name} evidence fields are not exact`);
    assert.equal(object.key, expected[name].key, `${name} evidence key is not exact`);
    assert.equal(object.byteLength, expected[name].byteLength, `${name} evidence byte length is not exact`);
    assert.equal(object.checksumType, "FULL_OBJECT", `${name} evidence checksum type is not exact`);
    assert.match(object.versionSha256, /^[a-f0-9]{64}$/, `${name} version digest is malformed`);
    assert.match(object.checksumCrc64nvmeSha256, /^[a-f0-9]{64}$/, `${name} provider checksum digest is malformed`);
    assert.equal(evidence.objectRetention[name]?.mode, "COMPLIANCE", `${name} evidence retention mode is not exact`);
    assert.equal(Date.parse(evidence.objectRetention[name]?.retainUntil ?? ""), Date.parse(RETAIN_UNTIL), `${name} evidence retention instant is not exact`);
  }
  assert.deepEqual(evidence.exclusions, approval.exclusions, "manifest-retention evidence exclusions changed");
  assert.equal(evidence.productionEligible, false, "manifest-retention evidence cannot authorize production");
  assert.equal(evidence.phase2, false, "manifest-retention evidence cannot authorize Phase 2");
  return true;
}

export function writeEvidence(path, evidence) {
  assert.equal(isAbsolute(path), true, "evidence path must be absolute");
  assert.equal(existsSync(path), false, "evidence path already exists; refusing overwrite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  chmodSync(temporary, 0o600); renameSync(temporary, path);
  assert.equal(statSync(path).mode & 0o777, 0o600, "evidence is not mode 600");
}

function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "--approval-template") return console.log(`${JSON.stringify(approvalTemplate(), null, 2)}\n`);
  if (mode === "--preflight") { validateApproval(read(args[0])); validateLocalArtifacts(args[1]); return console.log("Exact manifest-retention approval and local artifacts passed."); }
  if (mode === "--validate-head") { validateHead(read(args[0]), args[1]); return console.log("Exact manifest versioned head passed."); }
  if (mode === "--validate-retention") { validateRetention(read(args[0]), args[1]); return console.log("Exact manifest COMPLIANCE retention passed."); }
  if (mode === "--evidence") { validateEvidence(read(args[1]), read(args[0])); return console.log("Redacted derived-wildfire manifest-retention evidence passed."); }
  if (mode === "--write-evidence") {
    const [approvalPath, bcPayload, bcManifest, onPayload, onManifest, bcPayloadRetention, bcManifestRetention, onPayloadRetention, onManifestRetention, output] = args;
    const evidence = buildEvidence(read(approvalPath), { bcPayload: read(bcPayload), bcManifest: read(bcManifest), ontarioPayload: read(onPayload), ontarioManifest: read(onManifest) }, { bcPayload: read(bcPayloadRetention), bcManifest: read(bcManifestRetention), ontarioPayload: read(onPayloadRetention), ontarioManifest: read(onManifestRetention) });
    writeEvidence(output, evidence); return console.log("Redacted manifest-retention evidence written owner-only mode 600.");
  }
  throw new Error("usage");
}
if (process.argv[1]?.endsWith("check-wildfire-derived-manifest-retention.mjs")) { try { main(); } catch { console.error("Derived wildfire manifest-retention check failed closed; no AWS mutation was authorized."); process.exitCode = 65; } }
