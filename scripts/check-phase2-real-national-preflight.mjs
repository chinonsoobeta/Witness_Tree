import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { validatePhase2RealDataOwnerDecision } from "./check-phase2-real-data-owner-decision.mjs";
import { preflightEvidenceSha256, sourceBackedPhase2RealNationalPreflight } from "./preflight-phase2-real-national-run.mjs";
import { resolveDataRoot } from "./data-root.mjs";


export function validatePhase2RealNationalPreflight(record, { decision, preparation, harvest, wildfire, method, grid }) {
  validatePhase2RealDataOwnerDecision(decision, { requireApproval: true });
  assert.equal(record.schemaVersion, "witness-tree/phase2-real-national-preflight/1");
  assert.equal(record.status, "ready-for-bounded-nonproduction-execution");
  assert.equal(record.decision.ownerName, decision.ownerDecision.ownerName);
  assert.equal(record.decision.recordedAt, decision.ownerDecision.recordedAt);
  assert.deepEqual(record.decision.forestClassValues, [210, 220, 230]);
  assert.equal(record.decision.productionEligible, false);
  assert.equal(record.decision.externalComputeOrStorageAuthorized, false);

  const expectedInputs = preparation.entries.map((entry) => ({ id: `vlce2-${entry.year}`, fileName: entry.originalFilename, byteLength: entry.byteLength, sha256: entry.sha256 }));
  expectedInputs.push(
    { id: "nrcan-harvest-1985-2022", fileName: harvest.raw.localPath.split("/").at(-1), byteLength: harvest.raw.byteLength, sha256: harvest.raw.sha256 },
    { id: "nrcan-wildfire-1985-2022", fileName: wildfire.raw.localPath.split("/").at(-1), byteLength: wildfire.raw.byteLength, sha256: wildfire.raw.sha256 },
  );
  assert.equal(record.sourceVerification.mode, "local-source-backed-full-byte-sha256");
  assert.equal(record.sourceVerification.verifiedInputCount, 41);
  assert.equal(record.sourceVerification.verifiedInputCount, expectedInputs.length);
  assert.equal(record.sourceVerification.totalVerifiedBytes, expectedInputs.reduce((total, entry) => total + entry.byteLength, 0));
  assert.equal(record.sourceVerification.inputSetSha256, createHash("sha256").update(JSON.stringify(expectedInputs)).digest("hex"));

  assert.equal(record.capacity.hostMemoryBytes, record.capacity.approvedRamCapBytes);
  assert.equal(record.capacity.approvedRamCapBytes, 16 * 1024 ** 3);
  assert.equal(record.capacity.approvedLocalDiskCapBytes, 2048 * 1024 ** 3);
  assert.ok(record.capacity.availableLocalDiskBytes < record.capacity.uncompressedAnnualMaskScaleBytes);
  assert.deepEqual([record.capacity.vCpuCap, record.capacity.elapsedHourCap, record.capacity.concurrentYearPairCap], [8, 96, 1]);
  assert.equal(record.executable.methodVersion, method.methodVersion);
  assert.equal(record.executable.methodParameterSha256, method.parameterSha256);
  assert.equal(record.executable.methodReviewStatus, "owner-approved-versioned-nonproduction");
  assert.equal(record.executable.forestClassCrosswalkStatus, "owner-approved-versioned-nonproduction");
  assert.equal(record.executable.gridYears, grid.temporalCoverage.yearCount);
  assert.deepEqual([record.executable.windowedGeoTiffAdapter, record.executable.realBoundaryCrosswalk, record.executable.realDisturbanceRasterAdapter], [true, false, true]);
  assert.deepEqual(record.blockers, []);
  assert.deepEqual(record.claims, { realExecutionStarted: false, transformed: false, ingested: false, released: false, productionEligible: false, externalAction: false });
  assert.deepEqual(record.maturity, {
    fixedRubricPercentBefore: 43,
    fixedRubricPercentAfter: 43,
    deltaPercentagePoints: 0,
    reason: "Owner approval and source preflight do not close a real-transform rubric item.",
  });
  return record;
}

export async function checkPhase2RealNationalPreflight() {
  const files = await Promise.all([
    "phase2-real-national-preflight.json",
    "phase2-real-data-owner-decision.json",
    "vlce2-promotion-preparation.json",
    "nrcan-harvest-profile.json",
    "nrcan-wildfire-profile.json",
    "phase2-method-parameters.json",
    "raster-grid.json",
  ].map(async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), "utf8"))));
  const record=validatePhase2RealNationalPreflight(files[0], { decision: files[1], preparation: files[2], harvest: files[3], wildfire: files[4], method: files[5], grid: files[6] });
  const generated=await sourceBackedPhase2RealNationalPreflight(resolveDataRoot());
  assert.equal(generated.status,record.status); assert.deepEqual(generated.blockers,record.blockers); assert.equal(generated.sourceVerification.inputSetSha256,record.sourceVerification.inputSetSha256); assert.equal(generated.sourceVerification.totalVerifiedBytes,record.sourceVerification.totalVerifiedBytes); assert.deepEqual(generated.executable,record.executable);
  const lineage=JSON.parse(await readFile(`${resolveDataRoot()}/derived/phase2-real-national-1984-2022-v1/lineage.json`,"utf8"));
  assert.equal(lineage.preflight.digestScope,"canonical-source-backed-preflight-core");
  assert.equal(lineage.preflight.sha256,preflightEvidenceSha256(generated));
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkPhase2RealNationalPreflight();
  console.log("Phase 2 real national source-backed execution preflight evidence passed.");
}
