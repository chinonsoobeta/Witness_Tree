import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMMON_LIMITS,
  CORRECTION_ROUTES,
  DECISIONS,
  OWNER_AUTHORIZATION,
  QC_SCOPES,
  READBACK_VERIFIER_PATH,
  READBACK_VERIFIER_METHOD_VERSION,
  canonicalJson,
  readbackPresence,
  sha256File,
  validateQcStandCopyProductionAdmissionRecord,
} from "../scripts/check-qc-stand-copy-production-admission-readiness.mjs";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);

function mkdirFor(file) {
  mkdirSync(path.dirname(file), { recursive: true });
}

function copyFixtureFiles(root) {
  const files = new Set([
    "scripts/run-qc-stand-copy.mjs",
    READBACK_VERIFIER_PATH,
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

function binding(root, relativePath) {
  return { path: relativePath, sha256: sha256File(path.join(root, relativePath)) };
}

function syntheticOutputs(root, scope) {
  const outputPath = path.join(root, "artifacts", scope.expected.artifactRelativePath);
  mkdirFor(outputPath);
  writeFileSync(outputPath, Buffer.from(`synthetic GeoPackage bytes for ${scope.rowId}\n`));
  const outputSha256 = sha256File(outputPath);
  const fingerprint = `${"a".repeat(64)}`;
  const sidecar = {
    schemaVersion: "witness-tree/qc-stand-copy-sidecar/1",
    methodVersion: "qc-stand-copy-runner-v1",
    scopeId: scope.rowId,
    specification: { id: scope.specId, sha256: scope.expected.specSha256 },
    packetSha256: "4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a",
    ownerScopeApprovalSha256: "fda1c43d2ee23adb35907ddf012c9b64aa23e69774866c725271ed91223dffb2",
    executionApprovalSha256: scope.expected.executionApprovalSha256,
    source: {
      rawArchiveSha256: scope.expected.rawArchiveSha256,
      rawArchiveBytes: scope.expected.rawArchiveBytes,
      archiveMember: scope.expected.archiveMember,
      archiveMemberSha256: scope.expected.extractedGeoPackageSha256,
      extractedGeoPackageSha256: scope.expected.extractedGeoPackageSha256,
    },
    input: {
      layer: scope.expected.layer,
      geometryColumn: "geom",
      geometryType: scope.expected.geometryType,
      crs: scope.expected.crsCode,
      featureCount: scope.expected.featureCount,
      fields: scope.expected.fields,
      qa: {
        feature_count: scope.expected.featureCount,
        distinct_fid_count: scope.expected.featureCount,
        missing_fid_count: 0,
        missing_geometry_count: 0,
        empty_geometry_count: 0,
        invalid_geometry_count: 0,
        blank_key_count: 0,
      },
    },
    output: {
      layer: scope.expected.outputLayer,
      sha256: outputSha256,
      schema: scope.expected.outputSchema,
      featureCount: scope.expected.featureCount,
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
    prohibitedClaims: scope.expected.prohibitedClaims,
  };
  const sidecarPath = path.join(root, "artifacts", scope.expected.sidecarRelativePath);
  mkdirFor(sidecarPath);
  writeFileSync(sidecarPath, canonicalJson(sidecar));
  return {
    output: {
      path: scope.expected.artifactRelativePath,
      sha256: outputSha256,
      byteLength: Buffer.byteLength(`synthetic GeoPackage bytes for ${scope.rowId}\n`),
      layer: scope.expected.outputLayer,
      featureCount: scope.expected.featureCount,
    },
    sidecar: {
      path: scope.expected.sidecarRelativePath,
      sha256: sha256File(sidecarPath),
      byteLength: Buffer.byteLength(canonicalJson(sidecar)),
    },
  };
}

function syntheticReadback(root, scope, artifacts) {
  const verifierSha256 = sha256File(path.join(root, READBACK_VERIFIER_PATH));
  const fingerprint = "a".repeat(64);
  const evidence = {
    schemaVersion: "witness-tree/qc-stand-copy-readback-evidence/1",
    status: "complete-readback-verified",
    mode: "post-publication-readback",
    scopeId: scope.rowId,
    verifier: { path: READBACK_VERIFIER_PATH, sha256: verifierSha256, methodVersion: READBACK_VERIFIER_METHOD_VERSION },
    specification: { id: scope.specId, path: scope.specPath, sha256: scope.expected.specSha256 },
    output: {
      path: scope.expected.artifactRelativePath,
      sidecarPath: scope.expected.sidecarRelativePath,
      layer: scope.expected.outputLayer,
      schema: scope.expected.outputSchema,
      crs: scope.expected.crs,
      geometryType: scope.expected.geometryType,
      featureCount: scope.expected.featureCount,
      byteLength: artifacts.output.byteLength,
      sha256: artifacts.output.sha256,
      sidecarByteLength: artifacts.sidecar.byteLength,
      sidecarSha256: artifacts.sidecar.sha256,
      sourceRowFingerprintSha256: fingerprint,
      outputRowFingerprintSha256: fingerprint,
    },
    source: {
      path: scope.expected.sourceRelativePath,
      layer: scope.expected.layer,
      schema: ["fid", "geom", ...scope.expected.fields],
      crs: scope.expected.crs,
      geometryType: scope.expected.geometryType,
      featureCount: scope.expected.featureCount,
      sha256: scope.expected.extractedGeoPackageSha256,
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
  const evidencePath = path.join(root, scope.expected.readbackEvidencePath);
  mkdirFor(evidencePath);
  writeFileSync(evidencePath, canonicalJson(evidence));
  return { path: scope.expected.readbackEvidencePath, sha256: sha256File(evidencePath) };
}

function syntheticLedgerFields(scope, modificationNotice, rights, artifacts) {
  const expected = scope.expected.ledger;
  return {
    archiveVersion: expected.archiveVersion,
    bulkRedistributionAllowed: true,
    checksum: [scope.expected.rawArchiveSha256],
    correctionContactRoute: { internalEn: "/en/corrections", internalFr: "/fr/corrections", publisherListing: "https://www.donneesquebec.ca/" },
    coverage: expected.coverage,
    datasetOriginalName: expected.datasetOriginalName,
    datasetTitle: expected.datasetTitle,
    editionEffectiveDate: expected.editionEffectiveDate,
    licence: rights.licenceId,
    licenceUrl: rights.licenceUrl,
    modificationNotice,
    nextExpectedRefresh: expected.nextExpectedRefresh,
    plainLanguageExplanation: expected.plainLanguageExplanation,
    publisher: expected.publisher,
    redistributionStatus: rights.redistributionStatus,
    retrievalDate: expected.retrievalDate,
    schema: expected.schema,
    sourceUrl: expected.sourceUrl,
    transformations: {
      methodVersion: "qc-stand-copy-runner-v1",
      outputSha256: artifacts.output.sha256,
      summary: "Deterministic lossless one-layer stand-copy with source-coded attributes and lineage fields preserved; no join, reprojection, repair, simplify, snap, dissolve, or semantic inference.",
    },
    requiredAttribution: rights.requiredAttribution,
    admissionState: true,
    updateCadence: expected.updateCadence,
  };
}

function makeRecord(root) {
  copyFixtureFiles(root);
  const rows = QC_SCOPES.map((scope) => {
    const artifacts = syntheticOutputs(root, scope);
    const readback = syntheticReadback(root, scope, artifacts);
    const modificationNotice = {
      en: "Witness Tree preserves the bound publisher attributes and records a deterministic derived output; the source archive is unchanged.",
      fr: "Witness Tree préserve les attributs liés du fournisseur et consigne une sortie dérivée déterministe; l’archive source est inchangée.",
    };
    const rights = {
      licenceId: "cc-by-4.0",
      licenceVersion: "4.0",
      licenceUrl: "https://www.donneesquebec.ca/licence/#cc-by",
      requiredAttribution: scope.expected.requiredAttribution,
      sourceAttribution: scope.expected.sourceAttribution,
      modificationNotice,
      redistributionStatus: "allowed-under-cc-by-4.0-with-required-attribution-and-modification-notice",
      bulkRedistributionAllowed: true,
    };
    return {
      id: scope.rowId,
      specId: scope.specId,
      evidence: {
        packet: binding(root, "data/phase1-downstream-admission-packet.json"),
        ownerScopeApproval: binding(root, "data/phase1-transformation-scope-owner-approval-2026-08-25.json"),
        specification: binding(root, scope.specPath),
        executionApproval: binding(root, scope.executionApprovalPath),
        sourceRights: binding(root, scope.sourceRightsPath),
        readback,
        readbackVerifier: binding(root, READBACK_VERIFIER_PATH),
      },
      source: {
        rawArchiveSha256: scope.expected.rawArchiveSha256,
        rawArchiveBytes: scope.expected.rawArchiveBytes,
        archiveMember: scope.expected.archiveMember,
        archiveMemberSha256: scope.expected.extractedGeoPackageSha256,
        extractedGeoPackageSha256: scope.expected.extractedGeoPackageSha256,
        extractedGeoPackageBytes: scope.expected.extractedGeoPackageBytes,
      },
      artifacts,
      sourceRights: { licenceId: "cc-by-4.0", licenceVersion: "4.0", licenceUrl: "https://www.donneesquebec.ca/licence/#cc-by" },
      rights,
      ledgerFields: syntheticLedgerFields(scope, modificationNotice, rights, artifacts),
      modificationNotice,
      plainLanguageExplanation: {
        en: `A bounded, lossless ${scope.rowId} stand-polygon copy with source-coded attributes preserved verbatim.`,
        fr: `Une copie délimitée et sans perte des peuplements ${scope.rowId}; les attributs codés de la source sont préservés tels quels.`,
      },
      limits: structuredClone(scope.expected.limits),
      correctionContactRoute: { ...CORRECTION_ROUTES, publisherListing: "https://www.donneesquebec.ca/" },
      decisions: { ...DECISIONS },
    };
  });
  return {
    schemaVersion: "witness-tree/phase1-qc-stand-copy-production-admission/1",
    status: "owner-approved-admitted-and-release-approved",
    decisionId: "phase1-qc-stand-copy-production-admission-v1",
    decidedAt: "2026-08-26T00:55:28Z",
    ownerAuthorization: { ...OWNER_AUTHORIZATION },
    artifactRoot: "artifacts",
    requiredAttribution: {
      en: "Source: Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers. Licensed under CC BY 4.0.",
      fr: "Source : Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers. Sous licence CC BY 4.0.",
    },
    modificationNotice: {
      en: "Witness Tree preserves the named source values and records deterministic derived outputs; the source archives are unchanged.",
      fr: "Witness Tree préserve les valeurs sources nommées et consigne des sorties dérivées déterministes; les archives sources sont inchangées.",
    },
    correctionContactRoute: { ...CORRECTION_ROUTES, publisherListing: "https://www.donneesquebec.ca/" },
    limits: COMMON_LIMITS,
    decisions: { ...DECISIONS },
    rows,
  };
}

test("default readback mode reports presence only and never admission", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-presence-"));
  try {
    const output = path.join(root, "artifacts", QC_SCOPES[0].expected.artifactRelativePath);
    mkdirFor(output);
    writeFileSync(output, "synthetic output");
    const result = readbackPresence(root, "artifacts");
    assert.equal(result.mode, "readback-presence-only");
    assert.equal(result.admissionClaim, false);
    assert.equal(result.productionAdmission, false);
    assert.deepEqual(result.scopes.map(({ rowId, outputPresent, sidecarPresent, readbackPresent }) => [rowId, outputPresent, sidecarPresent, readbackPresent]), [
      ["qc-current-ecoforest", true, false, false],
      ["qc-original-current-inventory", false, false, false],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic complete outputs validate against exact two-scope bindings", () => {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-admission-"));
  try {
    const record = makeRecord(root);
    assert.equal(validateQcStandCopyProductionAdmissionRecord(record, root, "artifacts"), record);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate validation fails closed for source, approval, readback, rights, and owner-decision drift", () => {
  const mutations = [
    (record) => { record.rows[0].source.rawArchiveSha256 = "0".repeat(64); },
    (record) => { record.rows[1].evidence.executionApproval.sha256 = "0".repeat(64); },
    (record) => { record.rows[0].artifacts.output.byteLength += 1; },
    (record) => { record.rows[1].artifacts.output.layer = "wrong_layer"; },
    (record) => { record.rows[0].rights.licenceId = "ogl-canada"; },
    (record) => { record.rows[1].modificationNotice.fr = ""; },
    (record) => { record.rows[0].limits.fr = []; },
    (record) => { record.rows[1].correctionContactRoute.internalFr = "/wrong"; },
    (record) => { record.rows[0].evidence.readback.sha256 = "0".repeat(64); },
    (record) => { record.rows[1].evidence.readbackVerifier.sha256 = "0".repeat(64); },
    (record) => { record.rows[0].ledgerFields.publisher = "invented"; },
    (record) => { record.rows[1].ledgerFields.checksum = ["0".repeat(64)]; },
    (record) => { record.decisions.deploymentAuthorized = false; },
    (record) => { record.artifactRoot = "../outside"; },
  ];
  for (const mutate of mutations) {
    const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-negative-"));
    try {
      const baseline = makeRecord(root);
      mutate(baseline);
      assert.throws(() => validateQcStandCopyProductionAdmissionRecord(baseline, root, "artifacts"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("validator source has no transform, GDAL, or external mutation path", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../scripts/check-qc-stand-copy-production-admission-readiness.mjs", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /child_process|spawn\(|ogr2ogr|ogrinfo|writeFileSync\([^)]*output/i);
  assert.match(source, /readback-presence-only/);
  assert.match(source, /admissionClaim: false/);
});
