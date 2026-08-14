import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_ID = /^[A-Za-z0-9._-]{32}$/;
const SHA256 = /^[a-f\d]{64}$/;
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";

export function validateAlbertaPlviImmutablePromotionEvidence(evidence, preparation) {
  assert.equal(evidence.schemaVersion, "witness-tree/alberta-plvi-immutable-promotion-evidence/1");
  assert.equal(evidence.status, "remote-verified-archived");
  assert.match(evidence.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(evidence.notice, /not an owner source-ledger admission.*does not authorize transformation, analysis, ingestion, public release, production admission, or production use/i);
  assert.deepEqual(evidence.destination, preparation.destination);
  assert.match(evidence.verificationMethod, /HeadObject.*ChecksumMode=ENABLED.*GetObjectRetention/i);
  assert.equal(evidence.payloads.length, 2); assert.equal(evidence.sidecars.length, 2);
  const artifacts = new Map(preparation.artifacts.map((artifact) => [artifact.id, artifact]));
  const payloadIds = new Set();
  for (const payload of evidence.payloads) {
    const artifact = artifacts.get(payload.artifactId);
    assert.ok(artifact, "Every payload must name an approved artifact.");
    assert.ok(!payloadIds.has(payload.artifactId), "Payload evidence must be one-to-one."); payloadIds.add(payload.artifactId);
    assert.equal(payload.kind, artifact.kind); assert.equal(payload.payloadKey, artifact.payloadKey); assert.equal(payload.byteLength, artifact.byteLength); assert.equal(payload.sourceSha256, artifact.sha256);
    assert.match(payload.payloadVersionId, VERSION_ID); assert.match(payload.sourceSha256, SHA256);
    assert.deepEqual(payload.providerChecksum.algorithm, "CRC64NVME"); assert.equal(payload.providerChecksum.type, "FULL_OBJECT"); assert.match(payload.providerChecksum.base64, BASE64);
    assert.deepEqual(payload.retention, {mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL});
    if (payload.kind === "derived-repair") assert.equal(payload.rawSourceSha256, preparation.artifacts[0].sha256);
    else assert.equal(payload.rawSourceSha256, undefined);
  }
  const sidecarIds = new Set();
  for (const sidecar of evidence.sidecars) {
    const artifact = artifacts.get(sidecar.artifactId);
    assert.ok(artifact, "Every sidecar must name an approved artifact.");
    assert.ok(!sidecarIds.has(sidecar.artifactId), "Sidecar evidence must be one-to-one."); sidecarIds.add(sidecar.artifactId);
    assert.equal(sidecar.manifestKey, artifact.manifestKey); assert.match(sidecar.manifestVersionId, VERSION_ID); assert.ok(Number.isSafeInteger(sidecar.byteLength) && sidecar.byteLength > 0);
    assert.deepEqual(sidecar.providerChecksum.algorithm, "CRC64NVME"); assert.equal(sidecar.providerChecksum.type, "FULL_OBJECT"); assert.match(sidecar.providerChecksum.base64, BASE64);
  }
  assert.deepEqual([...payloadIds].sort(), [...artifacts.keys()].sort()); assert.deepEqual([...sidecarIds].sort(), [...artifacts.keys()].sort());
  assert.deepEqual(evidence.scopeExclusions, ["owner-source-ledger-admission", "transformation", "analysis", "ingestion", "public-release", "production-admission", "production-eligibility"]);
  assert.deepEqual(evidence.claims, {remoteObjectExists: true, sidecarUploaded: true, payloadComplianceRetention: true, immutableArchive: true, ownerSourceLedgerAdmission: false, transformed: false, analysed: false, ingested: false, publicReleased: false, productionAdmission: false, productionEligible: false});
  return evidence;
}

export async function checkAlbertaPlviImmutablePromotionEvidence(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const [evidence, preparation] = await Promise.all(["data/alberta-plvi-immutable-promotion-evidence.json", "data/alberta-plvi-immutable-promotion-preparation.json"].map(async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"))));
  return validateAlbertaPlviImmutablePromotionEvidence(evidence, preparation);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidence = await checkAlbertaPlviImmutablePromotionEvidence();
  console.log(`Alberta PLVI immutable promotion evidence passed for ${evidence.payloads.length} payloads and ${evidence.sidecars.length} sidecars; owner source admission remains false.`);
}
