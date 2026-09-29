#!/usr/bin/env node
// Condition and recovery, v2: did the tree cover that was lost come back? The
// worker walks every cell of four provinces through 1984 to 2022 once, for two
// definitions of "treed", and this checks the record of that run.
//
// The owner's scoped decision in docs/VLCE2_FOREST_MASK_DECISION.md picks the
// three-class set as the headline. The record keeps the four-class set beside it
// so the choice can be re-read, never so it can be displayed. Every figure here
// is re-derived from counts rather than trusted, the partitions are recomputed,
// and the two reproductions that justify the three-class set (the recorded
// federal recovery run and the recorded provincial annual series) are re-derived
// from their own bytes whenever the data root is attached.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHA256 = /^[a-f0-9]{64}$/;
const CELL_HECTARES = 0.09;
const PROVINCES = { "british-columbia": "59", alberta: "48", ontario: "35", quebec: "24" };
const SETS = { A: [210, 220, 230], B: [81, 210, 220, 230] };
const DECADES = ["1985-1994", "1995-2004", "2005-2014", "2015-2022"];
const WORKER = "scripts/phase4_condition_recovery_v2.py";
const DECISION_HEADING = "## Scoped decision: the treed-again rule for condition and recovery, 2026-09-23";

const read = (path) => readFileSync(resolve(repoRoot, path));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = JSON.parse(read("data/phase4-condition-recovery-v2.json"));

assert.equal(record.schema, "witness-tree/phase4-condition-recovery-v2-evidence/1");
assert.equal(record.status, "local-nonproduction-executed");
assert.equal(record.checkedBy, "scripts/check-phase4-condition-recovery-v2.mjs");

// A recovery figure reads like a finding about forests. It is a finding about
// three land-cover classes, and none of these may ever read true from this record.
for (const claim of ["admitted", "released", "productionEligible", "ownerReviewed", "nfiForestClaimed"]) {
  assert.equal(record.claims[claim], false, `claims.${claim} must be false`);
}

// The class treatment is the owner's scoped decision, so the record must point at
// a decision that still exists and still names the headline set.
const decisionDoc = read(record.decision.record).toString("utf8");
assert.ok(decisionDoc.includes(DECISION_HEADING), "the scoped decision this record relies on is gone");
assert.equal(record.decision.section, DECISION_HEADING.replace(/^## /, ""));
assert.equal(record.decision.headlineSet, "A");
assert.equal(record.decision.comparisonOnlySet, "B");
assert.deepEqual(record.run.treedClassSets, SETS);

// The worker is bound by digest: a changed worker needs a new run and a new record.
assert.equal(record.run.worker, WORKER);
assert.equal(sha256(read(WORKER)), record.run.workerSha256, "the worker changed after the recorded run");
assert.equal(record.run.cellHectares, CELL_HECTARES);
assert.equal(record.run.firstYear, 1984);
assert.equal(record.run.lastYear, 2022);
assert.equal(record.run.confirmYears, 3);
assert.ok(Array.isArray(record.notMeasured) && record.notMeasured.length >= 4,
  "the record must keep saying what it did not measure");

const count = (value, label) => assert.ok(Number.isInteger(value) && value >= 0, `${label} must be a non-negative count`);

// Unknown is never folded into zero, and every lost cell is in exactly one bucket
// under each reading. Checked for every province and set, then for the sum.
function checkTotals(t, label) {
  for (const field of ["maskCells", "unknownCells", "knownCells", "neverTreedCells", "everTreedCells", "lostCells"]) {
    count(t[field], `${label}.${field}`);
  }
  assert.equal(t.knownCells, t.maskCells - t.unknownCells, `${label}: known must be mask less unknown`);
  assert.equal(t.neverTreedCells + t.everTreedCells, t.knownCells, `${label}: known cells are not all accounted for`);
  assert.ok(t.lostCells <= t.everTreedCells, `${label}: more was lost than was ever treed`);
  const latest = t.latestLoss;
  assert.equal(latest.recoveredCells + latest.notRecoveredCells, t.lostCells, `${label}: latest-loss partition`);
  assert.ok(latest.unconfirmedCells <= latest.notRecoveredCells, `${label}: unconfirmed must sit inside not recovered`);
  assert.equal(t.anyLoss.recoveredCells + t.anyLoss.notRecoveredCells, t.lostCells, `${label}: any-loss partition`);
  assert.ok(t.anyLoss.recoveredCells >= latest.recoveredCells, `${label}: any-loss cannot recover less than latest-loss`);
  assert.deepEqual(Object.keys(t.byLatestLossDecade), DECADES, `${label}: decades`);
  const decades = Object.values(t.byLatestLossDecade);
  assert.equal(decades.reduce((n, d) => n + d.lostCells, 0), t.lostCells, `${label}: decades do not sum to lost`);
  assert.equal(decades.reduce((n, d) => n + d.recoveredCells, 0), latest.recoveredCells, `${label}: decades do not sum to recovered`);
  assert.equal(decades.reduce((n, d) => n + d.unconfirmedCells, 0), latest.unconfirmedCells, `${label}: decades do not sum to unconfirmed`);
  assert.ok(t.recoveredClass81In2022Cells <= latest.recoveredCells, `${label}: class 81 share exceeds recovered`);
}

assert.deepEqual(Object.keys(record.provinces).sort(), Object.keys(PROVINCES).sort());
for (const [slug, province] of Object.entries(record.provinces)) {
  for (const set of Object.keys(SETS)) checkTotals(province[set], `${slug}.${set}`);
  assert.equal(province.A.recoveredClass81In2022Cells, 0, `${slug}: the three-class set cannot recover into class 81`);
  // The unknown mask does not depend on the class set; if it did, the sets would not be comparable.
  assert.equal(province.A.unknownCells, province.B.unknownCells, `${slug}: unknown differs between sets`);
  assert.equal(province.A.maskCells, province.B.maskCells, `${slug}: mask differs between sets`);
}
for (const set of Object.keys(SETS)) {
  const sum = (pick) => Object.values(record.provinces).reduce((n, p) => n + pick(p[set]), 0);
  const four = record.fourProvinces[set];
  assert.equal(four.lostCells, sum((t) => t.lostCells), `fourProvinces.${set}.lostCells`);
  assert.equal(four.knownCells, sum((t) => t.knownCells), `fourProvinces.${set}.knownCells`);
  assert.equal(four.unknownCells, sum((t) => t.unknownCells), `fourProvinces.${set}.unknownCells`);
  assert.equal(four.latestLossRecoveredCells, sum((t) => t.latestLoss.recoveredCells), `fourProvinces.${set}.latestLossRecoveredCells`);
  assert.equal(four.anyLossRecoveredCells, sum((t) => t.anyLoss.recoveredCells), `fourProvinces.${set}.anyLossRecoveredCells`);
  assert.equal(four.unconfirmedCells, sum((t) => t.latestLoss.unconfirmedCells), `fourProvinces.${set}.unconfirmedCells`);
}

// Source inputs: the land-cover years and disturbance rasters are the staged
// acquisitions themselves, so their digests must agree with the staging record.
const staged = new Map(JSON.parse(read("data/staged-acquisitions.json")).entries.map((entry) => [entry.id, entry]));
const vlceYears = new Set();
for (const input of record.sourceInputs.staged) {
  const entry = staged.get(input.stagedId);
  assert.ok(entry, `${input.stagedId} is not a staged acquisition`);
  assert.equal(input.sha256, entry.sha256, `${input.stagedId} digest differs from the staging record`);
  const year = /^CA_forest_VLCE2_(\d{4})\.tif$/.exec(entry.originalFilename);
  if (year) vlceYears.add(Number(year[1]));
}
assert.equal(vlceYears.size, 39, "every land-cover year from 1984 to 2022 must be bound");
for (const input of [...record.sourceInputs.derived, ...record.outputs]) {
  assert.match(input.sha256, SHA256, `${input.slug} sha256`);
  assert.ok(Number.isInteger(input.byteLength) && input.byteLength > 0, `${input.slug} byteLength`);
  assert.ok(!input.path.startsWith("/"), `${input.slug} path must be relative to the data root`);
}
const outputs = Object.fromEntries(record.outputs.map((output) => [output.slug, output]));
for (const slug of ["condition-recovery-v2", "cells-manifest", ...Object.keys(PROVINCES).map((p) => `${p}-cells-vrt`)]) {
  assert.ok(outputs[slug], `${slug} must be bound`);
}

// An absent data root is unavailable evidence, not contradicted evidence: the
// arithmetic above still ran. An attached root that disagrees fails.
const dataRoot = resolveDataRoot();
const rootPresent = existsSync(dataRoot);
let verified = 0;
let reproduced = false;
if (rootPresent) {
  for (const input of [...record.sourceInputs.derived, ...record.outputs]) {
    const path = resolve(dataRoot, input.path);
    assert.ok(existsSync(path), `the data root is attached but does not hold ${input.slug} at ${input.path}`);
    assert.equal(statSync(path).size, input.byteLength, `${input.slug} byte length changed`);
    assert.equal(sha256(readFileSync(path)), input.sha256, `${input.slug} content changed`);
    verified += 1;
  }

  // Every per-cell strip the manifest names must be present at its recorded size.
  const cellsDir = resolve(dataRoot, record.cells.directory);
  const manifest = readFileSync(resolve(dataRoot, outputs["cells-manifest"].path), "utf8").trim().split("\n");
  assert.equal(manifest.length, record.cells.files, "the manifest does not list the recorded number of strips");
  assert.equal(readdirSync(cellsDir).filter((name) => name.endsWith(".tif")).length, record.cells.files,
    "the cells directory holds a different number of strips than the manifest");
  let cellBytes = 0;
  for (const line of manifest) {
    const [digest, name] = line.split(/ +/);
    assert.match(digest, SHA256, `manifest line ${line}`);
    cellBytes += statSync(resolve(cellsDir, name)).size;
  }
  assert.equal(cellBytes, record.cells.totalBytes, "the strips' total size changed");

  // The record restates the run, so the run is re-read rather than trusted.
  const run = JSON.parse(readFileSync(resolve(dataRoot, outputs["condition-recovery-v2"].path), "utf8"));
  assert.equal(run.workerSha256, record.run.workerSha256, "the run was not made by the bound worker");
  assert.equal(run.executedAt, record.run.executedAt);
  assert.deepEqual(run.treedClassSets, SETS);
  for (const [slug, province] of Object.entries(record.provinces)) {
    for (const set of Object.keys(SETS)) {
      // Cause and first-loss breakdowns are recorded with the cause evidence, not here.
      const total = Object.fromEntries(Object.entries(run.provinces[slug].sets[set].total)
        .filter(([field]) => field !== "causeOfLatestLoss" && field !== "byFirstLossDecade"));
      assert.deepEqual(province[set], total, `${slug}.${set} differs from the run output`);
    }
  }

  // Region coverage, re-derived. Cells that land in another province's region come
  // from the two boundary editions disagreeing at the border, and must stay small.
  for (const [slug, pruid] of Object.entries(PROVINCES)) {
    const rows = run.provinces[slug].sets.A.regions;
    const inProvince = Object.entries(rows).filter(([id, row]) => id !== "none" && row.pruid === pruid);
    const spill = Object.entries(rows).filter(([id, row]) => id !== "none" && row.pruid !== pruid);
    const expected = record.regions[slug];
    assert.equal(inProvince.length, expected.inProvinceRegions, `${slug}: in-province region count`);
    assert.equal(spill.length, expected.spillRows, `${slug}: spill row count`);
    assert.equal(Math.max(0, ...spill.map(([, row]) => row.maskCells)), expected.maxSpillCells, `${slug}: largest spill`);
    assert.equal(rows.none?.maskCells ?? 0, expected.cellsInNoRegion, `${slug}: cells in no region`);
  }
  assert.equal(Object.values(record.regions).reduce((n, r) => n + r.inProvinceRegions, 0), 44,
    "the four provinces hold 44 economic regions");

  // Reproduction one: the recorded federal recovery run built from the same three
  // classes. Its districts are summed by province; the boundary editions differ, so
  // the difference is recorded and recomputed rather than required to be zero.
  const federalRecord = JSON.parse(read("data/phase4-recovery-trajectory-federal-2023.json"));
  const federalRun = JSON.parse(readFileSync(resolve(dataRoot,
    federalRecord.inputs.find((input) => input.slug === "recovery-federal-2023").path), "utf8"));
  for (const [slug, pruid] of Object.entries(PROVINCES)) {
    const districts = Object.entries(federalRun.boundaries).filter(([id]) => id.startsWith(pruid)).map(([, d]) => d);
    const federalLost = districts.reduce((n, d) => n + d.lostCells, 0);
    const federalRecovered = districts.reduce((n, d) => n + d.recoveredCells, 0);
    const mine = record.provinces[slug].A;
    const expected = record.reproductions.federalRecoveryRun[slug];
    assert.equal(federalLost, expected.federalLostCells, `${slug}: federal lost cells`);
    assert.equal(federalRecovered, expected.federalRecoveredCells, `${slug}: federal recovered cells`);
    const lostDiff = Math.abs(mine.lostCells - federalLost) / federalLost * 100;
    assert.ok(lostDiff <= 0.01, `${slug}: lost area differs from the federal run by ${lostDiff.toFixed(4)}%`);
    const rateDiff = Math.abs(mine.anyLoss.recoveredCells / mine.lostCells - federalRecovered / federalLost) * 100;
    assert.ok(rateDiff <= 0.1, `${slug}: recovery rate differs from the federal run by ${rateDiff.toFixed(3)} points`);
  }

  // Reproduction two: every year's treed area against the recorded provincial series.
  for (const [slug, input] of Object.entries(record.reproductions.provincialAnnualSeries.inputs)) {
    const path = resolve(dataRoot, input.path);
    assert.equal(sha256(readFileSync(path)), input.sha256, `${slug} annual series content changed`);
    const annual = JSON.parse(readFileSync(path, "utf8")).annual;
    for (const [set, field] of [["A", "treedUplandHectares"], ["B", "treedAllHectares"]]) {
      run.provinces[slug].sets[set].annual.treedCells.forEach((cells, index) => {
        const diff = Math.abs(cells * CELL_HECTARES - annual[String(1984 + index)][field]);
        assert.ok(diff <= record.reproductions.provincialAnnualSeries.toleranceHectares,
          `${slug}.${set} ${1984 + index}: treed area differs from the recorded series by ${diff.toFixed(2)} ha`);
      });
    }
  }
  reproduced = true;
}

const four = record.fourProvinces.A;
console.log(
  `check-phase4-condition-recovery-v2: ok, ${(four.lostCells * CELL_HECTARES / 1e6).toFixed(2)}M ha lost and ` +
  `${(four.latestLossRecoveredCells / four.lostCells * 100).toFixed(1)}% recovered after the latest loss (three classes)` +
  `, ${verified} files verified against bytes` +
  (reproduced ? ", federal run and provincial series reproduced" : "") +
  (rootPresent ? "" : " (data root not mounted)"),
);
