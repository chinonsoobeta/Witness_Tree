import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publishFederalMode600 } from "./federal-electoral-safe-publication.mjs";
import { validateFederalElectoralPromotionIam } from "./check-federal-electoral-promotion-iam.mjs";
import { validateFederalLiveIamEvidence } from "./check-federal-electoral-live-iam-evidence.mjs";
import { FEDERAL_RAW_RESPONSE_NAMES, redactFederalAttestation, validatePrivateFederalAttestation, validateRedactedFederalAttestation } from "./check-federal-electoral-promotion-attestation.mjs";

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
  const before = secureRegularFile(path, label);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1 || opened.uid !== process.getuid()) fail(`${label} changed before descriptor read`);
    const bytes = readFileSync(descriptor);
    fsyncSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || String(after.mtimeNs) !== String(opened.mtimeNs) || String(after.ctimeNs) !== String(opened.ctimeNs)) fail(`${label} changed during descriptor read`);
    return bytes;
  } finally { closeSync(descriptor); }
}

function rawResponseEvidence(capturePath, names) {
  assert.ok(Array.isArray(names) && names.length > 0, "raw response names are missing");
  const seen = new Set();
  const records = [];
  assert.deepEqual(readdirSync(capturePath).sort(), [...names, "attestation-input.json"].sort(), "capture directory does not contain the exact approved raw-response file set");
  for (const name of names) {
    assert.match(name, /^[A-Za-z0-9._-]+$/, "raw response name is unsafe");
    assert.equal(seen.has(name), false, "raw response name is duplicated"); seen.add(name);
    const bytes = durableBytes(join(capturePath, name), `raw response ${name}`);
    records.push({ name, byteLength: bytes.length, sha256: sha256(bytes) });
  }
  return records;
}

export function assembleFederalAttestation({ capturePath, planPath, approvalPath, iamDesiredPath, liveIamPath, ownerPacketPath, readinessPath, runnerPath, authorizationSha256, privatePath, publicPath }) {
  const captureDirectory = resolve(capturePath); const planFile = resolve(planPath); const approvalFile = resolve(approvalPath); const iamFile = resolve(iamDesiredPath); const liveFile = resolve(liveIamPath); const ownerPacketFile = resolve(ownerPacketPath ?? resolve(ROOT, "data/phase1-owner-approval-packet.json")); const runnerFile = resolve(runnerPath ?? resolve(ROOT, "scripts/run-federal-electoral-approved-promotion.sh")); const privateOutput = resolve(privatePath); const publicOutput = resolve(publicPath);
  if (privateOutput === publicOutput) fail("attestation output paths must be distinct");
  const inputPath = join(captureDirectory, "attestation-input.json");
  const inputBytes = durableBytes(inputPath, "attestation input"); const input = JSON.parse(inputBytes);
  const readinessFile = resolve(readinessPath);
  const plan = readJson(planFile); const approval = readJson(approvalFile); const iamDesired = readJson(iamFile); const ownerPacket = readJson(ownerPacketFile);
  assert.deepEqual(Object.keys(authorizationSha256 ?? {}).sort(), ["approval", "iamDesired", "liveIam", "ownerPacket", "plan", "readiness", "runner"], "the exact pre-action authorization SHA-256 set is required");
  for (const [label, file] of Object.entries({ plan: planFile, approval: approvalFile, iamDesired: iamFile, liveIam: liveFile, ownerPacket: ownerPacketFile, readiness: readinessFile, runner: runnerFile })) {
    assert.match(authorizationSha256[label] ?? "", /^[a-f0-9]{64}$/, `${label} pre-action SHA-256 is malformed`);
    assert.equal(sha256(readBytes(file)), authorizationSha256[label], `${label} changed after pre-action authorization`);
  }
  validateFederalElectoralPromotionIam(iamDesired, plan); validateFederalLiveIamEvidence(liveFile, iamDesired, plan);
  const approvalEntry = approval.phase1?.archiveApprovals?.find(({ id }) => id === "federal-electoral-archive");
  assert.equal(approvalEntry?.ownerCommand, "zsh scripts/run-phase1-approved-promotion.sh --run-federal");
  assert.equal(approvalEntry?.bindingRef, "data/phase1-owner-approval-packet.json#/exactBindings/federal-electoral-archive");
  assert.equal(ownerPacket.exactBindings?.["federal-electoral-archive"]?.proposedRole, iamDesired.roleName);
  assert.deepEqual(input.rawResponseNames, [...FEDERAL_RAW_RESPONSE_NAMES], "attestation input raw response names are not the exact approved set");
  const rawResponses = rawResponseEvidence(captureDirectory, input.rawResponseNames);
  const rawByName = Object.fromEntries(rawResponses.map((response) => [response.name, response]));
  assert.equal(input.artifact.payload.headResponseSha256, rawByName["payload-head.json"].sha256, "payload head digest is not cross-linked to the captured raw response");
  assert.equal(input.artifact.payload.versionListResponseSha256, rawByName["payload-versions-after.json"].sha256, "payload version-list digest is not cross-linked to the captured raw response");
  assert.equal(input.artifact.manifest.headResponseSha256, rawByName["manifest-head.json"].sha256, "manifest head digest is not cross-linked to the captured raw response");
  assert.equal(input.artifact.manifest.versionListResponseSha256, rawByName["manifest-versions-after.json"].sha256, "manifest version-list digest is not cross-linked to the captured raw response");
  assert.equal(input.artifact.retention.responseSha256, rawByName["payload-retention.json"].sha256, "retention digest is not cross-linked to the captured raw response");
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
      runnerSha256: authorizationSha256.runner,
      planSha256: authorizationSha256.plan,
      approvalSha256: authorizationSha256.approval,
      iamDesiredSha256: authorizationSha256.iamDesired,
      ownerPacketSha256: authorizationSha256.ownerPacket,
      archiveReadinessSha256: authorizationSha256.readiness,
      liveIamSha256: authorizationSha256.liveIam,
      authentication: "fresh-mfa-owner-session",
      operation: "primary-only-exact-version-head-checksum-retention-capture"
    },
    preActionAuthorization: { status: "exact-inputs-validated-before-mfa", ownerApprovalRef: "data/phase1-phase3-owner-approvals-2026-08-21.json#/phase1/archiveApprovals/0", ownerBindingRef: "data/phase1-owner-approval-packet.json#/exactBindings/federal-electoral-archive", roleName: "WitnessTreeArchivePromotionUploader", inputSha256: authorizationSha256 },
    postActionEvidence: { status: "primary-exact-version-readbacks-captured", rawResponseBundleSha256, mutationScope: "primary-payload-manifest-and-payload-compliance-retention-only" },
    operator: input.operator,
    assumedRole: { Account: input.assumedRole.Account, Arn: input.assumedRole.Arn },
    artifact: input.artifact,
    rawResponses,
    rawResponseBundleSha256,
    recoveryAuthorization: { status: "not-authorized", primaryOnly: true, replicaAuthorized: false, recoveryCreditEligible: false, meaning: "No recovery-bucket action was authorized before the primary-only capture. A separate owner authorization is required before any recovery action." },
    recoveryProof: { status: "not-performed", primaryOnly: true, replicaCreated: false, recoveryReadbackVerified: false, recoveryCreditEligible: false, meaning: "No recovery-bucket action or post-action proof was performed. Primary exact-version evidence remains non-credit until separate recovery authorization and proof exist." },
    claims: { exactReadbacksVerified: true, retentionVerified: true, immutableObjectStorage: true, sourceLedgerCreditChanged: false, recoveryReplicaVerified: false, immutableArchiveCreditEligible: false, transformed: false, ingested: false, released: false, productionAdmission: false, productionEligible: false }
  };
  validatePrivateFederalAttestation(privateRecord, plan);
  const privatePublication = publishFederalMode600(privateOutput, privateRecord);
  try {
    const privateBytes = durableBytes(privatePublication.path, "private attestation");
    const publicRecord = redactFederalAttestation(privateRecord, privateBytes, plan);
    validateRedactedFederalAttestation(publicRecord, plan);
    publishFederalMode600(publicOutput, publicRecord);
    return { privatePath: privatePublication.path, publicPath: publicOutput };
  } catch {
    // Never delete by pathname during failure handling. An incomplete private
    // diagnostic remains owner-only and cannot be mistaken for a validated pair.
    fail("federal attestation pair publication failed; owner-only diagnostic state was retained");
  }
}

if (process.argv[1]?.endsWith(basename(import.meta.url))) {
  try {
    const args = process.argv.slice(2); const value = (name) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
    const required = ["--capture-dir", "--plan", "--approval", "--iam", "--live-iam", "--owner-packet", "--readiness", "--runner", "--authorization-sha256", "--private", "--public"]; for (const name of required) if (!value(name)) fail("required attestation input is missing");
    assembleFederalAttestation({ capturePath: value("--capture-dir"), planPath: value("--plan"), approvalPath: value("--approval"), iamDesiredPath: value("--iam"), liveIamPath: value("--live-iam"), ownerPacketPath: value("--owner-packet"), readinessPath: value("--readiness"), runnerPath: value("--runner"), authorizationSha256: JSON.parse(value("--authorization-sha256")), privatePath: value("--private"), publicPath: value("--public") });
    console.log("Federal primary-only private/redacted attestation pair written owner-only; no recovery or source-ledger credit was claimed.");
  } catch {
    console.error("Federal electoral attestation assembly failed without exposing provider values; inspect owner-only output state.");
    process.exitCode = 70;
  }
}
