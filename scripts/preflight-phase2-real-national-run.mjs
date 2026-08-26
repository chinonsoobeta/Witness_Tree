import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, stat, statfs } from "node:fs/promises";
import { totalmem } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

import { validatePhase2RealDataOwnerDecision } from "./check-phase2-real-data-owner-decision.mjs";

const GIB = 1024 ** 3;

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifiedFile(id, file, byteLength, sha256) {
  const link = await lstat(file);
  assert.equal(link.isSymbolicLink(), false, `${id} must not be a symbolic link.`);
  const observed = await stat(file);
  assert.equal(observed.isFile(), true, `${id} must be a regular file.`);
  assert.equal(observed.size, byteLength, `${id} byte length changed.`);
  assert.equal(await sha256File(file), sha256, `${id} SHA-256 changed.`);
  return { id, fileName: basename(file), byteLength, sha256 };
}

export function preflightEvidenceCore(preflight) {
  return {
    status: preflight.status,
    decision: preflight.decision,
    sourceVerification: preflight.sourceVerification,
    approvedCaps: {
      approvedRamCapBytes: preflight.capacity.approvedRamCapBytes,
      approvedLocalDiskCapBytes: preflight.capacity.approvedLocalDiskCapBytes,
      vCpuCap: preflight.capacity.vCpuCap,
      elapsedHourCap: preflight.capacity.elapsedHourCap,
      concurrentYearPairCap: preflight.capacity.concurrentYearPairCap,
    },
    executable: preflight.executable,
    blockers: preflight.blockers,
  };
}

export function preflightEvidenceSha256(preflight) {
  return createHash("sha256").update(`${JSON.stringify(preflightEvidenceCore(preflight))}\n`).digest("hex");
}

export async function sourceBackedPhase2RealNationalPreflight(dataRoot, capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
  if (!isAbsolute(dataRoot) || basename(dataRoot) !== "Witness_Tree-data") throw new Error("Preflight requires the absolute local Witness_Tree-data directory.");
  const decision = validatePhase2RealDataOwnerDecision(await json(new URL("../data/phase2-real-data-owner-decision.json", import.meta.url)), { requireApproval: true });
  const [preparation, harvest, wildfire, grid, method] = await Promise.all([
    json(new URL("../data/vlce2-promotion-preparation.json", import.meta.url)),
    json(new URL("../data/nrcan-harvest-profile.json", import.meta.url)),
    json(new URL("../data/nrcan-wildfire-profile.json", import.meta.url)),
    json(new URL("../data/raster-grid.json", import.meta.url)),
    json(new URL("../data/phase2-method-parameters.json", import.meta.url)),
  ]);
  assert.deepEqual(preparation.entries.map((entry) => entry.year), Array.from({ length: 39 }, (_, index) => 1984 + index));

  const verifiedInputs = [];
  for (const entry of preparation.entries) {
    verifiedInputs.push(await verifiedFile(
      `vlce2-${entry.year}`,
      join(dataRoot, "raw/nrcan-annual-land-cover-v2/2026-08-12", entry.originalFilename),
      entry.byteLength,
      entry.sha256,
    ));
  }
  verifiedInputs.push(await verifiedFile(
    "nrcan-harvest-1985-2022",
    join(dataRoot, "raw/nrcan-ca-forest-harvest-1985-2022/2026-08-14", basename(harvest.raw.localPath)),
    harvest.raw.byteLength,
    harvest.raw.sha256,
  ));
  verifiedInputs.push(await verifiedFile(
    "nrcan-wildfire-1985-2022",
    join(dataRoot, "raw/nrcan-ca-forest-wildfire-1985-2022/2026-08-14", basename(wildfire.raw.localPath)),
    wildfire.raw.byteLength,
    wildfire.raw.sha256,
  ));
  const inputSetSha256 = createHash("sha256").update(JSON.stringify(verifiedInputs)).digest("hex");

  const disk = await statfs(resolve("."));
  const availableBytes = disk.bavail * disk.bsize;
  const configuredCapBytes = decision.computePlan.proposedHardCaps.localTemporaryAndDerivedGiB * GIB;
  const uncompressedMaskBytes = decision.computePlan.scaleBounds.bytePerCellAnnualMasksBeforeCompression;
  const storage = await json(new URL("../data/phase2-real-raster-storage-plan.json", import.meta.url));
  const adapter = await readFile(new URL("./phase2_raster_window.py", import.meta.url), "utf8");
  const runner = await readFile(new URL("./run-phase2-real-national-rasters.mjs", import.meta.url), "utf8");
  const methodRealDataReady = method.reviewStatus === "owner-approved-versioned-nonproduction" && method.parameters.mask.forestClassCrosswalkStatus === "owner-approved-versioned-nonproduction";
  const blockers = [];
  if (!methodRealDataReady) blockers.push({ id: "method-not-real-data-approved" });
  if (!adapter.includes('choices=["mask", "loss", "pair"]')) blockers.push({ id: "no-windowed-geotiff-adapter" });
  if (!runner.includes('"recorded-harvest"') || !runner.includes('"wildfire"')) blockers.push({ id: "no-real-disturbance-raster-adapter" });
  if (!storage.bound.passes || availableBytes < storage.bound.retainedOutputBoundBytes + storage.bound.minimumSafetyMarginBytes || storage.bound.retainedOutputBoundBytes > configuredCapBytes) blockers.push({ id: "insufficient-local-output-headroom" });
  return {
    schemaVersion: "witness-tree/phase2-real-national-preflight/1",
    status: blockers.length === 0 ? "ready-for-bounded-nonproduction-execution" : "blocked-before-execution",
    capturedAt,
    decision: {
      ownerName: decision.ownerDecision.ownerName,
      recordedAt: decision.ownerDecision.recordedAt,
      forestClassValues: [210, 220, 230],
      productionEligible: false,
      externalComputeOrStorageAuthorized: false,
    },
    sourceVerification: {
      mode: "local-source-backed-full-byte-sha256",
      verifiedInputCount: verifiedInputs.length,
      totalVerifiedBytes: verifiedInputs.reduce((total, input) => total + input.byteLength, 0),
      inputSetSha256,
      inputs: verifiedInputs,
    },
    capacity: {
      hostMemoryBytes: totalmem(),
      approvedRamCapBytes: decision.computePlan.proposedHardCaps.ramGiB * GIB,
      availableLocalDiskBytes: availableBytes,
      approvedLocalDiskCapBytes: configuredCapBytes,
      uncompressedAnnualMaskScaleBytes: uncompressedMaskBytes,
      vCpuCap: decision.computePlan.proposedHardCaps.vCpu,
      elapsedHourCap: decision.computePlan.proposedHardCaps.elapsedHours,
      concurrentYearPairCap: decision.computePlan.proposedHardCaps.concurrentYearPairs,
    },
    executable: {
      methodVersion: method.methodVersion,
      methodParameterSha256: method.parameterSha256,
      methodReviewStatus: method.reviewStatus,
      forestClassCrosswalkStatus: method.parameters.mask.forestClassCrosswalkStatus,
      gridYears: grid.temporalCoverage.yearCount,
      windowedGeoTiffAdapter: true,
      realBoundaryCrosswalk: false,
      realDisturbanceRasterAdapter: true,
    },
    blockers,
    claims: {
      realExecutionStarted: false,
      transformed: false,
      ingested: false,
      released: false,
      productionEligible: false,
      externalAction: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dataRoot = process.argv[2];
  if (!dataRoot) throw new Error("Usage: preflight-phase2-real-national-run <absolute-Witness_Tree-data-directory>");
  console.log(JSON.stringify(await sourceBackedPhase2RealNationalPreflight(resolve(dataRoot)), null, 2));
}
