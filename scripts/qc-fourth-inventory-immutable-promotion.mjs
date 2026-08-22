import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { canonicalManifestBytes, exactPromotionObjects, loadQcFourthInventoryPromotionPreparation } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

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
  try {
    assertPrivateFileMetadata(file, "Multipart scratch file");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW, PRIVATE_FILE_MODE);
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

function assertStateRecordBinding(entry, record) {
  assert.ok(record && typeof record === "object" && !Array.isArray(record), `${entry.id} state record is malformed.`);
  assert.equal(record.objectKey, entry.objectKey, `${entry.id} state key drifted.`);
  assert.equal(record.byteLength, entry.byteLength, `${entry.id} state byte length drifted.`);
  assert.equal(record.sha256, entry.sha256, `${entry.id} state SHA-256 drifted.`);
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
    writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
    assertPrivateFileMetadata(manifestPath, "Generated canonical sidecar");
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
  return { ...process.env, AWS_REGION: "ca-central-1", AWS_DEFAULT_REGION: "ca-central-1" };
}

function stateFile(options) {
  return path.join(assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE), "qc-fourth-inventory-promotion-state.json");
}

function loadState(plan, options) {
  const file = stateFile(options);
  const planSha256 = sha256Bytes(JSON.stringify(plan));
  if (!pathExists(file)) return { schemaVersion: 1, planSha256, bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, objects: {} };
  const state = JSON.parse(privateFileRead(file, "Promotion state"));
  assert.equal(state.schemaVersion, 1); assert.equal(state.planSha256, planSha256); assert.equal(state.bucket, plan.bucket); assert.equal(state.region, plan.region); assert.equal(state.retentionUntil, RETAIN_UNTIL); assert.ok(state.objects && typeof state.objects === "object" && !Array.isArray(state.objects));
  const expected = new Map(exactPromotionObjects(plan).map((entry) => [entry.id, entry]));
  for (const [id, record] of Object.entries(state.objects)) assertStateRecordBinding(expected.get(id) || assert.fail(`Unexpected ${id} state record.`), record);
  return state;
}

function saveState(state, options) {
  const file = stateFile(options);
  const temporary = `${file}.next`;
  assert.equal(pathExists(temporary), false, "A stale temporary promotion state file exists; inspect it before resuming.");
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  assertPrivateFileMetadata(temporary, "Temporary promotion state");
  renameSync(temporary, file);
  assertPrivateFileMetadata(file, "Promotion state");
}

function s3(invoke, env, args) {
  return invoke(["s3api", ...args, "--region", "ca-central-1", "--output", "json"], env);
}

export function verifyRemoteObject(plan, entry, remote, invoke, env) {
  assert.ok(typeof remote.versionId === "string" && remote.versionId.length > 0 && remote.versionId !== "null", `${entry.id} remote VersionId is missing.`);
  const multipart = entry.byteLength > plan.upload.multipartThresholdBytes;
  const expectedChecksum = multipart ? remote.expectedChecksumSha256 : base64Sha256(entry.sha256);
  assert.ok(typeof expectedChecksum === "string" && BASE64_SHA256.test(expectedChecksum), `${entry.id} expected provider checksum is missing.`);
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
    assert.equal(existing.complete, true, `${entry.id} single-PUT state is incomplete or malformed.`);
    assert.equal(existing.method, "single-put", `${entry.id} state upload method drifted.`);
    return verifyRemoteObject(plan, entry, existing, invoke, env);
  }
  assert.equal(entry.byteLength <= plan.upload.singlePutMaximumBytes, true);
  const expected = base64Sha256(entry.sha256);
  const response = s3(invoke, env, ["put-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--body", entry.file, "--checksum-algorithm", "SHA256", "--checksum-sha256", expected, "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`]);
  assert.ok(response.VersionId, `${entry.id} PutObject did not return a VersionId.`);
  assert.equal(response.ChecksumSHA256, expected, `${entry.id} PutObject checksum drifted.`);
  const remote = { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, complete: true, method: "single-put", versionId: response.VersionId, checksumType: "FULL_OBJECT", checksumSha256: expected };
  verifyRemoteObject(plan, entry, remote, invoke, env);
  state.objects[entry.id] = remote; saveState(state, options);
  return remote;
}

function writePart(source, target, offset, length) {
  const input = openSourceRead(source);
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
  } finally { closeSync(input); closeSync(output); }
  return hash.digest();
}

function partChecksum(source, offset, length) {
  const input = openSourceRead(source);
  const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, length)); let position = offset; let remaining = length;
  try {
    while (remaining > 0) {
      const bytes = readSync(input, buffer, 0, Math.min(buffer.length, remaining), position);
      assert.ok(bytes > 0, "Unexpected end of multipart source.");
      hash.update(buffer.subarray(0, bytes)); position += bytes; remaining -= bytes;
    }
  } finally { closeSync(input); }
  return hash.digest("base64");
}

function compositeSha256(parts) {
  const raw = Buffer.concat(parts.map((part) => Buffer.from(part.checksumSha256, "base64")));
  return `${createHash("sha256").update(raw).digest("base64")}-${parts.length}`;
}

function validateMultipartState(plan, entry, current, complete = false) {
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
    assert.deepEqual(Object.keys(part).sort(), ["checksumSha256", "etag", "partNumber"], `${entry.id} multipart part fields drifted.`);
    assert.equal(part.partNumber, index + 1, `${entry.id} multipart parts must be a contiguous prefix.`);
    assert.match(part.etag, /^\S+$/, `${entry.id} multipart part ETag is malformed.`);
    assert.match(part.checksumSha256, BASE64_SHA256, `${entry.id} multipart part checksum is malformed.`);
    const offset = index * partSize;
    const length = Math.min(partSize, entry.byteLength - offset);
    assert.equal(part.checksumSha256, partChecksum(entry.file, offset, length), `${entry.id} multipart part checksum is not bound to the local bytes.`);
  }
  if (!complete) assert.ok(current.parts.length < partCount, `${entry.id} partial multipart state is already complete.`);
  if (complete) {
    assert.equal(current.complete, true, `${entry.id} multipart state is not complete.`);
    assert.equal(current.parts.length, partCount, `${entry.id} multipart state is incomplete.`);
    assert.equal(current.partSizeBytes, partSize, `${entry.id} completed multipart part size is missing.`);
    assert.equal(current.partCount, partCount, `${entry.id} completed multipart part count is missing.`);
    assert.equal(current.checksumType, "COMPOSITE", `${entry.id} completed multipart checksum type drifted.`);
  }
  return { partSize, partCount, expectedComposite: compositeSha256(current.parts) };
}

function multipartPut(plan, entry, state, options, invoke, env) {
  const prior = state.objects[entry.id];
  if (prior?.complete) {
    const expected = validateMultipartState(plan, entry, prior, true).expectedComposite;
    assert.equal(prior.expectedChecksumSha256, expected, `${entry.id} completed checksum is not bound to the local parts.`);
    assert.equal(prior.checksumSha256, expected, `${entry.id} completed checksum drifted.`);
    return verifyRemoteObject(plan, entry, prior, invoke, env);
  }
  const current = prior || { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, complete: false, method: "multipart", uploadId: null, parts: [], partSizeBytes: plan.upload.partSizeBytes, partCount: Math.ceil(entry.byteLength / plan.upload.partSizeBytes) };
  assertStateRecordBinding(entry, current);
  assert.equal(current.complete, false, `${entry.id} multipart state is malformed.`);
  if (current.uploadId === null) assert.equal(current.parts.length, 0, `${entry.id} cannot have parts without an UploadId.`);
  else validateMultipartState(plan, entry, current);
  if (!current.uploadId) {
    const response = s3(invoke, env, ["create-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--checksum-algorithm", "SHA256", "--checksum-type", "COMPOSITE", "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`]);
    assert.ok(response.UploadId, `${entry.id} multipart creation returned no UploadId.`);
    current.uploadId = response.UploadId; state.objects[entry.id] = current; saveState(state, options);
  }
  if (current.uploadId) {
    const listed = s3(invoke, env, ["list-parts", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId]);
    assert.equal(listed.IsTruncated, false, `${entry.id} part listing unexpectedly paginated.`);
    assert.deepEqual((listed.Parts || []).map(({ PartNumber, ETag, ChecksumSHA256 }) => ({ partNumber: PartNumber, etag: ETag, checksumSha256: ChecksumSHA256 })), current.parts, `${entry.id} remote multipart state drifted.`);
  }
  const { partSize, partCount } = validateMultipartState(plan, entry, current); const scratch = path.join(assertDirectoryMetadata(options.stateDir, "--state-dir", PRIVATE_DIRECTORY_MODE), "multipart-part-buffer.bin");
  for (let index = current.parts.length; index < partCount; index += 1) {
    const offset = index * partSize; const length = Math.min(partSize, entry.byteLength - offset); const digest = writePart(entry.file, scratch, offset, length); const checksumSha256 = digest.toString("base64");
    const response = s3(invoke, env, ["upload-part", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--part-number", String(index + 1), "--body", scratch, "--checksum-algorithm", "SHA256", "--checksum-sha256", checksumSha256]);
    assert.ok(response.ETag, `${entry.id} part ${index + 1} returned no ETag.`); assert.equal(response.ChecksumSHA256, checksumSha256, `${entry.id} part ${index + 1} checksum drifted.`);
    current.parts.push({ partNumber: index + 1, etag: response.ETag, checksumSha256 }); saveState(state, options);
  }
  const expectedComposite = validateMultipartState(plan, entry, current, true).expectedComposite;
  const request = { Parts: current.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber, ChecksumSHA256: part.checksumSha256 })) };
  const response = s3(invoke, env, ["complete-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--multipart-upload", JSON.stringify(request)]);
  assert.ok(response.VersionId, `${entry.id} multipart completion returned no VersionId.`); assert.equal(response.ChecksumSHA256, expectedComposite, `${entry.id} composite checksum drifted.`);
  const remote = { objectKey: entry.objectKey, byteLength: entry.byteLength, sha256: entry.sha256, complete: true, method: "multipart", uploadId: current.uploadId, versionId: response.VersionId, checksumType: "COMPOSITE", checksumSha256: expectedComposite, expectedChecksumSha256: expectedComposite, partSizeBytes: partSize, partCount, parts: current.parts };
  verifyRemoteObject(plan, entry, remote, invoke, env); state.objects[entry.id] = remote; saveState(state, options); return remote;
}

export function executePromotion(plan, options, dependencies = {}) {
  validateExecutionOptions(plan, options);
  const objects = localObjects(plan, options);
  preflight(objects); // Every local byte and SHA passes before the first AWS call.
  const invoke = dependencies.invoke || invokeJson;
  const env = dependencies.mfaEnv || roleEnvironment();
  const state = loadState(plan, options);
  const evidence = [];
  for (const entry of objects) evidence.push(entry.byteLength > plan.upload.multipartThresholdBytes ? multipartPut(plan, entry, state, options, invoke, env) : singlePut(plan, entry, state, options, invoke, env));
  assert.equal(evidence.length, 62);
  return { status: "remote-read-back-complete-pending-independent-review", bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, objects: state.objects };
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
  else console.log(JSON.stringify(executePromotion(plan, options), null, 2));
}
