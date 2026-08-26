import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
const SHA = /^[a-f0-9]{64}$/;
const ids = ["10", "11", "12", "13", "24", "35", "46", "47", "48", "59", "60", "61", "62"];
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, `${label} drifted.`);

export function validatePhase2OwnerAdmissionPacket(packet, raster, aggregate, method, contract, zonalContract) {
  exact(Object.keys(packet).sort(), ["decisionId", "exactBindings", "formalGateAssessment", "ownerCopyPaste", "permittedClaimsAfterSeparateAdmission", "prohibitedClaimsEvenAfterSeparateAdmission", "purpose", "requestedDecision", "schemaVersion", "status"].sort(), "packet keys");
  assert.equal(packet.schemaVersion, "witness-tree/phase2-owner-admission-packet/1");
  assert.equal(packet.status, "template-not-approved");
  assert.equal(packet.decisionId, "phase2-v21-21-raster-and-2020-2022-province-aggregate-admission-v1");
  assert.match(packet.purpose, /not an approval, admission, release, publication, or production/i);
  exact(packet.requestedDecision.ownerMayChoose, ["approve", "reject", "defer"], "owner choices");
  assert.match(packet.requestedDecision.approvalScope, /does not admit raw source inputs/i);
  assert.match(packet.requestedDecision.futureRecordRule, /new immutable admission record/i);

  const b = packet.exactBindings;
  exact(b.rasterReadback, { path: "data/phase2-v21-raster-readback-evidence.json", sha256: hash("data/phase2-v21-raster-readback-evidence.json"), batchId: raster.batchId, lineageSha256: raster.lineage.sha256, outputCount: 21, artifactCount: 42, checksumBinding: "The bound readback record enumerates the relative path, byte length, and SHA-256 for every one of the 21 rasters and 21 sidecars." }, "raster readback binding");
  exact(b.rasterMethod, { contractPath: "data/phase2-v21-raster-contract.json", contractSha256: hash("data/phase2-v21-raster-contract.json"), gridId: contract.gridRequirement.gridId, rasterReprojection: contract.gridRequirement.rasterReprojection, nodataValue: contract.gridRequirement.nodataValue, snapshotYears: contract.snapshotYears, intervalCount: contract.intervals.length, unknownPolicy: "retain-nodata-never-convert-to-zero" }, "raster method binding");
  exact(b.methodParameters, { path: "data/phase2-method-parameters.json", sha256: hash("data/phase2-method-parameters.json"), methodVersion: method.methodVersion, parameterSha256: method.parameterSha256, matching: method.parameters.matching, precedence: method.parameters.precedence, aggregation: method.parameters.aggregation, boundary: method.parameters.boundary }, "method parameter binding");
  const aggregateBinding = b.provinceAggregate;
  exact({ evidencePath: aggregateBinding.evidencePath, evidenceSha256: aggregateBinding.evidenceSha256, zonalContractPath: aggregateBinding.zonalContractPath, zonalContractSha256: aggregateBinding.zonalContractSha256, output: aggregateBinding.output, sidecar: aggregateBinding.sidecar, timeVersion: aggregateBinding.timeVersion, boundary: aggregateBinding.boundary, featureCount: aggregateBinding.featureCount, boundaryIds: aggregateBinding.boundaryIds, nationalPerCellGeometryMaterialized: aggregateBinding.nationalPerCellGeometryMaterialized }, { evidencePath: "data/phase2-v21-province-zonal-pilot-evidence.json", evidenceSha256: hash("data/phase2-v21-province-zonal-pilot-evidence.json"), zonalContractPath: "data/phase2-zonal-aggregation-contract.json", zonalContractSha256: hash("data/phase2-zonal-aggregation-contract.json"), output: aggregate.artifacts.output, sidecar: aggregate.artifacts.sidecar, timeVersion: aggregate.inputBindings.timeVersion, boundary: aggregate.inputBindings.boundary, featureCount: aggregate.result.featureCount, boundaryIds: ids, nationalPerCellGeometryMaterialized: false }, "province aggregate binding");
  assert.equal(zonalContract.claims.admittedNationalBoundaryAggregatesExist, false);
  assert.equal(raster.outputs.length, b.rasterReadback.outputCount);
  for (const row of raster.outputs) for (const artifact of [row.raster, row.sidecar]) assert.match(artifact.sha256, SHA);

  assert.deepEqual(packet.permittedClaimsAfterSeparateAdmission, ["The exact V2.1 21-output local batch is admitted for the bound scope.", "The exact 13-row 2020-2022 aggregate is admitted for the bound boundary edition and method.", "The aggregate is not national per-cell geometry."]);
  assert.ok(packet.prohibitedClaimsEvenAfterSeparateAdmission.includes("release, public availability, or production eligibility"));
  assert.ok(packet.prohibitedClaimsEvenAfterSeparateAdmission.includes("expert review completed"));
  exact(packet.formalGateAssessment.beforeOwnerDecision, { gate1AdmittedV21Baseline: false, gate4AdmittedBoundaryAggregates: false }, "pre-decision gates");
  exact(packet.formalGateAssessment.afterApprovalOnly, { gate1AdmittedV21Baseline: false, gate4AdmittedBoundaryAggregates: false }, "approval-only gates");
  assert.match(packet.formalGateAssessment.remainingTechnicalPrerequisite, /separate fail-closed admission-record validator.*source-input admission evidence/i);
  assert.match(packet.formalGateAssessment.honestConclusion, /Owner approval alone cannot truthfully complete gate 1 or gate 4/i);
  assert.match(packet.ownerCopyPaste, /decision=<OWNER: approve\|reject\|defer>/);
  assert.match(packet.ownerCopyPaste, /NO_RELEASE_OR_PRODUCTION_ADMISSION=true/);
  return packet;
}

export function checkPhase2OwnerAdmissionPacket() {
  return validatePhase2OwnerAdmissionPacket(read("data/phase2-owner-admission-packet.json"), read("data/phase2-v21-raster-readback-evidence.json"), read("data/phase2-v21-province-zonal-pilot-evidence.json"), read("data/phase2-method-parameters.json"), read("data/phase2-v21-raster-contract.json"), read("data/phase2-zonal-aggregation-contract.json"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkPhase2OwnerAdmissionPacket();
  console.log("Phase 2 owner admission packet is exact, fail-closed, and not approved.");
}
