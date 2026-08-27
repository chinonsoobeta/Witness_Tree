import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = path.join(ROOT, "data/nbac-immutable-promotion-preparation.json");
const SHA = /^[a-f0-9]{64}$/;
const PAYLOAD_KEY = "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip";

export function manifestFor(plan) {
  const a = plan.artifact;
  return `${JSON.stringify({
    schemaVersion: "witness-tree/nbac-archive-manifest/1",
    artifactId: a.id,
    sourceId: a.sourceId,
    sourceVersion: a.sourceVersion,
    capturedAt: a.capturedAt,
    payload: { key: a.payloadKey, originalFilename: a.originalFilename, byteLength: a.byteLength, sha256: a.sha256 },
    evidence: a.evidence,
    storage: { bucket: plan.destination.bucket, region: plan.destination.region, retentionMode: plan.mfaGatedExecution.retentionMode, retainUntil: plan.mfaGatedExecution.retainUntil },
  }, null, 2)}\n`;
}

export function validateNbacImmutablePromotionPreparation(plan) {
  assert.equal(plan.schemaVersion, "witness-tree/nbac-immutable-promotion-preparation/1");
  assert.equal(plan.status, "preparation-only");
  assert.match(plan.notice, /does not call AWS.*upload.*retention.*admit/i);
  assert.deepEqual(plan.destination, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.deepEqual(plan.mfaGatedExecution, { operatorProfile: "WitnessTreeArchiveOperator", role: "WitnessTreeArchivePromotionUploader", required: true, retentionMode: "COMPLIANCE", retainUntil: "2033-08-12T00:00:00Z" });
  const a = plan.artifact;
  assert.equal(a.id, "nrcan-nbac-1972-2025-20260513");
  assert.equal(a.sourceId, "cwfis-historical");
  assert.equal(a.originalFilename, "NBAC_1972to2025_20260513_shp.zip");
  assert.equal(a.localPath, "raw/nrcan-nbac-1972-2025/2026-08-27/NBAC_1972to2025_20260513_shp.zip");
  assert.equal(a.sourceVersion, "20260513");
  assert.equal(a.capturedAt, "2026-08-27T18:17:41Z");
  assert.equal(a.byteLength, 1257052370);
  assert.equal(a.sha256, "c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165");
  assert.match(a.sha256, SHA);
  assert.equal(a.payloadKey, PAYLOAD_KEY);
  assert.equal(a.manifestKey, a.payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json"));
  assert.equal(a.evidence.featureCount, 52610);
  assert.equal(a.evidence.invalidGeometryCount, 49);
  assert.equal(a.evidence.invalidGeometryPolicy, "quarantine; no silent repair");
  assert.equal(a.evidence.licence, "Open Government Licence - Canada");
  assert.equal(a.evidence.noEndorsement, true);
  for (const key of ["metadataSha256", "catalogueSnapshotSha256", "geospatialProfileSha256"]) assert.match(a.evidence[key], SHA);
  assert.deepEqual(plan.rolePolicyDelta.objectKeys, [a.payloadKey, a.manifestKey]);
  assert.deepEqual(plan.rolePolicyDelta.actions, ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:PutObjectRetention", "s3:GetObjectRetention"]);
  for (const denied of ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "iam:*"]) assert.ok(plan.rolePolicyDelta.denyByOmission.includes(denied));
  assert.deepEqual(plan.claims, { remoteObjectExists: false, manifestUploaded: false, retentionApplied: false, immutableArchive: false, transformed: false, ingested: false, released: false, published: false, productionAdmitted: false, productionEligible: false });
  return plan;
}

export function writeManifest(plan, directory) {
  validateNbacImmutablePromotionPreparation(plan);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, "nbac.manifest.json");
  const bytes = manifestFor(plan);
  writeFileSync(file, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { file, byteLength: Buffer.byteLength(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
}

export const loadPlan = () => validateNbacImmutablePromotionPreparation(JSON.parse(readFileSync(PLAN, "utf8")));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = loadPlan();
  const index = process.argv.indexOf("--write-manifest");
  if (index >= 0) console.log(JSON.stringify(writeManifest(plan, process.argv[index + 1])));
  else console.log(`PREPARED ${plan.artifact.id} bytes=${plan.artifact.byteLength} sha256=${plan.artifact.sha256}; no AWS call made.`);
}
