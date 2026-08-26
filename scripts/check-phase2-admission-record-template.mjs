import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, `${label} drifted.`);
const SHA = /^[a-f0-9]{64}$/;
const SOURCE_RECORD_PATHS = new Map([
  ["vlce2-annual-land-cover-1984-2022", "data/phase2-source-input-admission-vlce2-1984-2022.json"],
  ["statcan-2021-provinces-territories-cbf", "data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json"],
]);

export function validatePhase2AdmissionRecordTemplate(template, packet, raster, aggregate, method, boundary, vlce2) {
  exact(Object.keys(template).sort(), ["claims", "formalGateAssessment", "futureRecordLocationRule", "futureRecordRequirements", "ownerDecisionRequired", "purpose", "requiredEvidenceBindings", "requiredSourceInputAdmissionRecords", "schemaVersion", "status"].sort(), "template keys");
  assert.equal(template.schemaVersion, "witness-tree/phase2-admission-record/1");
  assert.equal(template.status, "template-no-owner-decision-recorded");
  assert.match(template.purpose, /not a decision, admission, release, publication, or production/i);
  assert.match(template.futureRecordLocationRule, /new immutable record/i);
  exact(template.ownerDecisionRequired, { decisionId: packet.decisionId, allowedDecision: "approve", mustBindPacket: { path: "data/phase2-owner-admission-packet.json", sha256: hash("data/phase2-owner-admission-packet.json") }, requiredAcknowledgements: ["exact-bindings-reviewed", "method-and-claim-limits-reviewed", "no-release-or-production-admission"] }, "owner decision requirement");
  exact(template.requiredSourceInputAdmissionRecords, [
    { id: "vlce2-annual-land-cover-1984-2022", whatMustBeAdmitted: "All 39 exact annual VLCE2 source archives used by the 21 raster outputs.", evidenceToBind: { path: "data/vlce2-remote-promotion-evidence.json", sha256: hash("data/vlce2-remote-promotion-evidence.json"), sourceId: vlce2.source.id, entryCount: 39, years: [1984, 2022] }, requiredFutureRecordFields: ["immutable-record-path", "immutable-record-sha256", "owner-source-admission-decision", "all-39-versioned-artifacts"] },
    { id: "statcan-2021-provinces-territories-cbf", whatMustBeAdmitted: "The exact 2021 Census Province/Territory Cartographic Boundary File used by the 13-row aggregate.", evidenceToBind: { path: "data/boundary-editions.json", sha256: hash("data/boundary-editions.json"), editionId: "statcan-2021-provinces-territories-cbf", artifactSha256: aggregate.inputBindings.boundary.sha256, featureCount: 13 }, requiredFutureRecordFields: ["immutable-record-path", "immutable-record-sha256", "owner-source-admission-decision", "edition-qualified-boundary-artifact"] }
  ], "source admission record requirements");
  exact(template.requiredEvidenceBindings, {
    rasterReadback: { path: "data/phase2-v21-raster-readback-evidence.json", sha256: hash("data/phase2-v21-raster-readback-evidence.json"), outputs: raster.counts.outputs, artifacts: 42 },
    methodParameters: { path: "data/phase2-method-parameters.json", sha256: hash("data/phase2-method-parameters.json") },
    zonalAggregate: { path: "data/phase2-v21-province-zonal-pilot-evidence.json", sha256: hash("data/phase2-v21-province-zonal-pilot-evidence.json"), timeVersion: aggregate.inputBindings.timeVersion, featureCount: aggregate.result.featureCount }
  }, "evidence bindings");
  assert.equal(raster.outputs.length, 21);
  assert.equal(raster.outputs.flatMap((output) => [output.raster, output.sidecar]).length, 42);
  assert.match(template.futureRecordRequirements[0], /21 raster outputs and 21 sidecars/i);
  assert.match(template.futureRecordRequirements[2], /every named source-input admission record exists/i);
  exact(template.formalGateAssessment, { gate1AdmittedV21Baseline: false, gate4AdmittedBoundaryAggregates: false, reason: "No owner decision or source-input admission records have been recorded." }, "formal gates");
  exact(template.claims, { admitted: false, released: false, productionEligible: false, formalGate1Complete: false, formalGate4Complete: false }, "claims");
  assert.equal(method.methodVersion, packet.exactBindings.methodParameters.methodVersion);
  assert.equal(boundary.editions.find((edition) => edition.id === "statcan-2021-provinces-territories-cbf").sha256, aggregate.inputBindings.boundary.sha256);
  return template;
}

export function checkPhase2AdmissionRecordTemplate() {
  return validatePhase2AdmissionRecordTemplate(read("data/phase2-admission-record.template.json"), read("data/phase2-owner-admission-packet.json"), read("data/phase2-v21-raster-readback-evidence.json"), read("data/phase2-v21-province-zonal-pilot-evidence.json"), read("data/phase2-method-parameters.json"), read("data/boundary-editions.json"), read("data/vlce2-remote-promotion-evidence.json"));
}

// This validator is intentionally not run against the template. It is the schema
// for the later separate record, and requires the caller to supply the two
// checksum-verified source-admission records named by that record.
export function validateRecordedPhase2AdmissionRecord(
  record,
  template,
  raster,
  sourceAdmissionRecords,
  readSourceBytes = (path) => readFileSync(new URL(path, root)),
) {
  exact(Object.keys(record).sort(), ["artifactBindings", "claims", "evidenceBindings", "ownerDecision", "schemaVersion", "sourceInputAdmissionRecords", "status"].sort(), "record keys");
  assert.equal(record.schemaVersion, template.schemaVersion);
  assert.equal(record.status, "recorded-admission");
  exact(record.ownerDecision, { decisionId: template.ownerDecisionRequired.decisionId, decision: "approve", packet: template.ownerDecisionRequired.mustBindPacket, acknowledgements: template.ownerDecisionRequired.requiredAcknowledgements }, "owner decision");
  exact(record.evidenceBindings, template.requiredEvidenceBindings, "method and aggregate evidence");
  const artifacts = raster.outputs.flatMap((output) => [
    { kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "raster", ...output.raster },
    { kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "sidecar", ...output.sidecar }
  ]);
  exact(record.artifactBindings, artifacts, "all 21 output and 21 sidecar bindings");
  assert.equal(record.sourceInputAdmissionRecords.length, template.requiredSourceInputAdmissionRecords.length);
  for (const requirement of template.requiredSourceInputAdmissionRecords) {
    const binding = record.sourceInputAdmissionRecords.find((entry) => entry.id === requirement.id);
    assert.ok(binding, `Missing source-input admission record: ${requirement.id}`);
    exact(Object.keys(binding).sort(), ["id", "path", "sha256"], `source binding ${requirement.id} keys`);
    assert.equal(binding.path, SOURCE_RECORD_PATHS.get(requirement.id), `Source admission record path is not canonical: ${requirement.id}`);
    assert.match(binding.sha256, SHA);
    const sourceRecord = sourceAdmissionRecords.get(binding.path);
    assert.ok(sourceRecord, `Source admission record is unavailable: ${binding.path}`);
    assert.equal(createHash("sha256").update(readSourceBytes(binding.path)).digest("hex"), binding.sha256, `Source admission record checksum drifted: ${binding.path}`);
    exact(sourceRecord.evidenceToBind, requirement.evidenceToBind, `source evidence ${requirement.id}`);
    exact(sourceRecord.ownerDecision, { decision: "approve", scope: requirement.whatMustBeAdmitted }, `source decision ${requirement.id}`);
    exact(sourceRecord.claims, { sourceInputAdmitted: true, released: false, productionEligible: false }, `source claims ${requirement.id}`);
  }
  exact(record.claims, { admitted: true, released: false, productionEligible: false, formalGate1Complete: true, formalGate4Complete: true }, "admission claims");
  return record;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPhase2AdmissionRecordTemplate();
  console.log("Phase 2 admission-record template is exact, source-input-explicit, and fail-closed.");
}
