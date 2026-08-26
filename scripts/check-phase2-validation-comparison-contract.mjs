import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const PROVINCES = ["BC", "AB", "ON", "QC"];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function syntheticCandidateId(province, stratum, index) {
  return `synthetic-${province}-${stratum}-${String(index).padStart(3, "0")}`;
}

function selectedSyntheticIds(seed, province, strata, candidateCount, take) {
  return strata.flatMap((stratum) => Array.from({ length: candidateCount }, (_, index) => syntheticCandidateId(province, stratum, index + 1))
    .map((id) => ({ id, rank: digest(`${seed}:${id}`) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.id.localeCompare(b.id))
    .slice(0, take)
    .map(({ id }) => id)).sort();
}

export function validatePhase2ValidationComparisonContract(record) {
  assert.equal(record?.schemaVersion, "witness-tree/phase2-validation-comparison-contract/1");
  assert.equal(record?.status, "synthetic-illustrative-framework-no-validation-results");
  assert.equal(record?.claims?.productionEligible, false);
  assert.equal(record?.claims?.validationResultsExist, false);
  assert.equal(record?.claims?.productAccuracyClaim, false);
  assert.equal(record?.claims?.externalAction, false);

  const plan = record.samplePlan;
  assert.equal(plan?.fixtureStatus, "synthetic-illustrative-nonproduction");
  assert.equal(plan?.fixedSeed, "witness-tree-phase2-validation-v1");
  assert.equal(plan?.locationsPerProvince, 100);
  assert.equal(plan?.locationsPerStratum, 25);
  assert.equal(plan?.candidateCountPerStratum, 125);
  assert.deepEqual(plan?.strata, ["1984-2002-attributed", "1984-2002-unattributed", "2003-2022-attributed", "2003-2022-unattributed"]);
  assert.equal(plan?.selectionEvidence?.algorithm, "sha256-rank-v1");
  assert.equal(plan?.selectionEvidence?.candidateIdPattern, "synthetic-{province}-{stratum}-{001..125}");
  assert.equal(plan?.expertReview?.status, "not-started");
  assert.equal(plan?.expertReview?.resultClaims, "none");
  for (const province of PROVINCES) {
    assert.equal(plan.expertReview.completedLocationsByProvince?.[province], 0);
    const selected = selectedSyntheticIds(plan.fixedSeed, province, plan.strata, plan.candidateCountPerStratum, plan.locationsPerStratum);
    assert.equal(selected.length, 100);
    assert.equal(plan.selectionEvidence.selectedIdsSha256ByProvince?.[province], digest(JSON.stringify(selected)));
  }

  assert.equal(record.harvestComparisons.length, 4);
  assert.deepEqual(record.harvestComparisons.map((row) => row.province).sort(), [...PROVINCES].sort());
  for (const row of record.harvestComparisons) {
    assert.equal(row.status, "pending");
    assert.equal(row.publication, "published");
    assert.equal(row.witnessTreeHectares, null);
    assert.equal(row.provincialPublishedHectares, null);
    assert.equal(row.absoluteDifferenceHectares, null);
    assert.equal(row.relativeDifference, null);
    assert.ok(row.explanation?.en?.trim() && row.explanation?.fr?.trim());
  }
  assert.equal(record.nbacComparisons.length, 1);
  const nbac = record.nbacComparisons[0];
  assert.equal(nbac.status, "pending");
  assert.equal(nbac.publication, "published");
  assert.equal(nbac.witnessTreeHectares, null);
  assert.equal(nbac.nbacHectares, null);
  assert.equal(nbac.absoluteDifferenceHectares, null);
  assert.equal(nbac.relativeDifference, null);
  assert.ok(nbac.explanation?.en?.trim() && nbac.explanation?.fr?.trim());

  assert.equal(record.ntemsHansenCrossCheck?.role, "independent-cross-check-not-source");
  assert.equal(record.ntemsHansenCrossCheck?.status, "not-started");
  assert.equal(record.ntemsHansenCrossCheck?.resultClaims, "none");
  assert.equal(record.ntemsHansenCrossCheck?.productionEligible, false);
  assert.equal(record.sourceReportedAccuracy?.role, "source-reported-context-not-product-accuracy");
  assert.equal(record.sourceReportedAccuracy?.witnessTreeProductAccuracyClaim, false);
  return record;
}

export async function readPhase2ValidationComparisonContract(file = new URL("../data/phase2-validation-comparison-contract.json", import.meta.url)) {
  return validatePhase2ValidationComparisonContract(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await readPhase2ValidationComparisonContract();
  console.log(JSON.stringify({ status: record.status, sampleLocations: record.samplePlan.locationsPerProvince * PROVINCES.length, validationResultsExist: false, productionEligible: false }));
}
