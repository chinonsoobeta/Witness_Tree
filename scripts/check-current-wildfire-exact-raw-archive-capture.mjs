import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sidecarFor, validateCurrentWildfirePromotionPreparation } from "./prepare-current-wildfire-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const VERSION = /^[A-Za-z0-9._-]{6,}$/;
const CRC64NVME = /^[A-Za-z0-9+/]{11}=$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const CAPTURED_AT = "2026-08-25T21:36:25.533Z";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";

/** Offline binding for the read-only exact-version archive capture. */
export function validateCurrentWildfireExactRawArchiveCapture(capture = read("data/current-wildfire-exact-raw-archive-capture-2026-08-25.json"), plan = read("data/current-wildfire-immutable-promotion-preparation.json"), staged = read("data/staged-acquisitions.json")) {
  validateCurrentWildfirePromotionPreparation(plan, staged);
  assert.equal(capture.schemaVersion, "witness-tree/current-wildfire-exact-raw-archive-capture/1");
  assert.equal(capture.status, "machine-verifiable-raw-archive-evidence-only");
  assert.equal(capture.capturedAt, CAPTURED_AT);
  assert.equal(new Date(capture.capturedAt).toISOString(), CAPTURED_AT);
  assert.deepEqual(capture.storage, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });
  assert.match(capture.notice, /exact-version.*not owner admission.*production eligibility/i);
  assert.deepEqual(capture.claims, { ownerAdmission: false, transformed: false, ingested: false, productionEligible: false });
  assert.equal(capture.entries.length, 4);

  const expectedSourceIds = ["cwfis-current", "bc-wildfire", "ab-wildfire", "on-fire-disturbance"];
  assert.deepEqual(capture.entries.map(({ sourceId }) => sourceId), expectedSourceIds);
  const keys = new Set(); const versions = new Set();
  for (const entry of capture.entries) {
    const artifact = plan.artifacts.find((candidate) => staged.entries.find((source) => source.id === candidate.id)?.sourceId === entry.sourceId);
    assert.ok(artifact, `Unexpected exact-capture source ${entry.sourceId}.`);
    const source = staged.entries.find((candidate) => candidate.id === artifact.id);
    const payloadKey = plan.proposedRoleScope.objectKeys.find((key) => key.startsWith(`raw/${entry.sourceId}/`) && key.includes("/payload/"));
    const manifestKey = payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json");
    const manifest = Buffer.from(sidecarFor(plan, source, artifact));
    for (const [kind, actual, expected] of [
      ["payload", entry.payload, { key: payloadKey, byteLength: source.byteLength, sha256: source.sha256 }],
      ["manifest", entry.manifest, { key: manifestKey, byteLength: manifest.byteLength, sha256: sha256(manifest) }]
    ]) {
      assert.equal(actual.key, expected.key, `${entry.sourceId} ${kind} key drifted.`);
      assert.equal(actual.byteLength, expected.byteLength, `${entry.sourceId} ${kind} bytes drifted.`);
      assert.equal(actual.sha256, expected.sha256, `${entry.sourceId} ${kind} SHA-256 drifted.`);
      assert.ok(VERSION.test(actual.versionId), `${entry.sourceId} ${kind} lacks a concrete version ID.`);
      assert.ok(!keys.has(actual.key), `Duplicate archive key ${actual.key}.`); keys.add(actual.key);
      assert.ok(!versions.has(actual.versionId), `Duplicate archive version ${actual.versionId}.`); versions.add(actual.versionId);
      assert.deepEqual(actual.checksum?.type, "FULL_OBJECT");
      assert.equal(actual.checksum?.algorithm, "CRC64NVME");
      assert.ok(CRC64NVME.test(actual.checksum?.providerValue ?? ""), `${entry.sourceId} ${kind} CRC64NVME value drifted.`);
      assert.deepEqual(actual.retention, { mode: "COMPLIANCE", until: RETAIN_UNTIL });
    }
  }
  assert.equal(keys.size, 8); assert.equal(versions.size, 8);
  return capture;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateCurrentWildfireExactRawArchiveCapture();
  console.log("Current-wildfire exact raw archive capture is bound to four raw payloads and four deterministic sidecars; admission remains false.");
}
