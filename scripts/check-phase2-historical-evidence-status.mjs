import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";

const STATUS_URL = new URL("../data/phase2-historical-evidence-status.json", import.meta.url);

export function validatePhase2HistoricalEvidenceStatus(status) {
  assert.deepEqual(Object.keys(status).sort(), ["claims", "historicalRun", "purpose", "schemaVersion", "status", "v21Separation"]);
  assert.equal(status.schemaVersion, "witness-tree/phase2-historical-evidence-status/1");
  assert.equal(status.status, "historical-versioned-nonproduction");
  assert.deepEqual(Object.keys(status.historicalRun).sort(), ["batchId", "componentInventoryDirectory", "componentInventoryReadback", "componentInventorySummary", "executionEvidence", "methodVersion", "outputDirectory", "sourceMap"]);
  assert.deepEqual(status.historicalRun, {
    batchId: "phase2-real-national-1984-2022-v1",
    methodVersion: "phase2-owner-approved-versioned-nonproduction-v1",
    executionEvidence: "phase2-real-national-execution-evidence.json",
    componentInventoryReadback: "phase2-real-loss-component-inventory-readback.json",
    componentInventorySummary: "phase2-real-loss-component-inventory-summary.json",
    sourceMap: "phase2-real-loss-source-map.json",
    outputDirectory: "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/phase2-real-national-1984-2022-v1",
    componentInventoryDirectory: "/Users/chinonsoobeta/Documents/Codex/2026-08-11/go/Witness_Tree-data/derived/phase2-real-loss-component-inventory-1984-2022-v1",
  });
  assert.deepEqual(status.v21Separation, {
    selectedSnapshotCount: 11,
    wholeIntervalCount: 10,
    v21OutputRastersExist: false,
    v21RasterExecutionPerformed: false,
    historicalEvidenceMaySatisfyV21OutputGate: false,
    historicalEvidenceMaySatisfyAdmissionGate: false,
    historicalEvidenceMaySatisfyScientificValidationGate: false,
    historicalEvidenceMaySatisfyReleaseGate: false,
  });
  assert.deepEqual(status.claims, {
    released: false,
    productionEligible: false,
    productionAdmitted: false,
    externalAction: false,
  });
  return status;
}

export async function readPhase2HistoricalEvidenceStatus() {
  return validatePhase2HistoricalEvidenceStatus(JSON.parse(await readFile(STATUS_URL, "utf8")));
}

export async function checkHistoricalEvidenceAvailability(status) {
  await access(new URL(`file://${status.historicalRun.outputDirectory}/lineage.json`));
  await access(new URL(`file://${status.historicalRun.componentInventoryDirectory}/inventory.json`));
  const [historicalFiles, componentFiles] = await Promise.all([
    readdir(status.historicalRun.outputDirectory, { recursive: true }),
    readdir(new URL(`file://${status.historicalRun.componentInventoryDirectory}/components/`)),
  ]);
  assert.equal(historicalFiles.filter((path) => path.endsWith(".tif")).length, 79);
  assert.equal(componentFiles.filter((path) => path.endsWith(".components.jsonl")).length, 38);
  return { status: status.status, rasterFilesAvailable: 79, componentFilesAvailable: 38, productionEligible: false };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const status = await readPhase2HistoricalEvidenceStatus();
  console.log(JSON.stringify(await checkHistoricalEvidenceAvailability(status)));
}
