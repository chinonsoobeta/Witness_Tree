import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runnerSha256OnDisk, validateRawArchiveReproductionDrill } from "../scripts/check-raw-archive-reproduction-drill.mjs";

const archiveEvidence = JSON.parse(readFileSync(new URL("../data/federal-electoral-archive-recovery-evidence.json", import.meta.url), "utf8"));
const admission = JSON.parse(readFileSync(new URL("../data/phase1-federal-electoral-production-admission.json", import.meta.url), "utf8"));
const context = { archiveEvidence, admission };

/**
 * data/raw-archive-reproduction-drill.json does not exist yet; it will be written by a real
 * execution of the runbook. These tests therefore build the record the checker expects and mutate
 * one field at a time to prove each rule bites.
 */
function fixture(overrides = {}) {
  return {
    schemaVersion: "witness-tree/raw-archive-reproduction-drill/1",
    status: "passed",
    operation: "read-only-version-pinned-reproduction",
    nonMutationStatement: "This drill did not upload, delete, lock, or alter retention on S3.",
    startedAt: "2026-08-26T12:00:00Z",
    completedAt: "2026-08-26T12:09:00Z",
    tools: { awsCli: "aws-cli/2.36.21", gdal: "GDAL 3.9.2", node: "v22.14.0" },
    awsOperations: ["s3api head-object", "s3api get-object"],
    restoredInputs: {
      payload: {
        key: archiveEvidence.physicalArtifact.payloadKey,
        versionId: archiveEvidence.payload.versionId,
        byteLength: archiveEvidence.payload.byteLength,
        sha256: archiveEvidence.payload.sha256,
      },
      manifest: {
        key: archiveEvidence.physicalArtifact.manifestKey,
        versionId: archiveEvidence.manifest.versionId,
        byteLength: archiveEvidence.manifest.byteLength,
        sha256: archiveEvidence.manifest.sha256,
      },
    },
    reproduction: {
      methodVersion: "phase1-federal-electoral-districts-2023-v1",
      runnerPath: "scripts/run-phase1-federal-electoral-transformation.mjs",
      runnerSha256: runnerSha256OnDisk(),
      outputByteLength: admission.sharedArtifact.byteLength,
      outputSha256: admission.sharedArtifact.sha256,
      exactByteMatch: true,
    },
    temporaryCopyRemoved: true,
    ...overrides,
  };
}

function withReproduction(overrides) {
  const record = fixture();
  return { ...record, reproduction: { ...record.reproduction, ...overrides } };
}

function withRestoredInputs(overrides) {
  const record = fixture();
  return { ...record, restoredInputs: { ...record.restoredInputs, ...overrides } };
}

test("a well-formed reproduction drill validates against the archive evidence and the admitted artifact", () => {
  const record = fixture();
  assert.equal(validateRawArchiveReproductionDrill(record, context), record);
  assert.equal(record.reproduction.outputByteLength, 20525056);
  assert.equal(record.reproduction.outputSha256, "ca50eb02e1baee076ebec1b8e8511ca6697e8e48cef68bf5d1d74f5458681c05");
  assert.equal(record.restoredInputs.payload.byteLength, 10301648);
  assert.equal(record.restoredInputs.payload.sha256, "4004a6bff0303c46bc5d9318a3c0b4a0322599bc707712a3c41acffafbef0b93");
  assert.equal(record.restoredInputs.manifest.byteLength, 572);
  assert.equal(record.restoredInputs.manifest.sha256, "84646377203dccaee1e770899d77b2261f77eb7367462c0bf6be90e0317c00ea");
});

test("a wrong schema string is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(fixture({ schemaVersion: "witness-tree/raw-archive-reproduction-drill/2" }), context), /must be a witness-tree\/raw-archive-reproduction-drill\/1 record/);
});

test("an empty non-mutation statement is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(fixture({ nonMutationStatement: "  " }), context), /Non-mutation statement is required/);
});

test("a missing pinned tool version is rejected", () => {
  const record = fixture();
  assert.throws(() => validateRawArchiveReproductionDrill({ ...record, tools: { ...record.tools, gdal: "" } }, context), /Pinned GDAL version is required/);
  assert.throws(() => validateRawArchiveReproductionDrill({ ...record, tools: { ...record.tools, node: "" } }, context), /Pinned node version is required/);
});

test("a payload SHA-256 that disagrees with the archive evidence is rejected", () => {
  const record = withRestoredInputs({ payload: { ...fixture().restoredInputs.payload, sha256: "0".repeat(64) } });
  assert.throws(() => validateRawArchiveReproductionDrill(record, context), /restored payload SHA-256 does not match the archive recovery evidence/);
});

test("a payload versionId or byte length that disagrees with the archive evidence is rejected", () => {
  const payload = fixture().restoredInputs.payload;
  assert.throws(() => validateRawArchiveReproductionDrill(withRestoredInputs({ payload: { ...payload, versionId: "not-the-pinned-version" } }), context), /restored payload versionId does not match/);
  assert.throws(() => validateRawArchiveReproductionDrill(withRestoredInputs({ payload: { ...payload, byteLength: 10301649 } }), context), /restored payload byte length does not match/);
});

test("a manifest checksum that disagrees with the archive evidence is rejected", () => {
  const manifest = fixture().restoredInputs.manifest;
  assert.throws(() => validateRawArchiveReproductionDrill(withRestoredInputs({ manifest: { ...manifest, sha256: "1".repeat(64) } }), context), /restored manifest SHA-256 does not match/);
});

test("a wrong method version or a stale runner checksum is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ methodVersion: "phase1-federal-electoral-districts-2023-v2" }), context), /must use method version phase1-federal-electoral-districts-2023-v1/);
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ runnerSha256: "2".repeat(64) }), context), /runner SHA-256 does not match the runner in this repository/);
});

test("a reproduced SHA-256 that disagrees with the admitted artifact is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ outputSha256: "3".repeat(64), exactByteMatch: false }), context), /reproduced output SHA-256 does not equal the admitted artifact SHA-256/);
});

test("a reproduced byte length that disagrees with the admitted artifact is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ outputByteLength: 20525057 }), context), /reproduced output byte length does not equal the admitted artifact byte length/);
});

test("exactByteMatch cannot claim a match the reproduction does not have", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ outputSha256: "4".repeat(64), exactByteMatch: true }), context), /exactByteMatch must equal the computed comparison/);
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ exactByteMatch: false }), context), /exactByteMatch must equal the computed comparison/);
  assert.throws(() => validateRawArchiveReproductionDrill(withReproduction({ exactByteMatch: "true" }), context), /exactByteMatch must be a boolean/);
});

test("temporaryCopyRemoved false is rejected", () => {
  assert.throws(() => validateRawArchiveReproductionDrill(fixture({ temporaryCopyRemoved: false }), context), /temporary copy was removed/);
});

test("a record naming a mutating AWS operation is rejected", () => {
  for (const operation of ["s3api put-object", "s3api put-object-retention", "s3api put-object-legal-hold", "s3api delete-object", "s3api put-object-legal-hold --legal-hold Status=ON"]) {
    assert.throws(() => validateRawArchiveReproductionDrill(fixture({ awsOperations: ["s3api head-object", operation] }), context), /named a mutating AWS operation/);
  }
  assert.throws(() => validateRawArchiveReproductionDrill(fixture({ awsOperations: ["s3api select-object-content"] }), context), /not on the read-only allowlist/);
  assert.throws(() => validateRawArchiveReproductionDrill(fixture({ awsOperations: [] }), context), /must name every AWS operation/);
});

test("a byte length absent on both sides is refused rather than compared vacuously", () => {
  // Guards against a fail-open shape: if the archive evidence were restructured so that
  // payload.byteLength resolved to undefined, and the drill also omitted it, an equality
  // comparison of undefined against undefined would hold and prove nothing.
  const record = fixture();
  delete record.restoredInputs.payload.byteLength;
  const strippedEvidence = JSON.parse(JSON.stringify(archiveEvidence));
  delete strippedEvidence.payload.byteLength;
  assert.throws(
    () => validateRawArchiveReproductionDrill(record, { ...context, archiveEvidence: strippedEvidence }),
    /positive integer byte length/,
  );
});

test("a zero or negative reproduced byte length is refused", () => {
  for (const value of [0, -1, 1.5, "20525056"]) {
    const record = fixture();
    record.reproduction.outputByteLength = value;
    assert.throws(() => validateRawArchiveReproductionDrill(record, context), /positive integer byte length/);
  }
});
