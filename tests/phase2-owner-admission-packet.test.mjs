import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase2OwnerAdmissionPacket } from "../scripts/check-phase2-owner-admission-packet.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const inputs = () => [read("data/phase2-owner-admission-packet.json"), read("data/phase2-v21-raster-readback-evidence.json"), read("data/phase2-v21-province-zonal-pilot-evidence.json"), read("data/phase2-method-parameters.json"), read("data/phase2-v21-raster-contract.json"), read("data/phase2-zonal-aggregation-contract.json")];

test("Phase 2 owner packet is exact and deliberately non-admitting", () => {
  const args = inputs();
  assert.equal(validatePhase2OwnerAdmissionPacket(...args), args[0]);
  assert.equal(args[0].status, "template-not-approved");
});

test("packet rejects approval, binding, method, boundary, and claim drift", () => {
  for (const mutate of [
    ([packet]) => { packet.status = "approved"; },
    ([packet]) => { packet.exactBindings.rasterReadback.sha256 = "a".repeat(64); },
    ([packet]) => { packet.exactBindings.rasterMethod.nodataValue = 0; },
    ([packet]) => { packet.exactBindings.methodParameters.matching.minimumOverlapOfSmallerGeometry = 0.4; },
    ([packet]) => { packet.exactBindings.provinceAggregate.boundary.idField = "NAME"; },
    ([packet]) => { packet.exactBindings.provinceAggregate.boundaryIds.pop(); },
    ([packet]) => { packet.formalGateAssessment.afterApprovalOnly.gate1AdmittedV21Baseline = true; },
    ([packet]) => { packet.prohibitedClaimsEvenAfterSeparateAdmission = []; },
    ([, raster]) => { raster.lineage.sha256 = "b".repeat(64); },
  ]) {
    const args = structuredClone(inputs());
    mutate(args);
    assert.throws(() => validatePhase2OwnerAdmissionPacket(...args));
  }
});
