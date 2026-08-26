import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMON_LIMITS,
  METHOD_VERSION,
  QC_SCOPES,
  canonicalJson,
  sha256File,
  validateQcStandCopyProductionAdmissionRecord,
} from "../scripts/check-qc-stand-copy-production-admission-readiness.mjs";
import {
  OUTPUT_PATH,
  buildQcStandCopyProductionAdmissionRecord,
  readiness,
} from "../scripts/prepare-qc-stand-copy-production-admission.mjs";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);
const ARTIFACT_FIXTURE_ROOT = "artifacts";

function mkdirFor(file) {
  mkdirSync(path.dirname(file), { recursive: true });
}

function copyCanonicalInputs(root) {
  const files = new Set([
    "scripts/run-qc-stand-copy.mjs",
    "scripts/verify-qc-stand-copy-readback.mjs",
    "data/phase1-downstream-admission-packet.json",
    "data/phase1-transformation-scope-owner-approval-2026-08-25.json",
  ]);
  for (const scope of QC_SCOPES) {
    files.add(scope.specPath);
    files.add(scope.executionApprovalPath);
    files.add(scope.sourceRightsPath);
  }
  for (const relativePath of files) {
    const destination = path.join(root, relativePath);
    mkdirFor(destination);
    copyFileSync(path.join(REPO, relativePath), destination);
  }
}

function writeSyntheticReadback(root, scope) {
  const expected = scope.expected;
  const outputPath = path.join(root, ARTIFACT_FIXTURE_ROOT, expected.artifactRelativePath);
  const sidecarPath = path.join(root, ARTIFACT_FIXTURE_ROOT, expected.sidecarRelativePath);
  mkdirFor(outputPath);
  writeFileSync(outputPath, Buffer.from(`synthetic output bytes for ${scope.rowId}\n`));
  const outputSha256 = sha256File(outputPath);
  const fingerprint = "a".repeat(64);
  const sidecar = {
    schemaVersion: "witness-tree/qc-stand-copy-sidecar/1",
    methodVersion: METHOD_VERSION,
    scopeId: scope.rowId,
    specification: { id: scope.specId, sha256: expected.specSha256 },
    packetSha256: "4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a",
    ownerScopeApprovalSha256: "fda1c43d2ee23adb35907ddf012c9b64aa23e69774866c725271ed91223dffb2",
    executionApprovalSha256: expected.executionApprovalSha256,
    source: {
      rawArchiveSha256: expected.rawArchiveSha256,
      rawArchiveBytes: expected.rawArchiveBytes,
      archiveMember: expected.archiveMember,
      archiveMemberSha256: expected.extractedGeoPackageSha256,
      extractedGeoPackageSha256: expected.extractedGeoPackageSha256,
    },
    input: {
      layer: expected.layer,
      geometryColumn: "geom",
      geometryType: expected.geometryType,
      crs: expected.crsCode,
      featureCount: expected.featureCount,
      fields: expected.fields,
      qa: {
        feature_count: expected.featureCount,
        distinct_fid_count: expected.featureCount,
        missing_fid_count: 0,
        missing_geometry_count: 0,
        empty_geometry_count: 0,
        invalid_geometry_count: 0,
        blank_key_count: 0,
      },
    },
    output: {
      layer: expected.outputLayer,
      sha256: outputSha256,
      schema: expected.outputSchema,
      featureCount: expected.featureCount,
      sourceRowFingerprintSha256: fingerprint,
      outputRowFingerprintSha256: fingerprint,
      geometryByteCopy: true,
    },
    qa: {
      exactInputBindings: true,
      schemaCrsFeatureCountGeometryChecks: true,
      joins: false,
      reprojection: false,
      repair: false,
      simplify: false,
      snap: false,
      dissolve: false,
      semanticInference: false,
      losslessRowFingerprintMatch: true,
      deterministicRerunArtifactMatch: true,
    },
    prohibitedClaims: expected.prohibitedClaims,
  };
  mkdirFor(sidecarPath);
  writeFileSync(sidecarPath, canonicalJson(sidecar));
  const sidecarBytes = readFileSync(sidecarPath);
  const verifierSha256 = sha256File(path.join(root, "scripts/verify-qc-stand-copy-readback.mjs"));
  const evidence = {
    schemaVersion: "witness-tree/qc-stand-copy-readback-evidence/1",
    status: "complete-readback-verified",
    mode: "post-publication-readback",
    scopeId: scope.rowId,
    verifier: { path: "scripts/verify-qc-stand-copy-readback.mjs", sha256: verifierSha256, methodVersion: "qc-stand-copy-independent-readback-v1" },
    specification: { id: scope.specId, path: scope.specPath, sha256: expected.specSha256 },
    output: {
      path: expected.artifactRelativePath,
      sidecarPath: expected.sidecarRelativePath,
      layer: expected.outputLayer,
      schema: expected.outputSchema,
      crs: expected.crs,
      geometryType: expected.geometryType,
      featureCount: expected.featureCount,
      byteLength: readFileSync(outputPath).length,
      sha256: outputSha256,
      sidecarByteLength: sidecarBytes.length,
      sidecarSha256: sha256File(sidecarPath),
      sourceRowFingerprintSha256: fingerprint,
      outputRowFingerprintSha256: fingerprint,
    },
    source: {
      path: expected.sourceRelativePath,
      layer: expected.layer,
      schema: ["fid", "geom", ...expected.fields],
      crs: expected.crs,
      geometryType: expected.geometryType,
      featureCount: expected.featureCount,
      sha256: expected.extractedGeoPackageSha256,
    },
    qa: {
      sourceOutputFeatureCountMatch: true,
      sourceOutputSchemaMatch: true,
      sourceOutputCrsMatch: true,
      sourceOutputGeometryTypeMatch: true,
      sourceOutputRowFingerprintMatch: true,
      geometryValidity: true,
      sidecarContract: true,
      outputAndSidecarHashes: true,
    },
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
    admissionClaim: false,
    productionAdmission: false,
    productionEligible: false,
  };
  const evidencePath = path.join(root, expected.readbackEvidencePath);
  mkdirFor(evidencePath);
  writeFileSync(evidencePath, canonicalJson(evidence));
}

function completeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-preparer-"));
  copyCanonicalInputs(root);
  QC_SCOPES.forEach((scope) => writeSyntheticReadback(root, scope));
  return root;
}

test("readiness is presence-only and requires both canonical readbacks", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-preparer-presence-"));
  try {
    const result = readiness(root, ARTIFACT_FIXTURE_ROOT);
    assert.equal(result.mode, "readiness-only");
    assert.equal(result.admissionClaim, false);
    assert.equal(result.productionAdmission, false);
    assert.equal(result.productionEligible, false);
    assert.equal(result.admissionReady, false);
    assert.equal(result.presentCount, 0);
    assert.equal(result.evidenceMissingCount, QC_SCOPES.length);
    assert.deepEqual(result.scopes.map(({ rowId, artifactFilesPresent, readbackEvidencePresent }) => [rowId, artifactFilesPresent, readbackEvidencePresent]), [
      ["qc-current-ecoforest", false, false],
      ["qc-original-current-inventory", false, false],
    ]);
    assert.equal(existsSync(path.join(root, OUTPUT_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete current and original evidence builds and validates in memory without writing", () => {
  const root = completeFixture();
  try {
    const record = buildQcStandCopyProductionAdmissionRecord("2026-08-26T00:55:28Z", root, ARTIFACT_FIXTURE_ROOT);
    assert.deepEqual(record.rows.map(({ id }) => id), QC_SCOPES.map(({ rowId }) => rowId));
    assert.deepEqual(record.limits, COMMON_LIMITS);
    assert.equal(validateQcStandCopyProductionAdmissionRecord(record, root, ARTIFACT_FIXTURE_ROOT), record);
    assert.equal(existsSync(path.join(root, OUTPUT_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the preparer fails closed when either scope lacks a complete readback", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-preparer-incomplete-"));
  try {
    copyCanonicalInputs(root);
    writeSyntheticReadback(root, QC_SCOPES[0]);
    assert.throws(
      () => buildQcStandCopyProductionAdmissionRecord("2026-08-26T00:55:28Z", root, ARTIFACT_FIXTURE_ROOT),
      /complete output, sidecar, and readback evidence.*qc-original-current-inventory/,
    );
    assert.equal(existsSync(path.join(root, OUTPUT_PATH)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("record construction requires a fixed whole-second UTC decision instant", () => {
  const root = completeFixture();
  try {
    for (const decidedAt of ["2026-08-26T00:55:28.123Z", "2026-08-26T00:55:28+00:00", "2026-02-30T00:55:28Z"]) {
      assert.throws(
        () => buildQcStandCopyProductionAdmissionRecord(decidedAt, root, ARTIFACT_FIXTURE_ROOT),
        /fixed whole-second UTC instant/,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical readback path drift is rejected before record construction", () => {
  const root = completeFixture();
  try {
    const evidencePath = path.join(root, QC_SCOPES[0].expected.readbackEvidencePath);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    evidence.output.path = "outside.gpkg";
    writeFileSync(evidencePath, canonicalJson(evidence));
    assert.throws(
      () => buildQcStandCopyProductionAdmissionRecord("2026-08-26T00:55:28Z", root, ARTIFACT_FIXTURE_ROOT),
      /does not bind the canonical output and sidecar paths/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
