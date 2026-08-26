import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, statSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { canonicalManifestBytes, exactPromotionObjects, loadQcFourthInventoryPromotionPreparation, qcFourthInventoryIamBatches } from "./check-qc-fourth-inventory-immutable-promotion.mjs";

const RETAIN_UNTIL = "2033-08-12T00:00:00Z";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(file) {
  const hash = createHash("sha256");
  const descriptor = openSync(file, "r");
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

export function validateExecutionOptions(plan, options) {
  if (!options.execute) return { mode: "dry-run" };
  assert.equal(options.approveExactArtifacts, true, "Execution requires --approve-exact-artifact-set.");
  assert.equal(options.approveIam, true, "Execution requires --approve-iam-policy.");
  assert.equal(options.approveRetention, true, "Execution requires --approve-compliance-retention.");
  assert.equal(options.approveMfa, true, "Execution requires --approve-mfa-session.");
  assert.equal(options.retentionUntil, RETAIN_UNTIL, `Retention is pinned to ${RETAIN_UNTIL}.`);
  assert.equal(options.sessionReady, true, "Execution requires the owner-local MFA role-session runner.");
  for (const name of ["dataRoot", "stateDir", "sidecarDir"]) {
    assert.ok(path.isAbsolute(options[name] || ""), `Execution requires an absolute --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.`);
    assert.ok(statSync(options[name]).isDirectory(), `${name} must already be a controlled directory.`);
  }
  const dataRoot = realpathSync(options.dataRoot);
  const stateDir = realpathSync(options.stateDir);
  const sidecarDir = realpathSync(options.sidecarDir);
  assert.equal(path.basename(dataRoot), "Witness_Tree-data", "--data-root must resolve to the exact Witness_Tree-data directory.");
  for (const [name, directory] of [["state", stateDir], ["sidecar", sidecarDir]]) {
    assert.notEqual(directory, path.parse(directory).root, `${name} directory cannot be a filesystem root.`);
    assert.notEqual(directory, realpathSync(homedir()), `${name} directory cannot be the user home directory.`);
    assert.notEqual(directory, dataRoot, `${name} directory must not be the data root.`);
  }
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
  const resolved = realpathSync(dataRoot);
  assert.notEqual(resolved, path.parse(resolved).root, "The data root cannot be a filesystem root.");
  assert.equal(path.basename(resolved), "Witness_Tree-data", "--data-root must resolve to the exact Witness_Tree-data directory.");
  return resolved;
}

function sourceObjects(plan, dataRoot) {
  const withinDataRoot = (relative) => {
    const candidate = path.resolve(dataRoot, relative);
    const info = lstatSync(candidate);
    assert.ok(info.isFile() && !info.isSymbolicLink(), `${relative} must be a regular non-symlink file.`);
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
  const manifestPath = path.join(realpathSync(options.sidecarDir), "collection-manifest.json");
  if (existsSync(manifestPath)) {
    assert.deepEqual(readFileSync(manifestPath), manifestBytes, "Existing canonical sidecar bytes drifted.");
  } else {
    writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  }
  return [
    ...sources,
    { ...plan.canonicalManifest, id: "canonical-collection-manifest", file: manifestPath }
  ];
}

function preflight(objects) {
  for (const entry of objects) {
    assert.equal(statSync(entry.file).size, entry.byteLength, `${entry.id} local byte length drifted.`);
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
  return path.join(realpathSync(options.stateDir), "qc-fourth-inventory-promotion-state.json");
}

function loadState(plan, options) {
  const file = stateFile(options);
  const planSha256 = sha256Bytes(JSON.stringify(plan));
  if (!existsSync(file)) return { schemaVersion: 1, planSha256, bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, objects: {} };
  const state = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(state.schemaVersion, 1); assert.equal(state.planSha256, planSha256); assert.equal(state.bucket, plan.bucket); assert.equal(state.region, plan.region); assert.equal(state.retentionUntil, RETAIN_UNTIL); assert.ok(state.objects);
  return state;
}

function saveState(state, options) {
  const file = stateFile(options);
  const temporary = `${file}.next`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function s3(invoke, env, args) {
  return invoke(["s3api", ...args, "--region", "ca-central-1", "--output", "json"], env);
}

export function verifyRemoteObject(plan, entry, remote, invoke, env) {
  const head = s3(invoke, env, ["head-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", remote.versionId, "--checksum-mode", "ENABLED"]);
  assert.equal(head.ContentLength, entry.byteLength, `${entry.id} remote byte length drifted.`);
  assert.equal(head.VersionId, remote.versionId, `${entry.id} VersionId drifted.`);
  assert.equal(head.ChecksumType, remote.checksumType, `${entry.id} checksum type drifted.`);
  assert.equal(head.ChecksumSHA256, remote.checksumSha256, `${entry.id} remote checksum drifted.`);
  const retention = s3(invoke, env, ["get-object-retention", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", remote.versionId]);
  assert.equal(retention.Retention?.Mode, "COMPLIANCE", `${entry.id} retention read-back is not COMPLIANCE.`);
  assert.equal(iso(retention.Retention?.RetainUntilDate), iso(RETAIN_UNTIL), `${entry.id} retention date drifted.`);
  return remote;
}

function singlePut(plan, entry, state, options, invoke, env) {
  const existing = state.objects[entry.id];
  if (existing?.complete) return verifyRemoteObject(plan, entry, existing, invoke, env);
  assert.equal(entry.byteLength <= plan.upload.singlePutMaximumBytes, true);
  const expected = base64Sha256(entry.sha256);
  const response = s3(invoke, env, ["put-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--body", entry.file, "--checksum-algorithm", "SHA256", "--checksum-sha256", expected, "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`]);
  assert.ok(response.VersionId, `${entry.id} PutObject did not return a VersionId.`);
  assert.equal(response.ChecksumSHA256, expected, `${entry.id} PutObject checksum drifted.`);
  const remote = { complete: true, method: "single-put", versionId: response.VersionId, checksumType: "FULL_OBJECT", checksumSha256: expected };
  verifyRemoteObject(plan, entry, remote, invoke, env);
  state.objects[entry.id] = remote; saveState(state, options);
  return remote;
}

function writePart(source, target, offset, length) {
  const input = openSync(source, "r"); const output = openSync(target, "w", 0o600);
  const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, length)); let position = offset; let remaining = length;
  try {
    while (remaining > 0) {
      const bytes = readSync(input, buffer, 0, Math.min(buffer.length, remaining), position);
      assert.ok(bytes > 0, "Unexpected end of multipart source.");
      writeSync(output, buffer, 0, bytes); hash.update(buffer.subarray(0, bytes)); position += bytes; remaining -= bytes;
    }
  } finally { closeSync(input); closeSync(output); }
  return hash.digest();
}

function compositeSha256(parts) {
  const raw = Buffer.concat(parts.map((part) => Buffer.from(part.checksumSha256, "base64")));
  return `${createHash("sha256").update(raw).digest("base64")}-${parts.length}`;
}

function multipartPut(plan, entry, state, options, invoke, env) {
  const prior = state.objects[entry.id];
  if (prior?.complete) return verifyRemoteObject(plan, entry, prior, invoke, env);
  const current = prior || { complete: false, method: "multipart", uploadId: null, parts: [] };
  if (!current.uploadId) {
    const response = s3(invoke, env, ["create-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--checksum-algorithm", "SHA256", "--checksum-type", "COMPOSITE", "--object-lock-mode", "COMPLIANCE", "--object-lock-retain-until-date", RETAIN_UNTIL, "--metadata", `sha256=${entry.sha256}`]);
    assert.ok(response.UploadId, `${entry.id} multipart creation returned no UploadId.`);
    current.uploadId = response.UploadId; state.objects[entry.id] = current; saveState(state, options);
  }
  if (current.parts.length) {
    const listed = s3(invoke, env, ["list-parts", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId]);
    assert.equal(listed.IsTruncated, false, `${entry.id} part listing unexpectedly paginated.`);
    assert.deepEqual((listed.Parts || []).map(({ PartNumber, ETag, ChecksumSHA256 }) => ({ partNumber: PartNumber, etag: ETag, checksumSha256: ChecksumSHA256 })), current.parts, `${entry.id} remote multipart state drifted.`);
  }
  const partSize = plan.upload.partSizeBytes; const partCount = Math.ceil(entry.byteLength / partSize); const scratch = path.join(realpathSync(options.stateDir), "multipart-part-buffer.bin");
  for (let index = current.parts.length; index < partCount; index += 1) {
    const offset = index * partSize; const length = Math.min(partSize, entry.byteLength - offset); const digest = writePart(entry.file, scratch, offset, length); const checksumSha256 = digest.toString("base64");
    const response = s3(invoke, env, ["upload-part", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--part-number", String(index + 1), "--body", scratch, "--checksum-algorithm", "SHA256", "--checksum-sha256", checksumSha256]);
    assert.ok(response.ETag, `${entry.id} part ${index + 1} returned no ETag.`); assert.equal(response.ChecksumSHA256, checksumSha256, `${entry.id} part ${index + 1} checksum drifted.`);
    current.parts.push({ partNumber: index + 1, etag: response.ETag, checksumSha256 }); saveState(state, options);
  }
  const expectedComposite = compositeSha256(current.parts);
  const request = { Parts: current.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber, ChecksumSHA256: part.checksumSha256 })) };
  const response = s3(invoke, env, ["complete-multipart-upload", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", current.uploadId, "--multipart-upload", JSON.stringify(request)]);
  assert.ok(response.VersionId, `${entry.id} multipart completion returned no VersionId.`); assert.equal(response.ChecksumSHA256, expectedComposite, `${entry.id} composite checksum drifted.`);
  const remote = { complete: true, method: "multipart", versionId: response.VersionId, checksumType: "COMPOSITE", checksumSha256: expectedComposite, partSizeBytes: partSize, partCount, parts: current.parts };
  verifyRemoteObject(plan, entry, remote, invoke, env); state.objects[entry.id] = remote; saveState(state, options); return remote;
}

export function executePromotion(plan, options, dependencies = {}) {
  validateExecutionOptions(plan, options);
  const permitted = qcFourthInventoryIamBatches(plan).find((batch) => batch.id === options.batch);
  assert.ok(permitted, "Execution requires one fixed --batch (batch-one or batch-two).");
  const permittedKeys = new Set(permitted.resources);
  const objects = localObjects(plan, options).filter((entry) => permittedKeys.has(`arn:aws:s3:::${plan.bucket}/${entry.objectKey}`));
  assert.equal(objects.length, permitted.resources.length, "The batch does not resolve to its exact local object set.");
  preflight(objects); // Every local byte and SHA passes before the first AWS call.
  const invoke = dependencies.invoke || invokeJson;
  const env = dependencies.mfaEnv || roleEnvironment();
  const state = loadState(plan, options);
  const evidence = [];
  for (const entry of objects) evidence.push(entry.byteLength > plan.upload.multipartThresholdBytes ? multipartPut(plan, entry, state, options, invoke, env) : singlePut(plan, entry, state, options, invoke, env));
  return { status: "remote-read-back-complete-pending-independent-review", batch: permitted.id, bucket: plan.bucket, region: plan.region, retentionUntil: RETAIN_UNTIL, objects: state.objects };
}

function cliOptions(argv) {
  const value = (name) => { const index = argv.indexOf(name); return index === -1 ? undefined : argv[index + 1]; };
  return {
    preflight: argv.includes("--preflight"), execute: argv.includes("--execute"), approveExactArtifacts: argv.includes("--approve-exact-artifact-set"), approveIam: argv.includes("--approve-iam-policy"), approveRetention: argv.includes("--approve-compliance-retention"), approveMfa: argv.includes("--approve-mfa-session"),
    retentionUntil: value("--retention-until"), sessionReady: argv.includes("--session-ready"), dataRoot: value("--data-root"), stateDir: value("--state-dir"), sidecarDir: value("--sidecar-dir"), batch: value("--batch")
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
