import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { canonicalManifestBytes, validateQcFourthInventoryPromotionPreparation } from "../scripts/check-qc-fourth-inventory-immutable-promotion.mjs";
import { dryRunLines, preflightLocal, validateExecutionOptions, verifyRemoteObject } from "../scripts/qc-fourth-inventory-immutable-promotion.mjs";

const plan = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const iam = JSON.parse(readFileSync(new URL("../data/qc-fourth-inventory-immutable-promotion-iam-policy.json", import.meta.url), "utf8"));

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
  assert.throws(() => validateExecutionOptions(plan, { ...approvals, sessionReady: true, dataRoot: "/", stateDir: "/", sidecarDir: "/" }), /Witness_Tree-data/);
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
