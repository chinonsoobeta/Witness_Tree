#!/usr/bin/env node
// Did the forest that was lost come back? The worker walks every mapped cell
// through 1984 to 2022 once and sorts it. This checks the record of that run.
//
// Two things about the run need holding in place. Its emitted prose says an
// unconfirmed return is counted as neither recovered nor not-recovered, and its
// arithmetic counts it as not-recovered; the arithmetic is the tested behaviour,
// so the partition asserted here is the arithmetic's, and the record has to keep
// saying that the prose was wrong. And the run reports 160 districts out of the
// 343 in the boundary edition, because it drops any district holding nothing it
// can count. That is a reporting gap, not a measurement one, and the only thing
// that establishes the difference is a separate worker's agreement, so this
// re-derives that agreement rather than repeating the claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHA256 = /^[a-f0-9]{64}$/;
const DISTRICTS_IN_EDITION = 343;
const CELL_HECTARES = 0.09;

const record = JSON.parse(
  readFileSync(resolve(repoRoot, "data/phase4-recovery-trajectory-federal-2023.json"), "utf8"),
);

assert.equal(record.schema, "witness-tree/phase4-recovery-trajectory-evidence/1");
assert.equal(record.status, "local-nonproduction-executed");
assert.equal(record.checkedBy, "scripts/check-phase4-recovery-trajectory.mjs");

// A recovery figure is the most quotable number this project produces and the
// easiest to mistake for a finding about forests rather than about tree cover.
// None of these may ever read true from this record.
for (const claim of ["admitted", "released", "productionEligible", "ownerReviewed", "netChangeIncluded", "gainProductUsed"]) {
  assert.equal(record.claims[claim], false, `claims.${claim} must be false`);
}
assert.equal(record.run.boundaryEdition, "fed-2023-representation-order");
assert.equal(record.run.cellHectares, CELL_HECTARES);
assert.equal(record.run.firstYear, 1984);
assert.equal(record.run.lastYear, 2022);
assert.ok(Array.isArray(record.notMeasured) && record.notMeasured.length >= 4,
  "the record must keep saying what it did not measure");

const national = record.national;
for (const [field, value] of Object.entries(national)) {
  assert.ok(Number.isInteger(value) && value >= 0, `national.${field} must be a non-negative count`);
}

// Unknown is never turned into zero, so the denominator has to shrink by exactly
// what was unknown rather than absorbing it.
assert.equal(national.knownCells, national.mappedCells - national.unknownCells,
  "known cells must be the mapped cells less the unknown ones");
assert.ok(national.everForestCells <= national.knownCells, "more cells were ever forest than are known");
assert.ok(national.lostCells <= national.everForestCells, "more forest was lost than ever existed");

// The partition, recomputed rather than read. Adding unconfirmed returns to
// these two is the specific arithmetic the emitted prose invites and it is wrong.
const partition = record.partition;
assert.equal(partition.statement, "recoveredCells + notRecoveredCells === lostCells");
assert.equal(partition.recoveredCells, national.recoveredCells);
assert.equal(partition.notRecoveredCells, national.notRecoveredCells);
assert.equal(partition.lostCells, national.lostCells);
assert.equal(national.recoveredCells + national.notRecoveredCells, national.lostCells,
  "recovered and not-recovered must together be exactly the lost cells");

// The finding about the emitted prose. It has to stay quantified, or it decays
// into a note nobody can act on.
const unconfirmed = record.unconfirmedReturns;
assert.equal(unconfirmed.cells, national.returnUnconfirmedCells);
assert.ok(unconfirmed.cells > 0, "a finding about unconfirmed returns needs unconfirmed returns");
assert.ok(unconfirmed.cells <= national.notRecoveredCells,
  "unconfirmed returns must sit inside the not-recovered bucket, which is what makes the emitted prose wrong");
assert.ok(Math.abs(unconfirmed.hectares - unconfirmed.cells * CELL_HECTARES) < 0.05,
  "the unconfirmed hectares do not follow from the cells");
assert.ok(Math.abs(unconfirmed.percentOfNotRecovered - (unconfirmed.cells / national.notRecoveredCells) * 100) < 0.01,
  "the unconfirmed share does not follow from the counts");
assert.match(unconfirmed.emittedRuleText, /neither recovered nor not-recovered/,
  "the record must quote the emitted text it is contradicting");

// District coverage. The counts have to close against the edition, so a district
// cannot go missing from both the report and the explanation at once.
const coverage = record.boundaryCoverage;
assert.equal(coverage.districtsInBoundaryLayer, DISTRICTS_IN_EDITION);
assert.equal(coverage.districtsWithNoMappedCellsIds.length, coverage.districtsWithNoMappedCells,
  "the list of districts holding nothing must be as long as the count of them");
assert.equal(new Set(coverage.districtsWithNoMappedCellsIds).size, coverage.districtsWithNoMappedCells,
  "a district is named twice among those holding nothing");
assert.equal(coverage.districtsReported + coverage.districtsWithNoMappedCells, DISTRICTS_IN_EDITION,
  "reported and empty districts do not account for the whole boundary edition");
assert.equal(coverage.nationalKnownCellsOutsideEveryDistrict,
  national.knownCells - coverage.knownCellsInReportedDistricts,
  "the residual outside every district does not follow from the totals");
assert.ok(coverage.nationalKnownCellsOutsideEveryDistrict >= 0,
  "districts hold more cells than the country does");

for (const input of record.inputs) {
  assert.match(input.sha256, SHA256, `${input.slug} sha256`);
  assert.ok(Number.isInteger(input.byteLength) && input.byteLength > 0, `${input.slug} byteLength`);
  assert.ok(!input.path.startsWith("/"), `${input.slug} path must be relative to the data root`);
}
const bySlug = Object.fromEntries(record.inputs.map((input) => [input.slug, input]));
for (const slug of ["recovery-federal-2023", "recovery-federal-2023-coded-boundaries", "federal-ridings-2023-interval-zonal"]) {
  assert.ok(bySlug[slug], `${slug} must be bound`);
}

// An absent archive is unavailable evidence, not contradicted evidence: the
// arithmetic above still ran. An archive that is attached and does not hold a
// bound artifact is contradicting the record, and that fails.
const dataRoot = resolveDataRoot();
const rootPresent = existsSync(dataRoot);
let verified = 0;
let corroborated = false;
if (rootPresent) {
  for (const input of record.inputs) {
    const path = resolve(dataRoot, input.path);
    assert.ok(existsSync(path), `the data root is attached but does not hold ${input.slug} at ${input.path}`);
    assert.equal(statSync(path).size, input.byteLength, `${input.slug} byte length changed`);
    assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), input.sha256,
      `${input.slug} content changed`);
    verified += 1;
  }

  // The record restates the run's totals, so they are re-read rather than trusted.
  const run = JSON.parse(readFileSync(resolve(dataRoot, bySlug["recovery-federal-2023"].path), "utf8"));
  for (const [field, value] of Object.entries(national)) {
    assert.equal(run.national[field], value, `national.${field} differs from the run output`);
  }
  assert.equal(run.method.unconfirmedRule, unconfirmed.emittedRuleText,
    "the run no longer emits the text this finding is about");
  assert.equal(Object.keys(run.boundaries).length, coverage.districtsReported,
    "the run reports a different number of districts than the record says");
  assert.equal(
    Object.values(run.boundaries).reduce((total, district) => total + district.knownCells, 0),
    coverage.knownCellsInReportedDistricts,
    "the run's district cells do not sum to the recorded total");
  for (const [id, district] of Object.entries(run.boundaries)) {
    assert.ok(district.lostCells <= district.everForestCells, `${id} lost more forest than it ever had`);
    assert.ok(district.everForestCells <= district.knownCells, `${id} had more forest than known cells`);
    assert.ok(district.recoveredCells <= district.lostCells, `${id} recovered more than it lost`);
    assert.ok(district.returnUnconfirmedCells <= district.lostCells, `${id} has more returns pending than losses`);
  }

  // The corroboration, re-derived. A separate worker read the same edition against
  // the same mapped extent; without its agreement the 183 omissions are just a claim.
  const zonal = JSON.parse(readFileSync(resolve(dataRoot, bySlug["federal-ridings-2023-interval-zonal"].path), "utf8"));
  assert.equal(zonal.boundaryEdition, "fed-2023-representation-order",
    "the corroborating record is not on the same boundary edition");
  assert.equal(zonal.districts.length, DISTRICTS_IN_EDITION,
    "the corroborating record does not carry the whole boundary edition");
  const zonalMapped = new Map(zonal.districts.map((d) => [d.boundaryId, d.cells - d.unmappedCells]));
  const reported = new Set(Object.keys(run.boundaries));
  const unexplained = [...reported].filter((id) => !zonalMapped.has(id));
  assert.deepEqual(unexplained, [], `the run reports districts the boundary edition does not hold: ${unexplained.join(", ")}`);
  for (const id of coverage.districtsWithNoMappedCellsIds) {
    assert.ok(zonalMapped.has(id), `${id} is called empty but is not in the boundary edition`);
    assert.ok(!reported.has(id), `${id} is called empty but the run reports it`);
    assert.equal(zonalMapped.get(id), 0,
      `${id} is called empty but the corroborating record puts ${zonalMapped.get(id)} mapped cells in it`);
  }
  assert.equal(
    [...zonalMapped.values()].reduce((total, cells) => total + cells, 0),
    coverage.knownCellsInReportedDistricts,
    "the two workers disagree on how much mapped area the districts hold");
  corroborated = true;
}

console.log(
  `check-phase4-recovery-trajectory: ok, ${coverage.districtsReported} of ${DISTRICTS_IN_EDITION} districts reported` +
  `, ${(national.lostCells * CELL_HECTARES / 1e6).toFixed(2)}M ha lost and ` +
  `${(national.recoveredCells * CELL_HECTARES / 1e6).toFixed(2)}M ha recovered` +
  `, ${verified} inputs verified against bytes` +
  (corroborated ? ", district coverage corroborated by the interval zonal run" : "") +
  (rootPresent ? "" : " (data root not mounted)"),
);
