import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateNbacArchiveReceipt } from "./check-nbac-archive-receipt.mjs";

// Receipt capture is offline. Do not retain inherited session credentials in
// this process longer than module startup.
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_SESSION_TOKEN;

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA_ROOT = "/Volumes/Extended_SSD/Witness_Tree-data";
const OUTPUT = resolve(ROOT, "data/nbac-archive-receipt-2026-08-27.json");
const PRIVATE_OUTPUT = resolve(DATA_ROOT, "evidence/nbac-archive-receipt-2026-08-27.private.json");
const PAYLOAD_KEY = "raw/nrcan-nbac-1972-2025/20260513/2026-08-27T18-17-41Z/c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165/payload/nbac_1972to2025_20260513_shp.zip";
const MANIFEST_KEY = PAYLOAD_KEY.replace(/\/payload\/[^/]+$/, "/manifest.json");
const SHA256 = "c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165";
const MANIFEST_SHA256 = "d61099efe58a5fa7c1353f6d3623405e4e0debd204ff7355a2763130f8ff1fa2";
const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function digestFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function validateHead(head, bytes, label) {
  assert.equal(typeof head.VersionId === "string" && head.VersionId.length > 0 && head.VersionId !== "null", true, `${label} version is absent`);
  assert.equal(head.ContentLength, bytes, `${label} byte length differs`);
  assert.equal(head.ChecksumType, "FULL_OBJECT", `${label} checksum type differs`);
  assert.match(head.ChecksumCRC64NVME, /^[A-Za-z0-9+/]{11}=$/, `${label} provider checksum is malformed`);
}

function validateRetention(value, label) {
  assert.equal(value?.Retention?.Mode, "COMPLIANCE", `${label} retention mode differs`);
  assert.equal(Date.parse(value.Retention.RetainUntilDate) >= Date.parse(RETAIN_UNTIL), true, `${label} retention is shorter than required`);
}

function atomicCreate(path, bytes, mode) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, bytes, { flag: "wx", mode });
  if (existsSync(path)) return false;
  renameSync(temporary, path);
  return true;
}

export { validateNbacArchiveReceipt } from "./check-nbac-archive-receipt.mjs";

function argument(name) {
  const hits = process.argv.flatMap((value, index) => value === name ? [index] : []);
  assert.equal(hits.length, 1, `${name} must appear exactly once`);
  assert(hits[0] + 1 < process.argv.length, `${name} is missing a value`);
  return process.argv[hits[0] + 1];
}

async function capture() {
  const payloadHead = readJson(argument("--payload-head"));
  const manifestHead = readJson(argument("--manifest-head"));
  const payloadRetention = readJson(argument("--payload-retention"));
  const manifestRetention = readJson(argument("--manifest-retention"));
  const payloadPath = argument("--payload-download");
  const manifestBytes = readFileSync(argument("--manifest-download"));
  const expectedManifest = readFileSync(argument("--expected-manifest"));
  validateHead(payloadHead, 1257052370, "payload");
  validateHead(manifestHead, expectedManifest.length, "manifest");
  validateRetention(payloadRetention, "payload");
  validateRetention(manifestRetention, "manifest");
  assert.equal(statSync(payloadPath).size, 1257052370, "payload download byte length differs");
  assert.equal(await digestFile(payloadPath), SHA256, "payload download SHA-256 differs");
  assert.equal(Buffer.compare(manifestBytes, expectedManifest), 0, "manifest download differs from deterministic expected bytes");
  assert.equal(digest(manifestBytes), MANIFEST_SHA256, "manifest SHA-256 differs");

  const verifiedAt = new Date().toISOString();
  const privateEvidence = {
    schemaVersion: "witness-tree/nbac-archive-private-evidence/1", verifiedAt,
    aws: { accountId: "286853118812", role: "WitnessTreeArchivePromotionUploader", bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1" },
    payload: { key: PAYLOAD_KEY, versionId: payloadHead.VersionId, checksumType: payloadHead.ChecksumType, checksumCRC64NVME: payloadHead.ChecksumCRC64NVME, contentLength: payloadHead.ContentLength, retention: payloadRetention.Retention },
    manifest: { key: MANIFEST_KEY, versionId: manifestHead.VersionId, checksumType: manifestHead.ChecksumType, checksumCRC64NVME: manifestHead.ChecksumCRC64NVME, contentLength: manifestHead.ContentLength, sha256: MANIFEST_SHA256, retention: manifestRetention.Retention },
    exactVersionDownload: { payloadByteLength: 1257052370, payloadSha256: SHA256, manifestDeterministicBytesMatch: true }
  };
  const privateText = jsonBytes(privateEvidence);
  const privateSha256 = digest(privateText);
  mkdirSync(resolve(DATA_ROOT, "evidence"), { recursive: true, mode: 0o700 });
  if (existsSync(PRIVATE_OUTPUT)) assert.equal(digest(readFileSync(PRIVATE_OUTPUT)), privateSha256, "existing private NBAC evidence differs; replacement refused");
  else assert.equal(atomicCreate(PRIVATE_OUTPUT, privateText, 0o600), true);

  const receipt = validateNbacArchiveReceipt({
    schemaVersion: "witness-tree/nbac-archive-receipt/2", status: "exact-version-primary-readback-verified-raw-only", verifiedAt,
    ledgerSourceId: "cwfis-historical", physicalComponentId: "nrcan-nbac-1972-2025",
    storage: { bucket: "witness-tree-raw-archive-ca-central-1", region: "ca-central-1", countryCode: "CA" },
    payload: { key: PAYLOAD_KEY, byteLength: 1257052370, sha256: SHA256, exactVersionDownload: { byteLengthMatches: true, sha256Matches: true } },
    manifest: { key: MANIFEST_KEY, byteLength: 1702, sha256: MANIFEST_SHA256, deterministicExpectedBytesMatch: true },
    privateEvidence: { pathRelativeToExternalDataRoot: "evidence/nbac-archive-receipt-2026-08-27.private.json", sha256: privateSha256 },
    operationBoundary: { exactVersionReadbackPerformed: true, versionIdentifiersPrivatelyBound: true, replacementAttempted: false, recoveryReplicaVerified: false },
    claims: { rawArchiveRefetch: true, primaryObjectReadback: true, immutablePrimaryArchive: false, universalArchiveRecovery: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false },
    notice: "Durable redacted receipt cryptographically bound to private exact-version primary-object readback evidence; this is not recovery, storage-control, transformation, admission, release, or production evidence."
  });
  const publicText = jsonBytes(receipt);
  if (existsSync(OUTPUT)) assert.deepEqual(JSON.parse(readFileSync(OUTPUT, "utf8")), receipt, "existing NBAC receipt differs; replacement refused");
  else assert.equal(atomicCreate(OUTPUT, publicText, 0o644), true);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--capture")) await capture();
  else validateNbacArchiveReceipt(JSON.parse(readFileSync(OUTPUT, "utf8")));
}
