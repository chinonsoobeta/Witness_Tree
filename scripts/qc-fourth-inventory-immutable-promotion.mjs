import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants as fsConstants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { canonicalManifestBytes, exactPromotionObjects, loadQcFourthInventoryPromotionPreparation, qcFourthPlanDigests } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const RETAIN_UNTIL = "2033-08-12T00:00:00Z";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  const hash = createHash("sha256");
  const descriptor = openSourceRead(file);
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

const base64Sha256 = (hex) => Buffer.from(hex, "hex").toString("base64");
const iso = (value) => new Date(value).toISOString();
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;
const COMPOSITE_SHA256 = /^[A-Za-z0-9+/]{43}=-[1-9][0-9]*$/;
const ACCOUNT = "286853118812";
const OPERATOR_PROFILE = "WitnessTreeArchiveOperator";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/${OPERATOR_PROFILE}`;
const PROMOTION_ROLE = "WitnessTreeQcFourthArchivePromotionUploader";
const PROMOTION_ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/${PROMOTION_ROLE}`;
const ROLE_SESSION_NAME = "witness-tree-qc-fourth-approved-promotion";
const RUN_TICKET_PREFIX = "qc-fourth-inventory-promotion-run";
const STATE_PREFIX = "qc-fourth-inventory-promotion-state";

function ownerUid() {
  assert.equal(typeof process.getuid, "function", "Owner-controlled paths require a POSIX owner identity.");
  return process.getuid();
}

function modeBits(info) {
  return info.mode & 0o777;
}

function pathExists(file) {
  try {
    lstatSync(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function sameInode(left, right) { return left?.dev === right?.dev && left?.ino === right?.ino; }

function bindDirectory(directory, label, mode = PRIVATE_DIRECTORY_MODE) {
  assert.equal(typeof fsConstants.O_NOFOLLOW, "number", `${label} requires symlink protection.`);
  const before = lstatSync(directory); const descriptor = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try { const opened = fstatSync(descriptor); assert.ok(opened.isDirectory() && before.isDirectory() && !before.isSymbolicLink() && sameInode(opened, before), `${label} identity changed.`); assert.equal(opened.uid, ownerUid(), `${label} must be owner-owned.`); if (mode !== undefined) assert.equal(modeBits(opened), mode, `${label} mode drifted.`); return { directory, descriptor, dev: opened.dev, ino: opened.ino }; }
  catch (error) { closeSync(descriptor); throw error; }
}

function assertBoundDirectory(binding) { const current = lstatSync(binding.directory); assert.ok(current.isDirectory() && !current.isSymbolicLink() && current.dev === binding.dev && current.ino === binding.ino, "Controlled directory identity changed; published evidence is retained for inspection."); }
function syncBoundDirectory(binding) { assertBoundDirectory(binding); fsyncSync(binding.descriptor); assertBoundDirectory(binding); }

function appendOnlyPrivateFile(file, bytes, label, binding) {
  assert.ok(path.isAbsolute(file), `${label} path must be absolute.`); assert.equal(path.dirname(file), binding.directory, `${label} parent binding drifted.`); assertBoundDirectory(binding);
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, PRIVATE_FILE_MODE);
  try { const opened = fstatSync(descriptor); assert.ok(opened.isFile() && opened.uid === ownerUid() && opened.nlink === 1 && modeBits(opened) === PRIVATE_FILE_MODE); writeFileSync(descriptor, bytes); fsyncSync(descriptor); const after = fstatSync(descriptor); assert.ok(sameInode(opened, after) && after.size === Buffer.byteLength(bytes)); }
  finally { closeSync(descriptor); }
  assertBoundDirectory(binding); const published = lstatSync(file); assert.ok(published.isFile() && !published.isSymbolicLink() && published.nlink === 1 && published.uid === ownerUid() && modeBits(published) === PRIVATE_FILE_MODE); syncBoundDirectory(binding); return file;
}

function assertDirectoryMetadata(directory, label, mode) {
  const info = lstatSync(directory);
  assert.ok(!info.isSymbolicLink() && info.isDirectory(), `${label} must be an existing non-symlink directory.`);
  assert.equal(info.uid, ownerUid(), `${label} must be owner-owned.`);
  if (mode !== undefined) assert.equal(modeBits(info), mode, `${label} must be mode ${mode.toString(8).padStart(3, "0")}.`);
  return realpathSync(directory);
}

function assertPrivateFileMetadata(file, label) {
  const info = lstatSync(file);
  assert.ok(!info.isSymbolicLink() && info.isFile(), `${label} must be an existing non-symlink regular file.`);
  assert.equal(info.uid, ownerUid(), `${label} must be owner-owned.`);
  assert.equal(modeBits(info), PRIVATE_FILE_MODE, `${label} must be mode 600.`);
  assert.equal(info.nlink, 1, `${label} must not have hard links.`);
  return realpathSync(file);
}

function privateFileRead(file, label) {
  assert.equal(typeof fsConstants.O_NOFOLLOW, "number", "Private file reads require symlink protection.");
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const info = fstatSync(descriptor);
    assert.ok(info.isFile(), `${label} must be a regular file.`);
    assert.equal(info.uid, ownerUid(), `${label} must be owner-owned.`);
    assert.equal(modeBits(info), PRIVATE_FILE_MODE, `${label} must be mode 600.`);
    assert.equal(info.nlink, 1, `${label} must not have hard links.`);
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function openPrivateScratch(file) {
  assert.equal(typeof fsConstants.O_NOFOLLOW, "number", "Multipart scratch files require symlink protection.");
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, PRIVATE_FILE_MODE);
  const info = fstatSync(descriptor);
  try {
    assert.ok(info.isFile(), "Multipart scratch file must be regular.");
    assert.equal(info.uid, ownerUid(), "Multipart scratch file must be owner-owned.");
    assert.equal(modeBits(info), PRIVATE_FILE_MODE, "Multipart scratch file must be mode 600.");
    assert.equal(info.nlink, 1, "Multipart scratch file must not have hard links.");
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function openSourceRead(file) {
  assert.equal(typeof fsConstants.O_NOFOLLOW, "number", "Source reads require symlink protection.");
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  const info = fstatSync(descriptor);
  try {
    assert.ok(info.isFile(), "Source must be a regular file.");
    assert.equal(info.nlink, 1, "Source must not have hard links.");
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function atomicPrivateFile(file, bytes, label) {
  const binding = bindDirectory(path.dirname(file), `${label} parent`);
  try { return appendOnlyPrivateFile(file, bytes, label, binding); } finally { closeSync(binding.descriptor); }
}

function acquireRunLock(options, plan) {
  const stateDir = assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE);
  const binding = bindDirectory(stateDir, "promotion run journal parent"); assertBoundDirectory(binding); const tickets = readdirSync(stateDir).filter((name) => new RegExp(`^${RUN_TICKET_PREFIX}\\.\\d{8}\\.json$`).test(name)).sort(); assertBoundDirectory(binding); tickets.forEach((name, index) => assert.equal(name, `${RUN_TICKET_PREFIX}.${String(index + 1).padStart(8, "0")}.json`, "promotion run journal sequence drifted"));
  if (tickets.length) { const latest = tickets.at(-1); assert.equal(pathExists(path.join(stateDir, `${latest}.closed`)), true, "An exclusive promotion run is active or left an unreviewed durable ticket; owner recovery is required."); }
  const sequence = tickets.length + 1; const name = `${RUN_TICKET_PREFIX}.${String(sequence).padStart(8, "0")}.json`; const lockPath = path.join(stateDir, name); const digests = qcFourthPlanDigests(plan);
  try { appendOnlyPrivateFile(lockPath, `${JSON.stringify({ schemaVersion: 1, sequence, pid: process.pid, startedAt: new Date().toISOString(), planFileSha256: digests.planFileSha256, planParsedSha256: digests.planParsedSha256 })}\n`, "promotion run ticket", binding); } catch (error) { closeSync(binding.descriptor); throw error; }
  let closed = false;
  return { path: lockPath, release: (outcome = "ended") => { if (closed) return; try { appendOnlyPrivateFile(`${lockPath}.closed`, `${JSON.stringify({ schemaVersion: 1, sequence, outcome, closedAt: new Date().toISOString(), ticketSha256: sha256Bytes(privateFileRead(lockPath, "promotion run ticket")) })}\n`, "promotion run closure", binding); } finally { closed = true; closeSync(binding.descriptor); } }, abandon: () => { if (!closed) closeSync(binding.descriptor); closed = true; } };
}

function assertStateRecordBinding(entry, record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), `${entry.id} state record is malformed.`);
  assert.equal(record.objectKey, entry.objectKey, `${entry.id} state key drifted.`);
  assert.equal(record.byteLength, entry.byteLength, `${entry.id} state byte length drifted.`);
  assert.equal(record.sha256, entry.sha256, `${entry.id} state SHA-256 drifted.`);
  assert.match(record.mutationSessionSha256 || "", /^[a-f0-9]{64}$/, `${entry.id} mutation session binding is missing.`);
  return record;
}

export function validateExecutionOptions(plan, options) {
  if (!options.execute) return { mode: "dry-run" };
  assert.equal(options.approveExactArtifacts, true, "Execution requires --approve-exact-artifact-set.");
  assert.equal(options.approveIam, true, "Execution requires --approve-iam-policy.");
  assert.equal(options.approveRetention, true, "Execution requires --approve-compliance-retention.");
  assert.equal(options.approveMfa, true, "Execution requires --approve-mfa-session.");
  assert.equal(options.retentionUntil, RETAIN_UNTIL, `Retention is pinned to ${RETAIN_UNTIL}.`);
  assert.equal(options.sessionReady, true, "Execution requires the owner-local MFA role-session runner.");
  for (const name of ["dataRoot", "stateDir", "sidecarDir"]) assert.ok(path.isAbsolute(options[name] || ""), `Execution requires an absolute --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
  const dataRoot = assertDirectoryMetadata(options.dataRoot, "--data-root");
  const stateDir = assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE);
  const sidecarDir = assertDirectoryMetadata(options.sidecarDir, "--sidecar-dir", PRIVATE_DIRECTORY_MODE);
  assert.equal(path.basename(dataRoot), "Witness_Tree-data", "--data-root must resolve to the exact Witness_Tree-data directory.");
  const dataRootInfo = lstatSync(options.dataRoot);
  assert.equal(modeBits(dataRootInfo) & 0o022, 0, "--data-root must not be writable by group or other users.");
  for (const [name, directory] of [["state", stateDir], ["sidecar", sidecarDir]]) {
    assert.notEqual(directory, path.parse(directory).root, `${name} directory cannot be a filesystem root.`);
    assert.notEqual(directory, realpathSync(homedir()), `${name} directory cannot be the user home directory.`);
    assert.notEqual(directory, dataRoot, `${name} directory must not be the data root.`);
  }
  const within = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);
  assert.equal(within(stateDir, sidecarDir) || within(sidecarDir, stateDir), false, "State and sidecar directories must not contain one another.");
  assert.equal(within(dataRoot, stateDir) || within(stateDir, dataRoot), false, "State directory must be separate from the data root.");
  assert.equal(within(dataRoot, sidecarDir) || within(sidecarDir, dataRoot), false, "Sidecar directory must be separate from the data root.");
  assert.notEqual(stateDir, sidecarDir, "State and generated sidecars require separate controlled directories.");
  assert.equal(plan.bucket, "witness-tree-raw-archive-ca-central-1");
  assert.equal(plan.region, "ca-central-1");
  assert.deepEqual(plan.retention, { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL });
  return { mode: "execute" };
}

export function dryRunLines(plan) {
  const objects = exactPromotionObjects(plan);
  return [
    `DRY RUN ONLY — no AWS or IAM call; bucket=${plan.bucket}; region=${plan.region}; mode=COMPLIANCE; retainUntil=${RETAIN_UNTIL}`,
    ...objects.map((entry) => `${entry.byteLength > plan.upload.multipartThresholdBytes ? "MULTIPART" : "SINGLE-PUT"} bytes=${entry.byteLength} sha256=${entry.sha256} key=${entry.objectKey}`),
    `TOTAL objects=${objects.length} payloads=${plan.archiveSet.count} evidence=${plan.evidenceArtifacts.length + 1} bytes=${objects.reduce((sum, entry) => sum + entry.byteLength, 0)}`
  ];
}

function exactDataRoot(dataRoot) {
  assert.ok(path.isAbsolute(dataRoot || ""), "A read-only preflight requires an absolute --data-root.");
  const resolved = assertDirectoryMetadata(dataRoot, "--data-root");
  assert.notEqual(resolved, path.parse(resolved).root, "The data root cannot be a filesystem root.");
  assert.equal(path.basename(resolved), "Witness_Tree-data", "--data-root must resolve to the exact Witness_Tree-data directory.");
  assert.equal(modeBits(lstatSync(dataRoot)) & 0o022, 0, "--data-root must not be writable by group or other users.");
  return resolved;
}

function sourceObjects(plan, dataRoot) {
  const withinDataRoot = (relative) => {
    const candidate = path.resolve(dataRoot, relative);
    const info = lstatSync(candidate);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${relative} must be a regular non-symlink file.`);
    assert.equal(info.uid, ownerUid(), `${relative} must be owner-owned.`);
    assert.equal(info.nlink, 1, `${relative} must not have hard links.`);
    const resolved = realpathSync(candidate);
    assert.ok(resolved.startsWith(`${dataRoot}${path.sep}`), `${relative} escapes the data root.`);
    return resolved;
  };
  return [
    ...plan.archiveSet.payloads.map((entry) => ({ ...entry, id: `sheet-${entry.sheet}`, file: withinDataRoot(entry.dataRootRelativePath) })),
    ...plan.evidenceArtifacts.map((entry) => ({ ...entry, file: withinDataRoot(entry.dataRootRelativePath) }))
  ];
}

function localObjects(plan, options) {
  const dataRoot = exactDataRoot(options.dataRoot);
  const sources = sourceObjects(plan, dataRoot);
  const manifestBytes = canonicalManifestBytes(plan);
  assert.equal(manifestBytes.length, plan.canonicalManifest.byteLength);
  assert.equal(sha256Bytes(manifestBytes), plan.canonicalManifest.sha256);
  const sidecarDir = assertDirectoryMetadata(options.sidecarDir, "--sidecar-dir", PRIVATE_DIRECTORY_MODE);
  const manifestPath = path.join(sidecarDir, "collection-manifest.json");
  if (pathExists(manifestPath)) {
    assertPrivateFileMetadata(manifestPath, "Existing canonical sidecar");
    assert.deepEqual(privateFileRead(manifestPath, "Existing canonical sidecar"), manifestBytes, "Existing canonical sidecar bytes drifted.");
  } else {
    atomicPrivateFile(manifestPath, manifestBytes, "Generated canonical sidecar");
  }
  return [
    ...sources,
    { ...plan.canonicalManifest, id: "canonical-collection-manifest", file: manifestPath }
  ];
}

function preflight(objects) {
  for (const entry of objects) {
    const info = lstatSync(entry.file);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${entry.id} must remain a regular non-symlink file.`);
    assert.equal(info.nlink, 1, `${entry.id} must not have hard links.`);
    assert.equal(info.size, entry.byteLength, `${entry.id} local byte length drifted.`);
    assert.equal(sha256File(entry.file), entry.sha256, `${entry.id} local SHA-256 drifted.`);
  }
}

export function preflightLocal(plan, options) {
  assert.equal(options.execute, false, "A read-only preflight cannot be combined with --execute.");
  const dataRoot = exactDataRoot(options.dataRoot);
  const sources = sourceObjects(plan, dataRoot);
  assert.equal(sources.length, plan.archiveSet.count + plan.evidenceArtifacts.length, "The local source set is incomplete.");
  preflight(sources);
  const manifestBytes = canonicalManifestBytes(plan);
  assert.equal(manifestBytes.length, plan.canonicalManifest.byteLength);
  assert.equal(sha256Bytes(manifestBytes), plan.canonicalManifest.sha256);
  return { dataRoot, sources, manifestBytes };
}

function invokeJson(args, env = process.env) {
  const output = execFileSync("aws", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  return output.trim() ? JSON.parse(output) : {};
}

function roleEnvironment() {
  assert.ok(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN, "The MFA role-session runner did not provide temporary credentials.");
  return ownerRoleEnvironment(process.env);
}

export function ownerRoleEnvironment(environment) {
  assert.ok(environment?.AWS_ACCESS_KEY_ID && environment?.AWS_SECRET_ACCESS_KEY && environment?.AWS_SESSION_TOKEN, "The MFA role-session runner did not provide temporary credentials.");
  assert.equal(environment.WITNESS_TREE_SESSION_VERIFIED, "1", "The owner-local MFA/session wrapper did not attest its exact session.");
  assert.equal(environment.WITNESS_TREE_ACCOUNT, ACCOUNT, "The owner-local MFA/session wrapper used the wrong AWS account.");
  assert.equal(environment.WITNESS_TREE_OPERATOR_ARN, OPERATOR_ARN, "The owner-local MFA/session wrapper used the wrong operator identity.");
  assert.equal(environment.WITNESS_TREE_ROLE_ARN, PROMOTION_ROLE_ARN, "The owner-local MFA/session wrapper used the wrong promotion role.");
  assert.equal(environment.WITNESS_TREE_ROLE_SESSION_NAME, ROLE_SESSION_NAME, "The owner-local MFA/session wrapper used the wrong role-session name.");
  assert.equal(environment.WITNESS_TREE_MFA_PRESENT, "true", "The owner-local wrapper did not attest fresh MFA.");
  assert.ok(typeof environment.WITNESS_TREE_SESSION_EXPIRES_AT === "string" && Number.isFinite(Date.parse(environment.WITNESS_TREE_SESSION_EXPIRES_AT)), "The owner-local MFA/session wrapper did not provide a session expiry.");
  assert.ok(Date.parse(environment.WITNESS_TREE_SESSION_EXPIRES_AT) > Date.now(), "The owner-local MFA role session is expired.");
  assert.equal(environment.WITNESS_TREE_ASSUMED_ROLE_ARN, `arn:aws:sts::${ACCOUNT}:assumed-role/${PROMOTION_ROLE}/${ROLE_SESSION_NAME}`, "The assumed-role identity provenance is missing.");
  assert.match(environment.WITNESS_TREE_ROLE_USER_ID || "", /^\S+$/, "The assumed-role UserId provenance is missing.");
  assert.match(environment.WITNESS_TREE_MFA_SERIAL_ARN || "", new RegExp(`^arn:aws:iam::${ACCOUNT}:mfa/[A-Za-z0-9+=,.@_/-]+$`), "The MFA serial provenance is missing.");
  return { ...environment, AWS_REGION: "ca-central-1", AWS_DEFAULT_REGION: "ca-central-1" };
}

function sessionProvenance(environment) {
  return { account: ACCOUNT, operatorArn: OPERATOR_ARN, roleArn: PROMOTION_ROLE_ARN, roleSessionName: ROLE_SESSION_NAME, assumedRoleArn: environment.WITNESS_TREE_ASSUMED_ROLE_ARN, roleUserId: environment.WITNESS_TREE_ROLE_USER_ID, mfaSerialArn: environment.WITNESS_TREE_MFA_SERIAL_ARN, mfaPresent: true, sessionExpiresAt: new Date(environment.WITNESS_TREE_SESSION_EXPIRES_AT).toISOString() };
}

function validateSessionProvenance(session) {
  assert.deepEqual(Object.keys(session).sort(), ["account", "assumedRoleArn", "mfaPresent", "mfaSerialArn", "operatorArn", "roleArn", "roleSessionName", "roleUserId", "sessionExpiresAt"]);
  assert.equal(session.account, ACCOUNT); assert.equal(session.operatorArn, OPERATOR_ARN); assert.equal(session.roleArn, PROMOTION_ROLE_ARN); assert.equal(session.roleSessionName, ROLE_SESSION_NAME);
  assert.equal(session.assumedRoleArn, `arn:aws:sts::${ACCOUNT}:assumed-role/${PROMOTION_ROLE}/${ROLE_SESSION_NAME}`);
  assert.match(session.roleUserId, /^\S+$/); assert.match(session.mfaSerialArn, new RegExp(`^arn:aws:iam::${ACCOUNT}:mfa/[A-Za-z0-9+=,.@_/-]+$`)); assert.equal(session.mfaPresent, true);
  assert.ok(typeof session.sessionExpiresAt === "string" && Number.isFinite(Date.parse(session.sessionExpiresAt)));
}

function stateFile(options) {
  const directory = assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE); const binding = bindDirectory(directory, "promotion state journal parent");
  try { assertBoundDirectory(binding); const pointers = readdirSync(directory).filter((name) => new RegExp(`^${STATE_PREFIX}\\.current\\.\\d{8}\\.json$`).test(name)).sort(); assertBoundDirectory(binding); pointers.forEach((name, index) => assert.equal(name, `${STATE_PREFIX}.current.${String(index + 1).padStart(8, "0")}.json`, "promotion state pointer sequence drifted")); if (!pointers.length) return null; const pointer = JSON.parse(privateFileRead(path.join(directory, pointers.at(-1)), "Promotion state pointer")); assert.deepEqual(Object.keys(pointer).sort(), ["generation", "sha256", "stateFile"]); assert.equal(pointer.generation, pointers.length); assert.match(pointer.stateFile, new RegExp(`^${STATE_PREFIX}\\.\\d{8}\\.[a-f0-9]{64}\\.json$`)); const file = path.join(directory, pointer.stateFile); const bytes = privateFileRead(file, "Promotion state generation"); assert.equal(sha256Bytes(bytes), pointer.sha256); assertBoundDirectory(binding); return file; }
  finally { closeSync(binding.descriptor); }
}

export function latestQcFourthStatePath(stateDir) { return stateFile({ stateDir }); }

function mutationIntent(plan, entry, operation, state, details = {}) {
  assert.match(state.activeSessionSha256 || "", /^[a-f0-9]{64}$/, "A durable active mutation session is required.");
  const request = {
    operation,
    bucket: plan.bucket,
    region: plan.region,
    objectKey: entry.objectKey,
    byteLength: entry.byteLength,
    sha256: entry.sha256,
    retention: { mode: "COMPLIANCE", retainUntil: RETAIN_UNTIL },
    ...details
  };
  return {
    operation,
    objectKey: entry.objectKey,
    requestSha256: sha256Bytes(JSON.stringify(request)),
    createdAt: new Date().toISOString(),
    status: "pre-call",
    mutationSessionSha256: state.activeSessionSha256
  };
}

function markRecoveryRequired(state, entry, options, intent, reason, error) {
  const record = state.objects[entry.id];
  record.recoveryRequired = true;
  record.recoveryReason = reason;
  record.recoveryNotice = "Read-only recovery is required; this runner will not retry or create a duplicate mutation.";
  record.mutationIntent = { ...intent, status: "ambiguous" };
  if (error?.code) record.errorCode = String(error.code).slice(0, 64);
  saveState(state, options);
}

function assertNoRecoveryRequired(entry, record) {
  if (record?.recoveryRequired === true) {
    throw new Error(`${entry.id} is marked recovery-required (${record.recoveryReason || "ambiguous mutation"}); automatic duplicate mutation is disabled. Use the separately gated read-only recovery tool.`);
  }
}

function callMutation(state, entry, options, intent, invoke, env, args, reason) {
  try {
    const response = s3(invoke, env, args);
    return response;
  } catch (error) {
    // Once the provider invocation begins, a local error cannot prove that the
    // mutation was rejected before acceptance. Persist ambiguity and require a
    // separately approved read-only investigation instead of guessing/retrying.
    const effectiveReason = reason === "multipart-completion-response-unknown" && error?.providerCode === "NoSuchUpload" ? "multipart-completion-nosuchupload" : reason;
    markRecoveryRequired(state, entry, options, intent, effectiveReason, error);
    const safe = new Error(`${entry.id} ${effectiveReason.replaceAll("-", " ")}; response is ambiguous and read-only recovery is required; no duplicate mutation will be attempted.`);
    safe.recoveryReason = effectiveReason;
    throw safe;
  }
}

function loadState(plan, options) {
  const file = stateFile(options);
  const digests = qcFourthPlanDigests(plan);
  if (!file) return { schemaVersion: 1, planSha256: digests.planParsedSha256, ...digests, bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, promotionSessions: [], activeSessionSha256: null, objects: {} };
  const state = JSON.parse(privateFileRead(file, "Promotion state"));
  assert.equal(state.schemaVersion, 1); assert.equal(state.planSha256, digests.planParsedSha256); assert.equal(state.planParsedSha256, digests.planParsedSha256); assert.equal(state.planFileSha256, digests.planFileSha256); assert.equal(state.bucket, plan.bucket); assert.equal(state.region, plan.region); assert.equal(state.retentionUntil, RETAIN_UNTIL); assert.ok(Array.isArray(state.promotionSessions)); state.promotionSessions.forEach(validateSessionProvenance); assert.ok(state.activeSessionSha256 === null || /^[a-f0-9]{64}$/.test(state.activeSessionSha256)); assert.ok(state.objects && typeof state.objects === "object" && !Array.isArray(state.objects));
  const sessionDigests = new Set(state.promotionSessions.map((session) => sha256Bytes(JSON.stringify(session))));
  const expected = new Map(exactPromotionObjects(plan).map((entry) => [entry.id, entry]));
  for (const [id, record] of Object.entries(state.objects)) { assertStateRecordBinding(expected.get(id) || assert.fail(`Unexpected ${id} state record.`), record); assert.ok(sessionDigests.has(record.mutationSessionSha256), `${id} mutation session is not bound to persisted provenance.`); }
  return state;
}

function saveState(state, options) {
  const directory = assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE); const binding = bindDirectory(directory, "promotion state journal parent");
  try {
    const pointers = readdirSync(directory).filter((name) => new RegExp(`^${STATE_PREFIX}\\.current\\.\\d{8}\\.json$`).test(name)).sort(); const generation = pointers.length + 1;
    const bytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`); const digest = sha256Bytes(bytes); const stateName = `${STATE_PREFIX}.${String(generation).padStart(8, "0")}.${digest}.json`;
    appendOnlyPrivateFile(path.join(directory, stateName), bytes, "promotion state generation", binding);
    appendOnlyPrivateFile(path.join(directory, `${STATE_PREFIX}.current.${String(generation).padStart(8, "0")}.json`), `${JSON.stringify({ generation, stateFile: stateName, sha256: digest })}\n`, "promotion state pointer", binding);
    return path.join(directory, stateName);
  } finally { closeSync(binding.descriptor); }
}

function s3(invoke, env, args) {
  try { return invoke(["s3api", ...args, "--region", "ca-central-1", "--output", "json"], env); }
  catch (error) {
    const safe = new Error(`${args[0]} provider call failed`);
    safe.providerCode = error?.code === "NoSuchUpload" ? "NoSuchUpload" : "provider-error";
    throw safe;
  }
}

export function verifyRemoteObject(plan, entry, remote, invoke, env) {
  assert.ok(typeof remote.versionId === "string" && remote.versionId.length > 0 && remote.versionId !== "null", `${entry.id} remote VersionId is missing.`);
  const multipart = entry.byteLength > plan.upload.multipartThresholdBytes;
  const expectedChecksum = multipart ? remote.expectedChecksumSha256 : base64Sha256(entry.sha256);
  assert.ok(typeof expectedChecksum === "string" && (multipart ? COMPOSITE_SHA256 : BASE64_SHA256).test(expectedChecksum), `${entry.id} expected provider checksum is missing.`);
  assert.equal(remote.checksumType, multipart ? "COMPOSITE" : "FULL_OBJECT", `${entry.id} checksum type is not bound to the approved upload method.`);
  assert.equal(remote.checksumSha256, expectedChecksum, `${entry.id} state checksum is not bound to the approved local bytes.`);
  const head = s3(invoke, env, ["head-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", remote.versionId, "--checksum-mode", "ENABLED"]);
  assert.equal(head.ContentLength, entry.byteLength, `${entry.id} remote byte length drifted.`);
  assert.equal(head.VersionId, remote.versionId, `${entry.id} VersionId drifted.`);
  assert.equal(head.ChecksumType, remote.checksumType, `${entry.id} checksum type drifted.`);
  assert.equal(head.ChecksumSHA256, expectedChecksum, `${entry.id} remote checksum drifted.`);
  const retention = s3(invoke, env, ["get-object-retention", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", remote.versionId]);
  assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${entry.id} retention read-back is not COMPLIANCE.`);
  assert.equal(iso(retention.Retention?.RetainUntilDate), iso(RETAIN_UNTIL), `${entry.id} retention date drifted.`);
  return remote;
}

function singlePut(plan, entry, state, options, invoke, env) {
  const existing = state.objects[entry.id];
  if (existing) {
    assertStateRecordBinding(entry, existing);
    assert.equal(existing.method, "single-put", `${entry.id} state upload method drifted.`);
    assert.ok(existing.complete === false || existing.complete === true, `${entry.id} single-PUT completion state is malformed.`);
    assertNoRecoveryRequired(entry, existing);
    assert.ok(existing.mutationIntent && existing.mutationIntent.operation === "put-object", `${entry.id} single-PUT state has no pre-call mutation intent.`);
    verifyRemoteObject(plan, entry, existing, invoke, env);
    if (!existing.complete) {
      existing.complete = true;
      existing.mutationIntent = { ...existing.mutationIntent, status: "readback-complete" };
      saveState(state, options);
    }
    return existing;
  }
  assert.equal(entry.byteLength <= plan.upload.singlePutMaximumBytes, true);
  const expected = base64Sha256(entry.sha256);
  const args = ["s3api", "put-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--body", entry.file, "--checksum-algorithm", "SHA256", "--checksum-sha256", expected, "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`, "--region", "ca-central-1", "--output", "json"];
  const intent = mutationIntent(plan, entry, "put-object", state, { checksumAlgorithm: "SHA256", checksumSha256: expected });
  const remote = { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, mutationSessionSha256: state.activeSessionSha256, complete: false, method: "single-put", mutationIntent: intent };
  state.objects[entry.id] = remote;
  saveState(state, options);
  const response = callMutation(state, entry, options, intent, invoke, env, args.slice(1), "single-put-response-unknown");
  if (!response?.VersionId || response.VersionId === "null" || response.ChecksumSHA256 !== expected) {
    markRecoveryRequired(state, entry, options, intent, "single-put-response-invalid", new Error("PutObject acknowledgement was incomplete or mismatched"));
    throw new Error(`${entry.id} PutObject acknowledgement was incomplete or mismatched; read-only recovery is required and no duplicate mutation will be attempted.`);
  }
  Object.assign(remote, { versionId: response.VersionId, checksumType: "FULL_OBJECT", checksumSha256: expected, mutationIntent: { ...intent, status: "accepted" } });
  state.objects[entry.id] = remote;
  saveState(state, options);
  verifyRemoteObject(plan, entry, remote, invoke, env);
  remote.complete = true;
  remote.mutationIntent = { ...remote.mutationIntent, status: "readback-complete" };
  saveState(state, options);
  return remote;
}

function descriptorSha256(descriptor, byteLength) { const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(8 * 1024 * 1024); let offset = 0; while (offset < byteLength) { const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, byteLength - offset), offset); assert.ok(count > 0, "Unexpected end of approved source descriptor."); hash.update(buffer.subarray(0, count)); offset += count; } return hash.digest("hex"); }
function openApprovedSource(entry) { const descriptor = openSourceRead(entry.file); try { const opened = fstatSync(descriptor); assert.equal(opened.size, entry.byteLength, `${entry.id} source descriptor length drifted.`); assert.equal(descriptorSha256(descriptor, entry.byteLength), entry.sha256, `${entry.id} source descriptor SHA-256 drifted.`); return { descriptor, opened }; } catch (error) { closeSync(descriptor); throw error; } }
function verifyApprovedSource(entry, source) { const after = fstatSync(source.descriptor); assert.ok(sameInode(after, source.opened) && after.size === source.opened.size, `${entry.id} source descriptor identity drifted.`); assert.equal(descriptorSha256(source.descriptor, entry.byteLength), entry.sha256, `${entry.id} source descriptor changed during multipart upload.`); }

function writePart(input, target, offset, length) {
  const output = openPrivateScratch(target);
  const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, length)); let position = offset; let remaining = length;
  try {
    while (remaining > 0) {
      const bytes = readSync(input, buffer, 0, Math.min(buffer.length, remaining), position);
      assert.ok(bytes > 0, "Unexpected end of multipart source.");
      let written = 0;
      while (written < bytes) written += writeSync(output, buffer, written, bytes - written);
      hash.update(buffer.subarray(0, bytes)); position += bytes; remaining -= bytes;
    }
  } finally { closeSync(output); }
  return hash.digest();
}

function partChecksum(input, offset, length) {
  const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, length)); let position = offset; let remaining = length;
  while (remaining > 0) {
    const bytes = readSync(input, buffer, 0, Math.min(buffer.length, remaining), position);
    assert.ok(bytes > 0, "Unexpected end of multipart source.");
    hash.update(buffer.subarray(0, bytes)); position += bytes; remaining -= bytes;
  }
  return hash.digest("base64");
}

export function recomputeMultipartPartChecksums(entry, partSizeBytes) {
  assert.ok(Number.isSafeInteger(partSizeBytes) && partSizeBytes > 0, "Multipart part size must be a positive safe integer.");
  const source = openApprovedSource(entry);
  try { const partCount = Math.ceil(entry.byteLength / partSizeBytes); const parts = Array.from({ length: partCount }, (_, index) => { const offset = index * partSizeBytes; const length = Math.min(partSizeBytes, entry.byteLength - offset); return { partNumber: index + 1, byteLength: length, checksumSha256: partChecksum(source.descriptor, offset, length) }; }); verifyApprovedSource(entry, source); return { partSizeBytes, partCount, parts, compositeChecksumSha256: compositeSha256(parts) }; }
  finally { closeSync(source.descriptor); }
}

function compositeSha256(parts) {
  const raw = Buffer.concat(parts.map((part) => Buffer.from(part.checksumSha256, "base64")));
  return `${createHash("sha256").update(raw).digest("base64")}-${parts.length}`;
}

function validateMultipartParts(plan, entry, current, sourceDescriptor, allPartsPresent = false) {
  assertStateRecordBinding(entry, current);
  assert.equal(current.method, "multipart", `${entry.id} state upload method drifted.`);
  assert.ok(typeof current.uploadId === "string" && current.uploadId.length > 0, `${entry.id} multipart UploadId is missing.`);
  assert.ok(Array.isArray(current.parts), `${entry.id} multipart parts state is malformed.`);
  const partSize = plan.upload.partSizeBytes;
  const partCount = Math.ceil(entry.byteLength / partSize);
  if (current.partSizeBytes !== undefined) assert.equal(current.partSizeBytes, partSize, `${entry.id} multipart part size drifted.`);
  if (current.partCount !== undefined) assert.equal(current.partCount, partCount, `${entry.id} multipart part count drifted.`);
  assert.ok(current.parts.length <= partCount, `${entry.id} has too many multipart parts.`);
  for (const [index, part] of current.parts.entries()) {
    assert.deepEqual(Object.keys(part).sort(), ["checksumSha256", "etag", "mutationSessionSha256", "partNumber"], `${entry.id} multipart part fields drifted.`);
    assert.equal(part.partNumber, index + 1, `${entry.id} multipart parts must be a contiguous prefix.`);
    assert.match(part.etag, /^\S+$/, `${entry.id} multipart part ETag is malformed.`);
    assert.match(part.checksumSha256, BASE64_SHA256, `${entry.id} multipart part checksum is malformed.`);
    assert.match(part.mutationSessionSha256, /^[a-f0-9]{64}$/, `${entry.id} multipart part session binding is missing.`);
    const offset = index * partSize;
    const length = Math.min(partSize, entry.byteLength - offset);
    assert.equal(part.checksumSha256, partChecksum(sourceDescriptor, offset, length), `${entry.id} multipart part checksum is not bound to the approved source descriptor.`);
  }
  if (allPartsPresent) assert.equal(current.parts.length, partCount, `${entry.id} multipart state does not contain every part.`);
  return { partSize, partCount, expectedComposite: compositeSha256(current.parts) };
}

function validateMultipartCompletion(plan, entry, current, sourceDescriptor, persistedComplete) {
  const result = validateMultipartParts(plan, entry, current, sourceDescriptor, true);
  assert.equal(current.complete, persistedComplete, `${entry.id} multipart completion state drifted.`);
  assert.equal(current.partSizeBytes, result.partSize, `${entry.id} completed multipart part size is missing.`);
  assert.equal(current.partCount, result.partCount, `${entry.id} completed multipart part count is missing.`);
  assert.equal(current.checksumType, "COMPOSITE", `${entry.id} completed multipart checksum type drifted.`);
  assert.ok(typeof current.versionId === "string" && current.versionId.length > 0 && current.versionId !== "null", `${entry.id} completed multipart VersionId is missing.`);
  assert.equal(current.expectedChecksumSha256, result.expectedComposite, `${entry.id} completed checksum is not bound to the local parts.`);
  assert.equal(current.checksumSha256, result.expectedComposite, `${entry.id} completed checksum drifted.`);
  return result;
}

function multipartPutWithSource(plan, entry, state, options, invoke, env, sourceDescriptor) {
  const prior = state.objects[entry.id];
  if (prior?.complete) {
    assertNoRecoveryRequired(entry, prior);
    validateMultipartCompletion(plan, entry, prior, sourceDescriptor, true);
    return verifyRemoteObject(plan, entry, prior, invoke, env);
  }
  const current = prior || { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, mutationSessionSha256: state.activeSessionSha256, complete: false, method: "multipart", uploadId: null, parts: [], partSizeBytes: plan.upload.partSizeBytes, partCount: Math.ceil(entry.byteLength / plan.upload.partSizeBytes) };
  assertStateRecordBinding(entry, current);
  assert.equal(current.complete, false, `${entry.id} multipart state is malformed.`);
  assertNoRecoveryRequired(entry, current);
  if (current.pendingMutation) throw new Error(`${entry.id} has an unfinished mutation intent; read-only recovery is required before any retry.`);
  if (current.versionId !== undefined) {
    validateMultipartCompletion(plan, entry, current, sourceDescriptor, false);
    verifyRemoteObject(plan, entry, current, invoke, env);
    current.complete = true;
    current.mutationIntent = { ...current.mutationIntent, status: "readback-complete" };
    saveState(state, options);
    return current;
  }
  if (current.uploadId === null) {
    assert.deepEqual(current.parts, [], `${entry.id} cannot have parts without an UploadId.`);
  } else {
    validateMultipartParts(plan, entry, current, sourceDescriptor);
  }
  if (!current.uploadId) {
    const intent = mutationIntent(plan, entry, "create-multipart-upload", state, { checksumAlgorithm: "SHA256", checksumType: "COMPOSITE", partSizeBytes: plan.upload.partSizeBytes });
    current.pendingMutation = intent;
    current.mutationIntent = intent;
    state.objects[entry.id] = current;
    saveState(state, options);
    const response = callMutation(state, entry, options, intent, invoke, env, ["create-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--checksum-algorithm", "SHA256", "--checksum-type", "COMPOSITE", "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`], "multipart-create-response-unknown");
    if (!response?.UploadId || response.UploadId === "null") {
      markRecoveryRequired(state, entry, options, intent, "multipart-create-response-invalid", new Error("CreateMultipartUpload acknowledgement was incomplete"));
      throw new Error(`${entry.id} multipart creation returned no usable UploadId; read-only recovery is required and no duplicate upload will be attempted.`);
    }
    current.uploadId = response.UploadId;
    current.pendingMutation = undefined;
    current.mutationIntent = { ...intent, status: "accepted" };
    state.objects[entry.id] = current;
    saveState(state, options);
  }
  if (current.uploadId) {
    let listed;
    try {
      listed = s3(invoke, env, ["list-parts", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId]);
    } catch (error) {
      const intent = current.mutationIntent || mutationIntent(plan, entry, "list-parts", state, { uploadId: current.uploadId });
      markRecoveryRequired(state, entry, options, intent, error?.providerCode === "NoSuchUpload" ? "multipart-completion-nosuchupload" : "multipart-list-parts-response-ambiguous", error);
      throw new Error(`${entry.id} multipart provider state could not be read unambiguously; read-only recovery is required and no duplicate upload will be attempted.`);
    }
    assert.equal(listed.IsTruncated, false, `${entry.id} part listing unexpectedly paginated.`);
    assert.deepEqual((listed.Parts || []).map(({ PartNumber, ETag, ChecksumSHA256 }) => ({ partNumber: PartNumber, etag: ETag, checksumSha256: ChecksumSHA256 })), current.parts.map(({ partNumber, etag, checksumSha256 }) => ({ partNumber, etag, checksumSha256 })), `${entry.id} remote multipart state drifted.`);
  }
  const { partSize, partCount } = validateMultipartParts(plan, entry, current, sourceDescriptor); const scratchDirectory = assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE);
  for (let index = current.parts.length; index < partCount; index += 1) {
    const scratch = path.join(scratchDirectory, `multipart-part-buffer.${process.pid}.${entry.id}.${index + 1}.bin`); const offset = index * partSize; const length = Math.min(partSize, entry.byteLength - offset); const digest = writePart(sourceDescriptor, scratch, offset, length); const checksumSha256 = digest.toString("base64");
    current.mutationSessionSha256 = state.activeSessionSha256;
    const intent = mutationIntent(plan, entry, "upload-part", state, { uploadId: current.uploadId, partNumber: index + 1, checksumSha256 });
    current.pendingMutation = intent;
    current.mutationIntent = intent;
    saveState(state, options);
    const response = callMutation(state, entry, options, intent, invoke, env, ["upload-part", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--part-number", String(index + 1), "--body", scratch, "--checksum-algorithm", "SHA256", "--checksum-sha256", checksumSha256], "multipart-part-response-unknown");
    if (!response?.ETag || response.ChecksumSHA256 !== checksumSha256) {
      markRecoveryRequired(state, entry, options, intent, "multipart-part-response-invalid", new Error("UploadPart acknowledgement was incomplete or mismatched"));
      throw new Error(`${entry.id} part ${index + 1} acknowledgement was incomplete or mismatched; read-only recovery is required and no duplicate part will be attempted.`);
    }
    current.parts.push({ partNumber: index + 1, etag: response.ETag, checksumSha256, mutationSessionSha256: state.activeSessionSha256 });
    current.pendingMutation = undefined;
    current.mutationIntent = { ...intent, status: "accepted" };
    saveState(state, options);
  }
  const expectedComposite = validateMultipartParts(plan, entry, current, sourceDescriptor, true).expectedComposite;
  assert.equal(descriptorSha256(sourceDescriptor, entry.byteLength), entry.sha256, `${entry.id} approved whole-file SHA-256 changed before multipart completion.`);
  const request = { Parts: current.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber, ChecksumSHA256: part.checksumSha256 })) };
  current.mutationSessionSha256 = state.activeSessionSha256;
  const intent = mutationIntent(plan, entry, "complete-multipart-upload", state, { uploadId: current.uploadId, parts: current.parts });
  current.pendingMutation = intent;
  current.mutationIntent = intent;
  saveState(state, options);
  let response;
  try {
    response = callMutation(state, entry, options, intent, invoke, env, ["complete-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--multipart-upload", JSON.stringify(request)], "multipart-completion-response-unknown");
  } catch (error) {
    if (error?.recoveryReason === "multipart-completion-nosuchupload") {
      markRecoveryRequired(state, entry, options, intent, "multipart-completion-nosuchupload", error);
    }
    throw new Error(`${entry.id} multipart completion response is unavailable or ambiguous; read-only recovery is required and no duplicate completion will be attempted.`);
  }
  if (!response?.VersionId || response.VersionId === "null" || response.ChecksumSHA256 !== expectedComposite) {
    markRecoveryRequired(state, entry, options, intent, "multipart-completion-response-invalid", new Error("CompleteMultipartUpload acknowledgement was incomplete or mismatched"));
    throw new Error(`${entry.id} multipart completion returned no usable exact response; read-only recovery is required and no duplicate completion will be attempted.`);
  }
  Object.assign(current, { versionId: response.VersionId, checksumType: "COMPOSITE", checksumSha256: expectedComposite, expectedChecksumSha256: expectedComposite, partSizeBytes: partSize, partCount, pendingMutation: undefined, mutationIntent: { ...intent, status: "accepted" } });
  state.objects[entry.id] = current;
  saveState(state, options);
  validateMultipartCompletion(plan, entry, current, sourceDescriptor, false);
  verifyRemoteObject(plan, entry, current, invoke, env);
  current.complete = true;
  current.mutationIntent = { ...current.mutationIntent, status: "readback-complete" };
  saveState(state, options);
  return current;
}

function multipartPut(plan, entry, state, options, invoke, env) { const source = openApprovedSource(entry); try { const result = multipartPutWithSource(plan, entry, state, options, invoke, env, source.descriptor); verifyApprovedSource(entry, source); return result; } finally { closeSync(source.descriptor); } }

export function executePromotion(plan, options, dependencies = {}) {
  validateExecutionOptions(plan, options);
  const lock = acquireRunLock(options, plan);
  try {
    const invoke = dependencies.invoke || invokeJson;
    const env = dependencies.mfaEnv ? ownerRoleEnvironment(dependencies.mfaEnv) : roleEnvironment();
    const objects = localObjects(plan, options);
    preflight(objects); // Every local byte and SHA passes before the first AWS call.
    const state = loadState(plan, options);
    const provenance = sessionProvenance(env);
    if (!state.promotionSessions.some((session) => JSON.stringify(session) === JSON.stringify(provenance))) {
      state.promotionSessions.push(provenance);
    }
    state.activeSessionSha256 = sha256Bytes(JSON.stringify(provenance)); saveState(state, options);
    const evidence = [];
    for (const entry of objects) evidence.push(entry.byteLength > plan.upload.multipartThresholdBytes ? multipartPut(plan, entry, state, options, invoke, env) : singlePut(plan, entry, state, options, invoke, env));
    assert.equal(evidence.length, 62);
    return { status: "remote-read-back-complete-pending-independent-review", bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, statePath: stateFile(options), objects: state.objects };
  } catch (error) { lock.release("ended-with-error"); throw error; }
  finally { lock.release("ended"); }
}

function cliOptions(argv) {
  const value = (name) => { const index = argv.indexOf(name); return index === -1 ? undefined : argv[index + 1]; };
  return {
    preflight: argv.includes("--preflight"), execute: argv.includes("--execute"), approveExactArtifacts: argv.includes("--approve-exact-artifact-set"), approveIam: argv.includes("--approve-iam-policy"), approveRetention: argv.includes("--approve-compliance-retention"), approveMfa: argv.includes("--approve-mfa-session"),
    retentionUntil: value("--retention-until"), sessionReady: argv.includes("--session-ready"), dataRoot: value("--data-root"), stateDir: value("--state-dir"), sidecarDir: value("--sidecar-dir")
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = loadQcFourthInventoryPromotionPreparation();
  const options = cliOptions(process.argv.slice(2));
  if (options.preflight) {
    const result = preflightLocal(plan, options);
    console.log(`PRECHECK passed: ${result.sources.length} local payload/evidence files have exact bytes and SHA-256; canonical manifest is deterministic and matches its pinned sidecar bytes; 62 exact keys and least-privilege IAM preparation were validated; no AWS or IAM call was made.`);
    for (const entry of result.sources) console.log(`LOCAL id=${entry.id} bytes=${entry.byteLength} sha256=${entry.sha256} path=${entry.file} key=${entry.objectKey}`);
    console.log(`SIDECAR bytes=${result.manifestBytes.length} sha256=${sha256Bytes(result.manifestBytes)} key=${plan.canonicalManifest.objectKey} generated-in-memory=true`);
  } else if (!options.execute) console.log(dryRunLines(plan).join("\n"));
  else {
    const result = executePromotion(plan, options);
    console.log(`QC fourth-inventory promotion completed exact-version readback for all 62 objects; opaque provider identifiers remain only in the owner-only state generation ${result.statePath}.`);
  }
}
