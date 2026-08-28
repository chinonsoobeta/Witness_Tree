import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = path.join(ROOT, "data/nbac-archive-receipt-2026-08-27.json");
const SHA256 = /^[a-f0-9]{64}$/;
const PRIVATE_EVIDENCE_PATH = "evidence/nbac-archive-receipt-2026-08-27.private.json";
const PAYLOAD_KEY = "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip";
const MANIFEST_KEY = "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/manifest.json";
const PAYLOAD_SHA256 = "c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165";
const MANIFEST_SHA256 = "d61099efe58a5fa7c1353f6d3623405e4e0debd204ff7355a2763130f8ff1fa2";
const RETAINED_CLAIMS = {
  rawArchiveRefetch: true,
  primaryObjectReadback: true,
  immutablePrimaryArchive: false,
  universalArchiveRecovery: false,
  transformed: false,
  ingested: false,
  released: false,
  productionAdmission: false,
  productionEligible: false,
};
const EXTERNAL_DATA_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

function safeExternalEvidencePath(value) {
  assert.equal(value, PRIVATE_EVIDENCE_PATH, "NBAC private evidence path must stay at the approved external-data evidence location");
  assert(!path.isAbsolute(value) && !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value), "NBAC private evidence path must be relative");
  assert(!value.split(/[\\/]/).some((segment) => !segment || segment === "." || segment === ".."), "NBAC private evidence path must not traverse directories");
}

/**
 * Validate the redacted v2 receipt. This proves one exact-version primary
 * payload/manifest readback and its private evidence digest. It deliberately
 * does not turn that readback into immutable archive, recovery, or production
 * evidence.
 */
export function validateNbacArchiveReceipt(receipt) {
  exactKeys(receipt, ["claims", "ledgerSourceId", "manifest", "notice", "operationBoundary", "payload", "physicalComponentId", "privateEvidence", "schemaVersion", "status", "storage", "verifiedAt"], "NBAC archive receipt");
  assert.equal(receipt.schemaVersion, "witness-tree/nbac-archive-receipt/2");
  assert.equal(receipt.status, "exact-version-primary-readback-verified-raw-only");
  assert.match(receipt.verifiedAt, /^2026-08-27T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(Number.isNaN(Date.parse(receipt.verifiedAt)), false, "NBAC receipt verifiedAt must be a valid UTC timestamp");
  assert.equal(receipt.ledgerSourceId, "cwfis-historical");
  assert.equal(receipt.physicalComponentId, "nrcan-nbac-1972-2025");
  exactKeys(receipt.storage, ["bucket", "countryCode", "region"], "NBAC receipt storage");
  assert.deepEqual(receipt.storage, { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" });

  exactKeys(receipt.payload, ["byteLength", "exactVersionDownload", "key", "sha256"], "NBAC receipt payload");
  assert.deepEqual(receipt.payload, { key: PAYLOAD_KEY, byteLength: 1257052370, sha256: PAYLOAD_SHA256, exactVersionDownload: { byteLengthMatches: true, sha256Matches: true } });
  exactKeys(receipt.payload.exactVersionDownload, ["byteLengthMatches", "sha256Matches"], "NBAC payload exact-version download");
  assert.match(receipt.payload.sha256, SHA256);

  exactKeys(receipt.manifest, ["byteLength", "deterministicExpectedBytesMatch", "key", "sha256"], "NBAC receipt manifest");
  assert.deepEqual(receipt.manifest, { key: MANIFEST_KEY, byteLength: 1702, sha256: MANIFEST_SHA256, deterministicExpectedBytesMatch: true });
  assert.equal(receipt.manifest.key, receipt.payload.key.replace(/\/payload\/[^/]+$/, "/manifest.json"));
  assert.match(receipt.manifest.sha256, SHA256);

  exactKeys(receipt.privateEvidence, ["pathRelativeToExternalDataRoot", "sha256"], "NBAC receipt private evidence");
  safeExternalEvidencePath(receipt.privateEvidence.pathRelativeToExternalDataRoot);
  assert.match(receipt.privateEvidence.sha256, SHA256);

  exactKeys(receipt.operationBoundary, ["exactVersionReadbackPerformed", "recoveryReplicaVerified", "replacementAttempted", "versionIdentifiersPrivatelyBound"], "NBAC receipt operation boundary");
  assert.deepEqual(receipt.operationBoundary, { exactVersionReadbackPerformed: true, versionIdentifiersPrivatelyBound: true, replacementAttempted: false, recoveryReplicaVerified: false });
  exactKeys(receipt.claims, Object.keys(RETAINED_CLAIMS), "NBAC receipt claims");
  assert.deepEqual(receipt.claims, RETAINED_CLAIMS);
  assert.match(receipt.notice, /primary.*readback/i);
  assert.match(receipt.notice, /not recovery/i);
  assert.doesNotMatch(JSON.stringify(receipt), /"(?:AccessKey|SecretAccess|SessionToken|TOTP|VersionId|ChecksumCRC64NVME)"\s*:/i, "Redacted NBAC receipt must not contain private/provider response fields");
  return receipt;
}

export function verifyNbacPrivateEvidence(receipt, dataRoot = EXTERNAL_DATA_ROOT) {
  validateNbacArchiveReceipt(receipt);
  assert.equal(path.resolve(dataRoot), EXTERNAL_DATA_ROOT, "NBAC private evidence must use the approved external data root");
  const evidencePath = path.resolve(dataRoot, receipt.privateEvidence.pathRelativeToExternalDataRoot);
  assert.equal(evidencePath.startsWith(`${EXTERNAL_DATA_ROOT}${path.sep}`), true, "NBAC private evidence escapes the external data root");
  const info = lstatSync(evidencePath);
  assert.equal(info.isFile() && !info.isSymbolicLink(), true, "NBAC private evidence must be a regular non-symlink file");
  assert.equal(info.mode & 0o777, 0o600, "NBAC private evidence must be mode 600");
  const bytes = readFileSync(evidencePath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), receipt.privateEvidence.sha256, "NBAC private evidence digest differs from the public receipt");
  const evidence = JSON.parse(bytes.toString("utf8"));
  exactKeys(evidence, ["aws", "exactVersionDownload", "manifest", "payload", "schemaVersion", "verifiedAt"], "NBAC private evidence");
  assert.equal(evidence.schemaVersion, "witness-tree/nbac-archive-private-evidence/1");
  assert.equal(evidence.verifiedAt, receipt.verifiedAt);
  assert.deepEqual(evidence.aws, { accountId: "286853118812", role: "WitnessTreeArchivePromotionUploader", bucket: receipt.storage.bucket, region: receipt.storage.region });
  for (const [label, value, publicValue] of [["payload", evidence.payload, receipt.payload], ["manifest", evidence.manifest, receipt.manifest]]) {
    exactKeys(value, label === "payload" ? ["checksumCRC64NVME", "checksumType", "contentLength", "key", "retention", "versionId"] : ["checksumCRC64NVME", "checksumType", "contentLength", "key", "retention", "sha256", "versionId"], `NBAC private ${label}`);
    assert.equal(value.key, publicValue.key);
    assert.equal(value.contentLength, publicValue.byteLength);
    assert.equal(typeof value.versionId === "string" && value.versionId.length > 0 && value.versionId !== "null", true, `NBAC private ${label} version is absent`);
    assert.equal(value.checksumType, "FULL_OBJECT");
    assert.match(value.checksumCRC64NVME, /^[A-Za-z0-9+/]{11}=$/);
    assert.equal(value.retention?.Mode, "COMPLIANCE");
    assert.equal(Date.parse(value.retention?.RetainUntilDate) >= Date.parse(RETAIN_UNTIL), true, `NBAC private ${label} retention is insufficient`);
  }
  assert.equal(evidence.manifest.sha256, receipt.manifest.sha256);
  assert.deepEqual(evidence.exactVersionDownload, { payloadByteLength: receipt.payload.byteLength, payloadSha256: receipt.payload.sha256, manifestDeterministicBytesMatch: true });
  return evidence;
}

export function checkNbacArchiveReceipt(file = RECEIPT, { verifyPrivate = false, dataRoot = EXTERNAL_DATA_ROOT } = {}) {
  const receipt = validateNbacArchiveReceipt(JSON.parse(readFileSync(file, "utf8")));
  if (verifyPrivate) verifyNbacPrivateEvidence(receipt, dataRoot);
  return receipt;
}

export const NBAC_ARCHIVE_RECEIPT_PATH = "data/nbac-archive-receipt-2026-08-27.json";
export const NBAC_PRIMARY_OBJECT_READBACK_CLAIM = "primaryObjectReadback";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert(process.argv.slice(2).every((value) => value === "--verify-private"), "Usage: node scripts/check-nbac-archive-receipt.mjs [--verify-private]");
  const receipt = checkNbacArchiveReceipt(RECEIPT, { verifyPrivate: process.argv.includes("--verify-private") });
  console.log(`NBAC archive receipt passed: ${receipt.status}; primary raw readback only, recovery and production remain false.`);
}
