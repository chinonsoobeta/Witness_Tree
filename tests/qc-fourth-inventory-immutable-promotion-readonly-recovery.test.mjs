import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { exactPromotionObjects, qcFourthPlanDigests } from "../scripts/check-qc-fourth-inventory-immutable-promotion.mjs";
import { recoverQcFourthReadOnly, validateRecoveryEnvironment } from "../scripts/recover-qc-fourth-inventory-immutable-promotion-readonly.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url), "utf8"));

function fixture(reason = "single-put-response-unknown", uploadId) {
  const workspace = mkdtempSync(path.join(tmpdir(), "qc-fourth-recovery-"));
  const entry = exactPromotionObjects(plan)[0];
  const digests = qcFourthPlanDigests(plan);
  const state = {
    schemaVersion: 1,
    planSha256: digests.planParsedSha256,
    planFileSha256: digests.planFileSha256,
    planParsedSha256: digests.planParsedSha256,
    bucket: plan.bucket,
    region: plan.region,
    retentionUntil: "2033-08-12T00:00:00Z",
    objects: {
      [entry.id]: {
        objectKey: entry.objectKey,
        byteLength: entry.byteLength,
      sha256: entry.sha256,
      method: uploadId ? "multipart" : "single-put",
        ...(uploadId ? { uploadId } : {}),
        recoveryRequired: true,
        recoveryReason: reason,
        complete: false
      }
    }
  };
  const statePath = path.join(workspace, "state.json");
  const outputPath = path.join(workspace, "recovery.json");
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  chmodSync(statePath, 0o600);
  return { workspace, state, entry, statePath, outputPath, cleanup: () => rmSync(workspace, { recursive: true, force: true }) };
}

function readOnlyMock(fixture, noSuchUpload = false) {
  const calls = [];
  const invoke = (args) => {
    const operation = args[1];
    calls.push({ operation, args: [...args] });
    assert.equal(["head-object", "get-object-retention", "list-parts"].includes(operation), true, `unexpected mutating recovery operation ${operation}`);
    if (operation === "list-parts" && noSuchUpload) throw new Error("NoSuchUpload");
    if (operation === "list-parts") return { IsTruncated: false, Parts: [] };
    if (operation === "head-object") return { VersionId: "candidate-version-1", ContentLength: fixture.entry.byteLength, ChecksumType: "FULL_OBJECT", ChecksumSHA256: Buffer.from(fixture.entry.sha256, "hex").toString("base64") };
    return { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
  };
  return { invoke, calls };
}

test("ambiguous single-PUT recovery is separately gated, read-only, and never changes state", () => {
  const item = fixture();
  const mock = readOnlyMock(item);
  try {
    assert.throws(() => recoverQcFourthReadOnly(plan, item.statePath, item.outputPath, { sessionReady: true, invoke: mock.invoke }), /separate explicit approval/);
    const result = recoverQcFourthReadOnly(plan, item.statePath, item.outputPath, { approveReadOnlyRecovery: true, sessionReady: true, invoke: mock.invoke, env: { mocked: "true" } });
    assert.equal(result.status, "read-only-diagnostic-only");
    assert.equal(result.objects[0].recoveryDecision, "recovery-required-no-automatic-duplicate");
    assert.equal(result.objects[0].candidateMatchesApprovedBytesChecksumAndRetention, true);
    assert.equal(mock.calls.some(({ operation }) => !["head-object", "get-object-retention"].includes(operation)), false);
    assert.deepEqual(JSON.parse(readFileSync(item.statePath, "utf8")), JSON.parse(JSON.stringify(item.state)));
    assert.throws(() => recoverQcFourthReadOnly(plan, item.statePath, item.outputPath, { approveReadOnlyRecovery: true, sessionReady: true, invoke: mock.invoke }), /already exists/);
  } finally { item.cleanup(); }
});

test("NoSuchUpload recovery records an unresolved read-only diagnostic and cannot start a replacement", () => {
  const item = fixture("multipart-completion-nosuchupload", "upload-that-may-have-completed");
  const mock = readOnlyMock(item, true);
  try {
    const result = recoverQcFourthReadOnly(plan, item.statePath, item.outputPath, { approveReadOnlyRecovery: true, sessionReady: true, invoke: mock.invoke, env: { mocked: "true" } });
    assert.equal(result.objects[0].observedUploadState, "NoSuchUpload");
    assert.equal(result.objects[0].recoveryDecision, "recovery-required-no-automatic-duplicate");
    assert.equal(result.claims.replacementStarted, false);
    assert.deepEqual(mock.calls.map(({ operation }) => operation), ["list-parts", "head-object", "head-object", "get-object-retention"]);
    assert.equal(JSON.parse(readFileSync(item.statePath, "utf8")).objects[item.entry.id].recoveryRequired, true);
  } finally { item.cleanup(); }
});

test("read-only recovery independently binds the exact owner, account, role, session, MFA, and expiry", () => {
  const exact = {
    AWS_ACCESS_KEY_ID: "temporary", AWS_SECRET_ACCESS_KEY: "temporary", AWS_SESSION_TOKEN: "temporary",
    WITNESS_TREE_SESSION_VERIFIED: "1", WITNESS_TREE_ACCOUNT: "286853118812",
    WITNESS_TREE_OPERATOR_ARN: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
    WITNESS_TREE_ROLE_ARN: "arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader",
    WITNESS_TREE_ROLE_SESSION_NAME: "witness-tree-qc-fourth-readonly-recovery", WITNESS_TREE_MFA_PRESENT: "true",
    WITNESS_TREE_SESSION_EXPIRES_AT: "2099-01-01T00:00:00Z"
  };
  assert.equal(validateRecoveryEnvironment(exact), exact);
  for (const [field, value] of [["WITNESS_TREE_ACCOUNT", "wrong"], ["WITNESS_TREE_OPERATOR_ARN", "wrong"], ["WITNESS_TREE_ROLE_ARN", "wrong"], ["WITNESS_TREE_ROLE_SESSION_NAME", "wrong"], ["WITNESS_TREE_MFA_PRESENT", "false"], ["WITNESS_TREE_SESSION_EXPIRES_AT", "2000-01-01T00:00:00Z"]]) {
    assert.throws(() => validateRecoveryEnvironment({ ...exact, [field]: value }));
  }
});
