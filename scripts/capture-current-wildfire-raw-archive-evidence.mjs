#!/usr/bin/env node
/**
 * Read-only, version-pinned evidence capture for the four approved current
 * wildfire raw snapshots. This never promotes, admits, transforms, or changes
 * an S3 object. It deliberately uses only head-object, exact-version
 * get-object, and exact-version get-object-retention.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { sidecarFor, validateCurrentWildfirePromotionPreparation } from "./prepare-current-wildfire-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const iso = (value) => new Date(value).toISOString().replace(".000Z", "Z");
const fail = (message) => { throw new Error(`Read-only archive evidence capture refused: ${message}`); };

function artifacts(plan, staged) {
  validateCurrentWildfirePromotionPreparation(plan, staged);
  return plan.artifacts.map((artifact) => {
    const source = staged.entries.find((entry) => entry.id === artifact.id);
    assert.ok(source, `Missing staged acquisition ${artifact.id}.`);
    const payloadKey = plan.proposedRoleScope.objectKeys.find((key) => key.startsWith(`raw/${source.sourceId}/`) && key.includes("/payload/"));
    assert.ok(payloadKey, `Missing exact payload key for ${source.sourceId}.`);
    const manifestKey = payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json");
    assert.ok(plan.proposedRoleScope.objectKeys.includes(manifestKey), `Missing exact manifest key for ${source.sourceId}.`);
    const deterministicManifest = Buffer.from(sidecarFor(plan, source, artifact));
    return { source, payloadKey, manifestKey, deterministicManifest };
  });
}

function validateHead(head, expectedBytes, label) {
  if (!head || typeof head.VersionId !== "string" || !head.VersionId) fail(`${label} has no concrete VersionId.`);
  if (head.ContentLength !== expectedBytes) fail(`${label} byte length drifted (expected ${expectedBytes}, received ${head.ContentLength}).`);
  if (head.ChecksumType !== "FULL_OBJECT" || typeof head.ChecksumCRC64NVME !== "string" || !head.ChecksumCRC64NVME) fail(`${label} lacks a FULL_OBJECT CRC64NVME checksum.`);
  return { versionId: head.VersionId, checksum: { type: head.ChecksumType, algorithm: "CRC64NVME", providerValue: head.ChecksumCRC64NVME } };
}

function validateRetention(retention, expectedUntil, label) {
  const actual = retention?.Retention;
  if (!actual || actual.Mode !== "COMPLIANCE" || typeof actual.RetainUntilDate !== "string") fail(`${label} does not have COMPLIANCE retention.`);
  if (iso(actual.RetainUntilDate) !== expectedUntil) fail(`${label} retention drifted (expected ${expectedUntil}, received ${actual.RetainUntilDate}).`);
  return { mode: actual.Mode, until: expectedUntil };
}

/**
 * Capture a record with an injected read-only transport. `aws` receives only
 * the three permitted S3 API operation names. This export keeps tests fully
 * offline and makes every AWS call auditable.
 */
export async function captureCurrentWildfireRawArchiveEvidence({ plan = read("data/current-wildfire-immutable-promotion-preparation.json"), staged = read("data/staged-acquisitions.json"), aws, capturedAt = new Date().toISOString(), digest = sha256 } = {}) {
  if (typeof aws !== "function") throw new TypeError("A read-only aws transport is required.");
  const expectedUntil = plan.mfaGatedExecution.recommendedRetainUntil;
  const entries = [];
  for (const item of artifacts(plan, staged)) {
    const inspect = async (kind, key, expected) => {
      const label = `${item.source.sourceId} ${kind}`;
      const head = await aws("head-object", { bucket: plan.destination.bucket, key, checksumMode: "ENABLED" });
      const verified = validateHead(head, expected.byteLength, label);
      const body = await aws("get-object", { bucket: plan.destination.bucket, key, versionId: verified.versionId, checksumMode: "ENABLED" });
      if (!Buffer.isBuffer(body)) fail(`${label} exact-version download was not bytes.`);
      if (body.byteLength !== expected.byteLength || digest(body) !== expected.sha256) fail(`${label} exact-version download drifted.`);
      const retention = await aws("get-object-retention", { bucket: plan.destination.bucket, key, versionId: verified.versionId });
      return { key, versionId: verified.versionId, byteLength: expected.byteLength, sha256: expected.sha256, checksum: verified.checksum, retention: validateRetention(retention, expectedUntil, label) };
    };
    const manifestExpected = { byteLength: item.deterministicManifest.byteLength, sha256: sha256(item.deterministicManifest) };
    entries.push({ sourceId: item.source.sourceId, payload: await inspect("payload", item.payloadKey, { byteLength: item.source.byteLength, sha256: item.source.sha256 }), manifest: await inspect("manifest", item.manifestKey, manifestExpected) });
  }
  return {
    schemaVersion: "witness-tree/current-wildfire-exact-raw-archive-capture/1",
    status: "machine-verifiable-raw-archive-evidence-only",
    capturedAt,
    storage: { ...plan.destination },
    notice: "Read-only, exact-version capture. It proves only the archived raw payloads and deterministic sidecars; it is not owner admission, transformation, ingestion, release, or production eligibility.",
    entries,
    claims: { ownerAdmission: false, transformed: false, ingested: false, productionEligible: false }
  };
}

function cliTransport(region) {
  const temp = mkdtempSync(join(tmpdir(), "witness-tree-current-wildfire-readback-"));
  chmodSync(temp, 0o700);
  let sequence = 0;
  const json = (args) => JSON.parse(execFileSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const run = (operation, request) => {
    const common = ["s3api", operation, "--bucket", request.bucket, "--key", request.key, "--region", region, "--output", "json"];
    if (operation === "head-object") return json([...common, "--checksum-mode", request.checksumMode]);
    if (operation === "get-object") {
      const destination = join(temp, `exact-${sequence++}`);
      json([...common, "--version-id", request.versionId, "--checksum-mode", request.checksumMode, destination]);
      return readFileSync(destination);
    }
    if (operation === "get-object-retention") return json([...common, "--version-id", request.versionId]);
    throw new Error(`Unsupported read-only operation ${operation}.`);
  };
  return { run, cleanup: () => rmSync(temp, { recursive: true, force: true }) };
}

function parseArgs(argv) {
  if (argv.length === 0) return { write: null };
  if (argv.length === 2 && argv[0] === "--write" && isAbsolute(argv[1])) return { write: argv[1] };
  throw new Error("Usage: capture-current-wildfire-raw-archive-evidence.mjs [--write /absolute/path.json]");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { write } = parseArgs(process.argv.slice(2));
  const plan = read("data/current-wildfire-immutable-promotion-preparation.json");
  const transport = cliTransport(plan.destination.region);
  try {
    const evidence = await captureCurrentWildfireRawArchiveEvidence({ plan, aws: transport.run });
    const text = `${JSON.stringify(evidence, null, 2)}\n`;
    if (write) {
      writeFileSync(write, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
      chmodSync(write, 0o600);
    }
    process.stdout.write(text);
  } finally { transport.cleanup(); }
}
