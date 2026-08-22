import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { redactQcAttestation, validatePrivateQcAttestation } from "./check-qc-immutable-promotion-attestation.mjs";
import { sidecarFor, validateQcImmutablePromotionPreparation } from "./prepare-qc-immutable-promotion.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path));
const b64sha = (value) => Buffer.from(hash(value), "hex").toString("base64");
const APPROVED_ACCOUNT = "286853118812";
const APPROVED_OPERATOR_ARN = `arn:aws:iam::${APPROVED_ACCOUNT}:user/WitnessTreeArchiveOperator`;

function failSafe(message) {
  const error = new Error(message);
  error.safe = true;
  throw error;
}

function safeEqual(actual, expected, message) {
  if (actual !== expected) failSafe(message);
}

function safeMatch(value, pattern, message) {
  if (typeof value !== "string" || !pattern.test(value)) failSafe(message);
}

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

function unlinkOwnedTemp(temp, owner) {
  if (!temp || !owner) return;
  try {
    const current = lstatSync(temp);
    if (!current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino) unlinkSync(temp);
  } catch (error) {
    if (error?.code !== "ENOENT") return;
  }
}

function syncParentDirectory(path) {
  let fd;
  try {
    fd = openSync(dirname(path), "r");
    fsyncSync(fd);
  } catch {
    failSafe("attestation output directory could not be synchronized");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function writeExclusiveMode600(path, value, { beforeLink } = {}) {
  validateFreshOutput(path);
  if (beforeLink !== undefined && typeof beforeLink !== "function") failSafe("attestation output link hook is invalid");
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  let fd;
  let owner;
  let linked = false;
  try {
    fd = openSync(temp, "wx", 0o600);
    owner = fstatSync(fd);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    if (beforeLink) beforeLink();
    linkSync(temp, path);
    linked = true;
    const created = lstatSync(path);
    if (!created.isFile() || created.isSymbolicLink() || created.uid !== process.getuid() || (created.mode & 0o777) !== 0o600) {
      failSafe("attestation output is not owner-owned mode 600");
    }
    unlinkOwnedTemp(temp, owner);
    syncParentDirectory(path);
    return path;
  } catch (error) {
    if (error?.safe) throw error;
    if (error?.code === "EEXIST") failSafe("attestation output already exists; refusing overwrite");
    failSafe(linked ? "attestation output could not be finalized" : "attestation output could not be created exclusively");
  } finally {
    if (fd !== undefined) closeSync(fd);
    unlinkOwnedTemp(temp, owner);
  }
}

function assembleQcAttestationUnsafe({ root, captureDirectory, privatePath, publicPath }) {
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
  writeExclusiveMode600(privatePath, privateRecord);
  const privateBytes = read(privatePath);
  writeExclusiveMode600(publicPath, redactQcAttestation(privateRecord, privateBytes, plan));
  return { privatePath, publicPath };
}

export function assembleQcAttestation({ root, captureDirectory, privatePath, publicPath }) {
  try {
    if (privatePath === publicPath) failSafe("attestation output paths must be distinct");
    validateFreshOutput(privatePath);
    validateFreshOutput(publicPath);
    return assembleQcAttestationUnsafe({ root, captureDirectory, privatePath, publicPath });
  } catch (error) {
    if (error?.safe) throw error;
    failSafe("QC attestation assembly failed closed; no output was written");
  }
}

if (process.argv[1]?.endsWith("assemble-qc-immutable-promotion-attestation.mjs")) {
  if (process.argv.length !== 6) failSafe("Usage: assembler <repository-root> <capture-directory> <private-output> <public-output>");
  assembleQcAttestation({ root: resolve(process.argv[2]), captureDirectory: resolve(process.argv[3]), privatePath: resolve(process.argv[4]), publicPath: resolve(process.argv[5]) });
  console.log("Wrote owner-only exact QC attestation and its redacted digest-bound record; no source-ledger or downstream state changed.");
}
