import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assembleQcAttestation } from "../scripts/assemble-qc-immutable-promotion-attestation.mjs";
import { redactQcAttestation, validatePendingQcAttestation, validateQcAttestationPair } from "../scripts/check-qc-immutable-promotion-attestation.mjs";
import { sidecarFor } from "../scripts/prepare-qc-immutable-promotion.mjs";

const root = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const pending = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-attestation.json", import.meta.url), "utf8"));
const sha = (value) => import("node:crypto").then(({ createHash }) => createHash("sha256").update(value).digest("hex"));

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-test-")); const capture = join(dir, "capture");
  await import("node:fs").then(({ mkdirSync }) => mkdirSync(capture, { mode: 0o700 }));
  writeFileSync(join(capture, "meta.json"), JSON.stringify({ createdAt: "2026-08-21T20:00:00Z", identity: { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" } }), { mode: 0o600 });
  for (const [index, artifact] of plan.artifacts.entries()) {
    const payloadVersionId = `S3PayloadExactVersion_${index}_ownerReceipt`; const sidecarVersionId = `S3ManifestExactVersion_${index}_ownerReceipt`;
    const compositeChecksumSha256 = `${Buffer.alloc(32, index + 1).toString("base64")}-${index + 84}`;
    const state = { artifactId: artifact.id, payloadKey: artifact.payloadKey, manifestKey: artifact.manifestKey, sha256: artifact.sha256, byteLength: artifact.byteLength, partSizeBytes: plan.mfaGatedExecution.multipartPartSizeBytes, initiation: "accepted", uploadId: `private-upload-${index}`, payloadVersionId, compositeChecksumSha256, sidecarVersionId };
    writeFileSync(join(capture, `${artifact.id}.state.json`), JSON.stringify(state), { mode: 0o600 });
    const at = "2026-08-21T20:00:00Z";
    writeFileSync(join(capture, `${artifact.id}.payload-head.json`), JSON.stringify({ VersionId: payloadVersionId, ContentLength: artifact.byteLength, ChecksumType: "COMPOSITE", ChecksumSHA256: compositeChecksumSha256, WitnessTreeCapturedAt: at }), { mode: 0o600 });
    const sidecar = sidecarFor(plan, artifact); const checksum = Buffer.from(await sha(sidecar), "hex").toString("base64");
    writeFileSync(join(capture, `${artifact.id}.manifest-head.json`), JSON.stringify({ VersionId: sidecarVersionId, ContentLength: Buffer.byteLength(sidecar), ChecksumType: "FULL_OBJECT", ChecksumSHA256: checksum, WitnessTreeCapturedAt: at }), { mode: 0o600 });
    writeFileSync(join(capture, `${artifact.id}.retention.json`), JSON.stringify({ Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" }, WitnessTreeCapturedAt: at }), { mode: 0o600 });
  }
  return { dir, capture, privatePath: join(dir, "private.json"), publicPath: join(dir, "public.json") };
}

test("canonical QC attestation is explicitly pending and changes no credit", () => {
  assert.equal(validatePendingQcAttestation(pending, plan), pending);
  assert.equal(pending.claims.exactReadbacksVerified, false);
  assert.equal(pending.claims.sourceLedgerCreditChanged, false);
});

test("owner-run transcript assembles four exact objects into a mode-600 digest-bound pair", async () => {
  const paths = await fixture();
  try {
    assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath });
    const pair = validateQcAttestationPair(paths.privatePath, JSON.parse(readFileSync(paths.publicPath, "utf8")), plan);
    assert.equal(pair.privateRecord.objects.length, 4);
    assert.equal(pair.publicRecord.claims.exactReadbacksVerified, false);
    assert.equal(pair.publicRecord.claims.immutableObjectStorage, false);
    assert.equal(JSON.stringify(pair.publicRecord).includes("private-upload"), false);
    assert.equal(pair.publicRecord.objects.some((object) => "versionId" in object || "providerValue" in object), false);
    assert.deepEqual(pair.privateRecord.recoveryBoundary, { multipartResumeStatePreserved: true, replicaCreated: false, replicaAuthorized: false, meaning: "Private multipart state supports interrupted-run diagnosis/resume only; no recovery replica was approved or proved." });
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("booleans, placeholders, plausible substitutions, digest drift and unsafe private modes fail closed", async () => {
  const paths = await fixture();
  try {
    const artifact = plan.artifacts[0]; const statePath = join(paths.capture, `${artifact.id}.state.json`);
    const state = JSON.parse(readFileSync(statePath, "utf8")); state.payloadVersionId = "plausibleConcreteVersion_999"; writeFileSync(statePath, JSON.stringify(state));
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), /payloadVersionId|strictEqual|Expected values/);
    rmSync(paths.privatePath, { force: true }); rmSync(paths.publicPath, { force: true });
    const fresh = await fixture();
    try {
      assembleQcAttestation({ root, captureDirectory: fresh.capture, privatePath: fresh.privatePath, publicPath: fresh.publicPath });
      const privateRecord = JSON.parse(readFileSync(fresh.privatePath, "utf8")); const publicRecord = JSON.parse(readFileSync(fresh.publicPath, "utf8"));
      privateRecord.objects[0].checksum.providerValue = "redacted-present";
      assert.throws(() => redactQcAttestation(privateRecord, Buffer.from(JSON.stringify(privateRecord)), plan));
      publicRecord.claims.productionEligible = true;
      assert.throws(() => validateQcAttestationPair(fresh.privatePath, publicRecord, plan), /exact redaction/);
      chmodSync(fresh.privatePath, 0o644);
      assert.throws(() => validateQcAttestationPair(fresh.privatePath, JSON.parse(readFileSync(fresh.publicPath, "utf8")), plan), /mode 600/);
    } finally { rmSync(fresh.dir, { recursive: true, force: true }); }
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("post-run capture is exact-version read-only and cannot mutate storage", () => {
  const script = readFileSync(new URL("../scripts/capture-qc-immutable-promotion-attestation.sh", import.meta.url), "utf8");
  assert.match(script, /head-object[\s\S]*--version-id[\s\S]*checksum-mode ENABLED/);
  assert.match(script, /get-object-retention[\s\S]*--version-id/);
  assert.match(script, /owner-owned non-symlink mode-600/);
  assert.doesNotMatch(script, /put-object|upload-part|complete-multipart|put-object-retention|delete-object|abort-multipart/i);
});
