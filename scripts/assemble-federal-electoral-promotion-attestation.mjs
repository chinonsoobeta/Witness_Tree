import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rollbackExclusivePublication, writeExclusiveMode600 } from "./assemble-qc-immutable-promotion-attestation.mjs";
import { validateFederalElectoralPromotionIam, validateFederalElectoralLiveIamAttestation } from "./check-federal-electoral-promotion-iam.mjs";
import { redactFederalAttestation, validatePrivateFederalAttestation, validateRedactedFederalAttestation } from "./check-federal-electoral-promotion-attestation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readBytes = (path) => readFileSync(path);
const readJson = (path) => JSON.parse(readBytes(path));
const fail = (message) => { throw new Error(message); };

function secureRegularFile(path, label) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.uid !== process.getuid()) fail(`${label} is not an owner-only regular file`);
  return metadata;
}

function durableBytes(path, label) {
  secureRegularFile(path, label);
  const descriptor = openSync(path, "r");
  try {
    const bytes = readFileSync(descriptor);
    fsyncSync(descriptor);
    return bytes;
  } finally { closeSync(descriptor); }
}

function rawResponseEvidence(capturePath, names) {
  assert.ok(Array.isArray(names) && names.length > 0, "raw response names are missing");
  const seen = new Set();
  const records = [];
  for (const name of names) {
    assert.match(name, /^[A-Za-z0-9._-]+$/, "raw response name is unsafe");
    assert.equal(seen.has(name), false, "raw response name is duplicated"); seen.add(name);
    const bytes = durableBytes(join(capturePath, name), `raw response ${name}`);
    records.push({ name, byteLength: bytes.length, sha256: sha256(bytes) });
  }
  return records;
}

export function assembleFederalAttestation({ capturePath, planPath, approvalPath, iamDesiredPath, liveIamPath, runnerPath, privatePath, publicPath }) {
  const captureDirectory = resolve(capturePath); const planFile = resolve(planPath); const approvalFile = resolve(approvalPath); const iamFile = resolve(iamDesiredPath); const liveFile = resolve(liveIamPath); const runnerFile = resolve(runnerPath ?? resolve(ROOT, "scripts/run-federal-electoral-approved-promotion.sh")); const privateOutput = resolve(privatePath); const publicOutput = resolve(publicPath);
  if (privateOutput === publicOutput) fail("attestation output paths must be distinct");
  const inputPath = join(captureDirectory, "attestation-input.json");
  const inputBytes = durableBytes(inputPath, "attestation input"); const input = JSON.parse(inputBytes);
  const plan = readJson(planFile); const approval = readJson(approvalFile); const iamDesired = readJson(iamFile); const liveIam = readJson(liveFile);
  validateFederalElectoralPromotionIam(iamDesired, plan); validateFederalElectoralLiveIamAttestation(liveIam, iamDesired, plan);
  const approvalEntry = approval.phase1?.archiveApprovals?.find(({ id }) => id === "federal-electoral-archive");
  assert.equal(approvalEntry?.ownerCommand, "zsh scripts/run-phase1-approved-promotion.sh --run-federal");
  const rawResponses = rawResponseEvidence(captureDirectory, input.rawResponseNames);
  const rawResponseBundleSha256 = sha256(`${JSON.stringify(rawResponses)}\n`);
  const privateRecord = {
    schemaVersion: "witness-tree/federal-electoral-promotion-attestation-private/1",
    status: "owner-run-primary-exact-version-readbacks-complete",
    provenance: {
      createdAt: input.createdAt,
      captureCommand: "zsh scripts/run-phase1-approved-promotion.sh --run-federal",
      accountId: input.operator.Account,
      operatorArn: input.operator.Arn,
      roleArn: input.assumedRole.roleArn,
      roleIdentityArn: input.assumedRole.Arn,
      runnerSha256: sha256(readBytes(runnerFile)),
      planSha256: sha256(readBytes(planFile)),
      approvalSha256: sha256(readBytes(approvalFile)),
      iamDesiredSha256: sha256(readBytes(iamFile)),
      liveIamSha256: sha256(readBytes(liveFile)),
      authentication: "fresh-mfa-owner-session",
      operation: "primary-only-exact-version-head-checksum-retention-capture"
    },
    operator: input.operator,
    assumedRole: { Account: input.assumedRole.Account, Arn: input.assumedRole.Arn },
    artifact: input.artifact,
    rawResponses,
    rawResponseBundleSha256,
    recoveryBoundary: { primaryOnly: true, replicaCreated: false, replicaAuthorized: false, recoveryCreditEligible: false, meaning: "No recovery-bucket operation was authorized or proved. Primary exact-version evidence remains non-credit until separate recovery authorization and proof exist." },
    claims: { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, recoveryReplicaVerified: false, immutableArchiveCreditEligible: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false }
  };
  validatePrivateFederalAttestation(privateRecord, plan);
  const privatePublication = writeExclusiveMode600(privateOutput, privateRecord);
  try {
    const privateBytes = durableBytes(privatePublication.path, "private attestation");
    const publicRecord = redactFederalAttestation(privateRecord, privateBytes, plan);
    validateRedactedFederalAttestation(publicRecord, plan);
    writeExclusiveMode600(publicOutput, publicRecord);
    return { privatePath: privatePublication.path, publicPath: publicOutput };
  } catch {
    if (!rollbackExclusivePublication(privatePublication)) fail("federal attestation pair publication failed; private rollback was not proved");
    fail("federal attestation pair publication failed without exposing provider values");
  }
}

if (process.argv[1]?.endsWith(basename(import.meta.url))) {
  try {
    const args = process.argv.slice(2); const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
    const required = ["--capture-dir", "--plan", "--approval", "--iam", "--live-iam", "--private", "--public"]; for (const name of required) if (!value(name)) fail("required attestation input is missing");
    assembleFederalAttestation({ capturePath: value("--capture-dir"), planPath: value("--plan"), approvalPath: value("--approval"), iamDesiredPath: value("--iam"), liveIamPath: value("--live-iam"), runnerPath: value("--runner") ?? resolve(ROOT, "scripts/run-federal-electoral-approved-promotion.sh"), privatePath: value("--private"), publicPath: value("--public") });
    console.log("Federal primary-only private/redacted attestation pair written owner-only; no recovery or source-ledger credit was claimed.");
  } catch {
    console.error("Federal electoral attestation assembly failed without exposing provider values; inspect owner-only output state.");
    process.exitCode = 70;
  }
}
