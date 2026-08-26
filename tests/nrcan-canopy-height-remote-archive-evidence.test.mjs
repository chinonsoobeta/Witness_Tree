import assert from "node:assert/strict";
import test from "node:test";
import { validateNrcanCanopyHeightRemoteArchiveEvidence } from "../scripts/check-nrcan-canopy-height-remote-archive-evidence.mjs";

test("canopy height remote evidence is exact, redacted, retained and non-admitting", () => {
  const evidence = validateNrcanCanopyHeightRemoteArchiveEvidence();
  assert.equal(evidence.claims.immutableArchive, true);
  assert.equal(evidence.claims.productionEligible, false);
});

test("canopy height evidence rejects checksum, retention, identifier and admission drift", () => {
  const base = validateNrcanCanopyHeightRemoteArchiveEvidence();
  const checksum = structuredClone(base); checksum.entry.recovery.payloadChecksum.providerValue = "changed";
  assert.throws(() => validateNrcanCanopyHeightRemoteArchiveEvidence(checksum));
  const retention = structuredClone(base); retention.entry.primary.payloadRetention.until = "2032-01-01T00:00:00Z";
  assert.throws(() => validateNrcanCanopyHeightRemoteArchiveEvidence(retention));
  const identifier = structuredClone(base); identifier.entry.versionId = "forbidden";
  assert.throws(() => validateNrcanCanopyHeightRemoteArchiveEvidence(identifier));
  const admitted = structuredClone(base); admitted.claims.productionAdmission = true;
  assert.throws(() => validateNrcanCanopyHeightRemoteArchiveEvidence(admitted));
});
