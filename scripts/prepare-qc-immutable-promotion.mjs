import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { archiveKeys, safeSegment, snapshotId, validatePromotionManifest } from "../lib/archive-staging/validate.ts";

const SHA256 = /^[a-f\d]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const BUCKET = "witness-tree-raw-archive-ca-central-1";
const REGION = "ca-central-1";
const PART_SIZE = 134217728;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const utc = (value) => UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");

export function partCount(byteLength, partSizeBytes = PART_SIZE) {
  return Math.ceil(byteLength / partSizeBytes);
}

export function multipartPlan(byteLength, partSizeBytes = PART_SIZE) {
  assert.ok(Number.isSafeInteger(byteLength) && byteLength > partSizeBytes, "A multipart payload must exceed the part size.");
  assert.equal(partSizeBytes, PART_SIZE, "The reviewed multipart part size is fixed.");
  const count = partCount(byteLength, partSizeBytes);
  assert.ok(count <= 10000, "S3 multipart uploads cannot exceed 10,000 parts.");
  return Array.from({ length: count }, (_, index) => ({ partNumber: index + 1, offsetBytes: index * partSizeBytes, byteLength: Math.min(partSizeBytes, byteLength - index * partSizeBytes) }));
}

export function sidecarFor(plan, artifact) {
  return `${JSON.stringify({ schemaVersion: "witness-tree/qc-archive-sidecar/1", artifactId: artifact.id, kind: artifact.kind, payload: { key: artifact.payloadKey, originalFilename: artifact.originalFilename, byteLength: artifact.byteLength, sha256: artifact.sha256 }, source: { productionSourceId: artifact.productionSourceId, archiveSourceId: artifact.archiveSourceId, sourceVersion: artifact.sourceVersion, retrievedAt: artifact.retrievedAt, ...artifact.sourceEvidence }, storage: { bucket: plan.destination.bucket, region: plan.destination.region, multipart: { partSizeBytes: plan.mfaGatedExecution.multipartPartSizeBytes, partCount: partCount(artifact.byteLength, plan.mfaGatedExecution.multipartPartSizeBytes), checksumAlgorithm: "SHA256" }, payloadRetention: "COMPLIANCE pending exact owner approval and read-back", sidecarRetention: "rebuildable-not-locked" } }, null, 2)}\n`;
}

export function validateQcImmutablePromotionPreparation(plan) {
  assert.equal(plan.schemaVersion, "witness-tree/qc-immutable-promotion-preparation/1");
  assert.equal(plan.status, "preparation-only");
  assert.match(plan.notice, /does not call AWS.*upload.*Object Lock.*ingest/i);
  assert.deepEqual(plan.destination, { bucket: BUCKET, region: REGION, countryCode: "CA" });
  assert.equal(plan.mfaGatedExecution.required, true); assert.equal(plan.mfaGatedExecution.proposedRole, "WitnessTreeQcArchivePromotionUploader");
  assert.equal(plan.mfaGatedExecution.retentionMode, "COMPLIANCE"); assert.equal(plan.mfaGatedExecution.recommendedRetainUntil, "2033-08-12T00:00:00Z"); assert.equal(plan.mfaGatedExecution.multipartPartSizeBytes, PART_SIZE);
  assert.match(plan.requiredApproval, /both exact artifacts.*four exact keys.*sequential multipart.*COMPLIANCE/i);
  assert.equal(plan.artifacts.length, 2);
  const seen = new Set(); const retention = [];
  for (const artifact of plan.artifacts) {
    assert.equal(artifact.kind, "raw-source"); assert.equal(typeof artifact.productionSourceId, "string"); assert.ok(artifact.productionSourceId.length > 0); assert.ok(safeSegment(artifact.archiveSourceId)); assert.ok(!/current|latest/i.test(artifact.archiveSourceId), "Archive identities cannot use moving aliases.");
    assert.equal(artifact.originalFilename, basename(artifact.localPath)); assert.ok(artifact.localPath.startsWith("raw/qc-")); assert.ok(!artifact.localPath.includes(".."));
    assert.equal(artifact.sourceVersion, "undeclared"); assert.ok(utc(artifact.retrievedAt)); assert.ok(Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 5_000_000_000); assert.match(artifact.sha256, SHA256);
    const staging = { storageState: "local-staging", immutableObjectStorage: false, production: false, sourceId: artifact.archiveSourceId, sourceVersion: artifact.sourceVersion, retrievedAt: artifact.retrievedAt, byteLength: artifact.byteLength, sha256: artifact.sha256, originalFilename: artifact.originalFilename, publisher: "Ministère des Ressources naturelles et des Forêts du Québec", catalogueUrl: "https://www.donneesquebec.ca/", requestedUrl: artifact.sourceEvidence.sourceUrl, licenceId: artifact.sourceEvidence.licenceId, licenceUrl: artifact.sourceEvidence.licenceUrl, requiredAttribution: artifact.sourceEvidence.attribution, changesNotice: "Raw artifact unchanged; preparation only, with no upload, retention, transformation, ingestion, or release." };
    const keys = archiveKeys(staging); assert.equal(artifact.payloadKey, keys.payloadKey); assert.equal(artifact.manifestKey, keys.manifestKey);
    validatePromotionManifest({ status: "staging-promotion", snapshotId: snapshotId(staging), staged: staging, ...keys, promotion: { state: "rejected" } });
    for (const key of [artifact.payloadKey, artifact.manifestKey]) { assert.ok(!seen.has(key), "Keys must be distinct and append-only."); seen.add(key); }
    retention.push(artifact.payloadKey); const parts = multipartPlan(artifact.byteLength, PART_SIZE); assert.ok(parts.length >= 2 && parts.at(-1).byteLength > 0);
    assert.match(sidecarFor(plan, artifact), /rebuildable-not-locked/);
  }
  assert.deepEqual(plan.proposedRoleScope.allow, ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:PutObjectRetention", "s3:GetObjectRetention"]);
  assert.deepEqual([...plan.proposedRoleScope.retentionKeys].sort(), retention.sort());
  for (const denied of ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "s3:PutObjectLegalHold", "s3:ReplicateObject", "s3:PutBucket*", "s3:DeleteBucket*", "iam:*"]) assert.ok(plan.proposedRoleScope.denyByOmission.includes(denied));
  assert.deepEqual(plan.claims, { remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, ownerSourceLedgerAdmission: false, transformed: false, ingested: false, productionEligible: false });
  return plan;
}

export function writeSidecars(plan, directory) {
  validateQcImmutablePromotionPreparation(plan); mkdirSync(directory, { recursive: true, mode: 0o700 });
  return plan.artifacts.map((artifact) => { const content = sidecarFor(plan, artifact); const file = join(directory, `${artifact.id}.manifest.json`); writeFileSync(file, content, { encoding: "utf8", flag: "wx", mode: 0o600 }); return { artifactId: artifact.id, file, byteLength: Buffer.byteLength(content), sha256: hash(content) }; });
}

if (process.argv[1]?.endsWith("prepare-qc-immutable-promotion.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
  const sidecars = process.argv.indexOf("--write-sidecars");
  if (sidecars !== -1) { const directory = process.argv[sidecars + 1]; assert.ok(directory, "--write-sidecars requires a directory."); console.log(JSON.stringify(writeSidecars(plan, directory))); }
  else { validateQcImmutablePromotionPreparation(plan); console.log(`Dry-run only: ${plan.artifacts.length} exact Québec raw artifacts, ${plan.artifacts.map((item) => partCount(item.byteLength)).join(" + ")} sequential multipart parts, and no AWS action.`); }
}
