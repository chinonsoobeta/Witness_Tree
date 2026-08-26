import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SHA = /^[a-f\d]{64}$/;
const utc = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const keyFor = (entry) => `raw/${entry.sourceId}/${entry.sourceVersion}/${entry.retrievedAt.replaceAll(":", "-")}/${entry.sha256}/payload/${entry.originalFilename.toLowerCase()}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function sidecarFor(plan, source, artifact) {
  return `${JSON.stringify({schemaVersion: "witness-tree/current-wildfire-archive-sidecar/1", purpose: "Immutable raw snapshot provenance only; never an admission, transformation, ingestion, release, or production decision.", source: {id: source.sourceId, datasetTitle: source.datasetTitle, publisher: source.publisher, catalogueUrl: source.catalogueUrl, queryOrEdition: artifact.queryOrEdition, retrievedAt: source.retrievedAt, licence: {id: source.licenceId, url: source.licenceUrl, attribution: source.attribution}}, payload: {key: keyFor(source), byteLength: source.byteLength, sha256: source.sha256, originalFilename: source.originalFilename}, profile: {record: artifact.profile, geometryDecision: artifact.archiveGeometryDecision}, sidecarRetention: "rebuildable-not-locked"}, null, 2)}\n`;
}

export function validateCurrentWildfirePromotionPreparation(plan, staged = read("data/staged-acquisitions.json")) {
  assert.equal(plan.schemaVersion, "witness-tree/current-wildfire-immutable-promotion-preparation/1"); assert.equal(plan.status, "preparation-only"); assert.match(plan.notice, /does not call AWS.*admit/i);
  assert.deepEqual(plan.destination, {bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA"}); assert.equal(plan.mfaGatedExecution.required, true); assert.equal(plan.mfaGatedExecution.proposedRole, "WitnessTreeCurrentWildfirePromotionUploader"); assert.equal(plan.mfaGatedExecution.recommendedRetainUntil, "2033-08-12T00:00:00Z"); assert.match(plan.requiredApproval, /four exact payloads.*four deterministic sidecars.*COMPLIANCE.*direct-PutObject\/read-back/i);
  const expectedGeometry = {"cwfis-current": "profiled-clean", "bc-wildfire": "owner-approved-derived-216-one-permanent-quarantine", "ab-wildfire": "profiled-clean", "on-fire-disturbance": "owner-approved-derived-188-zero-exclusion"};
  const expectedArchiveGeometry = {"cwfis-current": "profiled-clean", "bc-wildfire": "blocked-pending-geometry-policy", "ab-wildfire": "profiled-clean", "on-fire-disturbance": "blocked-pending-geometry-policy"};
  const wanted = Object.keys(expectedGeometry); assert.equal(plan.artifacts.length, 4); const seen = new Set();
  for (const artifact of plan.artifacts) {
    const source = staged.entries.find((entry) => entry.id === artifact.id); assert.ok(source, `Missing staged ${artifact.id}.`); assert.ok(wanted.includes(source.sourceId) && !seen.has(source.sourceId)); seen.add(source.sourceId);
    assert.ok(utc(source.retrievedAt) && Number.isSafeInteger(source.byteLength) && source.byteLength > 0 && SHA.test(source.sha256)); assert.equal(source.immutableObjectStorage, false); assert.equal(source.productionEligible, false); assert.equal(source.originalFilename, source.localPath.split("/").at(-1));
    const profile = read(artifact.profile); assert.equal(profile.sourceId, source.sourceId); assert.equal(profile.artifact.bytes, source.byteLength); assert.equal(profile.artifact.sha256, source.sha256); assert.equal(profile.productionEligible, false);
    assert.equal(artifact.archiveGeometryDecision, expectedArchiveGeometry[source.sourceId]); assert.equal(artifact.geometryDecision, expectedGeometry[source.sourceId]);
    const payloadKey = keyFor(source); assert.ok(payloadKey.startsWith("raw/") && !/(?:^|\/)(?:current|latest)(?:\/|$)/i.test(payloadKey)); assert.match(sidecarFor(plan, source, artifact), /rebuildable-not-locked/);
  }
  assert.deepEqual([...seen].sort(), [...wanted].sort());
  const keys = plan.artifacts.flatMap((artifact) => { const source = staged.entries.find((entry) => entry.id === artifact.id); return [keyFor(source), keyFor(source).replace(/\/payload\/[^/]+$/, "/manifest.json")]; });
  assert.deepEqual(plan.proposedRoleScope.trust, {principal: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator", mfaRequired: true}); assert.deepEqual(plan.proposedRoleScope.assumeRoleIdentityPolicy, {action: "sts:AssumeRole", resource: "arn:aws:iam::286853118812:role/WitnessTreeCurrentWildfirePromotionUploader"}); assert.deepEqual(plan.proposedRoleScope.allow, ["s3:PutObject", "s3:GetObject", "s3:GetObjectVersion", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts", "s3:PutObjectRetention", "s3:GetObjectRetention"]); assert.deepEqual(plan.proposedRoleScope.objectKeys, keys); for (const denied of ["s3:DeleteObject", "s3:DeleteObjectVersion", "s3:BypassGovernanceRetention", "s3:PutObjectLegalHold", "s3:ReplicateObject", "s3:PutBucket*", "s3:DeleteBucket*", "iam:*"]) assert.ok(plan.proposedRoleScope.denyByOmission.includes(denied));
  assert.deepEqual(plan.claims, {remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, ownerAdmission: false, transformed: false, ingested: false, productionEligible: false}); return plan;
}

export function writeSidecars(plan, directory, staged = read("data/staged-acquisitions.json")) { validateCurrentWildfirePromotionPreparation(plan, staged); mkdirSync(directory, {recursive: true, mode: 0o700}); return plan.artifacts.map((artifact) => { const source = staged.entries.find((entry) => entry.id === artifact.id); const file = join(directory, `${artifact.id}.manifest.json`); const content = sidecarFor(plan, source, artifact); writeFileSync(file, content, {encoding: "utf8", flag: "wx", mode: 0o600}); return {artifactId: artifact.id, file, byteLength: Buffer.byteLength(content), sha256: hash(content)}; }); }

export function dryRunLines(plan, staged) { validateCurrentWildfirePromotionPreparation(plan, staged); return plan.artifacts.flatMap((artifact) => { const source = staged.entries.find((entry) => entry.id === artifact.id); const sidecar = sidecarFor(plan, source, artifact); return [`VERIFY ${source.sourceId} bytes=${source.byteLength} sha256=${source.sha256}`, `SIDECAR ${source.sourceId} key=${keyFor(source).replace(/\/payload\/[^/]+$/, "/manifest.json")} sha256=${hash(sidecar)}`, `UPLOAD-PENDING s3://${plan.destination.bucket}/${keyFor(source)}`, `RETAIN-PENDING ${source.sourceId} mode=COMPLIANCE until=${plan.mfaGatedExecution.recommendedRetainUntil}`, `ADMISSION-BLOCK ${source.sourceId} geometry=${artifact.geometryDecision}`]; }); }

if (process.argv[1]?.endsWith("prepare-current-wildfire-immutable-promotion.mjs")) { const plan = read("data/current-wildfire-immutable-promotion-preparation.json"); const staged = read("data/staged-acquisitions.json"); const index = process.argv.indexOf("--write-sidecars"); if (index !== -1) { assert.ok(process.argv[index + 1], "--write-sidecars requires a directory."); console.log(JSON.stringify(writeSidecars(plan, process.argv[index + 1], staged))); } else console.log(dryRunLines(plan, staged).join("\n")); }
