import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  assertRunnableCheckpoint, completeCheckpoint, initializeCheckpoint, markAmbiguous, markManifestComplete,
  markRetentionStarted, markWriteStarted, recordAcknowledgement, recordHead, recordIdentity, recordPreparedCopy, recordResponseEvidence, recordRetention, EXPECTED_RESPONSE_NAMES, expectedResponseCommand, loadCheckpoint
} from "../scripts/check-current-wildfire-promotion-checkpoint.mjs";
import { publishPair, validatePair } from "../scripts/assemble-current-wildfire-promotion-attestation.mjs";
import { acquireCurrentWildfireRunLock, releaseCurrentWildfireRunLock } from "../scripts/current-wildfire-run-lock.mjs";
import { prepareAmbiguityReconciliation } from "../scripts/prepare-current-wildfire-ambiguity-reconciliation.mjs";

const ids = ["cwfis-current-active-wildfires-2026-08-14T202242Z", "bc-wildfire-current-perimeters-2026-08-14", "alberta-wildfire-locations-2026-08-14", "ontario-in-year-fire-perimeters-2026-08-14"];
const operator = JSON.stringify({ Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" });
const role = JSON.stringify({ Account: "286853118812", Arn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeCurrentWildfirePromotionUploader/test" });

function evidenceStdout(name, value) {
  if (name === "operator-identity.evidence.json") return { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" };
  if (name === "role-identity.evidence.json") return { Account: "286853118812", Arn: "arn:aws:sts::286853118812:assumed-role/WitnessTreeCurrentWildfirePromotionUploader/test" };
  const [, artifactId, kind, operation] = name.match(/^(.*)\.(payload|manifest)\.(put-object-retention|get-object-retention|put-object|head-object)/); const object = value.objects.find((candidate) => candidate.artifactId === artifactId && candidate.kind === kind);
  if (operation === "put-object") return { VersionId: object.ack.VersionId, ChecksumCRC64NVME: object.ack.ChecksumCRC64NVME };
  if (operation === "head-object") return { VersionId: object.head.VersionId, ContentLength: object.head.ContentLength, ChecksumType: object.head.ChecksumType, ChecksumCRC64NVME: object.head.ChecksumCRC64NVME };
  if (operation === "put-object-retention") return {};
  return { Retention: { Mode: object.retention.Mode, RetainUntilDate: object.retention.RetainUntilDate } };
}

function completeFixture(path) {
  initializeCheckpoint(path, "2026-08-23T12:00:00.000Z");
  recordIdentity(path, operator, role);
  for (const [index, artifactId] of ids.entries()) {
    for (const kind of ["payload", "manifest"]) {
      const version = `ExactOwnerVersion_${index}_${kind}`; const checksum = `${String(index + 1).repeat(11)}=`;
      const current = loadCheckpoint(path); const object = current.objects.find((item) => item.artifactId === artifactId && item.kind === kind);
      recordPreparedCopy(path, artifactId, kind, { path: join(path, `${artifactId}.${kind}`), device: index + 1, inode: index + 11, byteLength: object.bytes, sha256: object.sha256, checksumAlgorithm: "CRC64NVME", checksumType: "FULL_OBJECT", checksumValue: checksum });
      markWriteStarted(path, artifactId, kind);
      recordAcknowledgement(path, artifactId, kind, { VersionId: version, ChecksumCRC64NVME: checksum, rawResponse: JSON.stringify({ VersionId: version, ChecksumCRC64NVME: checksum, ETag: `private-etag-${index}` }) });
      const rawHead = { VersionId: version, ContentLength: object.bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: checksum, Metadata: { exact: "private" } };
      recordHead(path, artifactId, kind, { ...rawHead, rawResponse: JSON.stringify(rawHead) });
      if (kind === "payload") {
        markRetentionStarted(path, artifactId);
        const rawRetention = { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" }, RequestCharged: "private-value" };
        recordRetention(path, artifactId, { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z", putResponse: "{}\n", getResponse: JSON.stringify(rawRetention) });
      } else markManifestComplete(path, artifactId);
    }
  }
  for (const name of EXPECTED_RESPONSE_NAMES) { const evidence = `${path}.${name}`; const current = loadCheckpoint(path); writeFileSync(evidence, JSON.stringify({ command: expectedResponseCommand(name, current), stdout: JSON.stringify(evidenceStdout(name, current)), stderr: "" }), { mode: 0o600 }); recordResponseEvidence(path, name, evidence); }
  completeCheckpoint(path);
}

test("lost write response creates a durable ambiguity boundary that forbids duplicate versions", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-checkpoint-loss-")); const path = join(dir, "checkpoint.json");
  try {
    initializeCheckpoint(path); recordIdentity(path, operator, role);
    const object = loadCheckpoint(path).objects[0]; recordPreparedCopy(path, ids[0], "payload", { path: join(dir, "stable"), device: 1, inode: 2, byteLength: object.bytes, sha256: object.sha256, checksumAlgorithm: "CRC64NVME", checksumType: "FULL_OBJECT", checksumValue: "11111111111=" }); markWriteStarted(path, ids[0], "payload"); markAmbiguous(path, ids[0], "payload", "put-object");
    assert.throws(() => assertRunnableCheckpoint(path), /owner review|unresolved write boundary/);
    assert.throws(() => markWriteStarted(path, ids[0], "payload"), /owner review|already started/);
    const value = loadCheckpoint(path);
    assert.equal(value.status, "owner-review-required");
    assert.equal(value.objects[0].ambiguity.reason, "response-lost-or-provider-failure");
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a second owner session is blocked even after a clean completed boundary", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-checkpoint-session-")); const path = join(dir, "checkpoint.json");
  try {
    initializeCheckpoint(path); recordIdentity(path, operator, role);
    assert.throws(() => assertRunnableCheckpoint(path), /owner session.*owner review/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("completed checkpoint publishes an owner-only exact-response pair with digest cross-links", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-attestation-")); const checkpoint = join(dir, "checkpoint.json"); const privatePath = join(dir, "private.json"); const publicPath = join(dir, "public.json");
  try {
    completeFixture(checkpoint); publishPair(checkpoint, privatePath, publicPath);
    const pair = validatePair(privatePath, publicPath);
    assert.equal(pair.privateRecord.checkpoint.objects.length, 8);
    assert.equal(pair.privateRecord.checkpoint.objects[0].ack.rawResponse.includes("private-etag"), false);
    assert.equal(readFileSync(publicPath, "utf8").includes("private-etag"), false);
    assert.equal(pair.privateRecord.checkpoint.responseInventory.length, EXPECTED_RESPONSE_NAMES.length); assert.equal(pair.publicRecord.responseInventory.length, EXPECTED_RESPONSE_NAMES.length); assert.equal(readFileSync(publicPath, "utf8").includes("rawEvidence"), false);
    assert.equal(pair.publicRecord.claims.exactVersionReadbacksVerified, false);
    assert.equal(pair.privateRecord.claims.recoveryReplicaVerified, false);
    assert.equal(pair.privateRecord.recoveryReplicaProof.externalCallsPerformedByAssembler, false);
    assert.equal(statSync(privatePath).mode & 0o777, 0o600); assert.equal(statSync(publicPath).mode & 0o777, 0o600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("completion rejects a missing response and provider checksum not bound to the stable copy", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-inventory-")); const checkpoint = join(dir, "checkpoint.json");
  try { initializeCheckpoint(checkpoint); recordIdentity(checkpoint, operator, role); const object = loadCheckpoint(checkpoint).objects[0]; recordPreparedCopy(checkpoint, object.artifactId, object.kind, { path: join(dir, "stable"), device: 1, inode: 2, byteLength: object.bytes, sha256: object.sha256, checksumAlgorithm: "CRC64NVME", checksumType: "FULL_OBJECT", checksumValue: "11111111111=" }); markWriteStarted(checkpoint, object.artifactId, object.kind); recordAcknowledgement(checkpoint, object.artifactId, object.kind, { VersionId: "ExactVersionMismatch", ChecksumCRC64NVME: "22222222222=", rawResponse: JSON.stringify({ VersionId: "ExactVersionMismatch", ChecksumCRC64NVME: "22222222222=" }) }); assert.throws(() => recordHead(checkpoint, object.artifactId, object.kind, { VersionId: "ExactVersionMismatch", ContentLength: object.bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "22222222222=", rawResponse: JSON.stringify({ VersionId: "ExactVersionMismatch", ContentLength: object.bytes, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "22222222222=" }) }), /stable local bytes/); assert.throws(() => completeCheckpoint(checkpoint), /every exact object|response inventory/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("public-output race preserves both the private diagnostic and racing target", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-attestation-race-")); const checkpoint = join(dir, "checkpoint.json"); const privatePath = join(dir, "private.json"); const publicPath = join(dir, "public.json");
  try {
    completeFixture(checkpoint);
    assert.throws(() => publishPair(checkpoint, privatePath, publicPath, { public: { beforeOpen: () => writeFileSync(publicPath, "RACING_TARGET", { mode: 0o600, flag: "wx" }) } }), /diagnostics.*retained/);
    assert.equal(existsSync(privatePath), true);
    assert.equal(readFileSync(publicPath, "utf8"), "RACING_TARGET");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("post-publication validation failure never deletes a private replacement or public diagnostic", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-attestation-validate-race-")); const checkpoint = join(dir, "checkpoint.json"); const privatePath = join(dir, "private.json"); const publicPath = join(dir, "public.json");
  try { completeFixture(checkpoint); assert.throws(() => publishPair(checkpoint, privatePath, publicPath, { public: { afterFsync: () => writeFileSync(privatePath, "REPLACEMENT", { mode: 0o600 }) } }), /diagnostics.*retained/); assert.equal(readFileSync(privatePath, "utf8"), "REPLACEMENT"); assert.equal(existsSync(publicPath), true); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checkpoint mutations append exclusive generations and never replace the immutable anchor", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-generations-")); const path = join(dir, "checkpoint.json");
  try { initializeCheckpoint(path); const anchor = readFileSync(path); recordIdentity(path, operator, role); assert.deepEqual(readFileSync(path), anchor); assert.equal(loadCheckpoint(path).identitySessions.length, 1); assert.throws(() => recordIdentity(path, operator, role), /already contains/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("response evidence rejects command drift and credential-shaped output", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-evidence-")); const path = join(dir, "checkpoint.json"); const evidence = join(dir, "evidence.json");
  try { initializeCheckpoint(path); writeFileSync(evidence, JSON.stringify({ command: ["aws", "sts", "get-caller-identity"], stdout: JSON.stringify({ Account: "286853118812", Arn: "AKIAABCDEFGHIJKLMNOP" }), stderr: "" }), { mode: 0o600 }); assert.throws(() => recordResponseEvidence(path, "operator-identity.evidence.json", evidence), /credential material|exact evidence schema/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run-lock release cannot rename over or delete a concurrent replacement", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-run-lock-")); const path = join(dir, "run.lock");
  try { const lock = acquireCurrentWildfireRunLock(path); renameSync(path, join(dir, "owned-lock")); writeFileSync(path, "replacement", { mode: 0o600 }); assert.equal(releaseCurrentWildfireRunLock(lock), false); assert.equal(readFileSync(path, "utf8"), "replacement"); assert.equal(existsSync(join(dir, "owned-lock")), true); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("run-lock release is an inode-bound durable no-delete tombstone", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-run-lock-release-")); const path = join(dir, "run.lock");
  try { const lock = acquireCurrentWildfireRunLock(path); assert.equal(releaseCurrentWildfireRunLock(lock), true); assert.match(readFileSync(path, "utf8"), /active[\s\S]*released-no-delete/); assert.throws(() => acquireCurrentWildfireRunLock(path), /EEXIST/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ambiguity reconciliation remains owner-gated and read-only", () => {
  const dir = mkdtempSync(join(tmpdir(), "wildfire-reconcile-")); const path = join(dir, "checkpoint.json");
  try { initializeCheckpoint(path); recordIdentity(path, operator, role); const object = loadCheckpoint(path).objects[0]; recordPreparedCopy(path, object.artifactId, object.kind, { path: join(dir, "stable"), device: 1, inode: 2, byteLength: object.bytes, sha256: object.sha256, checksumAlgorithm: "CRC64NVME", checksumType: "FULL_OBJECT", checksumValue: "11111111111=" }); markWriteStarted(path, object.artifactId, object.kind); markAmbiguous(path, object.artifactId, object.kind, "put-object"); const before = JSON.stringify(loadCheckpoint(path)); const result = prepareAmbiguityReconciliation(path); assert.equal(result.status, "blocked-owner-approval-required"); assert.deepEqual(result.permittedCommands, []); assert.equal(JSON.stringify(loadCheckpoint(path)), before); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("checked-in runner is preflight-only and cannot cross an upload boundary", () => {
  const runner = new URL("../scripts/run-current-wildfire-approved-promotion.sh", import.meta.url).pathname; const bytes = readFileSync(runner, "utf8");
  assert.equal(/aws\s+(?:s3api|sts)|--body|mktemp|rm -/.test(bytes), false);
  const result = spawnSync(runner, ["--run", "/tmp/checkpoint", "/tmp/private", "/tmp/public"], { encoding: "utf8" }); assert.equal(result.status, 75); assert.match(result.stderr, /descriptor-consuming upload adapter/);
});
