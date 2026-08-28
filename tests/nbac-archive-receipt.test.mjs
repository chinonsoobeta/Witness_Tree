import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateNbacArchiveReceipt } from "../scripts/check-nbac-archive-receipt.mjs";

const valid = {
  schemaVersion: "witness-tree/nbac-archive-receipt/2", status: "exact-version-primary-readback-verified-raw-only", verifiedAt: "2026-08-27T19:00:00.000Z",
  ledgerSourceId: "cwfis-historical", physicalComponentId: "nrcan-nbac-1972-2025",
  storage: { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" },
  payload: { key: "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip", byteLength: 1257052370, sha256: "c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165", exactVersionDownload: { byteLengthMatches: true, sha256Matches: true } },
  manifest: { key: "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/manifest.json", byteLength: 1702, sha256: "d61099efe58a5fa7c1353f6d3623405e4e0debd204ff7355a2763130f8ff1fa2", deterministicExpectedBytesMatch: true },
  privateEvidence: { pathRelativeToExternalDataRoot: "evidence/nbac-archive-receipt-2026-08-27.private.json", sha256: "a".repeat(64) },
  operationBoundary: { exactVersionReadbackPerformed: true, versionIdentifiersPrivatelyBound: true, replacementAttempted: false, recoveryReplicaVerified: false },
  claims: { rawArchiveRefetch: true, primaryObjectReadback: true, immutablePrimaryArchive: false, universalArchiveRecovery: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false },
  notice: "Durable redacted receipt bound to a primary-object readback; this is not recovery evidence."
};

test("NBAC receipt binds private exact-version evidence without overstating recovery", () => {
  assert.equal(validateNbacArchiveReceipt(valid), valid);
});

test("NBAC receipt rejects recovery, archive-control, production, or replacement claims", () => {
  for (const mutate of [
    (copy) => { copy.operationBoundary.recoveryReplicaVerified = true; },
    (copy) => { copy.claims.immutablePrimaryArchive = true; },
    (copy) => { copy.claims.productionEligible = true; },
    (copy) => { copy.operationBoundary.replacementAttempted = true; },
  ]) {
    const copy = structuredClone(valid); mutate(copy);
    assert.throws(() => validateNbacArchiveReceipt(copy));
  }
});

test("checked-in NBAC receipt is a strict v2 primary-readback record", () => {
  const receipt = JSON.parse(readFileSync(new URL("../data/nbac-archive-receipt-2026-08-27.json", import.meta.url), "utf8"));
  assert.equal(validateNbacArchiveReceipt(receipt), receipt);
  assert.equal(receipt.claims.primaryObjectReadback, true);
  assert.equal(receipt.claims.universalArchiveRecovery, false);
  assert.equal(receipt.claims.productionEligible, false);
});

test("receipt checker rejects unknown fields and private/provider response leakage", () => {
  const receipt = structuredClone(valid);
  receipt.unexpected = true;
  assert.throws(() => validateNbacArchiveReceipt(receipt), /unexpected fields/i);

  const leaked = structuredClone(valid);
  leaked.privateEvidence.VersionId = "must-not-be-public";
  assert.throws(() => validateNbacArchiveReceipt(leaked), /unexpected fields|private\/provider/i);
});

test("receipt checker rejects a private evidence path outside the external evidence location", () => {
  for (const value of ["../private.json", "/tmp/private.json", "evidence/other.json"]) {
    const candidate = structuredClone(valid);
    candidate.privateEvidence.pathRelativeToExternalDataRoot = value;
    assert.throws(() => validateNbacArchiveReceipt(candidate), /private evidence path/i);
  }
});
