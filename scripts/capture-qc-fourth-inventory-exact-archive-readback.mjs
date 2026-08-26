#!/usr/bin/env node
/**
 * Read-only, exact-version verification for the completed Québec fourth-
 * inventory archive. The private runner state supplies version IDs only while
 * this process is running; the written evidence never contains them.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value);
const iso = (value) => new Date(value).toISOString().replace(".000Z", "Z");
const fail = (message) => { throw new Error(`Exact archive readback refused: ${message}`); };

export function exactObjectDescriptorDigest(plan) {
  return sha256(stable(exactPromotionObjects(plan).map(({ id, objectKey, byteLength, sha256: digest }) => ({ id, objectKey, byteLength, sha256: digest }))));
}

function privateState(state, objects) {
  assert.equal(state.schemaVersion, 1);
  assert.equal(typeof state.objects, "object");
  const ids = objects.map(({ id }) => id).sort();
  assert.deepEqual(Object.keys(state.objects).sort(), ids);
  return Object.fromEntries(ids.map((id) => {
    const entry = state.objects[id];
    if (typeof entry?.versionId !== "string" || !entry.versionId) fail(`${id} lacks a private version ID.`);
    if (typeof entry?.checksumSha256 !== "string" || !entry.checksumSha256) fail(`${id} lacks a private checksum.`);
    if (!["FULL_OBJECT", "COMPOSITE"].includes(entry.checksumType)) fail(`${id} has an unsupported private checksum type.`);
    return [id, entry];
  }));
}

function retention(retention, expected, id) {
  if (retention?.Retention?.Mode !== "COMPLIANCE") fail(`${id} does not have COMPLIANCE retention.`);
  if (iso(retention.Retention.RetainUntilDate) !== expected) fail(`${id} retention is not ${expected}.`);
}

/** `aws` is intentionally limited to head-object and get-object-retention. */
export async function captureQcFourthInventoryExactArchiveReadback({ plan = loadQcFourthInventoryPromotionPreparation(), state, aws, capturedAt = new Date().toISOString() } = {}) {
  if (typeof aws !== "function") throw new TypeError("A read-only aws transport is required.");
  const objects = exactPromotionObjects(plan);
  const privateObjects = privateState(state, objects);
  const typeCounts = {};
  const remoteChecksumLines = [];
  const privateVersionLines = [];
  let totalBytes = 0;
  for (const object of objects) {
    const pinned = privateObjects[object.id];
    const head = await aws("head-object", { bucket: plan.bucket, key: object.objectKey, versionId: pinned.versionId, checksumMode: "ENABLED" });
    if (head?.ContentLength !== object.byteLength) fail(`${object.id} byte length differs from the plan.`);
    if (head?.VersionId !== pinned.versionId) fail(`${object.id} exact version does not match private state.`);
    if (head?.ChecksumType !== pinned.checksumType || head?.ChecksumSHA256 !== pinned.checksumSha256) fail(`${object.id} checksum differs from private state.`);
    retention(await aws("get-object-retention", { bucket: plan.bucket, key: object.objectKey, versionId: pinned.versionId }), plan.retention.retainUntil, object.id);
    typeCounts[head.ChecksumType] = (typeCounts[head.ChecksumType] ?? 0) + 1;
    remoteChecksumLines.push(`${object.id}\t${head.ChecksumType}\t${head.ChecksumSHA256}`);
    privateVersionLines.push(`${object.id}\t${pinned.versionId}`);
    totalBytes += object.byteLength;
  }
  return {
    schemaVersion: "witness-tree/qc-fourth-inventory-exact-archive-readback/1",
    status: "independent-read-only-exact-version-compliance-readback",
    capturedAt: iso(capturedAt),
    storage: { region: plan.region, countryCode: "CA" },
    planBinding: {
      objectCount: objects.length,
      payloadCount: plan.archiveSet.count,
      evidenceAndManifestCount: objects.length - plan.archiveSet.count,
      byteLength: totalBytes,
      objectDescriptorSha256: exactObjectDescriptorDigest(plan),
      preparationSha256: sha256(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url)))
    },
    verification: {
      exactPrivateVersionsMatched: objects.length,
      byteLengthsMatchedPlan: objects.length,
      checksumsMatchedPrivateState: objects.length,
      checksumTypes: Object.fromEntries(Object.entries(typeCounts).sort()),
      remoteChecksumSetSha256: sha256(remoteChecksumLines.sort().join("\n") + "\n"),
      privateVersionSetSha256: sha256(privateVersionLines.sort().join("\n") + "\n"),
      complianceRetentionMatched: objects.length,
      retainUntil: plan.retention.retainUntil
    },
    notice: "Independent read-only, exact-version archive evidence. It proves only the 62 archived objects and their COMPLIANCE retention; it is not owner admission, transformation, ingestion, release, or production eligibility.",
    claims: { ownerAdmission: false, transformed: false, ingested: false, released: false, productionEligible: false }
  };
}

function cliTransport(region) {
  const json = (args) => JSON.parse(execFileSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  return (operation, request) => {
    const common = ["s3api", operation, "--bucket", request.bucket, "--key", request.key, "--version-id", request.versionId, "--region", region, "--output", "json"];
    if (operation === "head-object") return json([...common, "--checksum-mode", request.checksumMode]);
    if (operation === "get-object-retention") return json(common);
    throw new Error(`Unsupported read-only operation ${operation}.`);
  };
}

function parseArgs(argv) {
  if (argv.length === 4 && argv[0] === "--state-file" && isAbsolute(argv[1]) && argv[2] === "--write" && isAbsolute(argv[3])) return { stateFile: argv[1], write: argv[3] };
  throw new Error("Usage: capture-qc-fourth-inventory-exact-archive-readback.mjs --state-file /private/state.json --write /absolute/evidence.json");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { stateFile, write } = parseArgs(process.argv.slice(2));
  const plan = loadQcFourthInventoryPromotionPreparation();
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  const evidence = await captureQcFourthInventoryExactArchiveReadback({ plan, state, aws: cliTransport(plan.region) });
  writeFileSync(write, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write(`Captured independent read-only exact-version compliance evidence for ${evidence.planBinding.objectCount} objects.\n`);
}
