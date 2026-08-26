import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDS = [
  "ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height",
  "qc-current-ecoforest", "qc-original-current-inventory",
  "ab-avi-crown", "ab-avi-post-harvest", "ab-primary-land-vegetation",
];
const SHA256 = /^[a-f0-9]{64}$/;
const EXPECTED_ROWS = [
  { id: "ntems-annual-land-cover", preparationStatus: "blocked-phase1-production-method-output-and-downstream-decisions", reason: "The separately approved Phase 2 nonproduction method does not supply a Phase 1 production-admission target method, crosswalk, checksum-bound full-resolution output, or downstream decisions." },
  { id: "ntems-forest-harvest", preparationStatus: "blocked-phase1-source-ledger-scope-only-no-production-method-output", reason: "The recorded Phase 1 source-ledger-only decision supplies no Phase 1 production-admission target transformation, checksum-bound output, or ingestion decision; the separate Phase 2 nonproduction method does not close those gates." },
  { id: "ntems-canopy-cover", preparationStatus: "blocked-phase1-production-method-output-and-downstream-decisions", reason: "The separately approved Phase 2 nonproduction method does not supply Phase 1 production-admission canopy-cover semantics, a checksum-bound output, or downstream decisions." },
  { id: "ntems-canopy-height", preparationStatus: "blocked-phase1-source-ledger-scope-only-no-production-method-output", reason: "The recorded Phase 1 source-ledger-only decision supplies no Phase 1 production-admission target transformation, checksum-bound output, or ingestion decision; the separate Phase 2 nonproduction method does not close those gates." },
  { id: "ab-avi-crown", preparationStatus: "blocked-source-ledger-only-no-derived-payload-or-downstream-scope", reason: "The source-ledger-only decision preserves the exact FID 1 exclusion, but the repair/quarantine audit wrote no derived AVI payload and no downstream transformation or ingestion scope is approved." },
  { id: "ab-avi-post-harvest", preparationStatus: "blocked-source-ledger-only-no-derived-payload-or-downstream-scope", reason: "The source-ledger-only decision supplies no approved derived post-inventory-harvest payload, downstream transformation scope, or ingestion decision." },
  { id: "ab-primary-land-vegetation", preparationStatus: "selected-exact-scope-schema-preflight-blocked-downstream-decisions", reason: "The owner-approved exact raw/derived scope and immutable output support read-only validation, but ordered schema parity fails and transformation admission plus ingestion decisions remain separate." },
  { id: "qc-current-ecoforest", preparationStatus: "blocked-source-ledger-only-no-production-method-output", reason: "The recorded immutable archive attestation and source-ledger-only decision supply no approved production transformation, checksum-bound output, ingestion decision, release, or production admission." },
  { id: "qc-original-current-inventory", preparationStatus: "blocked-source-ledger-only-no-production-method-output", reason: "The recorded immutable archive attestation and source-ledger-only decision supply no approved production transformation, checksum-bound output, ingestion decision, release, or production admission." },
];
const EXPECTED_LEDGER_BLOCKERS = new Map([
  ["ntems-annual-land-cover", "Owner approved this named source-ledger evidence row only; transform, ingestion, release, and production eligibility remain separately blocked."],
  ["ntems-forest-harvest", "Owner accepted this named source-ledger evidence row only; transformation admission, ingestion, release, and production eligibility remain separately blocked. The exact raw payload and recovery evidence are archived and redacted read back."],
  ["ntems-canopy-cover", "Owner approved this named source-ledger evidence row only; transform, ingestion, release, and production eligibility remain separately blocked."],
  ["ntems-canopy-height", "Owner accepted this named source-ledger evidence row only; transformation admission, ingestion, release, and production admission remain separately required."],
  ["ab-avi-crown", "Owner approved this named source-ledger evidence row with only AVI_PostInventoryHarvestIndex FID 1 excluded. The existing repair/quarantine policy run is locally validated, but no downstream transformation scope, ingestion authorization, release approval, or production eligibility is approved."],
  ["ab-avi-post-harvest", "Owner approved this named source-ledger evidence row only. The existing repair/quarantine policy run is locally validated, but no downstream transformation scope, ingestion authorization, release approval, or production eligibility is recorded."],
  ["ab-primary-land-vegetation", "Exact raw and derived payload versions and deterministic sidecar versions are remotely verified; both payload versions carry COMPLIANCE retention through 2033-08-12. The owner admitted the exact raw/derived scope for scope-bound validation and ingestion preparation only; transformation admission, ingestion, release, production admission, and production eligibility remain separately blocked."],
  ["qc-current-ecoforest", "Separate owner decisions and evidence for transformation, ingestion, release, and production admission remain required."],
  ["qc-original-current-inventory", "Separate owner decisions and evidence for transformation, ingestion, release, and production admission remain required."],
]);
const EXPECTED_DECISION_SCOPES = new Map([
  ["ntems-annual-land-cover", "This approval is limited to this named source-ledger evidence row and does not authorize transformation, ingestion, release, runtime production eligibility, or any other source."],
  ["ntems-forest-harvest", "The owner accepted this named existing immutable source-ledger evidence row only, including its redacted primary/recovery archive readbacks. This does not authorize transformation admission, ingestion, release, runtime production eligibility, or any other source."],
  ["ntems-canopy-cover", "This approval is limited to this named source-ledger evidence row and does not authorize transformation, ingestion, release, runtime production eligibility, or any other source."],
  ["ntems-canopy-height", "The owner accepted this named existing immutable source-ledger evidence row only, including its redacted primary/recovery archive readbacks. This does not authorize transformation admission, ingestion, release, runtime production eligibility, or any other source."],
  ["ab-avi-crown", "Only AVI_PostInventoryHarvestIndex FID 1 is excluded; it has zero AVI_Crown observations and no Crown denominator impact. This does not authorize transformation, ingestion, release, runtime production eligibility, or any other source."],
  ["ab-avi-post-harvest", "This approval is limited to this named source-ledger evidence row and does not authorize transformation, ingestion, release, runtime production eligibility, or any other source."],
  ["ab-primary-land-vegetation", "The owner admitted only the unchanged raw ZIP and the exact 179,087-feature closed-join derived artifact under alberta-plvi-geometry-repair-v1 with 12 bounded repairs, preserving duplicate POLYGON_ID 41405 and no feature loss or deduplication. This authorizes scope-bound validation and ingestion preparation only; it does not authorize transformation admission, ingestion, release, runtime production eligibility, or any other source."],
  ["qc-current-ecoforest", "The owner accepted this named existing immutable source-ledger evidence row only, including its validated redacted archive attestation. This does not authorize transformation admission, ingestion, release, runtime production eligibility, or any other source."],
  ["qc-original-current-inventory", "The owner accepted this named existing immutable source-ledger evidence row only, including its validated redacted archive attestation. This does not authorize transformation admission, ingestion, release, runtime production eligibility, or any other source."],
]);

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
    immutableRows: 9,
    rawEvidenceNumerator: 14.75,
    rawEvidenceDenominator: 31,
    formalEvidenceTrackingPercentage: 39.2741935,
    productionAdmissionRows: 0,
    productionEligibleRows: 0,
  });
  assert.deepEqual(record.auditedRows, EXPECTED_ROWS);
  const immutableIds = context.ledger.entries
    .filter(({ evidenceState }) => evidenceState === "remote-verified-archived-profiled")
    .map(({ id }) => id);
  assert.ok(IDS.every((id) => immutableIds.includes(id)), "The established immutable rows must remain immutable after later archive evidence.");
  for (const expected of EXPECTED_ROWS) {
    const ledger = context.ledger.entries.find(({ id }) => id === expected.id);
    const decision = context.decisions.decisions.find(({ id }) => id === expected.id);
    const queue = context.queue.queueRows.find(({ id }) => id === expected.id);
    assert.ok(ledger && decision && queue, `${expected.id} must exist in ledger, owner decisions, and owner queue.`);
    assert.equal(ledger.evidenceState, "remote-verified-archived-profiled");
    assert.equal(ledger.rawCredit, 1);
    assert.equal(ledger.proof.immutableArchive, true);
    assert.equal(ledger.proof.productionAdmission, false);
    assert.equal(ledger.productionEligible, false);
    assert.equal(ledger.blocker, EXPECTED_LEDGER_BLOCKERS.get(expected.id));
    assert.equal(decision.ownerAdmission, "approved-source-ledger-only");
    assert.equal(decision.scope, EXPECTED_DECISION_SCOPES.get(expected.id));
    assert.equal(queue.ownerDecisionStatus.sourceLedger, "recorded-approved-source-ledger-only");
    assert.equal(queue.ownerDecisionStatus.transformation, expected.id === "ab-primary-land-vegetation" ? "pending-under-approved-scope" : "pending");
    assert.equal(queue.ownerDecisionStatus.ingestion, expected.id === "ab-primary-land-vegetation" ? "pending-under-approved-scope" : "pending");
  }
  assert.equal(context.decisions.decisions.find(({ id }) => id === "ab-primary-land-vegetation").scopeDecision, "approved-raw-and-derived-scope-only");
  assert.deepEqual(context.decisions.decisions.find(({ id }) => id === "ab-primary-land-vegetation").evidenceRefs, [
    "data/alberta-plvi-immutable-promotion-evidence.json",
    "data/alberta-plvi-full-release-readiness.json",
    "data/phase1-alberta-transform-ingestion-audit.json",
  ]);
  assert.equal(context.decisions.decisions.find(({ id }) => id === "ab-avi-crown").evidenceRef, "data/alberta-avi-crown-quarantine-decision.json");
  const plviQueue = context.queue.queueRows.find(({ id }) => id === "ab-primary-land-vegetation");
  assert.equal(plviQueue.primaryActionId, "plvi-transformation-ingestion-decisions");
  assert.equal(plviQueue.exactScopeDecision, "The unchanged raw ZIP and exact 179,087-feature closed-join derived scope with 12 bounded repairs, preserved duplicate POLYGON_ID 41405, and no loss or deduplication are already approved. Decide the schema mapping or corrected output, then decide transformation admission and ingestion separately; release and production admission remain later gates.");
  assert.deepEqual(plviQueue.exactNextSteps, [
    "retain the already-approved exact raw/derived scope and immutable evidence; ingestion preflight remains schema-blocked",
    "resolve the ordered-schema drift with a corrected checksum-bound output or an explicit field-mapping decision",
    "after the schema preflight passes, separately decide transformation admission and ingestion",
    "record release and production admission",
  ]);

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
  assert.equal(context.readiness.derivedOutput.attributeFieldCount, output.attributeFieldCount);
  assert.equal(context.readiness.ownerScope.scopeBoundValidationAuthorized, true);

  const source = selected.sourceSchemaContract;
  assert.deepEqual(source, {
    relativePath: "raw/alberta-primary-land-vegetation/2026-08-14/PrimaryLandAndVegetationInventoryPLVI.zip",
    archiveByteLength: 675544895,
    archiveSha256: "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3",
    datasetPath: "PrimaryLandAndVegetationInventoryPLVI/Data/Geodatabase/PrimaryLandAndVegetationInventoryPLVI.gdb",
    layer: "PrimaryLandAndVegetationInventory",
    attributeFieldCount: 60,
    orderedNameTypeSha256: "48cfd5562b5d8efe80cc6284ecf5ad45809209513ba1a69d5e8e77d2fff6a59c",
  });
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
  assert.deepEqual(selected.preflight, {
    contractCommand: "npm run check:phase1-immutable-downstream-preflight",
    localReadOnlyCommand: "node scripts/check-phase1-immutable-downstream-preflight.mjs --verify-local --data-root <controlled-absolute-Witness_Tree-data-path>",
    writesData: false,
    requiresTransformationAdmission: true,
    requiresIngestionDecision: true,
    requiredBeforeReady: [
      "Create a new checksum-bound output that preserves the exact approved source schema or obtain an explicit field mapping decision.",
      "Re-run feature, geometry, duplicate, closed-join, checksum, and exact ordered schema validation.",
      "Obtain separate transformation admission and ingestion decisions.",
    ],
  });
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
    decisions: read(root, "data/phase1-remote-source-admission-decisions.json"),
    queue: read(root, "data/phase1-owner-decision-queue.json"),
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
