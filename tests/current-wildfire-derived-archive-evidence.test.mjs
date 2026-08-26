import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateCurrentWildfireDerivedArchiveEvidence } from "../scripts/check-current-wildfire-derived-archive-evidence.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-archive-evidence.json", import.meta.url), "utf8"));

test("derived wildfire attestation validates its local identities while proving no remote object or retention", () => {
  const evidence = read();
  assert.equal(validateCurrentWildfireDerivedArchiveEvidence(evidence), evidence);
  assert.equal(evidence.objects.length, 4);
  assert.equal(evidence.objects.filter(({ kind }) => kind === "payload").every(({ retention }) => retention?.mode === "COMPLIANCE"), true);
  assert.equal(evidence.objects.every(({ versionPresent, fullObjectChecksumVerified, exactVersionReadback }) => !versionPresent && !fullObjectChecksumVerified && !exactVersionReadback), true);
  assert.equal(evidence.objects.filter(({ kind }) => kind === "payload").every(({ retention }) => retention.readbackVerified === false), true);
  assert.equal(evidence.claims.productionEligible, false);
  assert.equal(evidence.claims.phase2, false);
});

test("derived evidence rejects provider identifiers, checksum drift, or production claims", () => {
  for (const mutate of [
    (candidate) => { candidate.objects[0].versionId = "forbidden"; },
    (candidate) => { candidate.objects[1].checksum.algorithm = "MD5"; },
    (candidate) => { candidate.objects[2].retention.retainUntil = "2033-08-11T23:59:59Z"; },
    (candidate) => { candidate.claims.productionEligible = true; },
    (candidate) => { candidate.claims.recoveryReplicaVerified = true; }
  ]) {
    const changed = structuredClone(read());
    mutate(changed);
    assert.throws(() => validateCurrentWildfireDerivedArchiveEvidence(changed));
  }
});
