import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateNrcanHarvestRemoteArchiveEvidence } from "../scripts/check-nrcan-harvest-remote-archive-evidence.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const evidence = read("../data/nrcan-harvest-remote-archive-evidence.json");
const profile = read("../data/nrcan-harvest-profile.json");
const staged = read("../data/staged-acquisitions.json");
const ledger = read("../data/phase1-production-source-ledger.json");

test("harvest archive evidence binds local SHA and exact primary/recovery readbacks without admission", () => {
  assert.equal(validateNrcanHarvestRemoteArchiveEvidence(evidence, profile, staged, ledger), evidence);
  assert.equal(evidence.payload.localBinding.sha256Matches, true);
  assert.equal(evidence.payload.primary.retention.mode, "COMPLIANCE");
  assert.equal(evidence.payload.recovery.replication, "REPLICA");
  assert.equal(ledger.entries.find(({ id }) => id === "ntems-forest-harvest").productionEligible, false);
});

test("harvest archive evidence rejects checksum, retention, and provider-identifier drift", () => {
  const checksum = structuredClone(evidence);
  checksum.payload.primary.checksum.type = "COMPOSITE";
  assert.throws(() => validateNrcanHarvestRemoteArchiveEvidence(checksum, profile, staged, ledger));
  const retention = structuredClone(evidence);
  retention.payload.recovery.retention.until = "2034-08-12T00:00:00Z";
  assert.throws(() => validateNrcanHarvestRemoteArchiveEvidence(retention, profile, staged, ledger));
  const identifier = structuredClone(evidence);
  identifier.payload.primary.versionId = "redacted-id";
  assert.throws(() => validateNrcanHarvestRemoteArchiveEvidence(identifier, profile, staged, ledger));
});
