import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const SHA = /^[a-f\d]{64}$/;
const utc = (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && new Date(value).toISOString() === value.replace("Z", ".000Z");
const keyFor = (entry) => `raw/${entry.sourceId}/${entry.sourceVersion}/${entry.retrievedAt.replaceAll(":", "-")}/${entry.sha256}/payload/${entry.originalFilename.toLowerCase()}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function sidecarFor(plan, source, artifact) {
  return `${JSON.stringify({schemaVersion: "witness-tree/current-wildfire-archive-sidecar/1", purpose: "Immutable raw snapshot provenance only; never an admission, transformation, ingestion, release, or production decision.", source: {id: source.sourceId, datasetTitle: source.datasetTitle, publisher: source.publisher, catalogueUrl: source.catalogueUrl, queryOrEdition: artifact.queryOrEdition, retrievedAt: source.retrievedAt, licence: {id: source.licenceId, url: source.licenceUrl, attribution: source.attribution}}, payload: {key: keyFor(source), byteLength: source.byteLength, sha256: source.sha256, originalFilename: source.originalFilename}, profile: {record: artifact.profile, geometryDecision: artifact.geometryDecision}, sidecarRetention: "rebuildable-not-locked"}, null, 2)}\n`;
}

export function validateCurrentWildfirePromotionPreparation(plan, staged = read("data/staged-acquisitions.json")) {
  assert.equal(plan.schemaVersion, "witness-tree/current-wildfire-immutable-promotion-preparation/1"); assert.equal(plan.status, "preparation-only"); assert.match(plan.notice, /does not call AWS.*admit/i);
  assert.deepEqual(plan.destination, {bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA"}); assert.equal(plan.mfaGatedExecution.required, true); assert.equal(plan.mfaGatedExecution.recommendedRetainUntil, "2033-08-12T00:00:00Z");
  const expectedGeometry = {"cwfis-current": "profiled-clean", "bc-wildfire": "blocked-pending-geometry-policy", "ab-wildfire": "profiled-clean", "on-fire-disturbance": "blocked-pending-geometry-policy"}; const wanted = Object.keys(expectedGeometry); assert.equal(plan.artifacts.length, 4); const seen = new Set();
  for (const artifact of plan.artifacts) {
    const source = staged.entries.find((entry) => entry.id === artifact.id); assert.ok(source, `Missing staged ${artifact.id}.`); assert.ok(wanted.includes(source.sourceId) && !seen.has(source.sourceId)); seen.add(source.sourceId);
    assert.ok(utc(source.retrievedAt) && Number.isSafeInteger(source.byteLength) && source.byteLength > 0 && SHA.test(source.sha256)); assert.equal(source.immutableObjectStorage, false); assert.equal(source.productionEligible, false); assert.equal(source.originalFilename, source.localPath.split("/").at(-1));
    const profile = read(artifact.profile); assert.equal(profile.sourceId, source.sourceId); assert.equal(profile.artifact.bytes, source.byteLength); assert.equal(profile.artifact.sha256, source.sha256); assert.equal(profile.productionEligible, false);
    assert.equal(artifact.geometryDecision, expectedGeometry[source.sourceId]);
    const payloadKey = keyFor(source); assert.ok(payloadKey.startsWith("raw/") && !/(?:^|\/)(?:current|latest)(?:\/|$)/i.test(payloadKey)); assert.match(sidecarFor(plan, source, artifact), /rebuildable-not-locked/);
  }
  assert.deepEqual([...seen].sort(), [...wanted].sort()); assert.deepEqual(plan.claims, {remoteObjectExists: false, sidecarUploaded: false, retentionApplied: false, immutableObjectStorage: false, ownerAdmission: false, transformed: false, ingested: false, productionEligible: false}); return plan;
}

export function dryRunLines(plan, staged) { validateCurrentWildfirePromotionPreparation(plan, staged); return plan.artifacts.flatMap((artifact) => { const source = staged.entries.find((entry) => entry.id === artifact.id); const sidecar = sidecarFor(plan, source, artifact); return [`VERIFY ${source.sourceId} bytes=${source.byteLength} sha256=${source.sha256}`, `SIDECAR ${source.sourceId} key=${keyFor(source).replace(/\/payload\/[^/]+$/, "/manifest.json")} sha256=${hash(sidecar)}`, `UPLOAD-PENDING s3://${plan.destination.bucket}/${keyFor(source)}`, `RETAIN-PENDING ${source.sourceId} mode=COMPLIANCE until=${plan.mfaGatedExecution.recommendedRetainUntil}`, `ADMISSION-BLOCK ${source.sourceId} geometry=${artifact.geometryDecision}`]; }); }

if (process.argv[1]?.endsWith("prepare-current-wildfire-immutable-promotion.mjs")) { const plan = read("data/current-wildfire-immutable-promotion-preparation.json"); const staged = read("data/staged-acquisitions.json"); console.log(dryRunLines(plan, staged).join("\n")); }
