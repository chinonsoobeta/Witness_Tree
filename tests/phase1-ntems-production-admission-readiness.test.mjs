import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DECISIONS,
  EXPLANATIONS,
  NTEMS_SCOPES,
  OWNER_AUTHORIZATION,
  SPECIFICATION_PATH,
  check,
  readbackPresence,
  sha256File,
  validateNtemsProductionAdmissionRecord,
} from "../scripts/check-phase1-ntems-production-admission-readiness.mjs";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);
const OGL_EN = "Contains information licensed under the Open Government Licence – Canada.";
const OGL_FR = "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert – Canada.";

function mkdirFor(file) {
  mkdirSync(path.dirname(file), { recursive: true });
}

function copyEvidenceFixture(root) {
  const files = new Set([
    "scripts/run-phase1-ntems-transform.mjs",
    "scripts/verify-phase1-ntems-transform.mjs",
    "data/phase1-transformation-scope-owner-approval-2026-08-25.json",
    "data/phase1-downstream-admission-packet.json",
    "data/transformation-specs/qc-current-ecoforest-stand-copy-v1.json",
    "data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json",
    "data/vlce2-promotion-preparation.json",
    SPECIFICATION_PATH,
  ]);
  for (const scope of NTEMS_SCOPES) {
    files.add(scope.authorizationPath);
    scope.profilePaths.forEach((file) => files.add(file));
    scope.rightsBindings.forEach(([file]) => files.add(file));
  }
  for (const relativePath of files) {
    const destination = path.join(root, relativePath);
    mkdirFor(destination);
    copyFileSync(path.join(REPO, relativePath), destination);
  }
}

function jsonAt(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));
}

function binding(root, relativePath) {
  return { path: relativePath, sha256: sha256File(path.join(root, relativePath)) };
}

function pointerBinding(root, [relativePath, jsonPointer, expectedValue]) {
  return { ...binding(root, relativePath), jsonPointer, expectedValue };
}

function sourceAttribution(scope) {
  const value = [...scope.rightsBindings].reverse().find(([, jsonPointer]) => jsonPointer.endsWith("/attribution"));
  return value?.[2] ?? OGL_EN;
}

function retrievalDate(root, scope, auth) {
  if (scope.specId === "ntems-annual-land-cover-v1") {
    const byYear = new Map(jsonAt(root, "data/vlce2-promotion-preparation.json").entries.map((entry) => [entry.year, entry]));
    const inputs = auth.inputs.map((input) => ({ path: input.path, retrievedAt: byYear.get(input.year).retrievedAt }));
    return { status: "multiple-source-files", firstRetrievedAt: inputs[0].retrievedAt, lastRetrievedAt: inputs.at(-1).retrievedAt, inputs };
  }
  return jsonAt(root, "data/staged-acquisitions.json").entries.find((entry) => entry.sha256 === auth.inputs[0].sha256).retrievedAt;
}

function outputFixture(root, scope, specification, auth, index) {
  const input = auth.inputs[index];
  const inputSha = scope.specId === "ntems-annual-land-cover-v1" ? specification.inputBindings[0].sha256 : input.sha256;
  const name = scope.specId === "ntems-annual-land-cover-v1"
    ? `annual-land-cover-${input.year}.tif`
    : scope.specId === "ntems-forest-harvest-v1"
      ? "forest-harvest-year-1985-2022.tif"
      : scope.specId === "ntems-canopy-cover-v1"
        ? "canopy-cover-2022.tif"
        : "canopy-height-2022.tif";
  const outputPath = `${scope.specId}/${inputSha}/${specification.methodVersion}/${name}`;
  const outputFile = path.join(root, "artifacts", outputPath);
  mkdirFor(outputFile);
  writeFileSync(outputFile, Buffer.from(`${scope.specId}:output:${index}`));
  const outputSha256 = sha256File(outputFile);
  const outputByteLength = Buffer.byteLength(`${scope.specId}:output:${index}`);
  const sidecarPath = `${outputPath}.sidecar.json`;
  const sidecarFile = path.join(root, "artifacts", sidecarPath);
  const classSemantics = scope.specId === "ntems-canopy-cover-v1"
    ? "continuous-0-100"
    : scope.specId === "ntems-canopy-height-v1"
      ? "continuous-0-62.503"
      : scope.specId === "ntems-annual-land-cover-v1" && [1991, 2005].includes(input.year)
        ? "unknown-empty-rat"
        : "published-class-values-bound";
  const dataType = scope.specId.includes("canopy") ? "Float32" : scope.specId.includes("harvest") ? "UInt16" : "Byte";
  const sidecar = {
    schemaVersion: "witness-tree/phase1-ntems-transformation-sidecar/1",
    specId: scope.specId,
    methodVersion: specification.methodVersion,
    inputBindings: [{ ...input, classSemantics }],
    command: ["-of", "GTiff", "-co", "TILED=YES", "-co", "BIGTIFF=YES", "-co", "COMPRESS=DEFLATE", "-co", `PREDICTOR=${dataType === "Float32" ? 3 : 2}`, "-co", "NUM_THREADS=1", `data-root/${input.path}/${input.member}`, `output-root/${outputPath}`],
    toolVersions: { gdalTranslate: "GDAL synthetic", gdalInfo: "GDAL synthetic", gdalsrsinfo: "GDAL synthetic" },
    output: { path: outputPath, format: "GTiff" },
    outputSha256,
    outputByteLength,
    createdAt: auth.createdAt,
    qa: { source: { classSemantics }, outputMetadataChecked: true, outputChecksumChecked: true, noResamplingOrReprojection: true, noOverwrite: true, sourcePixelChecksum: index + 1, outputPixelChecksum: index + 1 },
    claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
  };
  mkdirFor(sidecarFile);
  writeFileSync(sidecarFile, `${JSON.stringify(sidecar, null, 2)}\n`);
  const sidecarBytes = readFileSync(sidecarFile);
  return {
    readbackOutput: outputPath,
    output: { path: outputPath, sha256: outputSha256, byteLength: outputByteLength },
    sidecar: { path: sidecarPath, sha256: sha256File(sidecarFile), byteLength: sidecarBytes.length },
    readback: {
      specification: scope.specId,
      input: auth.inputs[index]?.path ?? auth.inputs[0].path,
      status: "verified",
      output: outputPath,
      outputSha256,
      outputByteLength,
      sidecarSha256: sha256File(sidecarFile),
      sourcePixelChecksum: index + 1,
      outputPixelChecksum: index + 1,
    },
  };
}

function makeRecord(root) {
  const specRecord = jsonAt(root, SPECIFICATION_PATH);
  const rightsRecord = jsonAt(root, "data/phase1-ntems-rights-verification-2026-08-26.json");
  const rows = [];
  for (const scope of NTEMS_SCOPES) {
    const specification = specRecord.specifications.find(({ id }) => id === scope.specId);
    const auth = jsonAt(root, scope.authorizationPath);
    const dataset = rightsRecord.datasets.find(({ rowId }) => rowId === scope.rowId);
    const outputs = Array.from({ length: auth.inputs.length }, (_, index) => outputFixture(root, scope, specification, auth, index));
    const readback = {
      schemaVersion: "witness-tree/phase1-ntems-transformation-readback-evidence/1",
      status: "complete-readback-verified",
      authorization: { ...binding(root, scope.authorizationPath), createdAt: auth.createdAt },
      runner: auth.runner,
      specifications: [{ id: scope.specId, path: SPECIFICATION_PATH, sha256: sha256File(path.join(root, SPECIFICATION_PATH)) }],
      outputs: outputs.map(({ readback }) => readback),
      counts: { expected: outputs.length, verified: outputs.length, missing: 0 },
      claims: { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false },
      sourceRecord: { path: SPECIFICATION_PATH, sha256: sha256File(path.join(root, SPECIFICATION_PATH)) },
    };
    const readbackPath = scope.readbackPath;
    const readbackFile = path.join(root, readbackPath);
    mkdirFor(readbackFile);
    writeFileSync(readbackFile, `${JSON.stringify(readback, null, 2)}\n`);
    const rightEvidence = scope.rightsBindings.map((entry) => pointerBinding(root, entry));
    const sourceAttributionValue = sourceAttribution(scope);
    const requiredAttribution = { en: OGL_EN, fr: OGL_FR };
    const modificationNotice = {
      en: "Witness Tree preserves the bound source values and records the deterministic derived output; the source archive is not modified.",
      fr: "Witness Tree préserve les valeurs sources liées et consigne la sortie dérivée déterministe; l’archive source n’est pas modifiée.",
    };
    const ledgerFields = {
      publisher: "Natural Resources Canada",
      datasetTitle: dataset.title,
      sourceUrl: dataset.sourceResourceUrl,
      licence: "ogl-canada",
      licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
      editionEffectiveDate: { status: "unknown", reason: "The publisher has not declared an edition-effective date; the reference year is not inferred as one." },
      retrievalDate: retrievalDate(root, scope, auth),
      checksum: auth.inputs.map(({ sha256 }) => sha256),
      archiveVersion: scope.specId === "ntems-annual-land-cover-v1" ? "Version 2" : "undeclared",
      coverage: dataset.temporalCoverage,
      schema: { kind: "raster", specification: scope.specId, sourceContract: specification.output.schema },
      transformations: { methodVersion: specification.methodVersion, summary: "Deterministic source-grid-preserving GeoTIFF transformation with no resampling or reprojection.", outputs: outputs.map(({ readback }) => ({ path: readback.output, sha256: readback.outputSha256 })) },
      requiredAttribution,
      redistributionStatus: "allowed-under-ogl-canada-2.0-with-required-attribution-and-modification-notice",
      modificationNotice,
      admissionState: true,
      datasetOriginalName: auth.inputs.length === 1 ? path.basename(auth.inputs[0].path) : { count: auth.inputs.length, files: auth.inputs.map(({ path: inputPath }) => path.basename(inputPath)) },
      plainLanguageExplanation: EXPLANATIONS[scope.rowId],
      updateCadence: dataset.updateCadence,
      nextExpectedRefresh: { status: "unknown", reason: "The publisher provides no fixed next refresh date; recheck the official listing before release." },
      bulkRedistributionAllowed: true,
      correctionContactRoute: { internalEn: "/en/corrections", internalFr: "/fr/corrections", publisherListing: dataset.listingUrl },
    };
    rows.push({
      id: scope.rowId,
      specId: scope.specId,
      evidence: {
        sourceRights: rightEvidence,
        sourceProfiles: scope.profilePaths.map((relativePath) => binding(root, relativePath)),
        specification: binding(root, SPECIFICATION_PATH),
        scopeApproval: binding(root, "data/phase1-transformation-scope-owner-approval-2026-08-25.json"),
        executionAuthorization: binding(root, scope.authorizationPath),
        readback: binding(root, readbackPath),
        readbackVerifier: binding(root, "scripts/verify-phase1-ntems-transform.mjs"),
      },
      artifacts: outputs.map(({ readbackOutput, output, sidecar }) => ({ readbackOutput, output, sidecar })),
      rights: {
        licenceId: "ogl-canada",
        licenceVersion: "2.0",
        licenceUrl: "https://open.canada.ca/en/open-government-licence-canada",
        requiredAttribution,
        sourceAttribution: sourceAttributionValue,
        modificationNotice,
        redistributionStatus: "allowed-under-ogl-canada-2.0-with-required-attribution-and-modification-notice",
        bulkRedistributionAllowed: true,
      },
      ledgerFields,
    });
    rows[rows.length - 1].__readbackPath = readbackPath;
  }
  for (const row of rows) delete row.__readbackPath;
  return {
    schemaVersion: "witness-tree/phase1-ntems-production-admission/1",
    status: "owner-approved-admitted-and-release-approved",
    decisionId: "phase1-ntems-four-scope-production-admission-v1",
    decidedAt: "2026-08-26T02:10:00Z",
    ownerAuthorization: OWNER_AUTHORIZATION,
    rows,
    artifactRoot: "artifacts",
    requiredAttribution: { en: OGL_EN, fr: OGL_FR },
    modificationNotice: {
      en: "Witness Tree records deterministic derived outputs and leaves the bound source archives unchanged.",
      fr: "Witness Tree consigne les sorties dérivées déterministes et laisse les archives sources liées inchangées.",
    },
    decisions: DECISIONS,
    limits: ["The four records are bounded to the named NTEMS editions and do not claim current conditions beyond the source coverage.", "This validator does not itself perform ingestion, release, production admission, or deployment."],
  };
}

test("default readback inventory is four-scope and never an admission claim", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-presence-"));
  try {
    const presentPath = path.join(root, NTEMS_SCOPES[1].readbackPath);
    mkdirFor(presentPath);
    writeFileSync(presentPath, "{}\n");
    const result = readbackPresence(root);
    assert.equal(result.mode, "readback-evidence-file-existence-only");
    assert.equal(result.admissionClaim, false);
    assert.deepEqual(result.scopes.map(({ rowId, present }) => [rowId, present]), [
      ["ntems-annual-land-cover", false],
      ["ntems-forest-harvest", true],
      ["ntems-canopy-cover", false],
      ["ntems-canopy-height", false],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a complete future record is validated against exact rights, evidence, artifacts, and decisions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-"));
  try {
    copyEvidenceFixture(root);
    const record = makeRecord(root);
    assert.equal(validateNtemsProductionAdmissionRecord(record, root, "artifacts"), record);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate validation fails closed for mapping, evidence, artifact, rights, metadata, and decision drift", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-negative-"));
  try {
    copyEvidenceFixture(root);
    const baseline = makeRecord(root);
    const mutations = [
      (record) => { record.rows[0].specId = "ntems-forest-harvest-v1"; },
      (record) => { record.rows[1].evidence.sourceRights[0].expectedValue = "wrong"; },
      (record) => { record.rows[2].evidence.executionAuthorization.sha256 = "0".repeat(64); },
      (record) => { record.rows[2].evidence.scopeApproval.sha256 = "0".repeat(64); },
      (record) => { record.rows[3].artifacts[0].sidecar.byteLength += 1; },
      (record) => { record.rows[0].rights.modificationNotice.fr = ""; },
      (record) => { record.rows[1].ledgerFields.editionEffectiveDate = { status: "unknown" }; },
      (record) => { record.rows[2].ledgerFields.plainLanguageExplanation.fr = ""; },
      (record) => { record.rows[2].ledgerFields.plainLanguageExplanation.en = "Plausible but unbound text."; },
      (record) => { record.rows[0].ledgerFields.transformations.summary = "Plausible but unbound summary."; },
      (record) => { record.rows[1].ledgerFields.sourceUrl = "https://example.invalid/invented"; },
      (record) => { record.rows[0].artifacts[0].output.path += ".duplicate"; },
      (record) => { record.decisions.productionEligible = false; },
      (record) => { record.decidedAt = "2026-08-26T01:00:00Z"; },
      (record) => {
        record.rows[3].artifacts[0].readbackOutput = "../outside.tif";
        record.rows[3].artifacts[0].output.path = "../outside.tif";
        record.rows[3].artifacts[0].sidecar.path = "../outside.tif.sidecar.json";
        const readbackPath = path.join(root, record.rows[3].evidence.readback.path);
        const readback = JSON.parse(readFileSync(readbackPath, "utf8"));
        readback.outputs[0].output = "../outside.tif";
        writeFileSync(readbackPath, `${JSON.stringify(readback, null, 2)}\n`);
        record.rows[3].evidence.readback.sha256 = sha256File(readbackPath);
      },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(baseline);
      mutate(candidate);
      assert.throws(() => validateNtemsProductionAdmissionRecord(candidate, root, "artifacts"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate validation rejects approval-content, canonical-runner, command, and record-path drift", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-chain-negative-"));
  try {
    copyEvidenceFixture(root);

    {
      const record = makeRecord(root);
      const approvalPath = path.join(root, record.rows[0].evidence.scopeApproval.path);
      const approval = JSON.parse(readFileSync(approvalPath, "utf8"));
      approval.decisionBoundary.ingestionAuthorized = true;
      writeFileSync(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
      const changedSha = sha256File(approvalPath);
      record.rows.forEach((row) => { row.evidence.scopeApproval.sha256 = changedSha; });
      assert.throws(() => validateNtemsProductionAdmissionRecord(record, root, "artifacts"), /decision boundary/i);
    }

    copyEvidenceFixture(root);
    {
      const record = makeRecord(root);
      const row = record.rows[0];
      const authPath = path.join(root, row.evidence.executionAuthorization.path);
      const auth = JSON.parse(readFileSync(authPath, "utf8"));
      auth.runner = binding(root, "scripts/verify-phase1-ntems-transform.mjs");
      writeFileSync(authPath, `${JSON.stringify(auth, null, 2)}\n`);
      row.evidence.executionAuthorization.sha256 = sha256File(authPath);
      const readbackPath = path.join(root, row.evidence.readback.path);
      const readback = JSON.parse(readFileSync(readbackPath, "utf8"));
      readback.authorization.sha256 = row.evidence.executionAuthorization.sha256;
      readback.runner = auth.runner;
      writeFileSync(readbackPath, `${JSON.stringify(readback, null, 2)}\n`);
      row.evidence.readback.sha256 = sha256File(readbackPath);
      assert.throws(() => validateNtemsProductionAdmissionRecord(record, root, "artifacts"), /authorization runner path drifted/i);
    }

    copyEvidenceFixture(root);
    {
      const record = makeRecord(root);
      const row = record.rows[0];
      const sidecarPath = path.join(root, "artifacts", row.artifacts[0].sidecar.path);
      const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
      sidecar.command.splice(-2, 0, "-overwrite");
      writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
      row.artifacts[0].sidecar.sha256 = sha256File(sidecarPath);
      row.artifacts[0].sidecar.byteLength = readFileSync(sidecarPath).length;
      const readbackPath = path.join(root, row.evidence.readback.path);
      const readback = JSON.parse(readFileSync(readbackPath, "utf8"));
      readback.outputs[0].sidecarSha256 = row.artifacts[0].sidecar.sha256;
      writeFileSync(readbackPath, `${JSON.stringify(readback, null, 2)}\n`);
      row.evidence.readback.sha256 = sha256File(readbackPath);
      assert.throws(() => validateNtemsProductionAdmissionRecord(record, root, "artifacts"), /sidecar command.*drifted/i);
    }

    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.json`);
    writeFileSync(outside, "{}\n");
    try {
      assert.throws(() => check(root, `../${path.basename(outside)}`), /must not escape the repository/i);
    } finally {
      rmSync(outside, { force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate validation checks the complete rights record rather than selected pointers only", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-rights-negative-"));
  try {
    copyEvidenceFixture(root);
    const rightsPath = path.join(root, "data/phase1-ntems-rights-verification-2026-08-26.json");
    const rights = JSON.parse(readFileSync(rightsPath, "utf8"));
    rights.claims.bulkRedistributionAllowedSubjectToLicenceRequirementsAndExclusions = false;
    writeFileSync(rightsPath, `${JSON.stringify(rights, null, 2)}\n`);
    const record = makeRecord(root);
    assert.throws(() => validateNtemsProductionAdmissionRecord(record, root, "artifacts"), /NTEMS rights claims drifted/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate validation rejects a checksum-consistent but incomplete sidecar", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ntems-admission-sidecar-negative-"));
  try {
    copyEvidenceFixture(root);
    const record = makeRecord(root);
    const row = record.rows[1];
    const sidecarPath = path.join(root, "artifacts", row.artifacts[0].sidecar.path);
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    delete sidecar.qa;
    writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
    row.artifacts[0].sidecar.sha256 = sha256File(sidecarPath);
    row.artifacts[0].sidecar.byteLength = readFileSync(sidecarPath).length;
    const readbackPath = path.join(root, row.evidence.readback.path);
    const readback = JSON.parse(readFileSync(readbackPath, "utf8"));
    readback.outputs[0].sidecarSha256 = row.artifacts[0].sidecar.sha256;
    writeFileSync(readbackPath, `${JSON.stringify(readback, null, 2)}\n`);
    row.evidence.readback.sha256 = sha256File(readbackPath);
    assert.throws(() => validateNtemsProductionAdmissionRecord(record, root, "artifacts"), /sidecar.*keys drifted/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
