import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { redactQcAttestation, validatePrivateQcAttestation } from "./check-qc-immutable-promotion-attestation.mjs";
import { sidecarFor, validateQcImmutablePromotionPreparation } from "./prepare-qc-immutable-promotion.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path));
const b64sha = (value) => Buffer.from(hash(value), "hex").toString("base64");
const APPROVED_ACCOUNT = "286853118812";
const APPROVED_OPERATOR_ARN = `arn:aws:iam::${APPROVED_ACCOUNT}:user/WitnessTreeArchiveOperator`;

function failSafe(message, details = {}) {
  const error = new Error(message);
  error.safe = true;
  Object.assign(error, details);
  throw error;
}

function safeEqual(actual, expected, message) {
  if (actual !== expected) failSafe(message);
}

function safeMatch(value, pattern, message) {
  if (typeof value !== "string" || !pattern.test(value)) failSafe(message);
}

function sameInode(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino;
}

// nlink===1 bounds hard-link aliasing at each observation. A same-owner
// concurrent mutation after an observation cannot be globally excluded;
// mode 0600 still keeps the attestation bytes owner-only.

export function normalizeQcOperatorIdentity(rawIdentity) {
  if (rawIdentity === null || typeof rawIdentity !== "object" || Array.isArray(rawIdentity)) {
    failSafe("capture identity response must be a JSON object");
  }
  if (!Object.prototype.hasOwnProperty.call(rawIdentity, "Account") || !Object.prototype.hasOwnProperty.call(rawIdentity, "Arn")) {
    failSafe("capture identity response is missing the approved identity fields");
  }
  if (rawIdentity.Account !== APPROVED_ACCOUNT || rawIdentity.Arn !== APPROVED_OPERATOR_ARN) {
    failSafe("capture identity is not the exact approved operator");
  }
  return { Account: APPROVED_ACCOUNT, Arn: APPROVED_OPERATOR_ARN };
}

function captureMetadata(rawMeta) {
  if (rawMeta === null || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
    failSafe("capture metadata must be a JSON object");
  }
  const keys = Object.keys(rawMeta).sort();
  if (keys.length !== 2 || keys[0] !== "createdAt" || keys[1] !== "identity") {
    failSafe("capture metadata fields drifted");
  }
  return { createdAt: rawMeta.createdAt, identity: normalizeQcOperatorIdentity(rawMeta.identity) };
}

function validateFreshOutput(path) {
  if (typeof path !== "string" || path.length === 0) failSafe("attestation output path is invalid");
  let parent;
  try {
    parent = lstatSync(dirname(path));
  } catch {
    failSafe("attestation output directory is unavailable");
  }
  if (!parent.isDirectory() || parent.isSymbolicLink()) failSafe("attestation output directory is not a regular directory");
  try {
    lstatSync(path);
    failSafe("attestation output already exists; refusing overwrite");
  } catch (error) {
    if (error?.safe) throw error;
    if (error?.code !== "ENOENT") failSafe("attestation output path is not safely absent");
  }
}

function invokeHook(hooks, name, ...args) {
  const hook = hooks?.[name];
  if (hook === undefined) return;
  if (typeof hook !== "function") failSafe("attestation test hook is invalid");
  hook(...args);
}

function closeDescriptor(fd, stage, hooks = {}) {
  let injectedFailure = false;
  const failClose = hooks?.failClose;
  if (failClose !== undefined && typeof failClose !== "function") injectedFailure = true;
  if (typeof failClose === "function") {
    try { injectedFailure = failClose(stage, fd) === true; } catch { injectedFailure = true; }
  }
  try {
    closeSync(fd);
  } catch {
    failSafe("attestation descriptor close failed; inspect output state", { closeAttempted: true, descriptorClosed: false, closeProved: false });
  }
  if (failClose !== undefined && typeof failClose !== "function") failSafe("attestation test hook is invalid", { closeAttempted: true, descriptorClosed: true, closeProved: false });
  if (injectedFailure) failSafe("attestation descriptor close failed; inspect output state", { closeAttempted: true, descriptorClosed: true, closeProved: false });
}

function syncParentDirectory(path, hooks = {}) {
  let fd;
  try {
    fd = openSync(dirname(path), "r");
    invokeHook(hooks, "beforeDirectoryFsync", path);
    invokeHook(hooks, "onFsyncStage", "directory", path);
    fsyncSync(fd);
    invokeHook(hooks, "afterDirectoryFsync", path);
    closeDescriptor(fd, "directory", hooks);
    fd = undefined;
  } catch (error) {
    if (error?.closeAttempted) {
      fd = undefined;
      throw error;
    }
    if (fd !== undefined) {
      try {
        closeDescriptor(fd, "directory", hooks);
        fd = undefined;
      } catch (closeError) {
        fd = undefined;
        if (closeError?.safe) throw closeError;
        failSafe("attestation descriptor close failed; inspect output state", { closeAttempted: true, descriptorClosed: false, closeProved: false });
      }
    }
    if (error?.safe) throw error;
    failSafe("attestation output directory could not be synchronized");
  }
}

export function rollbackExclusivePublication(publication, hooks = {}) {
  if (!publication || resolve(publication.path) !== publication.path) return false;
  // This is a bounded observation, not a filesystem-wide lock: a same-owner
  // mutation after the nlink check, including before unlink, cannot be globally excluded.
  let current;
  try {
    invokeHook(hooks, "beforeRollback", publication.path, publication);
    current = lstatSync(publication.path);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 || !sameInode(current, publication)) return false;
    unlinkSync(publication.path);
    invokeHook(hooks, "beforeRollbackFsync", publication.path);
    syncParentDirectory(publication.path, hooks);
    invokeHook(hooks, "afterRollbackFsync", publication.path);
    try {
      lstatSync(publication.path);
      return false;
    } catch (error) {
      return error?.code === "ENOENT";
    }
  } catch {
    return false;
  }
}

export function writeExclusiveMode600(path, value, hooks = {}) {
  const outputPath = resolve(path);
  validateFreshOutput(outputPath);
  let bytes;
  try {
    bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  } catch {
    failSafe("attestation output content could not be serialized");
  }
  let fd;
  let opened;
  let openedFd = false;
  let fdState = "not-open";
  const closeOutput = () => {
    if (fd === undefined || fdState !== "open") return;
    fdState = "closing";
    try {
      closeDescriptor(fd, "output", hooks);
      fdState = "closed";
      fd = undefined;
    } catch (error) {
      if (error?.descriptorClosed === true) {
        fdState = "closed";
        fd = undefined;
      } else {
        fdState = "uncertain";
        fd = undefined;
      }
      throw error;
    }
  };
  try {
    if (typeof constants.O_NOFOLLOW !== "number") failSafe("attestation output cannot be opened without symlink protection");
    invokeHook(hooks, "beforeOpen", outputPath);
    fd = openSync(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    openedFd = true;
    fdState = "open";
    opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== process.getuid() || (opened.mode & 0o777) !== 0o600) failSafe("attestation output identity or metadata check failed");
    invokeHook(hooks, "afterOpen", outputPath, opened);
    invokeHook(hooks, "beforeWrite", outputPath, opened);
    writeFileSync(fd, bytes);
    invokeHook(hooks, "afterWrite", outputPath, opened);
    invokeHook(hooks, "beforeFileFsync", outputPath, opened);
    invokeHook(hooks, "onFsyncStage", "file", outputPath);
    fsyncSync(fd);
    invokeHook(hooks, "afterFileFsync", outputPath, opened);
    const written = fstatSync(fd);
    if (!sameInode(written, opened) || written.nlink !== 1 || written.size !== bytes.length || written.uid !== opened.uid || (written.mode & 0o777) !== (opened.mode & 0o777)) failSafe("attestation output changed before verification");
    invokeHook(hooks, "beforeVerify", outputPath, written);
    const created = lstatSync(outputPath);
    if (!created.isFile() || created.isSymbolicLink() || created.nlink !== 1 || !sameInode(created, opened) || created.size !== bytes.length || created.uid !== opened.uid || (created.mode & 0o777) !== (opened.mode & 0o777)) failSafe("attestation output identity or metadata check failed");
    invokeHook(hooks, "afterVerify", outputPath, created);
    syncParentDirectory(outputPath, hooks);
    const published = lstatSync(outputPath);
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1 || !sameInode(published, opened) || published.size !== bytes.length || published.uid !== opened.uid || (published.mode & 0o777) !== (opened.mode & 0o777)) failSafe("attestation output changed after synchronization");
    closeOutput();
    const closed = lstatSync(outputPath);
    if (!closed.isFile() || closed.isSymbolicLink() || closed.nlink !== 1 || !sameInode(closed, opened) || closed.size !== bytes.length || closed.uid !== opened.uid || (closed.mode & 0o777) !== (opened.mode & 0o777)) failSafe("attestation output changed after descriptor close");
    return { path: outputPath, dev: closed.dev, ino: closed.ino, size: closed.size, uid: closed.uid, mode: closed.mode & 0o777 };
  } catch (error) {
    let closeError = error?.closeAttempted ? error : null;
    if (fd !== undefined && fdState === "open") {
      try { closeOutput(); } catch (closeFailure) { closeError = closeFailure; }
    }
    if (fd !== undefined) fd = undefined;
    if (!opened) {
      if (openedFd || closeError) failSafe("attestation output rollback was not proved; inspect output state", { rollbackProved: false, outputCreated: true });
      if (error?.safe) throw error;
      if (error?.code === "EEXIST" || error?.code === "ELOOP") failSafe("attestation output already exists; refusing overwrite");
      failSafe("attestation output could not be created exclusively");
    }
    const publication = { path: outputPath, dev: opened.dev, ino: opened.ino, size: bytes.length, uid: opened.uid, mode: opened.mode & 0o777 };
    if (!rollbackExclusivePublication(publication, hooks) || closeError) failSafe("attestation output rollback was not proved; inspect output state", { rollbackProved: false, outputCreated: true });
    failSafe("attestation output failed; owned output was rolled back", { rollbackProved: true, outputCreated: false });
  }
}

function assembleQcAttestationUnsafe({ root, captureDirectory, privatePath, publicPath, beforePublicOpen, beforePrivateRollback, failClose }) {
  const planPath = resolve(root, "data/qc-immutable-promotion-preparation.json");
  const runnerPath = resolve(root, "scripts/run-qc-approved-multipart-promotion.sh");
  const capturePath = resolve(root, "scripts/capture-qc-immutable-promotion-attestation.sh");
  const plan = json(planPath); validateQcImmutablePromotionPreparation(plan);
  const meta = captureMetadata(json(resolve(captureDirectory, "meta.json")));
  const states = []; const objects = [];
  for (const artifact of plan.artifacts) {
    const prefix = resolve(captureDirectory, artifact.id);
    const statePath = `${prefix}.state.json`; const state = json(statePath);
    safeEqual(state.artifactId, artifact.id, "state artifact binding did not match the exact plan");
    safeEqual(state.payloadKey, artifact.payloadKey, "state payload binding did not match the exact plan");
    safeEqual(state.manifestKey, artifact.manifestKey, "state manifest binding did not match the exact plan");
    safeEqual(state.sha256, artifact.sha256, "state digest binding did not match the exact plan");
    safeEqual(state.byteLength, artifact.byteLength, "state byte-length binding did not match the exact plan");
    safeEqual(state.partSizeBytes, plan.mfaGatedExecution.multipartPartSizeBytes, "state part-size binding did not match the exact plan");
    safeEqual(state.initiation, "accepted", "state initiation is not accepted");
    safeMatch(state.uploadId, /\S/, "uploadId is missing from exact accepted state");
    safeMatch(state.payloadVersionId, /\S/, "payloadVersionId is missing from exact accepted state");
    safeMatch(state.sidecarVersionId, /\S/, "sidecarVersionId is missing from exact accepted state");
    safeMatch(state.compositeChecksumSha256, /\S/, "compositeChecksumSha256 is missing from exact accepted state");
    states.push({ artifactId: artifact.id, sha256: hash(read(statePath)) });
    const payloadHeadPath = `${prefix}.payload-head.json`; const payloadHead = json(payloadHeadPath);
    safeEqual(payloadHead.VersionId, state.payloadVersionId, "payloadVersionId did not match the exact payload head"); safeEqual(payloadHead.ContentLength, artifact.byteLength, "payload byte length did not match the exact payload head");
    safeEqual(payloadHead.ChecksumType, "COMPOSITE", "payload checksum type did not match the exact payload head"); safeEqual(payloadHead.ChecksumSHA256, state.compositeChecksumSha256, "payload checksum did not match the exact payload head");
    const manifestHeadPath = `${prefix}.manifest-head.json`; const manifestHead = json(manifestHeadPath);
    const sidecar = sidecarFor(plan, artifact);
    safeEqual(manifestHead.VersionId, state.sidecarVersionId, "sidecarVersionId did not match the exact manifest head"); safeEqual(manifestHead.ContentLength, Buffer.byteLength(sidecar), "manifest byte length did not match the exact manifest head");
    safeEqual(manifestHead.ChecksumType ?? "FULL_OBJECT", "FULL_OBJECT", "manifest checksum type did not match the exact manifest head"); safeEqual(manifestHead.ChecksumSHA256, b64sha(sidecar), "manifest checksum did not match the exact manifest head");
    const retentionPath = `${prefix}.retention.json`; const retention = json(retentionPath);
    safeEqual(retention.Retention.Mode, plan.mfaGatedExecution.retentionMode, "payload retention mode did not match the exact plan");
    safeEqual(new Date(retention.Retention.RetainUntilDate).getTime(), new Date(plan.mfaGatedExecution.recommendedRetainUntil).getTime(), "payload retention date did not match the exact plan");
    for (const [objectKind, head, headPath, versionId, key, contentLength, checksum] of [
      ["payload", payloadHead, payloadHeadPath, state.payloadVersionId, artifact.payloadKey, artifact.byteLength, { algorithm: "SHA256", type: "COMPOSITE", providerValue: state.compositeChecksumSha256 }],
      ["manifest", manifestHead, manifestHeadPath, state.sidecarVersionId, artifact.manifestKey, Buffer.byteLength(sidecar), { algorithm: "SHA256", type: "FULL_OBJECT", providerValue: b64sha(sidecar) }]
    ]) objects.push({ artifactId: artifact.id, productionSourceId: artifact.productionSourceId, objectKind, key, versionId, contentLength, checksum, headObjectReadAt: head.WitnessTreeCapturedAt, headResponseSha256: hash(read(headPath)), retention: objectKind === "payload" ? { mode: retention.Retention.Mode, retainUntil: plan.mfaGatedExecution.recommendedRetainUntil, readAt: retention.WitnessTreeCapturedAt, responseSha256: hash(read(retentionPath)) } : "not-authorized-rebuildable-sidecar" });
  }
  const privateRecord = {
    schemaVersion: "witness-tree/qc-immutable-promotion-attestation-private/1",
    status: "owner-run-exact-version-readbacks-complete",
    provenance: { createdAt: meta.createdAt, captureCommand: "zsh scripts/capture-qc-immutable-promotion-attestation.sh --capture <mode-600-private-output> <redacted-public-output>", accountId: meta.identity.Account, operatorArn: meta.identity.Arn, roleArn: "arn:aws:iam::286853118812:role/WitnessTreeQcArchivePromotionUploader", runnerSha256: hash(read(runnerPath)), captureScriptSha256: hash(read(capturePath)), planSha256: hash(read(planPath)), stateFileSha256s: states, authentication: "fresh-mfa-owner-session", operation: "read-only-exact-version-head-and-payload-retention-capture" },
    destination: plan.destination,
    objects,
    recoveryBoundary: { multipartResumeStatePreserved: true, replicaCreated: false, replicaAuthorized: false, meaning: "Private multipart state supports interrupted-run diagnosis/resume only; no recovery replica was approved or proved." },
    claims: { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false }
  };
  validatePrivateQcAttestation(privateRecord, plan);
  const privatePublication = writeExclusiveMode600(privatePath, privateRecord, { failClose });
  try {
    const privateBytes = read(privatePublication.path);
    const publicRecord = redactQcAttestation(privateRecord, privateBytes, plan);
    writeExclusiveMode600(publicPath, publicRecord, { beforeOpen: beforePublicOpen, failClose });
  } catch (error) {
    const publicRollbackUnproved = error?.rollbackProved === false;
    if (!rollbackExclusivePublication(privatePublication, { beforeRollback: beforePrivateRollback, failClose })) failSafe("QC attestation pair publication failed; private rollback was not proved; inspect output state");
    if (publicRollbackUnproved) failSafe("QC attestation pair publication failed; public rollback was not proved; inspect output state");
    failSafe("QC attestation pair publication failed; private output was rolled back");
  }
  return { privatePath: privatePublication.path, publicPath: resolve(publicPath) };
}

export function assembleQcAttestation({ root, captureDirectory, privatePath, publicPath, beforePublicOpen, beforePrivateRollback, failClose }) {
  try {
    const privateOutput = resolve(privatePath); const publicOutput = resolve(publicPath);
    if (privateOutput === publicOutput) failSafe("attestation output paths must be distinct");
    validateFreshOutput(privateOutput);
    validateFreshOutput(publicOutput);
    return assembleQcAttestationUnsafe({ root, captureDirectory, privatePath: privateOutput, publicPath: publicOutput, beforePublicOpen, beforePrivateRollback, failClose });
  } catch (error) {
    if (error?.safe) throw error;
    failSafe("QC attestation assembly failed closed; output state requires inspection");
  }
}

if (process.argv[1]?.endsWith("assemble-qc-immutable-promotion-attestation.mjs")) {
  if (process.argv.length !== 6) failSafe("Usage: assembler <repository-root> <capture-directory> <private-output> <public-output>");
  assembleQcAttestation({ root: resolve(process.argv[2]), captureDirectory: resolve(process.argv[3]), privatePath: resolve(process.argv[4]), publicPath: resolve(process.argv[5]) });
  console.log("Wrote owner-only exact QC attestation and its redacted digest-bound record; no source-ledger or downstream state changed.");
}
