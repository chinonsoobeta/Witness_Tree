import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exactPromotionObjects, loadQcFourthInventoryPromotionPreparation, qcFourthPlanDigests } from "./check-qc-fourth-inventory-immutable-promotion.mjs";
import { preflightLocal, recomputeMultipartPartChecksums } from "./qc-fourth-inventory-immutable-promotion.mjs";

const RETAIN_UNTIL = "2033-08-12T00:00:00Z";
const PRIVATE_FILE_MODE = 0o600;
const ACCOUNT = "286853118812";
const OPERATOR_ARN = `arn:aws:iam::${ACCOUNT}:user/WitnessTreeArchiveOperator`;
const ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/WitnessTreeQcFourthArchivePromotionUploader`;
const RECOVERY_SESSION_NAME = "witness-tree-qc-fourth-readonly-recovery";
const AMBIGUOUS_REASONS = new Set([
  "single-put-response-unknown",
  "single-put-response-invalid",
  "multipart-create-response-unknown",
  "multipart-create-response-invalid",
  "multipart-part-response-unknown",
  "multipart-part-response-invalid",
  "multipart-completion-response-unknown",
  "multipart-completion-response-invalid",
  "multipart-completion-nosuchupload",
  "multipart-list-parts-response-ambiguous"
]);

const exists = (file) => {
  try { lstatSync(file); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
};

function assertPrivateInput(file) {
  const metadata = lstatSync(file);
  assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "recovery state must be a regular non-symlink file");
  assert.equal(metadata.uid, process.getuid(), "recovery state must be owner-owned");
  assert.equal(metadata.mode & 0o777, PRIVATE_FILE_MODE, "recovery state must be mode 600");
  assert.equal(metadata.nlink, 1, "recovery state must not have hard-link aliases");
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertControlledDirectory(directory, label) {
  const metadata = lstatSync(directory);
  assert.ok(metadata.isDirectory() && !metadata.isSymbolicLink(), `${label} must be a non-symlink directory`);
  assert.equal(metadata.uid, process.getuid(), `${label} must be owner-owned`);
  assert.equal(metadata.mode & 0o777, 0o700, `${label} must be mode 700`);
}

function assertNewOutput(file) {
  assert.ok(path.isAbsolute(file), "recovery output must be an absolute path");
  assert.equal(exists(file), false, "recovery output already exists; refusing to overwrite it");
  assert.equal(exists(`${file}.next`), false, "recovery output temporary path already exists; inspect it before continuing");
}

function publishOutput(file, record) {
  const temporary = `${file}.next`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: PRIVATE_FILE_MODE });
  let published = false;
  try {
    const metadata = lstatSync(temporary);
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), "recovery output temporary file must be regular");
    assert.equal(metadata.uid, process.getuid(), "recovery output temporary file must be owner-owned");
    assert.equal(metadata.mode & 0o777, PRIVATE_FILE_MODE, "recovery output temporary file must be mode 600");
    assert.equal(metadata.nlink, 1, "recovery output temporary file must not have hard links");
    // link(2) refuses an output that appeared after the precheck; rename(2)
    // would replace it during that race.
    assert.equal(exists(file), false, "recovery output appeared during read-only capture");
    linkSync(temporary, file);
    published = true;
    unlinkSync(temporary);
    const finalMetadata = lstatSync(file);
    assert.equal(finalMetadata.uid, process.getuid(), "recovery output must be owner-owned");
    assert.equal(finalMetadata.mode & 0o777, PRIVATE_FILE_MODE, "recovery output must be mode 600");
    assert.equal(finalMetadata.nlink, 1, "recovery output must not have hard links");
  } catch (error) {
    if (published) {
      try { unlinkSync(file); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
    }
    throw error;
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}

function invokeJson(args, env = process.env) {
  const output = execFileSync("aws", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  return output.trim() ? JSON.parse(output) : {};
}

function s3(invoke, env, args) {
  return invoke(["s3api", ...args, "--region", "ca-central-1", "--output", "json"], env);
}

function planBoundState(plan, state) {
  const digests = qcFourthPlanDigests(plan);
  assert.equal(state.schemaVersion, 1);
  assert.equal(state.planSha256, digests.planParsedSha256);
  assert.equal(state.planParsedSha256, digests.planParsedSha256);
  assert.equal(state.planFileSha256, digests.planFileSha256);
  assert.equal(state.bucket, plan.bucket);
  assert.equal(state.region, plan.region);
  assert.equal(state.retentionUntil, RETAIN_UNTIL);
  assert.ok(state.objects && typeof state.objects === "object" && !Array.isArray(state.objects));
  const entries = new Map(exactPromotionObjects(plan).map((entry) => [entry.id, entry]));
  for (const [id, record] of Object.entries(state.objects)) {
    const entry = entries.get(id);
    assert.ok(entry, `state contains an unexpected object ${id}`);
    assert.equal(record.objectKey, entry.objectKey, `${id} state key drifted`);
    assert.equal(record.byteLength, entry.byteLength, `${id} state byte length drifted`);
    assert.equal(record.sha256, entry.sha256, `${id} state SHA-256 drifted`);
    if (record.recoveryRequired) assert.ok(AMBIGUOUS_REASONS.has(record.recoveryReason), `${id} has an unsupported recovery reason`);
  }
  const ambiguous = Object.entries(state.objects).filter(([, record]) => record.recoveryRequired === true);
  assert.ok(ambiguous.length > 0, "promotion state contains no recovery-required ambiguous mutation");
  return { entries, ambiguous };
}

function classifyError(error) {
  const text = typeof error?.message === "string" ? error.message : "unknown";
  if (/NoSuchUpload/i.test(text)) return "NoSuchUpload";
  if (/AccessDenied/i.test(text)) return "AccessDenied";
  return "readback-error";
}

function expectedChecksum(plan, entry, localMultipart) {
  if (entry.byteLength > plan.upload.multipartThresholdBytes) return localMultipart.compositeChecksumSha256;
  return Buffer.from(entry.sha256, "hex").toString("base64");
}

export function validateRecoveryEnvironment(environment) {
  if (environment?.mocked === "true") return environment;
  assert.ok(environment?.AWS_ACCESS_KEY_ID && environment?.AWS_SECRET_ACCESS_KEY && environment?.AWS_SESSION_TOKEN, "temporary read-only role-session credentials are required");
  assert.equal(environment.WITNESS_TREE_SESSION_VERIFIED, "1", "the owner-local recovery wrapper did not verify its session");
  assert.equal(environment.WITNESS_TREE_ACCOUNT, ACCOUNT, "the recovery session is outside the approved account");
  assert.equal(environment.WITNESS_TREE_OPERATOR_ARN, OPERATOR_ARN, "the recovery session did not originate from the approved operator");
  assert.equal(environment.WITNESS_TREE_ROLE_ARN, ROLE_ARN, "the recovery session did not use the approved role");
  assert.equal(environment.WITNESS_TREE_ROLE_SESSION_NAME, RECOVERY_SESSION_NAME, "the recovery session name drifted");
  assert.equal(environment.WITNESS_TREE_MFA_PRESENT, "true", "the recovery wrapper did not attest fresh MFA");
  assert.ok(typeof environment.WITNESS_TREE_SESSION_EXPIRES_AT === "string" && Number.isFinite(Date.parse(environment.WITNESS_TREE_SESSION_EXPIRES_AT)), "the recovery session expiry is missing");
  assert.ok(Date.parse(environment.WITNESS_TREE_SESSION_EXPIRES_AT) > Date.now(), "the recovery session is expired");
  return environment;
}

export function recoverQcFourthReadOnly(plan, statePath, outputPath, dependencies = {}) {
  assert.equal(dependencies.approveReadOnlyRecovery, true, "Read-only recovery requires a separate explicit approval");
  assert.equal(dependencies.sessionReady, true, "Read-only recovery requires the owner-local read-only session wrapper");
  assertControlledDirectory(path.dirname(path.resolve(statePath)), "recovery state parent");
  assertControlledDirectory(path.dirname(path.resolve(outputPath)), "recovery output parent");
  assertNewOutput(outputPath);
  const state = assertPrivateInput(statePath);
  const { entries, ambiguous } = planBoundState(plan, state);
  const invoke = dependencies.invoke || invokeJson;
  const env = validateRecoveryEnvironment(dependencies.env || process.env);
  let localSources = new Map();
  if (dependencies.dataRoot) {
    const preflight = preflightLocal(plan, { execute: false, dataRoot: path.resolve(dependencies.dataRoot) });
    localSources = new Map(preflight.sources.map((entry) => [entry.id, entry]));
  }
  const results = ambiguous.map(([id, record]) => {
    const entry = entries.get(id);
    const local = localSources.get(id);
    let localMultipart;
    if (entry.byteLength > plan.upload.multipartThresholdBytes) {
      assert.ok(local, `${id} recovery requires local preflight bytes for multipart composite recomputation`);
      localMultipart = recomputeMultipartPartChecksums(local, plan.upload.partSizeBytes);
    }
    const expected = expectedChecksum(plan, entry, localMultipart || { compositeChecksumSha256: null });
    const calls = [];
    let latest;
    let latestError;
    // An upload ID allows only a read-only ListParts probe.  No replacement
    // initiation or completion is ever attempted here.
    if (record.uploadId) {
      try {
        latest = s3(invoke, env, ["list-parts", "--bucket", plan.bucket, "--key", entry.objectKey, "--upload-id", record.uploadId]);
        calls.push("list-parts");
      } catch (error) {
        latestError = classifyError(error);
        calls.push("list-parts");
      }
    }
    let head;
    try {
      head = s3(invoke, env, ["head-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--checksum-mode", "ENABLED"]);
      calls.push("head-object");
    } catch (error) {
      latestError = latestError || classifyError(error);
      calls.push("head-object");
    }
    let exact;
    let retention;
    if (head?.VersionId && head.ContentLength === entry.byteLength && head.ChecksumType === (entry.byteLength > plan.upload.multipartThresholdBytes ? "COMPOSITE" : "FULL_OBJECT") && head.ChecksumSHA256 === expected) {
      try {
        exact = s3(invoke, env, ["head-object", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", head.VersionId, "--checksum-mode", "ENABLED"]);
        calls.push("head-object-version");
        retention = s3(invoke, env, ["get-object-retention", "--bucket", plan.bucket, "--key", entry.objectKey, "--version-id", head.VersionId]);
        calls.push("get-object-retention");
      } catch (error) {
        latestError = classifyError(error);
      }
    }
    const exactMatch = Boolean(exact && exact.VersionId === head?.VersionId && exact.ContentLength === entry.byteLength && exact.ChecksumSHA256 === expected && retention?.Retention?.Mode === "COMPLIANCE" && Date.parse(retention.Retention.RetainUntilDate) === Date.parse(RETAIN_UNTIL));
    return {
      id,
      objectKey: entry.objectKey,
      recoveryReason: record.recoveryReason,
      uploadIdPresent: Boolean(record.uploadId),
      observedUploadState: latest ? "read-only-list-parts-succeeded" : latestError === "NoSuchUpload" ? "NoSuchUpload" : latestError ? "unavailable" : "not-probed",
      candidateVersionId: head?.VersionId || null,
      candidateMatchesApprovedBytesChecksumAndRetention: exactMatch,
      localCompositeChecksumSha256: localMultipart?.compositeChecksumSha256 || null,
      calls,
      recoveryDecision: "recovery-required-no-automatic-duplicate",
      claims: { stateChanged: false, mutationPerformed: false, replacementStarted: false }
    };
  });
  const record = {
    schemaVersion: "witness-tree/qc-fourth-inventory-immutable-promotion-readonly-recovery/1",
    status: "read-only-diagnostic-only",
    notice: "This record is a separately gated read-only diagnostic. It does not authorize, perform, or imply a replacement upload, multipart completion, retention change, ledger credit, transformation, ingestion, release, or production admission.",
    planFileSha256: qcFourthPlanDigests(plan).planFileSha256,
    planParsedSha256: qcFourthPlanDigests(plan).planParsedSha256,
    stateFileSha256: requireStateDigest(statePath),
    objectCount: results.length,
    objects: results,
    claims: { stateChanged: false, mutationPerformed: false, replacementStarted: false, sourceLedgerCreditChanged: false, transformed: false, ingested: false, productionEligible: false }
  };
  publishOutput(outputPath, record);
  return record;
}

function requireStateDigest(statePath) {
  return createHash("sha256").update(readFileSync(statePath)).digest("hex");
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  assert.ok(args.includes("--recover") && args.includes("--approve-read-only-recovery") && args.includes("--session-ready"), "Read-only recovery requires --recover --approve-read-only-recovery --session-ready");
  assert.equal(args.includes("--execute"), false, "Read-only recovery cannot be combined with --execute");
  const statePath = option(args, "--state");
  const outputPath = option(args, "--output");
  const dataRoot = option(args, "--data-root");
  assert.ok(statePath && outputPath && dataRoot, "Usage: --recover --approve-read-only-recovery --session-ready --state <mode-600-state> --data-root <Witness_Tree-data> --output <new-mode-600-output>");
  assert.ok(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SESSION_TOKEN, "temporary read-only role-session credentials are required");
  const result = recoverQcFourthReadOnly(loadQcFourthInventoryPromotionPreparation(), path.resolve(statePath), path.resolve(outputPath), { approveReadOnlyRecovery: true, sessionReady: true, dataRoot: path.resolve(dataRoot), env: process.env });
  console.log(JSON.stringify(result, null, 2));
}
