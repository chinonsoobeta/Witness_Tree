import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sidecarFor } from "../scripts/prepare-alberta-plvi-immutable-promotion.mjs";
import { legacyManifestMatches, validateAlbertaPlviLegacyManifestAudit } from "../scripts/check-alberta-plvi-legacy-manifest-audit.mjs";

const audit = JSON.parse(readFileSync(new URL("../data/alberta-plvi-legacy-manifest-audit.json", import.meta.url), "utf8"));
const preparation = JSON.parse(readFileSync(new URL("../data/alberta-plvi-immutable-promotion-preparation.json", import.meta.url), "utf8"));

test("PLVI legacy audit accepts only the two checksum-bound historical fieldCount manifests", () => {
  assert.equal(validateAlbertaPlviLegacyManifestAudit(audit, preparation), audit);
  for (const entry of audit.manifests) {
    const artifact = preparation.artifacts.find((candidate) => candidate.id === entry.artifactId);
    const historical = sidecarFor(preparation, artifact).replaceAll('"attributeFieldCount": 60', '"fieldCount": 63');
    assert.equal(legacyManifestMatches(audit, preparation, entry.manifestKey, entry.versionId, historical, entry.providerChecksum.base64), true);
    assert.equal(legacyManifestMatches(audit, preparation, entry.manifestKey, `${entry.versionId}x`, historical, entry.providerChecksum.base64), false);
    assert.equal(legacyManifestMatches(audit, preparation, entry.manifestKey, entry.versionId, sidecarFor(preparation, artifact), entry.providerChecksum.base64), false);
    assert.equal(legacyManifestMatches(audit, preparation, entry.manifestKey, entry.versionId, historical, "AAAAAAAAAAA="), false);
  }
});

test("PLVI legacy audit rejects an altered historical version and never changes canonical 60-attribute preparation", () => {
  assert.throws(() => validateAlbertaPlviLegacyManifestAudit({...audit, manifests: [{...audit.manifests[0], byteLength: 1}, audit.manifests[1]]}, preparation));
  assert.throws(() => validateAlbertaPlviLegacyManifestAudit({...audit, manifests: [{...audit.manifests[0], versionId: "x".repeat(32)}, audit.manifests[1]]}, preparation));
  assert.equal(preparation.artifacts.every((artifact) => JSON.stringify(artifact).includes("attributeFieldCount") && !JSON.stringify(artifact).includes("fieldCount")), true);
});
