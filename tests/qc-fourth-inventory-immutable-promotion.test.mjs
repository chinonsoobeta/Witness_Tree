import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { canonicalManifestBytes, validateQcFourthInventoryPromotionPreparation } from "../scripts/check-qc-fourth-inventory-immutable-promotion.mjs";
import { dryRunLines, executePromotion, latestQcFourthStatePath, ownerRoleEnvironment, preflightLocal, validateExecutionOptions, verifyRemoteObject } from "../scripts/qc-fourth-inventory-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const iam = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-iam-policy.json", import.meta.url), "utf8"));

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const currentStatePath = (fixture) => latestQcFourthStatePath(fixture.stateDir);
const readState = (fixture) => JSON.parse(readFileSync(currentStatePath(fixture), "utf8"));
const exactPromotionEnv = {
  AWS_ACCESS_KEY_ID: "temporary", AWS_SECRET_ACCESS_KEY: "temporary", AWS_SESSION_TOKEN: "temporary",
  WITNESS_TREE_SESSION_VERIFIED: "1", WITNESS_TREE_ACCOUNT: "286853118812", WITNESS_TREE_OPERATOR_ARN: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
  WITNESS_TREE_ROLE_ARN: "arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader", WITNESS_TREE_ROLE_SESSION_NAME: "witness-tree-qc-fourth-approved-promotion", WITNESS_TREE_MFA_PRESENT: "true", WITNESS_TREE_SESSION_EXPIRES_AT: "2099-01-01T00:00:00Z",
  WITNESS_TREE_ASSUMED_ROLE_ARN: "arn:aws:sts::286853118812:assumed-role/WitnessTreeQcFourthArchivePromotionUploader/witness-tree-qc-fourth-approved-promotion", WITNESS_TREE_ROLE_USER_ID: "AROA_TEST:witness-tree-qc-fourth-approved-promotion", WITNESS_TREE_MFA_SERIAL_ARN: "arn:aws:iam::286853118812:mfa/WitnessTreeArchiveOperator"
};

function executionFixture() {
  const workspace = mkdtempSync(path.join(tmpdir(), "qc-fourth-execution-"));
  const dataRoot = path.join(workspace, "Witness_Tree-data");
  const stateDir = path.join(workspace, "state");
  const sidecarDir = path.join(workspace, "sidecars");
  mkdirSync(dataRoot, { mode: 0o755 }); mkdirSync(stateDir, { mode: 0o700 }); mkdirSync(sidecarDir, { mode: 0o700 });
  const synthetic = structuredClone(plan);
  synthetic.upload.multipartThresholdBytes = 128 * 1024;
  synthetic.upload.partSizeBytes = 64 * 1024;
  const multipartIndex = 1;
  let archiveBytes = 0;
  for (const [index, entry] of synthetic.archiveSet.payloads.entries()) {
    const bytes = index === multipartIndex ? Buffer.alloc(150 * 1024, 0x5a) : Buffer.from(`sheet-${index}`);
    entry.dataRootRelativePath = `raw/qc-fourth-inventory/test/sheet-${index}.zip`;
    entry.byteLength = bytes.length; entry.sha256 = sha256(bytes); entry.objectKey = `test/payload/${index}/${entry.sha256}`;
    const file = path.join(dataRoot, entry.dataRootRelativePath); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    archiveBytes += bytes.length;
  }
  synthetic.archiveSet.byteLength = archiveBytes;
  for (const [index, entry] of synthetic.evidenceArtifacts.entries()) {
    const bytes = Buffer.from(`evidence-${index}`);
    entry.dataRootRelativePath = `raw/qc-fourth-inventory/test/evidence-${index}.bin`;
    entry.byteLength = bytes.length; entry.sha256 = sha256(bytes); entry.objectKey = `test/evidence/${index}/${entry.sha256}`;
    const file = path.join(dataRoot, entry.dataRootRelativePath); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
  }
  const manifestBytes = canonicalManifestBytes(synthetic);
  assert.ok(manifestBytes.length < synthetic.upload.multipartThresholdBytes);
  synthetic.canonicalManifest.byteLength = manifestBytes.length;
  synthetic.canonicalManifest.sha256 = sha256(manifestBytes);
  synthetic.canonicalManifest.objectKey = `test/manifest/${synthetic.canonicalManifest.sha256}`;
  const multipartEntry = synthetic.archiveSet.payloads[multipartIndex];
  return {
    workspace, dataRoot, stateDir, sidecarDir, plan: synthetic,
    multipartId: `sheet-${multipartEntry.sheet}`,
    multipartKey: multipartEntry.objectKey,
    firstSingleKey: synthetic.archiveSet.payloads[0].objectKey,
    options: { execute: true, approveExactArtifacts: true, approveIam: true, approveRetention: true, approveMfa: true, retentionUntil: "2033-08-12T00:00:00Z", sessionReady: true, dataRoot, stateDir, sidecarDir },
    cleanup: () => rmSync(workspace, { recursive: true, force: true })
  };
}

function mockS3(fixture, hooks = {}) {
  const calls = [];
  const objects = new Map();
  const uploads = new Map();
  let nextUpload = 1;
  let nextVersion = 1;
  const value = (args, name) => args[args.indexOf(name) + 1];
  const count = (operation, predicate = () => true) => calls.filter((call) => call.operation === operation && predicate(call)).length;
  const invoke = (args) => {
    const operation = args[1];
    const key = value(args, "--key");
    const call = { operation, key, args: [...args] }; calls.push(call);
    hooks.onCall?.(call);
    if (operation === "put-object") {
      const checksum = value(args, "--checksum-sha256");
      const remote = { ContentLength: readFileSync(value(args, "--body")).length, VersionId: `single-version-${nextVersion++}`, ChecksumType: "FULL_OBJECT", ChecksumSHA256: checksum };
      objects.set(key, remote);
      if (hooks.loseSinglePutResponseOnce) { hooks.loseSinglePutResponseOnce = false; throw new Error(hooks.singlePutErrorMessage || "single PUT response lost after remote acceptance"); }
      return { VersionId: remote.VersionId, ChecksumSHA256: checksum };
    }
    if (operation === "create-multipart-upload") {
      const uploadId = `upload-${nextUpload++}`;
      uploads.set(uploadId, { key, parts: [], completed: false });
      if (hooks.loseCreateResponseOnce) { hooks.loseCreateResponseOnce = false; throw new Error("CreateMultipartUpload response lost after remote acceptance"); }
      return { UploadId: uploadId };
    }
    if (operation === "list-parts") {
      const upload = uploads.get(value(args, "--upload-id"));
      if (!upload || upload.completed) throw new Error("NoSuchUpload");
      return { IsTruncated: false, Parts: upload.parts.map((part) => ({ ...part })) };
    }
    if (operation === "upload-part") {
      const partNumber = Number(value(args, "--part-number"));
      if (hooks.failUploadPartOnce === partNumber) { hooks.failUploadPartOnce = null; throw new Error(`interrupted part ${partNumber}`); }
      const upload = uploads.get(value(args, "--upload-id"));
      const part = { PartNumber: partNumber, ETag: `etag-${partNumber}`, ChecksumSHA256: value(args, "--checksum-sha256") };
      upload.parts[partNumber - 1] = part;
      return { ETag: part.ETag, ChecksumSHA256: part.ChecksumSHA256 };
    }
    if (operation === "complete-multipart-upload") {
      if (hooks.failCompleteOnce) { hooks.failCompleteOnce = false; throw new Error("completion interrupted before response"); }
      const upload = uploads.get(value(args, "--upload-id"));
      const request = JSON.parse(value(args, "--multipart-upload"));
      const checksum = `${createHash("sha256").update(Buffer.concat(request.Parts.map((part) => Buffer.from(part.ChecksumSHA256, "base64")))).digest("base64")}-${request.Parts.length}`;
      upload.completed = true;
      const remote = { ContentLength: readFileSync(path.join(fixture.dataRoot, fixture.plan.archiveSet.payloads.find((entry) => entry.objectKey === key).dataRootRelativePath)).length, VersionId: `multipart-version-${nextVersion++}`, ChecksumType: "COMPOSITE", ChecksumSHA256: checksum };
      objects.set(key, remote);
      if (hooks.noSuchUploadOnCompleteOnce) { hooks.noSuchUploadOnCompleteOnce = false; const error = new Error("provider opaque detail"); error.code = "NoSuchUpload"; throw error; }
      if (hooks.loseCompleteResponseOnce) { hooks.loseCompleteResponseOnce = false; throw new Error("completion response lost after remote acceptance"); }
      return { VersionId: remote.VersionId, ChecksumSHA256: checksum };
    }
    if (operation === "head-object") {
      if (key === fixture.firstSingleKey && hooks.failSingleHeadOnce) { hooks.failSingleHeadOnce = false; throw new Error("single readback interruption"); }
      if (key === fixture.multipartKey && hooks.failMultipartHeadOnce) { hooks.failMultipartHeadOnce = false; throw new Error("ambiguous readback interruption"); }
      const remote = objects.get(key); assert.ok(remote, `No mocked object exists for ${key}`); return { ...remote };
    }
    if (operation === "get-object-retention") {
      const mode = key === fixture.multipartKey && hooks.multipartRetentionMode ? hooks.multipartRetentionMode : "COMPLIANCE";
      return { Retention: { Mode: mode, RetainUntilDate: "2033-08-12T00:00:00Z" } };
    }
    throw new Error(`Unexpected mocked operation ${operation}`);
  };
  return { calls, count, hooks, invoke, objects, uploads };
}

test("Québec fourth-inventory preparation binds the exact complete collection without remote claims", () => {
  assert.equal(validateQcFourthInventoryPromotionPreparation(plan, iam), plan);
  assert.equal(plan.archiveSet.payloads.length, 56);
  assert.equal(plan.archiveSet.byteLength, 16177306782);
  assert.equal(plan.evidenceArtifacts.length, 5);
  assert.equal(plan.canonicalManifest.byteLength, canonicalManifestBytes(plan).length);
  assert.equal(plan.exclusionDecision.decision, "excluded-map-only-redundant-component");
  assert.equal(plan.claims.immutableObjectStorage, false);
});

test("dry run names all 62 exact objects, selects six resumable multipart uploads, and never calls AWS", () => {
  const lines = dryRunLines(plan);
  assert.equal(lines.filter((line) => line.startsWith("MULTIPART")).length, 6);
  assert.equal(lines.filter((line) => line.startsWith("SINGLE-PUT")).length, 56);
  assert.match(lines[0], /no AWS or IAM call/);
  assert.match(lines.at(-1), /objects=62 payloads=56 evidence=6/);
  assert.equal(lines.some((line) => /CARTE_ECO_ORI_4_PROV_gpkg\.zip/.test(line)), false);
});

test("preparation fails closed on omission, mutable keys, provincial substitution, claims, and IAM widening", () => {
  const omitted = structuredClone(plan); omitted.archiveSet.payloads.pop();
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(omitted, iam));
  const alias = structuredClone(plan); alias.archiveSet.payloads[0].objectKey = "raw/qc-fourth-inventory/latest.zip";
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(alias, iam));
  const provincial = structuredClone(plan); provincial.archiveSet.payloads.push({ ...provincial.archiveSet.payloads[0], sheet: "00A", originalFilename: "CARTE_ECO_ORI_4_PROV_gpkg.zip" });
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(provincial, iam));
  const claimed = structuredClone(plan); claimed.claims.remoteObjectsExist = true;
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(claimed, iam));
  const widened = structuredClone(iam); widened.Statement.find((statement) => statement.Sid === "ExactMfaGatedPromotionObjectsOnly").Resource.push(`arn:aws:s3:::${plan.bucket}/raw/qc-fourth-inventory/latest`);
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(plan, widened));
  const abort = structuredClone(iam); abort.Statement.find((statement) => statement.Sid === "ExactMfaGatedPromotionObjectsOnly").Action.push("s3:AbortMultipartUpload");
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(plan, abort));
  const extraAllow = structuredClone(iam); extraAllow.Statement.push({ Sid: "BroaderAccess", Effect: "Allow", Action: "s3:*", Resource: "*" });
  assert.throws(() => validateQcFourthInventoryPromotionPreparation(plan, extraAllow));
});

test("execution remains fail-closed pending the owner-local MFA role-session runner", () => {
  assert.deepEqual(validateExecutionOptions(plan, { execute: false }), { mode: "dry-run" });
  assert.throws(() => validateExecutionOptions(plan, { execute: true }), /exact-artifact-set/);
  const approvals = { execute: true, approveExactArtifacts: true, approveIam: true, approveRetention: true, approveMfa: true, retentionUntil: "2033-08-12T00:00:00Z" };
  assert.throws(() => validateExecutionOptions(plan, approvals), /owner-local MFA role-session runner/);
  assert.throws(() => validateExecutionOptions(plan, { ...approvals, sessionReady: true, dataRoot: "/", stateDir: "/", sidecarDir: "/" }), /owner-owned|Witness_Tree-data/);
});

test("execution requires owner-owned mode-700 non-symlink state and sidecar directories", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "qc-fourth-private-paths-"));
  const dataRoot = path.join(workspace, "Witness_Tree-data");
  const stateDir = path.join(workspace, "state");
  const sidecarDir = path.join(workspace, "sidecars");
  const approvals = { execute: true, approveExactArtifacts: true, approveIam: true, approveRetention: true, approveMfa: true, retentionUntil: "2033-08-12T00:00:00Z", sessionReady: true, dataRoot, stateDir, sidecarDir };
  mkdirSync(dataRoot, { mode: 0o755 }); mkdirSync(stateDir, { mode: 0o700 }); mkdirSync(sidecarDir, { mode: 0o700 });
  try {
    assert.deepEqual(validateExecutionOptions(plan, approvals), { mode: "execute" });
    chmodSync(stateDir, 0o755);
    assert.throws(() => validateExecutionOptions(plan, approvals), /state-dir.*mode 700/i);
    chmodSync(stateDir, 0o700);
    const stateAlias = path.join(workspace, "state-alias"); symlinkSync(stateDir, stateAlias);
    assert.throws(() => validateExecutionOptions(plan, { ...approvals, stateDir: stateAlias }), /state-dir.*non-symlink/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("the promotion session gate binds exact account, operator, role, session, MFA, and unexpired credentials", () => {
  const exact = {
    AWS_ACCESS_KEY_ID: "temporary", AWS_SECRET_ACCESS_KEY: "temporary", AWS_SESSION_TOKEN: "temporary",
    WITNESS_TREE_SESSION_VERIFIED: "1", WITNESS_TREE_ACCOUNT: "286853118812",
    WITNESS_TREE_OPERATOR_ARN: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator",
    WITNESS_TREE_ROLE_ARN: "arn:aws:iam::286853118812:role/WitnessTreeQcFourthArchivePromotionUploader",
    WITNESS_TREE_ROLE_SESSION_NAME: "witness-tree-qc-fourth-approved-promotion", WITNESS_TREE_MFA_PRESENT: "true",
    WITNESS_TREE_SESSION_EXPIRES_AT: "2099-01-01T00:00:00Z",
    WITNESS_TREE_ASSUMED_ROLE_ARN: exactPromotionEnv.WITNESS_TREE_ASSUMED_ROLE_ARN, WITNESS_TREE_ROLE_USER_ID: exactPromotionEnv.WITNESS_TREE_ROLE_USER_ID, WITNESS_TREE_MFA_SERIAL_ARN: exactPromotionEnv.WITNESS_TREE_MFA_SERIAL_ARN
  };
  assert.equal(ownerRoleEnvironment(exact).AWS_REGION, "ca-central-1");
  assert.throws(() => ownerRoleEnvironment({ mocked: "true" }), /temporary/);
  for (const [field, value] of [["WITNESS_TREE_ACCOUNT", "000000000000"], ["WITNESS_TREE_OPERATOR_ARN", "wrong"], ["WITNESS_TREE_ROLE_ARN", "wrong"], ["WITNESS_TREE_ROLE_SESSION_NAME", "wrong"], ["WITNESS_TREE_MFA_PRESENT", "false"], ["WITNESS_TREE_SESSION_EXPIRES_AT", "2000-01-01T00:00:00Z"]]) {
    assert.throws(() => ownerRoleEnvironment({ ...exact, [field]: value }));
  }
});

test("read-only local preflight hashes every source file without creating a sidecar", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "qc-fourth-preflight-"));
  const dataRoot = path.join(workspace, "Witness_Tree-data");
  const synthetic = structuredClone(plan);
  mkdirSync(dataRoot, { recursive: true });
  try {
    for (const [index, entry] of synthetic.archiveSet.payloads.entries()) {
      const bytes = Buffer.from(`synthetic-sheet-${index}`);
      entry.dataRootRelativePath = `raw/qc-fourth-inventory/test/sheet-${index}.zip`;
      entry.byteLength = bytes.length;
      entry.sha256 = createHash("sha256").update(bytes).digest("hex");
      const file = path.join(dataRoot, entry.dataRootRelativePath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    for (const [index, entry] of synthetic.evidenceArtifacts.entries()) {
      const bytes = Buffer.from(`synthetic-evidence-${index}`);
      entry.dataRootRelativePath = `raw/qc-fourth-inventory/test/evidence-${index}.bin`;
      entry.byteLength = bytes.length;
      entry.sha256 = createHash("sha256").update(bytes).digest("hex");
      const file = path.join(dataRoot, entry.dataRootRelativePath);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    const manifestBytes = canonicalManifestBytes(synthetic);
    synthetic.canonicalManifest.byteLength = manifestBytes.length;
    synthetic.canonicalManifest.sha256 = createHash("sha256").update(manifestBytes).digest("hex");
    const result = preflightLocal(synthetic, { execute: false, dataRoot });
    assert.equal(result.sources.length, 61);
    assert.equal(result.manifestBytes.length, synthetic.canonicalManifest.byteLength);
    assert.equal(existsSync(path.join(workspace, "collection-manifest.json")), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("read-only preflight rejects execution and a non-canonical data root", () => {
  assert.throws(() => preflightLocal(plan, { execute: true, dataRoot: "/tmp/Witness_Tree-data" }), /cannot be combined/);
  assert.throws(() => preflightLocal(plan, { execute: false, dataRoot: process.cwd() }), /Witness_Tree-data/);
});

test("a successful upload without exact COMPLIANCE read-back is rejected", () => {
  const entry = { id: "sheet-11M", ...plan.archiveSet.payloads[0] };
  const remote = { versionId: "version-1", checksumType: "FULL_OBJECT", checksumSha256: Buffer.from(entry.sha256, "hex").toString("base64") };
  const invoke = (args) => args[1] === "head-object" ? { ContentLength: entry.byteLength, VersionId: remote.versionId, ChecksumType: remote.checksumType, ChecksumSHA256: remote.checksumSha256 } : { Retention: { Mode: "GOVERNANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
  assert.throws(() => verifyRemoteObject(plan, entry, remote, invoke, {}), /not COMPLIANCE/);
});

test("completed state cannot substitute a remote checksum for the approved local bytes", () => {
  const entry = { id: "sheet-11M", ...plan.archiveSet.payloads[0] };
  const remote = { versionId: "version-1", checksumType: "FULL_OBJECT", checksumSha256: Buffer.from("not-the-approved-checksum").toString("base64") };
  assert.throws(() => verifyRemoteObject(plan, entry, remote, () => { throw new Error("AWS must not be called"); }, {}), /state checksum is not bound/);
});

test("multipart completion accepts the provider composite checksum form", () => {
  const entry = { id: "sheet-22F", ...plan.archiveSet.payloads.find((item) => item.byteLength > plan.upload.multipartThresholdBytes) };
  const composite = `${Buffer.from(entry.sha256, "hex").toString("base64")}-6`;
  const remote = { versionId: "version-1", checksumType: "COMPOSITE", checksumSha256: composite, expectedChecksumSha256: composite };
  const invoke = (args) => args[1] === "head-object"
    ? { ContentLength: entry.byteLength, VersionId: remote.versionId, ChecksumType: remote.checksumType, ChecksumSHA256: composite }
    : { Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } };
  assert.equal(verifyRemoteObject(plan, entry, remote, invoke, {}), remote);
});

test("executePromotion completes a first-run multipart object before persisting complete", () => {
  const fixture = executionFixture(); const service = mockS3(fixture);
  try {
    const result = executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv });
    assert.equal(result.objects[fixture.multipartId].complete, true);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
    assert.equal(service.count("upload-part"), 3);
    const persisted = readState(fixture);
    assert.equal(persisted.objects[fixture.multipartId].complete, true);
  } finally { fixture.cleanup(); }
});

test("multipart completion is blocked when the one approved source descriptor changes mid-upload", () => {
  const fixture = executionFixture(); const entry = fixture.plan.archiveSet.payloads.find((candidate) => candidate.objectKey === fixture.multipartKey); const sourcePath = path.join(fixture.dataRoot, entry.dataRootRelativePath); let changed = false;
  const service = mockS3(fixture, { onCall: ({ operation }) => { if (!changed && operation === "upload-part") { changed = true; writeFileSync(sourcePath, Buffer.alloc(entry.byteLength, 0x41)); } } });
  try { assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /whole-file SHA-256 changed|source descriptor changed|part checksum is not bound/); assert.equal(service.count("complete-multipart-upload"), 0); assert.equal(changed, true); }
  finally { fixture.cleanup(); }
});

test("executePromotion persists an ambiguous part response and refuses an automatic retry", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failUploadPartOnce: 2 });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /part response unknown|ambiguous/i);
    const partial = readState(fixture);
    assert.equal(partial.objects[fixture.multipartId].parts.length, 1);
    assert.equal(partial.objects[fixture.multipartId].recoveryRequired, true);
    const firstPartCalls = () => service.count("upload-part", (call) => call.args[call.args.indexOf("--part-number") + 1] === "1");
    assert.equal(firstPartCalls(), 1);
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /recovery-required|automatic duplicate/i);
    assert.equal(firstPartCalls(), 1);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("put-object", (call) => call.key === fixture.firstSingleKey), 1);
  } finally { fixture.cleanup(); }
});

test("executePromotion resumes a single-PUT response pending exact-version readback without a duplicate write", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failSingleHeadOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /head-object provider call failed/);
    const firstId = `sheet-${fixture.plan.archiveSet.payloads[0].sheet}`;
    const pending = readState(fixture).objects[firstId];
    assert.equal(pending.complete, false); assert.match(pending.versionId, /^single-version-/);
    const result = executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv });
    assert.equal(result.objects[firstId].complete, true);
    assert.equal(service.count("put-object", (call) => call.key === fixture.firstSingleKey), 1);
  } finally { fixture.cleanup(); }
});

test("executePromotion treats every unavailable completion response as ambiguous and never retries it", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failCompleteOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /completion response is unavailable or ambiguous/);
    const pending = readState(fixture).objects[fixture.multipartId];
    assert.equal(pending.complete, false); assert.equal(pending.parts.length, 3); assert.equal(pending.versionId, undefined);
    assert.equal(pending.recoveryRequired, true);
    const uploadsBefore = service.count("upload-part");
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /recovery-required|automatic duplicate/i);
    assert.equal(service.count("upload-part"), uploadsBefore);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
  } finally { fixture.cleanup(); }
});

test("executePromotion recovers a completion response whose exact-version readback was interrupted", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failMultipartHeadOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /head-object provider call failed/);
    const pending = readState(fixture).objects[fixture.multipartId];
    assert.equal(pending.complete, false); assert.match(pending.versionId, /^multipart-version-/); assert.equal(pending.parts.length, 3);
    const result = executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv });
    assert.equal(result.objects[fixture.multipartId].complete, true);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
    assert.equal(service.count("list-parts"), 1);
  } finally { fixture.cleanup(); }
});

test("executePromotion fails closed without a duplicate upload when completion succeeded but returned no usable response", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { loseCompleteResponseOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /completion response is unavailable or ambiguous/);
    const pending = readState(fixture).objects[fixture.multipartId];
    assert.equal(pending.complete, false); assert.equal(pending.parts.length, 3); assert.equal(pending.versionId, undefined);
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /recovery-required|automatic duplicate mutation is disabled/i);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
    assert.equal(service.count("upload-part"), 3);
  } finally { fixture.cleanup(); }
});

test("NoSuchUpload returned by completion is persisted for separate read-only recovery without replacement", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { noSuchUploadOnCompleteOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /completion response is unavailable or ambiguous/);
    const pending = readState(fixture).objects[fixture.multipartId];
    assert.equal(pending.recoveryRequired, true);
    assert.equal(pending.recoveryReason, "multipart-completion-nosuchupload");
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /recovery-required|automatic duplicate/i);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
  } finally { fixture.cleanup(); }
});

test("executePromotion fails closed when provider multipart parts differ from persisted local state", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failCompleteOnce: true });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /completion response is unavailable or ambiguous/);
    const state = readState(fixture);
    delete state.objects[fixture.multipartId].recoveryRequired; delete state.objects[fixture.multipartId].recoveryReason; delete state.objects[fixture.multipartId].recoveryNotice; delete state.objects[fixture.multipartId].errorCode; delete state.objects[fixture.multipartId].pendingMutation;
    const tamperedPath = currentStatePath(fixture); writeFileSync(tamperedPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 }); chmodSync(tamperedPath, 0o600);
    const upload = [...service.uploads.values()][0]; upload.parts[0].ChecksumSHA256 = Buffer.alloc(32, 0x44).toString("base64");
    const mutationCalls = () => service.count("create-multipart-upload") + service.count("upload-part") + service.count("complete-multipart-upload") + service.count("put-object");
    const before = mutationCalls();
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /strictEqual|Expected values to be strictly equal|state/i);
    assert.equal(mutationCalls(), before);
  } finally { fixture.cleanup(); }
});

test("lost PutObject and CreateMultipartUpload responses are durably ambiguous and cannot create duplicate retained versions or orphan uploads", () => {
  for (const hooks of [{ loseSinglePutResponseOnce: true }, { loseCreateResponseOnce: true }]) {
    const fixture = executionFixture(); const service = mockS3(fixture, hooks);
    try {
      assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /response.*unknown|ambiguous|recovery/i);
      const state = readState(fixture);
      const ambiguous = Object.values(state.objects).find((record) => record.recoveryRequired);
      assert.ok(ambiguous?.mutationIntent?.requestSha256);
      assert.equal(ambiguous.mutationIntent.status, "ambiguous");
      const putCount = service.count("put-object"); const createCount = service.count("create-multipart-upload");
      assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /recovery-required|automatic duplicate/i);
      assert.equal(service.count("put-object"), putCount); assert.equal(service.count("create-multipart-upload"), createCount);
    } finally { fixture.cleanup(); }
  }
});

test("mutation session provenance is durable before the first provider call and provider secrets never enter errors or state", () => {
  const fixture = executionFixture(); const secret = "SECRET_PROVIDER_REQUEST_opaque-789"; const service = mockS3(fixture, { loseSinglePutResponseOnce: true, singlePutErrorMessage: secret });
  let firstCallState;
  const invoke = (args, env) => {
    if (!firstCallState) firstCallState = readState(fixture);
    return service.invoke(args, env);
  };
  try {
    let error;
    try { executePromotion(fixture.plan, fixture.options, { invoke, mfaEnv: exactPromotionEnv }); } catch (caught) { error = caught; }
    assert.ok(error); assert.equal(firstCallState.promotionSessions.length, 1); assert.deepEqual(firstCallState.promotionSessions[0], {
      account: "286853118812", operatorArn: exactPromotionEnv.WITNESS_TREE_OPERATOR_ARN, roleArn: exactPromotionEnv.WITNESS_TREE_ROLE_ARN, roleSessionName: exactPromotionEnv.WITNESS_TREE_ROLE_SESSION_NAME,
      assumedRoleArn: exactPromotionEnv.WITNESS_TREE_ASSUMED_ROLE_ARN, roleUserId: exactPromotionEnv.WITNESS_TREE_ROLE_USER_ID, mfaSerialArn: exactPromotionEnv.WITNESS_TREE_MFA_SERIAL_ARN, mfaPresent: true, sessionExpiresAt: "2099-01-01T00:00:00.000Z"
    });
    assert.equal(String(error).includes(secret), false); assert.equal(String(error.stack).includes(secret), false);
    assert.equal(readFileSync(currentStatePath(fixture), "utf8").includes(secret), false);
  } finally { fixture.cleanup(); }
});

test("the owner-only whole-run lock rejects a concurrent run before sidecar creation or any provider call", () => {
  const fixture = executionFixture(); const service = mockS3(fixture);
  try {
    writeFileSync(path.join(fixture.stateDir, "qc-fourth-inventory-promotion-run.00000001.json"), "occupied\n", { mode: 0o600 });
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /exclusive.*run|already active/i);
    assert.equal(service.calls.length, 0);
    assert.equal(existsSync(path.join(fixture.sidecarDir, "collection-manifest.json")), false);
  } finally { fixture.cleanup(); }
});

test("executePromotion rejects corrupted persisted state before any remote call", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { failUploadPartOnce: 2 });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /part response unknown|ambiguous/i);
    const state = readState(fixture); state.objects[fixture.multipartId].objectKey = "corrupted-key";
    const tamperedPath = currentStatePath(fixture); writeFileSync(tamperedPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 }); chmodSync(tamperedPath, 0o600);
    const before = service.calls.length;
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /strictEqual|Expected values to be strictly equal|state/i);
    assert.equal(service.calls.length, before);
  } finally { fixture.cleanup(); }
});

test("executePromotion keeps multipart completion pending until exact COMPLIANCE retention verifies", () => {
  const fixture = executionFixture(); const service = mockS3(fixture, { multipartRetentionMode: "GOVERNANCE" });
  try {
    assert.throws(() => executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv }), /not COMPLIANCE/);
    const pending = readState(fixture).objects[fixture.multipartId];
    assert.equal(pending.complete, false); assert.match(pending.versionId, /^multipart-version-/);
    service.hooks.multipartRetentionMode = "COMPLIANCE";
    const result = executePromotion(fixture.plan, fixture.options, { invoke: service.invoke, mfaEnv: exactPromotionEnv });
    assert.equal(result.objects[fixture.multipartId].complete, true);
    assert.equal(service.count("create-multipart-upload"), 1);
    assert.equal(service.count("complete-multipart-upload"), 1);
  } finally { fixture.cleanup(); }
});
