import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SCHEMA = "witness-tree/phase2-real-data-owner-decision/1";
const GEOGRAPHIES = ["province", "watershed", "forest-district", "municipality", "provincial-riding", "federal-riding", "reserve", "treaty-area"];
const FOREST_OPTIONS = ["conservative-treed-upland-v1", "include-treed-wetland-v1"];
const BOUNDARY_OPTIONS = {
  provinceBoundaryDecision: ["accept-statcan-2021", "defer"],
  municipalityBoundaryDecision: ["accept-statcan-2021-csd", "defer"],
  federalRidingBoundaryDecision: ["accept-elections-canada-2025-2023-order", "defer"],
};

export function validatePhase2RealDataOwnerDecision(record, { requireApproval = false } = {}) {
  assert.equal(record.schemaVersion, SCHEMA);
  assert.equal(record.derivedFromHead, "a651924250dfd224262df61633e603712012f0cb");
  assert.match(record.notice, /no execution until.*gates pass.*never authorizes production use.*external compute\/storage/i);
  assert.deepEqual(record.maturity, {
    phase: 2,
    fixedRubricPercentBefore: 43,
    fixedRubricPercentAfter: 43,
    deltaPercentagePoints: 0,
    reason: "Decision and preflight evidence does not implement or validate a real-data transform.",
  });
  assert.deepEqual(record.forestDefinition.options.map((option) => option.forestClassValues), [[210, 220, 230], [81, 210, 220, 230]]);
  assert.deepEqual(record.forestDefinition.options.map((option) => option.unknownClassValues), [[0, 255], [0, 255]]);
  assert.match(record.forestDefinition.evidenceLimit, /class 81.*does not determine whether/i);
  assert.deepEqual(record.disturbanceSources.map((source) => source.inputSha256), [
    "c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad",
    "725f3b582c87cb7c6f3fd397a523fba6621718ac59c68dc904cd1d849a9160c9",
  ]);
  assert.deepEqual(record.boundaries.geographyTypes.map((item) => item.type), GEOGRAPHIES);
  assert.equal(new Set(record.boundaries.geographyTypes.map((item) => item.type)).size, 8);
  assert.equal(record.boundaries.allEightReady, false);
  for (const type of ["watershed", "forest-district", "provincial-riding", "reserve", "treaty-area"]) {
    assert.match(record.boundaries.geographyTypes.find((item) => item.type === type)?.state ?? "", /^blocked-/);
  }
  assert.equal(record.computePlan.inputYears.count, 39);
  assert.equal(record.computePlan.grid.cellYears, 970700103360);
  assert.equal(record.computePlan.grid.transitionCellPairs, 945810357120);
  assert.deepEqual(record.computePlan.proposedHardCaps, { vCpu: 8, ramGiB: 16, localTemporaryAndDerivedGiB: 2048, elapsedHours: 96, concurrentYearPairs: 1 });
  assert.match(record.computePlan.capTradeoff, /abort/i);
  assert.equal(record.claims.realTransformationRun, false);
  assert.equal(record.claims.allEightBoundaryEditionsReady, false);
  assert.equal(record.claims.productionEligible, false);

  const decision = record.ownerDecision;
  if (decision.status === "pending") {
    for (const [key, value] of Object.entries(decision)) if (key !== "status") assert.equal(value, null, `Pending decision field ${key} must remain null.`);
    assert.equal(record.status, "owner-decision-required");
    assert.equal(record.claims.approvalRecorded, false);
    if (requireApproval) throw new Error("Exact owner approval has not been recorded.");
    return record;
  }

  assert.equal(decision.status, "approved-for-versioned-nonproduction-processing");
  assert.equal(record.status, "owner-decision-recorded");
  assert.equal(record.claims.approvalRecorded, true);
  assert.ok(typeof decision.ownerName === "string" && decision.ownerName.trim(), "Owner name is required.");
  assert.match(decision.recordedAt ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(new Date(decision.recordedAt).toISOString().replace(".000Z", "Z"), decision.recordedAt, "Recorded time must be a real canonical UTC timestamp.");
  assert.ok(FOREST_OPTIONS.includes(decision.forestCrosswalkOption), "A listed forest crosswalk option is required.");
  for (const key of ["approveExactHarvestScope", "approveExactWildfireScope", "approveComputeCaps", "approveNationalMaskAndChangeNonProductionRun", "acknowledgeAllEightAggregatesRemainBlocked", "acknowledgeNonProductionOutputs", "acknowledgeNoExternalActionOrRelease"]) {
    assert.equal(decision[key], true, `${key} must be explicitly true.`);
  }
  for (const [key, options] of Object.entries(BOUNDARY_OPTIONS)) {
    assert.ok(options.includes(decision[key]), `${key} must select an evidenced edition or defer. Add and validate new exact-edition evidence before selecting another source.`);
  }
  return record;
}

export async function checkPhase2RealDataOwnerDecision(file = new URL("../data/phase2-real-data-owner-decision.json", import.meta.url), options) {
  return validatePhase2RealDataOwnerDecision(JSON.parse(await readFile(file, "utf8")), options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkPhase2RealDataOwnerDecision();
  console.log("Phase 2 real-data owner decision package passed its fail-closed preflight checks.");
}
