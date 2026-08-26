import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const SHA256 = /^[a-f\d]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const BUCKET = "witness-tree-raw-archive-ca-central-1";
const REGION = "ca-central-1";
const RAW_KEY = "raw/ab-primary-land-vegetation/undeclared/2026-08-14T14-01-07Z/017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3";
const DERIVED_KEY = "derived/ab-primary-land-vegetation/alberta-plvi-full-repair-v1-2026-08-14/2026-08-14T14-14-31Z/5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b";

const utc = (value) => UTC.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const sidecarHash = (value) => createHash("sha256").update(value).digest("hex");

export function sidecarFor(plan, artifact) {
  const common = {schemaVersion: "witness-tree/alberta-plvi-archive-sidecar/1", artifactId: artifact.id, kind: artifact.kind, payload: {key: artifact.payloadKey, originalFilename: artifact.originalFilename, byteLength: artifact.byteLength, sha256: artifact.sha256}, storage: {bucket: plan.destination.bucket, region: plan.destination.region, payloadRetention: "COMPLIANCE pending exact owner approval and read-back", sidecarRetention: "rebuildable-not-locked"}};
  return `${JSON.stringify(artifact.kind === "raw-source" ? {...common, source: {sourceId: artifact.sourceId, sourceVersion: artifact.sourceVersion, capturedAt: artifact.capturedAt, ...artifact.sourceEvidence}} : {...common, derived: {sourceId: artifact.sourceId, sourceVersion: artifact.sourceVersion, capturedAt: artifact.capturedAt, ...artifact.derivedLineage}}, null, 2)}\n`;
}

export function validateAlbertaPlviImmutablePromotionPreparation(plan) {
  assert.equal(plan.schemaVersion, "witness-tree/alberta-plvi-immutable-promotion-preparation/1");
  assert.equal(plan.status, "preparation-only");
  assert.match(plan.notice, /does not call AWS, upload.*sidecar.*Object Lock retention.*admit/i);
  assert.equal(plan.destination.bucket, BUCKET); assert.equal(plan.destination.region, REGION); assert.equal(plan.destination.countryCode, "CA");
  assert.equal(plan.mfaGatedExecution.required, true); assert.equal(plan.mfaGatedExecution.proposedRole, "WitnessTreePlviArchivePromotionUploader"); assert.equal(plan.mfaGatedExecution.retentionMode, "COMPLIANCE"); assert.equal(plan.mfaGatedExecution.recommendedRetainUntil, "2033-08-12T00:00:00Z");
  assert.match(plan.requiredApproval, /both exact artifacts.*exact Canadian bucket and region.*COMPLIANCE retention/i);
  assert.equal(plan.artifacts.length, 2);
  const [raw, derived] = plan.artifacts;
  assert.equal(raw.id, "alberta-plvi-raw-2026-08-14"); assert.equal(raw.kind, "raw-source"); assert.equal(raw.byteLength, 675544895); assert.equal(raw.sha256, "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3"); assert.equal(raw.payloadKey, `${RAW_KEY}/payload/primarylandandvegetationinventoryplvi.zip`); assert.equal(raw.manifestKey, `${RAW_KEY}/manifest.json`); assert.equal(raw.sourceEvidence.invalidGeometryCount, 12); assert.equal(raw.sourceEvidence.attributeFieldCount, 60); assert.equal("fieldCount" in raw.sourceEvidence, false);
  assert.equal(derived.id, "alberta-plvi-full-repair-v1-2026-08-14"); assert.equal(derived.kind, "derived-repair"); assert.equal(derived.byteLength, 899551232); assert.equal(derived.sha256, "5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b"); assert.equal(derived.payloadKey, `${DERIVED_KEY}/payload/alberta-plvi-full-repaired-closed-join.gpkg`); assert.equal(derived.manifestKey, `${DERIVED_KEY}/manifest.json`); assert.equal(derived.derivedLineage.rawArtifactId, raw.id); assert.equal(derived.derivedLineage.rawSha256, raw.sha256); assert.equal(derived.derivedLineage.repairPatchSha256, "70348ce64c3e688ee7dc3948a683e49631aa16d591953a89f51d8186169d94e0"); assert.equal(derived.derivedLineage.invalidGeometryCount, 0); assert.equal(derived.derivedLineage.featureCount, 179087); assert.equal(derived.derivedLineage.attributeFieldCount, 60); assert.equal("fieldCount" in derived.derivedLineage, false);
  const seen = new Set();
  for (const artifact of plan.artifacts) {
    assert.ok(utc(artifact.capturedAt)); assert.ok(Number.isSafeInteger(artifact.byteLength) && artifact.byteLength > 0); assert.match(artifact.sha256, SHA256); assert.equal(artifact.originalFilename, basename(artifact.localPath));
    assert.ok(artifact.payloadKey.endsWith(`/payload/${artifact.originalFilename.toLowerCase()}`)); assert.equal(artifact.manifestKey, artifact.payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json")); assert.ok(!artifact.payloadKey.includes("current") && !artifact.payloadKey.includes("latest"));
    for (const key of [artifact.payloadKey, artifact.manifestKey]) { assert.ok(!seen.has(key), "Archive keys must be distinct."); seen.add(key); }
    assert.match(sidecarFor(plan, artifact), /rebuildable-not-locked/);
  }
  assert.deepEqual(plan.proposedRoleScope.allow, ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:PutObjectRetention", "s3:GetObjectRetention"]);
  assert.deepEqual([...plan.proposedRoleScope.objectKeys].sort(), [...seen].sort());
  for (const denied of ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "iam:*"]) assert.ok(plan.proposedRoleScope.denyByOmission.includes(denied));
  assert.deepEqual(plan.claims, {remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, ownerSourceLedgerAdmission: false, transformed: false, ingested: false, productionEligible: false});
  return plan;
}

export function dryRunLines(plan) {
  validateAlbertaPlviImmutablePromotionPreparation(plan);
  return plan.artifacts.flatMap((artifact) => [`VERIFY ${artifact.id} bytes=${artifact.byteLength} sha256=${artifact.sha256}`, `SIDECAR ${artifact.id} key=${artifact.manifestKey} sha256=${sidecarHash(sidecarFor(plan, artifact))}`, `UPLOAD-PENDING s3://${plan.destination.bucket}/${artifact.payloadKey}`, `RETAIN-PENDING ${artifact.id} mode=COMPLIANCE until=${plan.mfaGatedExecution.recommendedRetainUntil}`]);
}

export function writeSidecars(plan, directory) {
  validateAlbertaPlviImmutablePromotionPreparation(plan); mkdirSync(directory, {recursive: true, mode: 0o700});
  return plan.artifacts.map((artifact) => { const file = join(directory, `${artifact.id}.manifest.json`); const content = sidecarFor(plan, artifact); writeFileSync(file, content, {encoding: "utf8", flag: "wx", mode: 0o600}); return {artifactId: artifact.id, file, byteLength: Buffer.byteLength(content), sha256: sidecarHash(content)}; });
}

if (process.argv[1]?.endsWith("prepare-alberta-plvi-immutable-promotion.mjs")) {
  const plan = JSON.parse(readFileSync(new URL("../data/alberta-plvi-immutable-promotion-preparation.json", import.meta.url), "utf8"));
  const sidecarDir = process.argv.indexOf("--write-sidecars");
  if (sidecarDir !== -1) { const directory = process.argv[sidecarDir + 1]; assert.ok(directory, "--write-sidecars requires a directory."); console.log(JSON.stringify(writeSidecars(plan, directory))); }
  else console.log(dryRunLines(plan).join("\n"));
}
