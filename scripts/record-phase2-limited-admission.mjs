import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateRecordedPhase2AdmissionRecord } from "./check-phase2-admission-record-template.mjs";

const root = new URL("../", import.meta.url);
const readBytes = (path) => readFileSync(new URL(path, root));
const read = (path) => JSON.parse(readBytes(path));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const outputPath = new URL("../data/phase2-admission-record-2026-08-26.json", import.meta.url);
const template = read("data/phase2-admission-record.template.json");
const raster = read("data/phase2-v21-raster-readback-evidence.json");
const sourcePaths = [
  "data/phase2-source-input-admission-vlce2-1984-2022.json",
  "data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json",
];
const sourceRecords = new Map(sourcePaths.map((path) => [path, read(path)]));
const sourceInputAdmissionRecords = template.requiredSourceInputAdmissionRecords.map((requirement) => {
  const path = sourcePaths.find((candidate) => sourceRecords.get(candidate).evidenceToBind.path === requirement.evidenceToBind.path);
  if (!path) throw new Error(`No source admission record matches ${requirement.id}.`);
  return { id: requirement.id, path, sha256: sha256(readBytes(path)) };
});
const artifactBindings = raster.outputs.flatMap((output) => [
  { kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "raster", ...output.raster },
  { kind: output.kind, year: output.year ?? null, fromYear: output.fromYear ?? null, toYear: output.toYear ?? null, role: "sidecar", ...output.sidecar },
]);
const record = {
  schemaVersion: template.schemaVersion,
  status: "recorded-admission",
  ownerDecision: {
    decisionId: template.ownerDecisionRequired.decisionId,
    decision: "approve",
    packet: template.ownerDecisionRequired.mustBindPacket,
    acknowledgements: template.ownerDecisionRequired.requiredAcknowledgements,
  },
  sourceInputAdmissionRecords,
  evidenceBindings: template.requiredEvidenceBindings,
  artifactBindings,
  claims: { admitted: true, released: false, productionEligible: false, formalGate1Complete: true, formalGate4Complete: true },
};

validateRecordedPhase2AdmissionRecord(record, template, raster, sourceRecords, readBytes);
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
console.log(`Recorded the exact limited Phase 2 admission at ${fileURLToPath(outputPath)}.`);
