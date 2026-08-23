import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { sidecarFor, validateCurrentWildfirePromotionPreparation } from "./prepare-current-wildfire-immutable-promotion.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const PLAN = read("data/current-wildfire-immutable-promotion-preparation.json");
const STAGED = read("data/staged-acquisitions.json");
validateCurrentWildfirePromotionPreparation(PLAN, STAGED);

export const CHECKPOINT_SCHEMA = "witness-tree/current-wildfire-immutable-promotion-checkpoint/1";
export const CHECKPOINT_STATUS = Object.freeze({ pending: "pending", prepared: "stable-copy-prepared", started: "write-started", acknowledged: "acknowledged", readback: "readback-verified", retentionStarted: "retention-write-started", complete: "complete", ambiguous: "ambiguous-response" });
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(?!.*(?:redacted|placeholder|example|fabricated))[A-Za-z0-9._+=:/-]{6,}$/i;
const CRC64 = /^[A-Za-z0-9+/]{11}=$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const planSha256 = () => sha256(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url)));
const keyFor = (source) => `raw/${source.sourceId}/${source.sourceVersion}/${source.retrievedAt.replaceAll(":", "-")}/${source.sha256}/payload/${source.originalFilename.toLowerCase()}`;
const expectedObjects = () => PLAN.artifacts.flatMap((artifact) => {
  const source = STAGED.entries.find((entry) => entry.id === artifact.id);
  assert.ok(source, `missing staged artifact ${artifact.id}`);
  const payloadKey = keyFor(source);
  return [
    { artifactId: artifact.id, sourceId: source.sourceId, kind: "payload", key: payloadKey, bytes: source.byteLength, sha256: source.sha256 },
    { artifactId: artifact.id, sourceId: source.sourceId, kind: "manifest", key: payloadKey.replace(/\/payload\/[^/]+$/, "/manifest.json"), bytes: Buffer.byteLength(sidecarFor(PLAN, source, artifact)), sha256: sha256(sidecarFor(PLAN, source, artifact)) }
  ];
});
export const EXPECTED_RESPONSE_NAMES = Object.freeze([
  "operator-identity.evidence.json", "role-identity.evidence.json",
  ...PLAN.artifacts.flatMap(({ id }) => ["put-object", "head-object", "put-object-retention", "get-object-retention"].map((operation) => `${id}.payload.${operation}.evidence.json`).concat(["put-object", "head-object"].map((operation) => `${id}.manifest.${operation}.evidence.json`)))
]);

function exactKeys(value, expected, label) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields drifted`);
}

function ownerRegular(path) {
  assert.equal(isAbsolute(path), true, "checkpoint path must be absolute");
  const metadata = lstatSync(path);
  assert.equal(metadata.isFile() && !metadata.isSymbolicLink(), true, "checkpoint must be a regular non-symlink file");
  assert.equal(metadata.uid, process.getuid(), "checkpoint must be owner-owned");
  assert.equal(metadata.mode & 0o777, 0o600, "checkpoint must be mode 600");
  assert.equal(metadata.nlink, 1, "checkpoint must not have hard-link aliases");
  return metadata;
}

function secureParent(path) { const parent = lstatSync(dirname(path)); assert.ok(parent.isDirectory() && !parent.isSymbolicLink(), "checkpoint parent must be a regular directory"); assert.equal(parent.uid, process.getuid(), "checkpoint parent must be owner-owned"); assert.equal(parent.mode & 0o077, 0, "checkpoint parent must be owner-only"); return parent; }
function bindParent(path) { const before = secureParent(path); const fd = openSync(dirname(path), constants.O_RDONLY | constants.O_NOFOLLOW); try { const opened = fstatSync(fd); assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino); return { fd, dev: opened.dev, ino: opened.ino }; } catch (error) { closeSync(fd); throw error; } }
function assertParentBound(path, binding) { const current = secureParent(path); assert.equal(current.dev, binding.dev, "checkpoint parent device changed"); assert.equal(current.ino, binding.ino, "checkpoint parent inode changed"); }

function syncParent(path, binding) { assertParentBound(path, binding); fsyncSync(binding.fd); assertParentBound(path, binding); }

function writeNew(path, value) {
  assert.equal(isAbsolute(path), true, "checkpoint path must be absolute");
  const parent = bindParent(path);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
  let fd;
  try {
    assertParentBound(path, parent); fd = openSync(path, flags, 0o600);
    const opened = fstatSync(fd); writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    const published = ownerRegular(path); assert.equal(published.dev, opened.dev); assert.equal(published.ino, opened.ino);
    syncParent(path, parent);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    throw error;
  } finally { closeSync(parent.fd); }
}

const generationDirectory = (path) => `${path}.generations`;

function appendGeneration(path, value, generation) {
  const directory = generationDirectory(path);
  const directoryMetadata = lstatSync(directory);
  assert.ok(directoryMetadata.isDirectory() && !directoryMetadata.isSymbolicLink(), "checkpoint generation store must be a directory");
  assert.equal(directoryMetadata.uid, process.getuid()); assert.equal(directoryMetadata.mode & 0o777, 0o700);
  const directoryFd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW); const openedDirectory = fstatSync(directoryFd);
  assert.equal(openedDirectory.dev, directoryMetadata.dev); assert.equal(openedDirectory.ino, directoryMetadata.ino);
  const generationPath = join(directory, `${String(generation).padStart(8, "0")}.json`);
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let fd;
  try {
    const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0);
    fd = openSync(generationPath, flags, 0o600); const opened = fstatSync(fd);
    writeFileSync(fd, bytes); fsyncSync(fd); closeSync(fd); fd = undefined;
    const currentDirectory = lstatSync(directory); assert.equal(currentDirectory.dev, openedDirectory.dev, "checkpoint generation parent changed"); assert.equal(currentDirectory.ino, openedDirectory.ino, "checkpoint generation parent changed");
    const published = ownerRegular(generationPath); assert.equal(published.dev, opened.dev); assert.equal(published.ino, opened.ino);
    fsyncSync(directoryFd);
  } catch (error) { if (fd !== undefined) closeSync(fd); throw error; }
  finally { closeSync(directoryFd); }
}

function timestamp(value = new Date().toISOString()) {
  assert.match(value, UTC, "checkpoint timestamp is not exact");
  return value;
}

export function checkpointTemplate(now = new Date().toISOString()) {
  timestamp(now);
  return {
    schemaVersion: CHECKPOINT_SCHEMA,
    status: "new",
    operation: "owner-local-current-wildfire-raw-promotion",
    planSha256: planSha256(),
    createdAt: now,
    updatedAt: now,
    identitySessions: [],
    objects: expectedObjects().map((object) => ({ ...object, status: CHECKPOINT_STATUS.pending, localCopy: null, ack: null, head: null, retention: null, ambiguity: null })),
    responseInventory: EXPECTED_RESPONSE_NAMES.map((name) => ({ name, byteLength: null, sha256: null, rawEvidence: null })),
    responseBundleSha256: null,
    recoveryBoundary: { replicaCreated: false, replicaReadbackVerified: false, replicationMutationPerformed: false },
    claims: { exactVersionReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, productionEligible: false }
  };
}

function validateObject(object, expected) {
  exactKeys(object, ["ambiguity", "ack", "artifactId", "bytes", "head", "key", "kind", "localCopy", "retention", "sha256", "sourceId", "status"], `${expected.artifactId}/${expected.kind}`);
  assert.equal(object.artifactId, expected.artifactId);
  assert.equal(object.sourceId, expected.sourceId);
  assert.equal(object.kind, expected.kind);
  assert.equal(object.key, expected.key);
  if (expected.kind === "payload") { assert.equal(object.bytes, expected.bytes); assert.equal(object.sha256, expected.sha256); }
  else { assert.equal(object.bytes, expected.bytes); assert.equal(object.sha256, expected.sha256); }
  assert.ok(Object.values(CHECKPOINT_STATUS).includes(object.status), `${expected.artifactId}/${expected.kind} status is unknown`);
  if (object.localCopy !== null) { exactKeys(object.localCopy, ["path", "device", "inode", "byteLength", "sha256", "checksumAlgorithm", "checksumType", "checksumValue"], `${expected.artifactId}/${expected.kind} local copy`); assert.equal(isAbsolute(object.localCopy.path), true); assert.equal(object.localCopy.byteLength, expected.bytes); assert.equal(object.localCopy.sha256, expected.sha256); assert.equal(object.localCopy.checksumAlgorithm, "CRC64NVME"); assert.equal(object.localCopy.checksumType, "FULL_OBJECT"); assert.match(object.localCopy.checksumValue, CRC64); assert.ok(Number.isSafeInteger(object.localCopy.device)); assert.ok(Number.isSafeInteger(object.localCopy.inode)); }
  if (object.ack !== null) {
    exactKeys(object.ack, ["ChecksumCRC64NVME", "VersionId", "rawResponse"], `${expected.artifactId}/${expected.kind} acknowledgement`);
    assert.match(object.ack.VersionId, VERSION);
    assert.match(object.ack.ChecksumCRC64NVME, CRC64);
    const raw = JSON.parse(object.ack.rawResponse);
    assert.equal(raw.VersionId, object.ack.VersionId);
    assert.equal(raw.ChecksumCRC64NVME, object.ack.ChecksumCRC64NVME);
  }
  if (object.head !== null) {
    exactKeys(object.head, ["ChecksumCRC64NVME", "ChecksumType", "ContentLength", "VersionId", "rawResponse"], `${expected.artifactId}/${expected.kind} head`);
    assert.equal(object.head.ContentLength, expected.bytes, `${expected.artifactId}/${expected.kind} head byte length drifted`);
    assert.equal(object.head.VersionId, object.ack?.VersionId, `${expected.artifactId}/${expected.kind} head version drifted`);
    assert.equal(object.head.ChecksumType, "FULL_OBJECT", `${expected.artifactId}/${expected.kind} head is not FULL_OBJECT`);
    assert.equal(object.head.ChecksumCRC64NVME, object.ack?.ChecksumCRC64NVME, `${expected.artifactId}/${expected.kind} head checksum drifted`); assert.equal(object.head.ChecksumCRC64NVME, object.localCopy?.checksumValue, `${expected.artifactId}/${expected.kind} provider checksum is not bound to the stable local bytes`);
    const raw = JSON.parse(object.head.rawResponse);
    for (const field of ["VersionId", "ContentLength", "ChecksumType", "ChecksumCRC64NVME"]) assert.equal(raw[field], object.head[field], `${expected.artifactId}/${expected.kind} raw head ${field} drifted`);
  }
  if (object.retention !== null) {
    exactKeys(object.retention, ["Mode", "RetainUntilDate", "putResponse", "getResponse"], `${expected.artifactId}/${expected.kind} retention`);
    assert.equal(object.retention.Mode, "COMPLIANCE");
    assert.equal(object.retention.RetainUntilDate, PLAN.mfaGatedExecution.recommendedRetainUntil);
    JSON.parse(object.retention.putResponse);
    const raw = JSON.parse(object.retention.getResponse);
    assert.equal(raw.Retention?.Mode, object.retention.Mode);
    assert.equal(raw.Retention?.RetainUntilDate, object.retention.RetainUntilDate);
  }
  if (object.ambiguity !== null) {
    exactKeys(object.ambiguity, ["at", "phase", "reason"], `${expected.artifactId}/${expected.kind} ambiguity`);
    assert.ok(["put-object", "put-object-retention"].includes(object.ambiguity.phase));
    assert.equal(object.ambiguity.reason, "response-lost-or-provider-failure");
    timestamp(object.ambiguity.at);
  }
}

export function validateCheckpoint(value, plan = PLAN) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "checkpoint is malformed");
  exactKeys(value, ["claims", "createdAt", "identitySessions", "objects", "operation", "planSha256", "recoveryBoundary", "responseBundleSha256", "responseInventory", "schemaVersion", "status", "updatedAt"], "checkpoint");
  assert.equal(value.schemaVersion, CHECKPOINT_SCHEMA);
  assert.equal(value.operation, "owner-local-current-wildfire-raw-promotion");
  assert.equal(value.planSha256, sha256(readFileSync(new URL("../data/current-wildfire-immutable-promotion-preparation.json", import.meta.url))));
  assert.ok(["new", "running", "owner-review-required", "completed"].includes(value.status));
  timestamp(value.createdAt); timestamp(value.updatedAt);
  assert.ok(Array.isArray(value.identitySessions), "checkpoint identity sessions are malformed");
  assert.ok(value.identitySessions.length <= 1, "checkpoint may contain exactly one identity session at most");
  for (const session of value.identitySessions) {
    exactKeys(session, ["operatorRaw", "roleRaw"], "checkpoint identity session");
    const operator = JSON.parse(session.operatorRaw); const role = JSON.parse(session.roleRaw);
    assert.equal(operator.Account, "286853118812");
    assert.equal(operator.Arn, "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator");
    assert.equal(role.Account, "286853118812");
    assert.match(role.Arn, /^arn:aws:sts::286853118812:assumed-role\/WitnessTreeCurrentWildfirePromotionUploader\//);
  }
  assert.ok(Array.isArray(value.objects));
  const expected = expectedObjects(plan);
  assert.equal(value.objects.length, expected.length);
  for (const [index, object] of value.objects.entries()) validateObject(object, expected[index]);
  assert.deepEqual(value.responseInventory.map(({ name }) => name), [...EXPECTED_RESPONSE_NAMES]); for (const item of value.responseInventory) { exactKeys(item, ["name", "byteLength", "sha256", "rawEvidence"], "response inventory item"); if (item.sha256 !== null) { assert.match(item.sha256, SHA256); assert.ok(Number.isSafeInteger(item.byteLength) && item.byteLength >= 0); assert.equal(typeof item.rawEvidence, "string"); assert.equal(Buffer.byteLength(item.rawEvidence), item.byteLength); assert.equal(sha256(item.rawEvidence), item.sha256); } else { assert.equal(item.byteLength, null); assert.equal(item.rawEvidence, null); } }
  const bundle = sha256(`${JSON.stringify(value.responseInventory.map(({ name, byteLength, sha256: digest }) => ({ name, byteLength, sha256: digest })))}\n`);
  if (value.status === "completed") assert.equal(value.responseBundleSha256, bundle, "response bundle digest drifted"); else assert.equal(value.responseBundleSha256, null);
  assert.deepEqual(value.recoveryBoundary, { replicaCreated: false, replicaReadbackVerified: false, replicationMutationPerformed: false });
  assert.deepEqual(value.claims, { exactVersionReadbacksVerified: false, retentionVerified: false, immutableObjectStorage: false, productionEligible: false });
  return value;
}

function latestGenerationPath(path) {
  const directory = generationDirectory(path);
  let names = [];
  let identity = null;
  try { const before = lstatSync(directory); assert.ok(before.isDirectory() && !before.isSymbolicLink()); names = readdirSync(directory).filter((name) => /^\d{8}\.json$/.test(name)).sort(); const after = lstatSync(directory); assert.equal(after.dev, before.dev); assert.equal(after.ino, before.ino); identity = { path: directory, dev: after.dev, ino: after.ino }; } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return { path: names.length === 0 ? path : join(directory, names.at(-1)), directory: identity };
}

export function loadCheckpoint(path) {
  const latest = latestGenerationPath(path); path = latest.path;
  const before = ownerRegular(path); const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const opened = fstatSync(fd); assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino); const bytes = readFileSync(fd); const after = fstatSync(fd); assert.equal(after.dev, opened.dev); assert.equal(after.ino, opened.ino); assert.equal(after.size, opened.size); if (latest.directory) { const current = lstatSync(latest.directory.path); assert.equal(current.dev, latest.directory.dev, "checkpoint generation parent changed during read"); assert.equal(current.ino, latest.directory.ino, "checkpoint generation parent changed during read"); } return validateCheckpoint(JSON.parse(bytes)); } finally { closeSync(fd); }
}

function target(value, artifactId, kind) {
  const object = value.objects.find((candidate) => candidate.artifactId === artifactId && candidate.kind === kind);
  assert.ok(object, "checkpoint object is outside the exact plan");
  return object;
}

function mutate(path, callback) {
  const value = loadCheckpoint(path); callback(value); value.updatedAt = new Date().toISOString(); validateCheckpoint(value);
  const directory = generationDirectory(path); const generation = readdirSync(directory).filter((name) => /^\d{8}\.json$/.test(name)).length + 1;
  appendGeneration(path, value, generation); return value;
}

export function initializeCheckpoint(path, now = new Date().toISOString()) {
  const value = checkpointTemplate(now);
  const parent = bindParent(path);
  try { mkdirSync(generationDirectory(path), { mode: 0o700 }); syncParent(path, parent); writeNew(path, value); } finally { closeSync(parent.fd); }
  return value;
}

export function recordIdentity(path, operatorRaw, roleRaw) {
  return mutate(path, (value) => {
    assert.ok(["new", "running"].includes(value.status), "identity cannot be added to a checkpoint requiring owner review");
    assert.equal(value.objects.some((object) => [CHECKPOINT_STATUS.started, CHECKPOINT_STATUS.ambiguous, CHECKPOINT_STATUS.retentionStarted].includes(object.status)), false, "identity cannot be added across an unresolved write boundary");
    assert.equal(value.identitySessions.length, 0, "checkpoint already contains an identity session");
    const operatorValue = JSON.parse(operatorRaw); const roleValue = JSON.parse(roleRaw);
    exactKeys(operatorValue, ["Account", "Arn"], "operator identity"); exactKeys(roleValue, ["Account", "Arn"], "role identity");
    value.identitySessions.push({ operatorRaw: `${JSON.stringify(operatorValue)}\n`, roleRaw: `${JSON.stringify(roleValue)}\n` });
  });
}

export function recordPreparedCopy(path, artifactId, kind, localCopy) { return mutate(path, (value) => { const object = target(value, artifactId, kind); assert.equal(object.status, CHECKPOINT_STATUS.pending); object.localCopy = localCopy; object.status = CHECKPOINT_STATUS.prepared; value.status = "running"; }); }

const BUCKET = "witness-tree-raw-archive-ca-central-1";
const REGION = "ca-central-1";
const secretPattern = /(?:AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|AccessKeyId|SecretAccessKey|SessionToken|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})/i;

export function expectedResponseCommand(name, value) {
  if (name === "operator-identity.evidence.json" || name === "role-identity.evidence.json") return ["aws", "sts", "get-caller-identity", "--output", "json"];
  const match = name.match(/^(.*)\.(payload|manifest)\.(put-object|head-object|put-object-retention|get-object-retention)\.evidence\.json$/);
  assert.ok(match, "response name has no exact command schema");
  const [, artifactId, kind, operation] = match; const object = target(value, artifactId, kind);
  const base = ["aws", "s3api", operation, "--bucket", BUCKET, "--key", object.key];
  if (operation === "put-object") return [...base, "--body", object.localCopy?.path, "--if-none-match", "*", "--checksum-algorithm", "CRC64NVME", "--checksum-crc64-nvme", object.localCopy?.checksumValue, "--region", REGION, "--output", "json"];
  if (operation === "head-object") return [...base, "--version-id", object.ack?.VersionId, "--checksum-mode", "ENABLED", "--region", REGION, "--output", "json"];
  if (operation === "put-object-retention") return [...base, "--version-id", object.ack?.VersionId, "--retention", `Mode=COMPLIANCE,RetainUntilDate=${PLAN.mfaGatedExecution.recommendedRetainUntil}`, "--region", REGION, "--output", "json"];
  return [...base, "--version-id", object.ack?.VersionId, "--region", REGION, "--output", "json"];
}

function sanitizeStdout(name, stdout) {
  assert.equal(typeof stdout, "string"); assert.equal(secretPattern.test(stdout), false, "response contains credential material");
  const parsed = JSON.parse(stdout);
  if (name.endsWith("identity.evidence.json")) { exactKeys(parsed, ["Account", "Arn"], "identity stdout"); return parsed; }
  if (name.includes(".put-object.evidence.")) { exactKeys(parsed, ["ChecksumCRC64NVME", "VersionId"], "put-object stdout"); return parsed; }
  if (name.includes(".head-object.evidence.")) { exactKeys(parsed, ["ChecksumCRC64NVME", "ChecksumType", "ContentLength", "VersionId"], "head-object stdout"); return parsed; }
  if (name.includes(".put-object-retention.evidence.")) { exactKeys(parsed, [], "put-object-retention stdout"); return parsed; }
  exactKeys(parsed, ["Retention"], "get-object-retention stdout"); exactKeys(parsed.Retention, ["Mode", "RetainUntilDate"], "retention stdout"); return parsed;
}

export function recordResponseEvidence(path, name, evidencePath) { return mutate(path, (value) => {
  assert.ok(EXPECTED_RESPONSE_NAMES.includes(name), "response name is outside the exact inventory"); const item = value.responseInventory.find((entry) => entry.name === name); assert.equal(item.sha256, null, "response evidence is duplicated");
  const before = ownerRegular(evidencePath); const fd = openSync(evidencePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const opened = fstatSync(fd); assert.equal(opened.dev, before.dev); assert.equal(opened.ino, before.ino); const raw = readFileSync(fd); assert.equal(secretPattern.test(raw.toString("utf8")), false, "response evidence contains credential material"); const parsed = JSON.parse(raw); exactKeys(parsed, ["command", "stderr", "stdout"], "response evidence"); assert.deepEqual(parsed.command, expectedResponseCommand(name, value), "response command does not match the exact evidence schema"); assert.equal(parsed.stderr, "", "response stderr must be empty"); const stdout = `${JSON.stringify(sanitizeStdout(name, parsed.stdout))}\n`; const canonical = `${JSON.stringify({ command: parsed.command, stdout, stderr: "" })}\n`; item.byteLength = Buffer.byteLength(canonical); item.sha256 = sha256(canonical); item.rawEvidence = canonical;
  } finally { closeSync(fd); }
}); }

export function markWriteStarted(path, artifactId, kind) {
  return mutate(path, (value) => {
    assert.ok(["new", "running"].includes(value.status), "checkpoint is not runnable; owner review is required");
    const object = target(value, artifactId, kind);
    assert.equal(object.status, CHECKPOINT_STATUS.prepared, "object stable copy is not prepared or write already started");
    object.status = CHECKPOINT_STATUS.started;
    value.status = "running";
  });
}

export function recordAcknowledgement(path, artifactId, kind, ack) {
  return mutate(path, (value) => {
    const object = target(value, artifactId, kind);
    assert.equal(object.status, CHECKPOINT_STATUS.started, "object is not awaiting its first write acknowledgement");
    assert.match(ack?.VersionId ?? "", VERSION, "PutObject acknowledgement has no concrete version");
    assert.match(ack?.ChecksumCRC64NVME ?? "", CRC64, "PutObject acknowledgement has no CRC64NVME checksum");
    object.ack = { VersionId: ack.VersionId, ChecksumCRC64NVME: ack.ChecksumCRC64NVME, rawResponse: `${JSON.stringify({ VersionId: ack.VersionId, ChecksumCRC64NVME: ack.ChecksumCRC64NVME })}\n` };
    object.status = CHECKPOINT_STATUS.acknowledged;
  });
}

export function recordHead(path, artifactId, kind, head) {
  return mutate(path, (value) => {
    const expected = expectedObjects().find((candidate) => candidate.artifactId === artifactId && candidate.kind === kind);
    const object = target(value, artifactId, kind);
    assert.ok([CHECKPOINT_STATUS.acknowledged, CHECKPOINT_STATUS.readback].includes(object.status), "object does not have an acknowledged version");
    const raw = { VersionId: head.VersionId, ContentLength: head.ContentLength, ChecksumType: head.ChecksumType, ChecksumCRC64NVME: head.ChecksumCRC64NVME };
    const normalized = { ...raw, rawResponse: `${JSON.stringify(raw)}\n` };
    validateObject({ ...object, head: normalized, status: CHECKPOINT_STATUS.readback }, expected);
    object.head = normalized;
    object.status = CHECKPOINT_STATUS.readback;
  });
}

export function markRetentionStarted(path, artifactId) {
  return mutate(path, (value) => {
    const object = target(value, artifactId, "payload");
    assert.equal(object.status, CHECKPOINT_STATUS.readback, "payload is not ready for retention");
    object.status = CHECKPOINT_STATUS.retentionStarted;
  });
}

export function recordRetention(path, artifactId, retention) {
  return mutate(path, (value) => {
    const object = target(value, artifactId, "payload");
    assert.equal(object.status, CHECKPOINT_STATUS.retentionStarted, "payload retention write was not started");
    const normalized = { Mode: retention.Mode, RetainUntilDate: retention.RetainUntilDate, putResponse: "{}\n", getResponse: `${JSON.stringify({ Retention: { Mode: retention.Mode, RetainUntilDate: retention.RetainUntilDate } })}\n` };
    validateObject({ ...object, retention: normalized, status: CHECKPOINT_STATUS.complete }, expectedObjects().find((candidate) => candidate.artifactId === artifactId && candidate.kind === "payload"));
    object.retention = normalized;
    object.status = CHECKPOINT_STATUS.complete;
  });
}

export function markManifestComplete(path, artifactId) {
  return mutate(path, (value) => {
    const object = target(value, artifactId, "manifest");
    assert.equal(object.status, CHECKPOINT_STATUS.readback, "manifest is not exactly read back");
    object.status = CHECKPOINT_STATUS.complete;
  });
}

export function markAmbiguous(path, artifactId, kind, phase) {
  return mutate(path, (value) => {
    const object = target(value, artifactId, kind);
    assert.ok([CHECKPOINT_STATUS.started, CHECKPOINT_STATUS.retentionStarted].includes(object.status), "checkpoint has no ambiguous write boundary");
    assert.ok(["put-object", "put-object-retention"].includes(phase));
    object.status = CHECKPOINT_STATUS.ambiguous;
    object.ambiguity = { phase, reason: "response-lost-or-provider-failure", at: new Date().toISOString() };
    value.status = "owner-review-required";
  });
}

export function completeCheckpoint(path) {
  return mutate(path, (value) => {
    assert.ok(value.objects.every((object) => object.status === CHECKPOINT_STATUS.complete), "checkpoint cannot complete before every exact object boundary");
    assert.equal(value.identitySessions.length, 1, "checkpoint requires exactly one operator/role identity session"); assert.ok(value.responseInventory.every((entry) => entry.sha256 !== null), "checkpoint cannot complete without the exact finite response inventory");
    value.status = "completed";
    value.responseBundleSha256 = sha256(`${JSON.stringify(value.responseInventory.map(({ name, byteLength, sha256: digest }) => ({ name, byteLength, sha256: digest })))}\n`);
  });
}

export function assertRunnableCheckpoint(path) {
  const value = loadCheckpoint(path);
  assert.ok(["new", "running"].includes(value.status), "checkpoint requires owner review before retry; no duplicate write is safe");
  assert.equal(value.objects.some((object) => [CHECKPOINT_STATUS.started, CHECKPOINT_STATUS.ambiguous, CHECKPOINT_STATUS.retentionStarted].includes(object.status)), false, "checkpoint contains an unresolved write boundary; owner review is required");
  assert.equal(value.identitySessions.length, 0, "checkpoint already contains an owner session; owner review is required before another session can run");
  return value;
}

if (process.argv[1]?.endsWith("check-current-wildfire-promotion-checkpoint.mjs")) {
  try {
    const [mode, path, artifactId, kind, input, phase] = process.argv.slice(2);
    if (mode === "--init") initializeCheckpoint(path);
    else if (mode === "--validate") loadCheckpoint(path);
    else if (mode === "--assert-runnable") assertRunnableCheckpoint(path);
    else if (mode === "--record-identity") recordIdentity(path, readFileSync(artifactId, "utf8"), readFileSync(kind, "utf8"));
    else if (mode === "--record-prepared") recordPreparedCopy(path, artifactId, kind, JSON.parse(readFileSync(input, "utf8")));
    else if (mode === "--record-evidence") recordResponseEvidence(path, artifactId, kind);
    else if (mode === "--mark-write-started") markWriteStarted(path, artifactId, kind);
    else if (mode === "--record-ack") { const rawResponse = readFileSync(input, "utf8"); const raw = JSON.parse(rawResponse); recordAcknowledgement(path, artifactId, kind, { ...raw, rawResponse }); }
    else if (mode === "--record-head") { const rawResponse = readFileSync(input, "utf8"); const raw = JSON.parse(rawResponse); recordHead(path, artifactId, kind, { VersionId: raw.VersionId, ContentLength: raw.ContentLength, ChecksumType: raw.ChecksumType, ChecksumCRC64NVME: raw.ChecksumCRC64NVME, rawResponse }); }
    else if (mode === "--mark-retention-started") markRetentionStarted(path, artifactId);
    else if (mode === "--record-retention") { const putResponse = readFileSync(kind, "utf8"); const getResponse = readFileSync(input, "utf8"); const raw = JSON.parse(getResponse); recordRetention(path, artifactId, { Mode: raw.Retention?.Mode, RetainUntilDate: raw.Retention?.RetainUntilDate, putResponse, getResponse }); }
    else if (mode === "--mark-manifest-complete") markManifestComplete(path, artifactId);
    else if (mode === "--mark-ambiguous") markAmbiguous(path, artifactId, kind, phase);
    else if (mode === "--complete") completeCheckpoint(path);
    else throw new Error("usage");
    console.log("Current-wildfire checkpoint operation passed; opaque provider values remain owner-local.");
  } catch {
    console.error("Current-wildfire checkpoint failed closed; owner review is required and no retry is authorized.");
    process.exitCode = 65;
  }
}
