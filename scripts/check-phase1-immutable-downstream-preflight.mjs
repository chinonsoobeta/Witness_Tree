import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDS = [
  "ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height",
  "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation",
];
const SHA256 = /^[a-f0-9]{64}$/;

const read = (root, file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const fileSha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const schemaSha256 = (fields) => createHash("sha256").update(JSON.stringify(fields.map(({ name, type }) => ({ name, type })))).digest("hex");

function assertFalseClaims(claims) {
  assert.deepEqual(claims, {
    realDataTransformedByThisWork: false,
    ingestionAuthorized: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    remoteMutationPerformed: false,
    externalMutationPerformed: false,
    rawEvidenceDelta: 0,
    formalPercentagePointDelta: 0,
    immutableRowsDelta: 0,
    productionAdmissionRowsDelta: 0,
    productionEligibleRowsDelta: 0,
  });
}

export function validatePhase1ImmutableDownstreamPreflight(record, context) {
  assert.equal(record.schemaVersion, "witness-tree/phase1-immutable-downstream-preflight/1");
  assert.equal(record.status, "owner-independent-audit-complete-plvi-schema-blocked");
  assert.match(record.notice, /read-only preparation contract.*does not transform.*ingest.*production source/i);
  assert.deepEqual(record.baseline, {
    immutableRows: 7,
    rawEvidenceNumerator: 14.25,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 38.7903226,
    productionAdmissionRows: 0,
    productionEligibleRows: 0,
  });
  assert.deepEqual(record.auditedRows.map(({ id }) => id), IDS);
  const immutableIds = context.ledger.entries
    .filter(({ evidenceState }) => evidenceState === "remote-verified-archived-profiled")
    .map(({ id }) => id);
  assert.deepEqual(immutableIds, IDS);
  for (const row of record.auditedRows) {
    assert.match(row.preparationStatus, /^(?:blocked|selected-preflight-blocked)-/);
    assert.ok(row.reason.trim());
  }

  const selected = record.selectedBatch;
  assert.deepEqual(selected.rows, ["ab-primary-land-vegetation"]);
  assert.match(selected.selectionReason, /only immutable row.*owner-scoped.*checksum-bound derived payload/i);
  const method = selected.methodContract;
  assert.equal(method.specification, "alberta-plvi-geometry-repair-v1");
  assert.equal(method.runRecord, "data/transformation-runs/alberta-plvi-geometry-repair-v1-2026-08-14.json");
  assert.match(method.runRecordSha256, SHA256);
  assert.equal(fileSha256(path.join(context.root, method.runRecord)), method.runRecordSha256);
  assert.equal(context.runRecord.specification, method.specification);
  assert.equal(context.runRecord.rule.relativeAreaTolerance, method.relativeAreaTolerance);
  assert.match(method.rule, /179075.*12 named invalid polygons.*duplicate POLYGON_ID 41405.*do not drop or deduplicate/i);

  const output = selected.outputContract;
  assert.deepEqual(output, {
    relativePath: "derived/alberta-plvi-full-repair-v1/2026-08-14/alberta-plvi-full-repaired-closed-join.gpkg",
    byteLength: 899551232,
    sha256: "5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b",
    layer: "alberta_plvi_full_repaired",
    featureCount: 179087,
    crs: "EPSG:3400",
    attributeFieldCount: 60,
    emptyOrNullGeometryCount: 0,
    invalidGeometryCount: 0,
    nonPolygonalGeometryCount: 0,
  });
  assert.equal(context.readiness.derivedOutput.sha256, output.sha256);
  assert.equal(context.readiness.derivedOutput.byteLength, output.byteLength);
  assert.equal(context.readiness.derivedOutput.layer, output.layer);
  assert.equal(context.readiness.derivedOutput.featureCount, output.featureCount);
  assert.equal(context.readiness.derivedOutput.crs, output.crs);

  const source = selected.sourceSchemaContract;
  assert.equal(source.archiveByteLength, 675544895);
  assert.match(source.archiveSha256, SHA256);
  assert.equal(context.readiness.rawInput.byteLength, source.archiveByteLength);
  assert.equal(context.readiness.rawInput.sha256, source.archiveSha256);
  assert.match(source.orderedNameTypeSha256, SHA256);
  assert.equal(source.attributeFieldCount, 60);
  const observed = selected.observedOutputSchema;
  assert.equal(observed.orderedNameTypeSha256, "7fe569a75dc692daa2b352c7d462d71bb7376d781ca6ef5ccf33015faa5d70db");
  assert.equal(observed.attributeFieldCount, 60);
  assert.deepEqual(observed.nameDrift, [
    { index: 57, source: "SUBMISSION_ID", output: "SUBMISSION" },
    { index: 58, source: "Shape_Length", output: "Shape_Leng" },
  ]);
  assert.equal(observed.integerToInteger64WideningCount, 23);
  assert.equal(observed.exactNameParity, false);
  assert.equal(observed.exactNameTypeParity, false);
  assert.deepEqual(selected.validationGates, {
    methodRecordChecksumBound: true,
    outputChecksumBound: true,
    featureCountPreserved: true,
    geometryValidAndPolygonal: true,
    duplicateIdentityPreserved: true,
    exactSchemaNameParity: false,
    exactSchemaNameTypeParity: false,
    preflightResult: "blocked",
  });
  assert.equal(selected.preflight.writesData, false);
  assert.equal(selected.preflight.requiresTransformationAdmission, true);
  assert.equal(selected.preflight.requiresIngestionDecision, true);
  assert.equal(selected.preflight.requiredBeforeReady.length, 3);
  assertFalseClaims(record.claims);
  return record;
}

const streamSha256 = (file) => new Promise((resolve, reject) => {
  const hash = createHash("sha256");
  createReadStream(file).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex")));
});

function ogrLayer(dataset, layer) {
  const result = JSON.parse(execFileSync("ogrinfo", ["-ro", "-so", "-json", dataset, layer], { encoding: "utf8" }));
  assert.equal(result.layers?.length, 1, `${layer} must resolve to exactly one layer.`);
  return result.layers[0];
}

export function validateLocalObservation(record, observation) {
  const selected = record.selectedBatch;
  assert.equal(observation.sourceArchiveByteLength, selected.sourceSchemaContract.archiveByteLength);
  assert.equal(observation.sourceArchiveSha256, selected.sourceSchemaContract.archiveSha256);
  assert.equal(observation.outputByteLength, selected.outputContract.byteLength);
  assert.equal(observation.outputSha256, selected.outputContract.sha256);
  assert.equal(observation.outputLayer, selected.outputContract.layer);
  assert.equal(observation.outputFeatureCount, selected.outputContract.featureCount);
  assert.equal(observation.outputCrs, selected.outputContract.crs);
  assert.equal(observation.sourceAttributeFieldCount, selected.sourceSchemaContract.attributeFieldCount);
  assert.equal(observation.outputAttributeFieldCount, selected.outputContract.attributeFieldCount);
  assert.equal(observation.sourceSchemaSha256, selected.sourceSchemaContract.orderedNameTypeSha256);
  assert.equal(observation.outputSchemaSha256, selected.observedOutputSchema.orderedNameTypeSha256);
  assert.deepEqual(observation.nameDrift, selected.observedOutputSchema.nameDrift);
  assert.equal(observation.integerToInteger64WideningCount, selected.observedOutputSchema.integerToInteger64WideningCount);
  return observation;
}

export async function verifyLocalPlvi(record, dataRoot) {
  assert.equal(path.isAbsolute(dataRoot), true, "--data-root must be absolute.");
  const selected = record.selectedBatch;
  const sourceArchive = path.join(dataRoot, selected.sourceSchemaContract.relativePath);
  const outputFile = path.join(dataRoot, selected.outputContract.relativePath);
  const sourceDataset = `/vsizip/${sourceArchive}/${selected.sourceSchemaContract.datasetPath}`;
  const sourceLayer = ogrLayer(sourceDataset, selected.sourceSchemaContract.layer);
  const outputLayer = ogrLayer(outputFile, selected.outputContract.layer);
  const sourceFields = sourceLayer.fields.map(({ name, type }) => ({ name, type }));
  const outputFields = outputLayer.fields.map(({ name, type }) => ({ name, type }));
  const nameDrift = sourceFields.flatMap((field, index) => field.name === outputFields[index]?.name ? [] : [{ index, source: field.name, output: outputFields[index]?.name }]);
  const integerToInteger64WideningCount = sourceFields.filter((field, index) => field.type === "Integer" && outputFields[index]?.type === "Integer64").length;
  const crsId = outputLayer.geometryFields?.[0]?.coordinateSystem?.projjson?.id;
  return validateLocalObservation(record, {
    sourceArchiveByteLength: statSync(sourceArchive).size,
    sourceArchiveSha256: await streamSha256(sourceArchive),
    outputByteLength: statSync(outputFile).size,
    outputSha256: await streamSha256(outputFile),
    outputLayer: outputLayer.name,
    outputFeatureCount: outputLayer.featureCount,
    outputCrs: `${crsId?.authority}:${crsId?.code}`,
    sourceAttributeFieldCount: sourceFields.length,
    outputAttributeFieldCount: outputFields.length,
    sourceSchemaSha256: schemaSha256(sourceFields),
    outputSchemaSha256: schemaSha256(outputFields),
    nameDrift,
    integerToInteger64WideningCount,
  });
}

export function loadPhase1ImmutableDownstreamPreflight(root = ROOT) {
  const record = read(root, "data/phase1-immutable-downstream-preflight.json");
  return validatePhase1ImmutableDownstreamPreflight(record, {
    root,
    ledger: read(root, "data/phase1-production-source-ledger.json"),
    runRecord: read(root, record.selectedBatch.methodContract.runRecord),
    readiness: read(root, "data/alberta-plvi-full-release-readiness.json"),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = loadPhase1ImmutableDownstreamPreflight();
  const verify = process.argv.includes("--verify-local");
  if (verify) {
    const index = process.argv.indexOf("--data-root");
    assert.ok(index >= 0 && process.argv[index + 1], "--verify-local requires --data-root <absolute-path>.");
    await verifyLocalPlvi(record, process.argv[index + 1]);
  }
  console.log(`Phase 1 immutable downstream preflight passed as ${record.selectedBatch.validationGates.preflightResult}: PLVI output identity is exact, schema drift is detected, and all score/admission deltas remain zero.`);
}
