import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { redactQcAttestation, validatePrivateQcAttestation } from "./check-qc-immutable-promotion-attestation.mjs";
import { sidecarFor, validateQcImmutablePromotionPreparation } from "./prepare-qc-immutable-promotion.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(path);
const json = (path) => JSON.parse(read(path));
const b64sha = (value) => Buffer.from(hash(value), "hex").toString("base64");

function atomicMode600(path, value) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  renameSync(temp, path);
}

export function assembleQcAttestation({ root, captureDirectory, privatePath, publicPath }) {
  const planPath = resolve(root, "data/qc-immutable-promotion-preparation.json");
  const runnerPath = resolve(root, "scripts/run-qc-approved-multipart-promotion.sh");
  const capturePath = resolve(root, "scripts/capture-qc-immutable-promotion-attestation.sh");
  const plan = json(planPath); validateQcImmutablePromotionPreparation(plan);
  const meta = json(resolve(captureDirectory, "meta.json"));
  assert.deepEqual(Object.keys(meta).sort(), ["createdAt", "identity"].sort());
  assert.deepEqual(meta.identity, { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" });
  const states = []; const objects = [];
  for (const artifact of plan.artifacts) {
    const prefix = resolve(captureDirectory, artifact.id);
    const statePath = `${prefix}.state.json`; const state = json(statePath);
    assert.deepEqual({ artifactId: state.artifactId, payloadKey: state.payloadKey, manifestKey: state.manifestKey, sha256: state.sha256, byteLength: state.byteLength, partSizeBytes: state.partSizeBytes }, { artifactId: artifact.id, payloadKey: artifact.payloadKey, manifestKey: artifact.manifestKey, sha256: artifact.sha256, byteLength: artifact.byteLength, partSizeBytes: plan.mfaGatedExecution.multipartPartSizeBytes });
    assert.equal(state.initiation, "accepted");
    assert.match(state.uploadId, /\S/); assert.match(state.payloadVersionId, /\S/); assert.match(state.sidecarVersionId, /\S/); assert.match(state.compositeChecksumSha256, /\S/);
    states.push({ artifactId: artifact.id, sha256: hash(read(statePath)) });
    const payloadHeadPath = `${prefix}.payload-head.json`; const payloadHead = json(payloadHeadPath);
    assert.equal(payloadHead.VersionId, state.payloadVersionId); assert.equal(payloadHead.ContentLength, artifact.byteLength);
    assert.equal(payloadHead.ChecksumType, "COMPOSITE"); assert.equal(payloadHead.ChecksumSHA256, state.compositeChecksumSha256);
    const manifestHeadPath = `${prefix}.manifest-head.json`; const manifestHead = json(manifestHeadPath);
    const sidecar = sidecarFor(plan, artifact);
    assert.equal(manifestHead.VersionId, state.sidecarVersionId); assert.equal(manifestHead.ContentLength, Buffer.byteLength(sidecar));
    assert.equal(manifestHead.ChecksumType ?? "FULL_OBJECT", "FULL_OBJECT"); assert.equal(manifestHead.ChecksumSHA256, b64sha(sidecar));
    const retentionPath = `${prefix}.retention.json`; const retention = json(retentionPath);
    assert.equal(retention.Retention.Mode, plan.mfaGatedExecution.retentionMode);
    assert.equal(new Date(retention.Retention.RetainUntilDate).getTime(), new Date(plan.mfaGatedExecution.recommendedRetainUntil).getTime());
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
  atomicMode600(privatePath, privateRecord);
  const privateBytes = read(privatePath);
  atomicMode600(publicPath, redactQcAttestation(privateRecord, privateBytes, plan));
  return { privatePath, publicPath };
}

if (process.argv[1]?.endsWith("assemble-qc-immutable-promotion-attestation.mjs")) {
  assert.equal(process.argv.length, 6, "Usage: assembler <repository-root> <capture-directory> <private-output> <public-output>");
  assembleQcAttestation({ root: resolve(process.argv[2]), captureDirectory: resolve(process.argv[3]), privatePath: resolve(process.argv[4]), publicPath: resolve(process.argv[5]) });
  console.log("Wrote owner-only exact QC attestation and its redacted digest-bound record; no source-ledger or downstream state changed.");
}
