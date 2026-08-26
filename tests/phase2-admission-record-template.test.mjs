import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase2AdmissionRecordTemplate, validateRecordedPhase2AdmissionRecord } from "../scripts/check-phase2-admission-record-template.mjs";
import { createHash } from "node:crypto";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const inputs = () => [read("data/phase2-admission-record.template.json"), read("data/phase2-owner-admission-packet.json"), read("data/phase2-v21-raster-readback-evidence.json"), read("data/phase2-v21-province-zonal-pilot-evidence.json"), read("data/phase2-method-parameters.json"), read("data/boundary-editions.json"), read("data/vlce2-remote-promotion-evidence.json")];

test("Phase 2 admission-record template is exact and non-admitting", () => {
  const args = inputs();
  assert.equal(validatePhase2AdmissionRecordTemplate(...args), args[0]);
});

test("template rejects decision, packet, source-input, output-count, and formal-gate drift", () => {
  for (const mutate of [
    ([template]) => { template.status = "approved"; },
    ([template]) => { template.ownerDecisionRequired.mustBindPacket.sha256 = "a".repeat(64); },
    ([template]) => { template.requiredSourceInputAdmissionRecords.pop(); },
    ([template]) => { template.requiredEvidenceBindings.rasterReadback.outputs = 20; },
    ([template]) => { template.formalGateAssessment.gate1AdmittedV21Baseline = true; },
    ([template]) => { template.claims.productionEligible = true; },
    ([, , raster]) => { raster.outputs.pop(); }
  ]) {
    const args = structuredClone(inputs());
    mutate(args);
    assert.throws(() => validatePhase2AdmissionRecordTemplate(...args));
  }
});

test("future admission validator requires all source records and all 42 artifacts", () => {
  const [template, , raster] = inputs();
  const sources = new Map();
  const sourceBytes = new Map();
  const canonicalPaths = {
    "vlce2-annual-land-cover-1984-2022": "data/phase2-source-input-admission-vlce2-1984-2022.json",
    "statcan-2021-provinces-territories-cbf": "data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json",
  };
  const bindings = template.requiredSourceInputAdmissionRecords.map((requirement) => {
    const path = canonicalPaths[requirement.id];
    const source = { evidenceToBind: requirement.evidenceToBind, ownerDecision: { decision: "approve", scope: requirement.whatMustBeAdmitted }, claims: { sourceInputAdmitted: true, released: false, productionEligible: false } };
    const bytes = Buffer.from(JSON.stringify(source));
    sources.set(path, source); sourceBytes.set(path, bytes);
    return { id: requirement.id, path, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const record = {
    schemaVersion: template.schemaVersion, status: "recorded-admission",
    ownerDecision: { decisionId: template.ownerDecisionRequired.decisionId, decision: "approve", packet: template.ownerDecisionRequired.mustBindPacket, acknowledgements: template.ownerDecisionRequired.requiredAcknowledgements },
    sourceInputAdmissionRecords: bindings, evidenceBindings: template.requiredEvidenceBindings,
    artifactBindings: raster.outputs.flatMap((output) => [{ kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "raster", ...output.raster }, { kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "sidecar", ...output.sidecar }]),
    claims: { admitted: true, released: false, productionEligible: false, formalGate1Complete: true, formalGate4Complete: true }
  };
  const readSourceBytes = (path) => sourceBytes.get(path);
  assert.equal(validateRecordedPhase2AdmissionRecord(record, template, raster, sources, readSourceBytes), record);
  for (const mutate of [(value) => value.artifactBindings.pop(), (value) => value.sourceInputAdmissionRecords.pop(), (value) => { value.claims.productionEligible = true; }]) {
    const copy = structuredClone(record); mutate(copy); assert.throws(() => validateRecordedPhase2AdmissionRecord(copy, template, raster, sources, readSourceBytes));
  }
  const externalPath = structuredClone(record); externalPath.sourceInputAdmissionRecords[0].path = "/tmp/self-asserted-admission.json";
  assert.throws(() => validateRecordedPhase2AdmissionRecord(externalPath, template, raster, sources, readSourceBytes), /not canonical/);
});
