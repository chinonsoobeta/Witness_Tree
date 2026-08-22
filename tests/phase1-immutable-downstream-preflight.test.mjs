import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateLocalObservation,
  validatePhase1ImmutableDownstreamPreflight,
} from "../scripts/check-phase1-immutable-downstream-preflight.mjs";

const root = new URL("../", import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, root), "utf8"));
const record = read("data/phase1-immutable-downstream-preflight.json");
const context = {
  root: new URL("..", import.meta.url).pathname,
  ledger: read("data/phase1-production-source-ledger.json"),
  decisions: read("data/phase1-remote-source-admission-decisions.json"),
  queue: read("data/phase1-owner-decision-queue.json"),
  runRecord: read(record.selectedBatch.methodContract.runRecord),
  readiness: read("data/alberta-plvi-full-release-readiness.json"),
};

test("audits all nine immutable rows and keeps the PLVI schema preflight blocked", () => {
  assert.equal(validatePhase1ImmutableDownstreamPreflight(record, context), record);
  assert.equal(record.auditedRows.length, 9);
  assert.deepEqual(record.selectedBatch.rows, ["ab-primary-land-vegetation"]);
  assert.equal(record.selectedBatch.validationGates.preflightResult, "blocked");
  assert.deepEqual(record.selectedBatch.observedOutputSchema.nameDrift, [
    { index: 57, source: "SUBMISSION_ID", output: "SUBMISSION" },
    { index: 58, source: "Shape_Length", output: "Shape_Leng" },
  ]);
  assert.equal(record.claims.rawEvidenceDelta, 0);
  assert.equal(record.claims.productionAdmission, false);
});

test("rejects output, method, schema, row-set, and downstream claim drift", () => {
  const corruptions = [
    (copy) => { copy.selectedBatch.outputContract.sha256 = "0".repeat(64); },
    (copy) => { copy.selectedBatch.methodContract.runRecordSha256 = "0".repeat(64); },
    (copy) => { copy.selectedBatch.observedOutputSchema.nameDrift = []; },
    (copy) => { copy.selectedBatch.observedOutputSchema.integerToInteger64WideningCount = 0; },
    (copy) => { copy.selectedBatch.sourceSchemaContract.relativePath = "raw/plausible.zip"; },
    (copy) => { copy.selectedBatch.sourceSchemaContract.datasetPath = "plausible.gdb"; },
    (copy) => { copy.selectedBatch.sourceSchemaContract.layer = "PlausibleLayer"; },
    (copy) => { copy.selectedBatch.sourceSchemaContract.orderedNameTypeSha256 = "1".repeat(64); },
    (copy) => { copy.selectedBatch.preflight.contractCommand = "node scripts/check-phase1-immutable-downstream-preflight.mjs"; },
    (copy) => { copy.selectedBatch.preflight.localReadOnlyCommand += " --plausible"; },
    (copy) => { copy.selectedBatch.preflight.requiredBeforeReady[0] = "Create some plausible output."; },
    (copy) => { copy.selectedBatch.validationGates.exactSchemaNameParity = true; },
    (copy) => { copy.selectedBatch.validationGates.preflightResult = "ready"; },
    (copy) => { copy.auditedRows.pop(); },
    (copy) => { copy.auditedRows[0].preparationStatus = "blocked-plausible-prefix"; },
    (copy) => { copy.auditedRows[4].reason = "Plausible but non-canonical blocker."; },
    (copy) => { copy.claims.ingestionAuthorized = true; },
    (copy) => { copy.claims.productionEligible = true; },
  ];
  for (const corrupt of corruptions) {
    const copy = structuredClone(record);
    corrupt(copy);
    assert.throws(() => validatePhase1ImmutableDownstreamPreflight(copy, context));
  }
});

test("rejects canonical ledger and owner-decision drift for every audited row", () => {
  for (const id of record.auditedRows.map(({ id }) => id)) {
    const ledgerContext = structuredClone(context);
    ledgerContext.ledger.entries.find((row) => row.id === id).blocker = "Plausible non-canonical blocker meaning.";
    assert.throws(() => validatePhase1ImmutableDownstreamPreflight(record, ledgerContext));

    const decisionContext = structuredClone(context);
    decisionContext.decisions.decisions.find((row) => row.id === id).scope = "Plausible non-canonical owner scope.";
    assert.throws(() => validatePhase1ImmutableDownstreamPreflight(record, decisionContext));

    const queueContext = structuredClone(context);
    queueContext.queue.queueRows.find((row) => row.id === id).ownerDecisionStatus.ingestion = "ready";
    assert.throws(() => validatePhase1ImmutableDownstreamPreflight(record, queueContext));
  }
});

test("rejects PLVI credit, evidence-reference, queue-decision, and readiness drift", () => {
  const mutations = [
    (copy) => { copy.ledger.entries.find((row) => row.id === "ab-primary-land-vegetation").rawCredit = 0.75; },
    (copy) => { copy.decisions.decisions.find((row) => row.id === "ab-primary-land-vegetation").evidenceRefs.pop(); },
    (copy) => { copy.queue.queueRows.find((row) => row.id === "ab-primary-land-vegetation").primaryActionId = "plvi-owner-scope-decision"; },
    (copy) => { copy.queue.queueRows.find((row) => row.id === "ab-primary-land-vegetation").exactScopeDecision = "Plausible stale scope decision."; },
    (copy) => { copy.queue.queueRows.find((row) => row.id === "ab-primary-land-vegetation").exactNextSteps.pop(); },
    (copy) => { copy.readiness.derivedOutput.attributeFieldCount = 63; },
    (copy) => { copy.readiness.ownerScope.scopeBoundValidationAuthorized = false; },
  ];
  for (const mutate of mutations) {
    const drift = structuredClone(context);
    mutate(drift);
    assert.throws(() => validatePhase1ImmutableDownstreamPreflight(record, drift));
  }
});

test("local observation contract rejects checksum, schema, and field-mapping drift", () => {
  const valid = {
    sourceArchiveByteLength: 675544895,
    sourceArchiveSha256: "017a0a835c680ca1b6c1eb790322a28e1b4c0c64e36924da46d8bb99cb1571d3",
    outputByteLength: 899551232,
    outputSha256: "5633e7d49982ee1232b415f362654744c1f1dab11d7c3c7ef8a7928dac20825b",
    outputLayer: "alberta_plvi_full_repaired",
    outputFeatureCount: 179087,
    outputCrs: "EPSG:3400",
    sourceAttributeFieldCount: 60,
    outputAttributeFieldCount: 60,
    sourceSchemaSha256: "48cfd5562b5d8efe80cc6284ecf5ad45809209513ba1a69d5e8e77d2fff6a59c",
    outputSchemaSha256: "7fe569a75dc692daa2b352c7d462d71bb7376d781ca6ef5ccf33015faa5d70db",
    nameDrift: [
      { index: 57, source: "SUBMISSION_ID", output: "SUBMISSION" },
      { index: 58, source: "Shape_Length", output: "Shape_Leng" },
    ],
    integerToInteger64WideningCount: 23,
  };
  assert.equal(validateLocalObservation(record, valid), valid);
  for (const changed of [
    { sourceArchiveSha256: "0".repeat(64) },
    { outputSha256: "0".repeat(64) },
    { sourceSchemaSha256: "0".repeat(64) },
    { outputAttributeFieldCount: 59 },
    { nameDrift: [] },
    { integerToInteger64WideningCount: 0 },
  ]) assert.throws(() => validateLocalObservation(record, { ...structuredClone(valid), ...changed }));
});
