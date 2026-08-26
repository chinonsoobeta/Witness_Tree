import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sidecarFor } from "./prepare-alberta-plvi-immutable-promotion.mjs";

const SHA256 = /^[a-f\d]{64}$/;
const VERSION = /^[A-Za-z0-9._-]{32}$/;
const BASE64 = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;
const EXACT_VERSIONS = new Map([
  ["alberta-plvi-raw-2026-08-14", "yC3g35H9fpX.AcyP7B3hjkB4BuiTZmgl"],
  ["alberta-plvi-full-repair-v1-2026-08-14", "8K7Wc6oWJPYvpbFLI5KSb9gMM66CqP9Z"]
]);

const hash = (text) => createHash("sha256").update(text).digest("hex");
const legacySidecar = (plan, artifact) => sidecarFor(plan, artifact).replaceAll('"attributeFieldCount": 60', '"fieldCount": 63');

export function validateAlbertaPlviLegacyManifestAudit(audit, preparation) {
  assert.equal(audit.schemaVersion, "witness-tree/alberta-plvi-legacy-manifest-audit/1");
  assert.equal(audit.status, "historical-exact-version-manifest-evidence-only");
  assert.match(audit.notice, /accepted only.*recorded key, version, byte length, SHA-256 and provider checksum.*canonical PLVI preparation remains attributeFieldCount: 60/i);
  assert.deepEqual(audit.correction, {historicalField: "fieldCount", historicalValue: 63, canonicalField: "attributeFieldCount", canonicalValue: 60, scope: "manifest wording only; raw and derived payload identities are unchanged"});
  assert.equal(audit.manifests.length, 2);
  const artifacts = new Map(preparation.artifacts.map((artifact) => [artifact.id, artifact]));
  const ids = new Set();
  for (const manifest of audit.manifests) {
    const artifact = artifacts.get(manifest.artifactId);
    assert.ok(artifact && !ids.has(manifest.artifactId), "Each approved artifact needs one legacy manifest."); ids.add(manifest.artifactId);
    assert.equal(manifest.manifestKey, artifact.manifestKey); assert.match(manifest.versionId, VERSION); assert.equal(manifest.versionId, EXACT_VERSIONS.get(manifest.artifactId)); assert.match(manifest.sha256, SHA256);
    assert.deepEqual(manifest.providerChecksum.algorithm, "CRC64NVME"); assert.equal(manifest.providerChecksum.type, "FULL_OBJECT"); assert.match(manifest.providerChecksum.base64, BASE64);
    const expected = legacySidecar(preparation, artifact);
    assert.equal(manifest.byteLength, Buffer.byteLength(expected)); assert.equal(manifest.sha256, hash(expected));
    assert.match(expected, /"fieldCount": 63/); assert.doesNotMatch(expected, /attributeFieldCount/);
  }
  assert.deepEqual([...ids].sort(), [...artifacts.keys()].sort());
  assert.deepEqual(audit.claims, {currentCanonicalManifest: false, remoteMutationPerformed: false, sourceAdmission: false, productionEligible: false});
  return audit;
}

export function legacyManifestMatches(audit, preparation, key, version, content, providerChecksum) {
  validateAlbertaPlviLegacyManifestAudit(audit, preparation);
  const match = audit.manifests.find((entry) => entry.manifestKey === key && entry.versionId === version);
  return Boolean(match && providerChecksum === match.providerChecksum.base64 && Buffer.byteLength(content) === match.byteLength && hash(content) === match.sha256);
}

export async function checkAlbertaPlviLegacyManifestAudit(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const [audit, preparation] = await Promise.all(["data/alberta-plvi-legacy-manifest-audit.json", "data/alberta-plvi-immutable-promotion-preparation.json"].map(async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"))));
  return validateAlbertaPlviLegacyManifestAudit(audit, preparation);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === "--compare") {
    const [key, version, file, providerChecksum] = process.argv.slice(3);
    assert.ok(key && version && file && providerChecksum, "Usage: --compare <manifest-key> <version-id> <downloaded-file> <provider-checksum>");
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const audit = JSON.parse(readFileSync(path.join(root, "data/alberta-plvi-legacy-manifest-audit.json"), "utf8"));
    const preparation = JSON.parse(readFileSync(path.join(root, "data/alberta-plvi-immutable-promotion-preparation.json"), "utf8"));
    process.exitCode = legacyManifestMatches(audit, preparation, key, version, readFileSync(file, "utf8"), providerChecksum) ? 0 : 1;
  } else {
    const audit = await checkAlbertaPlviLegacyManifestAudit();
    console.log(`Alberta PLVI legacy manifest audit passed for ${audit.manifests.length} exact historical versions.`);
  }
}
