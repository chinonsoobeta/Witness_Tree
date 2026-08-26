import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assembleQcAttestation, normalizeQcOperatorIdentity, writeExclusiveMode600 } from "../scripts/assemble-qc-immutable-promotion-attestation.mjs";
import { redactQcAttestation, validateCapturedQcAttestation, validateQcAttestationPair } from "../scripts/check-qc-immutable-promotion-attestation.mjs";
import { sidecarFor } from "../scripts/prepare-qc-immutable-promotion.mjs";

const root = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const plan = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-preparation.json", import.meta.url), "utf8"));
const canonical = JSON.parse(readFileSync(new URL("../data/qc-immutable-promotion-attestation.json", import.meta.url), "utf8"));
const sha = (value) => import("node:crypto").then(({ createHash }) => createHash("sha256").update(value).digest("hex"));
const descriptorCount = () => readdirSync("/dev/fd").filter((name) => /^\d+$/.test(name)).length;

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

test("canonical QC attestation is the captured redaction and requires the private pair for full verification", () => {
  assert.equal(validateCapturedQcAttestation(canonical, plan), canonical);
  assert.match(canonical.notice, /owner-attested internally consistent evidence.*not independently signed AWS proof/i);
  assert.equal(canonical.claims.exactReadbacksVerified, false);
  assert.equal(canonical.claims.sourceLedgerCreditChanged, false);
});

test("captured public evidence rejects undeclared fields and identifier or checksum leak shapes", () => {
  for (const mutation of [
    { arbitrary: "not-canonical" },
    { uploadId: "private-upload-identifier" },
    { versionId: "plausible-concrete-version" },
    { providerChecksum: "plausible-provider-checksum" }
  ]) assert.throws(() => validateCapturedQcAttestation({ ...canonical, ...mutation }, plan), /fields drifted/);
});

test("owner-run transcript assembles four exact objects into a mode-600 digest-bound pair", async () => {
  const paths = await fixture();
  try {
    assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath });
    const pair = validateQcAttestationPair(paths.privatePath, JSON.parse(readFileSync(paths.publicPath, "utf8")), plan);
    assert.equal(pair.privateRecord.objects.length, 4);
    assert.equal(pair.publicRecord.claims.exactReadbacksVerified, false);
    assert.equal(pair.publicRecord.claims.immutableObjectStorage, false);
    assert.match(pair.publicRecord.notice, /owner-attested internally consistent evidence.*not independently signed AWS proof/i);
    assert.equal(JSON.stringify(pair.publicRecord).includes("private-upload"), false);
    assert.equal(pair.publicRecord.objects.some((object) => "versionId" in object || "providerValue" in object), false);
    assert.deepEqual(pair.privateRecord.recoveryBoundary, { multipartResumeStatePreserved: true, replicaCreated: false, replicaAuthorized: false, meaning: "Private multipart state supports interrupted-run diagnosis/resume only; no recovery replica was approved or proved." });
    assert.deepEqual(readdirSync(paths.dir).sort(), ["capture", "private.json", "public.json"]);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("standard STS UserId is accepted, normalized away, and never enters either evidence record", async () => {
  const paths = await fixture();
  try {
    writeFileSync(join(paths.capture, "meta.json"), JSON.stringify({
      createdAt: "2026-08-21T20:00:00Z",
      identity: {
        UserId: "AIDA_PRIVATE_STANDARD_USER_ID",
        Account: "286853118812",
        Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator"
      }
    }), { mode: 0o600 });
    assert.deepEqual(normalizeQcOperatorIdentity(JSON.parse(readFileSync(join(paths.capture, "meta.json"), "utf8")).identity), { Account: "286853118812", Arn: "arn:aws:iam::286853118812:user/WitnessTreeArchiveOperator" });
    assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath });
    const privateBytes = readFileSync(paths.privatePath, "utf8"); const publicBytes = readFileSync(paths.publicPath, "utf8");
    assert.doesNotMatch(privateBytes, /AIDA_PRIVATE_STANDARD_USER_ID/);
    assert.doesNotMatch(publicBytes, /AIDA_PRIVATE_STANDARD_USER_ID/);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("identity rejection fails closed without rendering raw identity values", async () => {
  const paths = await fixture();
  try {
    const secret = "PRIVATE_IDENTITY_VALUE_MUST_NOT_RENDER";
    writeFileSync(join(paths.capture, "meta.json"), JSON.stringify({ createdAt: "2026-08-21T20:00:00Z", identity: { UserId: secret, Account: "999999999999", Arn: secret } }), { mode: 0o600 });
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), (error) => {
      assert.match(error.message, /exact approved operator/);
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(existsSync(paths.publicPath), false);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("provider identifier mismatch fails closed without rendering the provider value", async () => {
  const paths = await fixture();
  try {
    const secret = "PRIVATE_PROVIDER_VERSION_MUST_NOT_RENDER";
    const artifact = plan.artifacts[0]; const statePath = join(paths.capture, `${artifact.id}.state.json`);
    const state = JSON.parse(readFileSync(statePath, "utf8")); state.payloadVersionId = secret; writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), (error) => {
      assert.match(error.message, /payloadVersionId/);
      assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(existsSync(paths.publicPath), false);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("provider-shaped direct failures never render version, checksum, retention, or raw state values", async () => {
  const cases = [
    ["uploadId", (state, head, manifest, retention, secret) => { state.uploadId = { secret }; }],
    ["payloadVersionId", (state, head, manifest, retention, secret) => { state.payloadVersionId = secret; }],
    ["sidecarVersionId", (state, head, manifest, retention, secret) => { state.sidecarVersionId = secret; }],
    ["compositeChecksumSha256", (state, head, manifest, retention, secret) => { state.compositeChecksumSha256 = secret; }],
    ["payloadHeadVersionId", (state, head, manifest, retention, secret) => { head.VersionId = secret; }],
    ["payloadHeadChecksum", (state, head, manifest, retention, secret) => { head.ChecksumSHA256 = secret; }],
    ["manifestHeadVersionId", (state, head, manifest, retention, secret) => { manifest.VersionId = secret; }],
    ["manifestHeadChecksum", (state, head, manifest, retention, secret) => { manifest.ChecksumSHA256 = secret; }],
    ["retentionMode", (state, head, manifest, retention, secret) => { retention.Retention.Mode = secret; }],
    ["retentionDate", (state, head, manifest, retention, secret) => { retention.Retention.RetainUntilDate = secret; }],
    ["statePayloadKey", (state, head, manifest, retention, secret) => { state.payloadKey = secret; }]
  ];
  for (const [label, mutate] of cases) {
    const paths = await fixture();
    try {
      const secret = `PRIVATE_PROVIDER_${label}_MUST_NOT_RENDER`;
      const artifact = plan.artifacts[0]; const statePath = join(paths.capture, `${artifact.id}.state.json`); const payloadPath = join(paths.capture, `${artifact.id}.payload-head.json`); const manifestPath = join(paths.capture, `${artifact.id}.manifest-head.json`); const retentionPath = join(paths.capture, `${artifact.id}.retention.json`);
      const state = JSON.parse(readFileSync(statePath, "utf8")); const head = JSON.parse(readFileSync(payloadPath, "utf8")); const manifest = JSON.parse(readFileSync(manifestPath, "utf8")); const retention = JSON.parse(readFileSync(retentionPath, "utf8"));
      mutate(state, head, manifest, retention, secret);
      writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); writeFileSync(payloadPath, JSON.stringify(head), { mode: 0o600 }); writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600 }); writeFileSync(retentionPath, JSON.stringify(retention), { mode: 0o600 });
      assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), (error) => {
        assert.equal(error.message.includes(secret), false, label);
        return true;
      });
      assert.equal(existsSync(paths.privatePath), false, label);
      assert.equal(existsSync(paths.publicPath), false, label);
    } finally { rmSync(paths.dir, { recursive: true, force: true }); }
  }
});

test("direct assembly refuses an existing target, including a symlink, without changing it", async () => {
  const paths = await fixture();
  try {
    const sentinel = "EXISTING_PRIVATE_ATTESTATION_MUST_REMAIN";
    writeFileSync(paths.privatePath, sentinel, { mode: 0o600 });
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), /already exists; refusing overwrite/);
    assert.equal(readFileSync(paths.privatePath, "utf8"), sentinel);
    assert.equal(existsSync(paths.publicPath), false);
    assert.deepEqual(readdirSync(paths.dir).sort(), ["capture", "private.json"]);
    rmSync(paths.privatePath);
    const symlinkTarget = join(paths.dir, "symlink-target"); writeFileSync(symlinkTarget, "SYMLINK_TARGET_MUST_REMAIN", { mode: 0o600 }); symlinkSync(symlinkTarget, paths.publicPath);
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath }), /already exists; refusing overwrite/);
    assert.equal(readFileSync(symlinkTarget, "utf8"), "SYMLINK_TARGET_MUST_REMAIN");
    assert.deepEqual(readdirSync(paths.dir).sort(), ["capture", "public.json", "symlink-target"]);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("exclusive open race fails closed and leaves the racing destination untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-output-race-")); const output = join(dir, "attestation.json");
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, {
      beforeOpen: () => writeFileSync(output, "RACING_TARGET_MUST_WIN", { mode: 0o600, flag: "wx" })
    }), /already exists; refusing overwrite/);
    assert.equal(readFileSync(output, "utf8"), "RACING_TARGET_MUST_WIN");
    assert.deepEqual(readdirSync(dir), ["attestation.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("opened destination swap before verification fails without deleting the racing path", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-output-swap-")); const output = join(dir, "attestation.json"); const moved = `${output}.moved`;
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, {
      beforeVerify: () => {
        renameSync(output, moved);
        writeFileSync(output, "RACING_TARGET_MUST_WIN", { mode: 0o600, flag: "wx" });
      }
    }), /rollback was not proved; inspect output state/);
    assert.equal(readFileSync(output, "utf8"), "RACING_TARGET_MUST_WIN");
    assert.equal(readFileSync(moved, "utf8").length > 0, true);
    assert.deepEqual(readdirSync(dir).sort(), ["attestation.json", "attestation.json.moved"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("hard-link alias before verification fails closed without claiming rollback", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-alias-verification-")); const output = join(dir, "attestation.json"); const alias = join(dir, "attestation.alias");
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { beforeVerify: () => linkSync(output, alias) }), /rollback was not proved; inspect output state/);
    assert.equal(readFileSync(output, "utf8").length > 0, true);
    assert.equal(readFileSync(alias, "utf8").length > 0, true);
    assert.deepEqual(readdirSync(dir).sort(), ["attestation.alias", "attestation.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("destination swap after directory fsync fails without deleting the racing path", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-post-fsync-swap-")); const output = join(dir, "attestation.json"); const moved = `${output}.moved`; let raced = false;
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, {
      afterDirectoryFsync: () => {
        if (!raced) {
          raced = true;
          renameSync(output, moved);
          writeFileSync(output, "RACING_TARGET_MUST_WIN", { mode: 0o600, flag: "wx" });
        }
      }
    }), /rollback was not proved; inspect output state/);
    assert.equal(readFileSync(output, "utf8"), "RACING_TARGET_MUST_WIN");
    assert.equal(readFileSync(moved, "utf8").length > 0, true);
    assert.deepEqual(readdirSync(dir).sort(), ["attestation.json", "attestation.json.moved"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("file and directory fsync stages are both reached", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-fsync-")); const output = join(dir, "attestation.json"); const stages = [];
  try {
    writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { onFsyncStage: (stage) => stages.push(stage) });
    assert.deepEqual(stages, ["file", "directory"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("file fsync failure rolls back the owned destination", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-fsync-file-failure-")); const output = join(dir, "attestation.json");
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { onFsyncStage: (stage) => { if (stage === "file") throw new Error("injected file fsync failure"); } }), /owned output was rolled back/);
    assert.equal(existsSync(output), false);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("directory fsync failure reports an unproved rollback state", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-fsync-directory-failure-")); const output = join(dir, "attestation.json");
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { onFsyncStage: (stage) => { if (stage === "directory") throw new Error("injected directory fsync failure"); } }), /rollback was not proved; inspect output state/);
    assert.equal(existsSync(output), false);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("output descriptor close failure rolls back without a double-close or descriptor leak", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-close-output-failure-")); const output = join(dir, "attestation.json"); const stages = []; const before = descriptorCount();
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { failClose: (stage) => { stages.push(stage); return stage === "output"; } }), /rollback was not proved; inspect output state/);
    assert.deepEqual(stages, ["directory", "output", "directory"]);
    assert.equal(existsSync(output), false);
    assert.equal(descriptorCount(), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("directory descriptor close failure rolls back without a double-close or descriptor leak", () => {
  const dir = mkdtempSync(join(tmpdir(), "qc-attestation-close-directory-failure-")); const output = join(dir, "attestation.json"); const stages = []; const before = descriptorCount();
  try {
    assert.throws(() => writeExclusiveMode600(output, { claims: { exactReadbacksVerified: true } }, { failClose: (stage) => { stages.push(stage); return stage === "directory"; } }), /rollback was not proved; inspect output state/);
    assert.deepEqual(stages, ["directory", "output", "directory"]);
    assert.equal(existsSync(output), false);
    assert.equal(descriptorCount(), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("public publication race rolls back only this invocation's private inode", async () => {
  const paths = await fixture();
  try {
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, beforePublicOpen: () => writeFileSync(paths.publicPath, "RACING_PUBLIC_TARGET_MUST_REMAIN", { mode: 0o600, flag: "wx" }) }), /private output was rolled back/);
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(readFileSync(paths.publicPath, "utf8"), "RACING_PUBLIC_TARGET_MUST_REMAIN");
    assert.deepEqual(readdirSync(paths.dir).sort(), ["capture", "public.json"]);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("hard-link alias before public failure prevents a private rollback claim", async () => {
  const paths = await fixture(); const alias = `${paths.privatePath}.alias`;
  try {
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, beforePublicOpen: () => {
      linkSync(paths.privatePath, alias);
      writeFileSync(paths.publicPath, "RACING_PUBLIC_TARGET_MUST_REMAIN", { mode: 0o600, flag: "wx" });
    } }), /private rollback was not proved; inspect output state/);
    assert.equal(readFileSync(paths.privatePath, "utf8").length > 0, true);
    assert.equal(readFileSync(alias, "utf8").length > 0, true);
    assert.equal(readFileSync(paths.publicPath, "utf8"), "RACING_PUBLIC_TARGET_MUST_REMAIN");
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("public descriptor close failure rolls back both outputs and preserves descriptor ownership", async () => {
  const paths = await fixture(); const stages = []; const before = descriptorCount(); let outputCloses = 0;
  try {
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, failClose: (stage) => {
      stages.push(stage);
      if (stage === "output") { outputCloses += 1; return outputCloses === 2; }
      return false;
    } }), /QC attestation pair publication failed; public rollback was not proved; inspect output state/);
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(existsSync(paths.publicPath), false);
    assert.equal(descriptorCount(), before);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("public rollback directory close failure reports public uncertainty and preserves descriptor ownership", async () => {
  const paths = await fixture(); const before = descriptorCount(); let outputCloses = 0; let directoryCloses = 0;
  try {
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, failClose: (stage) => {
      if (stage === "output") { outputCloses += 1; return outputCloses === 2; }
      if (stage === "directory") { directoryCloses += 1; return directoryCloses === 2; }
      return false;
    } }), /QC attestation pair publication failed; public rollback was not proved; inspect output state/);
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(existsSync(paths.publicPath), false);
    assert.equal(descriptorCount(), before);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("private rollback directory close failure reports pair state without a descriptor leak", async () => {
  const paths = await fixture(); const stages = []; const before = descriptorCount(); let directoryCloses = 0;
  try {
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, beforePublicOpen: () => writeFileSync(paths.publicPath, "RACING_PUBLIC_TARGET_MUST_REMAIN", { mode: 0o600, flag: "wx" }), failClose: (stage) => {
      stages.push(stage);
      if (stage === "directory") { directoryCloses += 1; return directoryCloses === 2; }
      return false;
    } }), /private rollback was not proved; inspect output state/);
    assert.equal(existsSync(paths.privatePath), false);
    assert.equal(readFileSync(paths.publicPath, "utf8"), "RACING_PUBLIC_TARGET_MUST_REMAIN");
    assert.equal(descriptorCount(), before);
  } finally { rmSync(paths.dir, { recursive: true, force: true }); }
});

test("private rollback race reports an unproved state and leaves racing files untouched", async () => {
  const paths = await fixture();
  try {
    const racedPrivate = `${paths.privatePath}.raced`;
    assert.throws(() => assembleQcAttestation({ root, captureDirectory: paths.capture, privatePath: paths.privatePath, publicPath: paths.publicPath, beforePublicOpen: () => {
      renameSync(paths.privatePath, racedPrivate);
      writeFileSync(paths.privatePath, "RACING_PRIVATE_TARGET_MUST_REMAIN", { mode: 0o600, flag: "wx" });
      writeFileSync(paths.publicPath, "RACING_PUBLIC_TARGET_MUST_REMAIN", { mode: 0o600, flag: "wx" });
    } }), (error) => {
      assert.match(error.message, /private rollback was not proved; inspect output state/);
      assert.doesNotMatch(error.message, /no output was written/);
      return true;
    });
    assert.equal(readFileSync(paths.privatePath, "utf8"), "RACING_PRIVATE_TARGET_MUST_REMAIN");
    assert.equal(readFileSync(racedPrivate, "utf8").length > 0, true);
    assert.equal(readFileSync(paths.publicPath, "utf8"), "RACING_PUBLIC_TARGET_MUST_REMAIN");
    assert.deepEqual(readdirSync(paths.dir).sort(), ["capture", "private.json", "private.json.raced", "public.json"]);
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
  assert.match(script, /wt_assume_direct_mfa_role/);
  assert.match(script, /--argjson identity "\$operator_identity"/);
  assert.match(script, /aws-direct-mfa-role-session\.sh/);
  assert.match(script, /assemble-qc-immutable-promotion-attestation\.mjs[\s\S]*2>"\$TMP\/assembler\.stderr"/);
  assert.doesNotMatch(script, /put-object|upload-part|complete-multipart|put-object-retention|delete-object|abort-multipart/i);
});
