import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { manifestKey, sidecarFor, validate as validatePlan } from "./prepare-wildfire-derived-immutable-promotion.mjs";

const PLAN = validatePlan();
export const READBACK_SCHEMA = "witness-tree/wildfire-derived-readback-approval/1";
export const ACCOUNT = "286853118812";
export const PROFILE = PLAN.mfaGatedExecution.operatorProfile;
export const ROLE = PLAN.mfaGatedExecution.proposedRole;
export const REGION = PLAN.destination.region;
export const BUCKET = PLAN.destination.bucket;
export const RETAIN_UNTIL = PLAN.mfaGatedExecution.recommendedRetainUntil;
export const DEFAULT_DATA_ROOT = "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data";

const EXCLUSIONS = Object.freeze([
  "no-mpu-listing",
  "no-mpu-completion",
  "no-upload",
  "no-sidecar-rewrite",
  "no-delete",
  "no-replication",
  "no-bypass-governance",
  "no-legal-hold",
  "no-iam-change",
  "no-production-inference",
  "no-phase2"
]);

const expectedArtifacts = (plan = PLAN) => plan.artifacts.map((artifact) => ({
  id: artifact.id,
  sourceId: artifact.sourceId,
  featureCount: artifact.featureCount,
  byteLength: artifact.byteLength,
  sha256: artifact.sha256,
  payloadKey: artifact.payloadKey,
  manifestKey: manifestKey(artifact),
  manifestByteLength: Buffer.byteLength(sidecarFor(artifact)),
  manifestSha256: createHash("sha256").update(sidecarFor(artifact)).digest("hex")
}));

export function approvalTemplate(plan = PLAN) {
  return {
    schemaVersion: READBACK_SCHEMA,
    approved: true,
    account: ACCOUNT,
    role: ROLE,
    profile: PROFILE,
    region: REGION,
    bucket: BUCKET,
    retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL, payloadsAndManifests: true },
    artifacts: expectedArtifacts(plan),
    exclusions: [...EXCLUSIONS],
    productionEligible: false,
    phase2: false
  };
}

function sorted(value) {
  return [...value].sort();
}

function validCrc64(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/]{11}=$/.test(value);
}

function expectedApprovalKeys() {
  return ["approved", "artifacts", "bucket", "account", "exclusions", "phase2", "profile", "productionEligible", "region", "retention", "role", "schemaVersion"];
}

export function validateApproval(approval, plan = PLAN) {
  assert.ok(approval && typeof approval === "object" && !Array.isArray(approval), "readback approval is malformed");
  assert.deepEqual(sorted(Object.keys(approval)), sorted(expectedApprovalKeys()), "readback approval contains an unexpected field");
  const expected = approvalTemplate(plan);
  assert.equal(approval.schemaVersion, expected.schemaVersion, "readback approval schema is not recognized");
  assert.equal(approval.approved, true, "explicit readback approval is absent");
  assert.equal(approval.account, expected.account, "readback approval account is outside the approved account");
  assert.equal(approval.role, expected.role, "readback approval role is not the approved derived role");
  assert.equal(approval.profile, expected.profile, "readback approval operator profile is not exact");
  assert.equal(approval.region, expected.region, "readback approval region is not exact");
  assert.equal(approval.bucket, expected.bucket, "readback approval bucket is not exact");
  assert.deepEqual(approval.retention, expected.retention, "readback approval retention is not exact");
  assert.deepEqual(approval.exclusions, expected.exclusions, "readback approval exclusions are incomplete or changed");
  assert.equal(approval.productionEligible, false, "readback approval may not authorize production inference");
  assert.equal(approval.phase2, false, "readback approval may not authorize Phase 2");
  assert.ok(Array.isArray(approval.artifacts) && approval.artifacts.length === expected.artifacts.length, "readback approval artifact count is not exact");
  for (const [index, artifact] of expected.artifacts.entries()) {
    const actual = approval.artifacts[index];
    assert.deepEqual(actual, artifact, `readback approval artifact ${index + 1} is not exact`);
  }
  return true;
}

function artifactPath(artifact, dataRoot = DEFAULT_DATA_ROOT) {
  const marker = "../Witness_Tree-data/";
  assert.ok(artifact.localPath?.startsWith(marker), "derived artifact local path is outside the approved data root");
  return join(dataRoot, artifact.localPath.slice(marker.length));
}

function fileSha256(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function validateLocalArtifacts(dataRoot = DEFAULT_DATA_ROOT, plan = PLAN) {
  for (const artifact of plan.artifacts) {
    const path = artifactPath(artifact, dataRoot);
    assert.equal(statSync(path).size, artifact.byteLength, `${artifact.id} local byte length drifted`);
    assert.equal(fileSha256(path), artifact.sha256, `${artifact.id} local SHA-256 drifted`);
  }
  return true;
}

function validateHead(head, bytes, label) {
  assert.ok(head && typeof head === "object" && !Array.isArray(head), `${label} head is malformed`);
  assert.equal(head.ContentLength, bytes, `${label} byte length does not match the approved artifact`);
  assert.equal(head.ChecksumType, "FULL_OBJECT", `${label} checksum type is not FULL_OBJECT`);
  assert.equal(validCrc64(head.ChecksumCRC64NVME), true, `${label} CRC64NVME checksum is absent or malformed`);
  assert.equal(typeof head.VersionId === "string" && head.VersionId.length > 0, true, `${label} concrete version is absent`);
}

function validateRetention(retention, label) {
  assert.ok(retention && typeof retention === "object", `${label} retention readback is malformed`);
  assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${label} retention mode is not COMPLIANCE`);
  assert.equal(Date.parse(retention.Retention?.RetainUntilDate ?? ""), Date.parse(RETAIN_UNTIL), `${label} retention date is not exact`);
}

export function validateReadback(approval, readback, plan = PLAN) {
  validateApproval(approval, plan);
  assert.ok(readback && typeof readback === "object" && !Array.isArray(readback), "derived readback is malformed");
  const expected = expectedArtifacts(plan);
  assert.deepEqual(sorted(Object.keys(readback)), sorted(expected.map(({ id }) => id)), "derived readback contains an unexpected artifact");
  for (const artifact of expected) {
    const actual = readback[artifact.id];
    assert.deepEqual(sorted(Object.keys(actual ?? {})), ["manifest", "manifestRetention", "payload", "retention"], `${artifact.id} readback shape is not exact`);
    validateHead(actual.payload, artifact.byteLength, `${artifact.id} payload`);
    validateHead(actual.manifest, artifact.manifestByteLength, `${artifact.id} manifest`);
    validateRetention(actual.retention, `${artifact.id} payload`);
    validateRetention(actual.manifestRetention, `${artifact.id} manifest`);
  }
  return true;
}

if (process.argv[1]?.endsWith("check-wildfire-derived-readback.mjs")) {
  try {
    const mode = process.argv[2];
    if (mode === "--approval") {
      validateApproval(JSON.parse(readFileSync(process.argv[3], "utf8")));
      validateLocalArtifacts(process.argv[4] ?? DEFAULT_DATA_ROOT);
      console.log("Derived wildfire readback approval and local artifacts passed.");
    } else if (mode === "--readback") {
      validateReadback(JSON.parse(readFileSync(process.argv[3], "utf8")), JSON.parse(readFileSync(process.argv[4], "utf8")));
      console.log("Derived wildfire exact payload, manifest, checksum, version, and retention readbacks passed.");
    } else if (mode === "--approval-template") {
      console.log(`${JSON.stringify(approvalTemplate(), null, 2)}\n`);
    } else {
      throw new Error("usage");
    }
  } catch {
    console.error("Derived wildfire readback check failed closed; no TOTP or AWS mutation was authorized.");
    process.exitCode = 65;
  }
}
