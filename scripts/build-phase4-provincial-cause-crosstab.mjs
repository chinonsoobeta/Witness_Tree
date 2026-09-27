#!/usr/bin/env node
// Builds data/phase4-provincial-cause-crosstab.json: for British Columbia and
// Québec, every interval's detected loss split by what the national disturbance
// rasters recorded (harvest, fire, or no cause) and by what the patch matched
// provincially in the admitted 2026-09-26 matching run (a record kind, or none).
//
// The per-interval outputs come from rerunning the matching with
// scripts/phase4-match-provincial-crosstab.mts, the admitted matcher plus the
// cross-tabulation, with the per-cell store's attribute files present. The rerun must reproduce
// the admitted report's counts exactly, so this refuses to build otherwise: the
// cross-tabulation adds a view of the same run, never a different run.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const DERIVED = "derived/phase4-provincial-cause-crosstab-2026-09-26";
const ATTRIBUTION = "derived/phase2-per-cell-geometry-1984-2022-four-province-v1/attribution-manifest.json";
const REPORT = "data/phase4-provincial-matching-report.json";
const OUT = "data/phase4-provincial-cause-crosstab.json";
const OUTCOMES = ["harvest", "fire", "insect", "windthrow", "no-provincial-match"];
const CAUSES = ["harvest", "fire", "none"];

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const repoSha = async (file) => sha(await readFile(path.join(ROOT, file)));

const report = JSON.parse(await readFile(path.join(ROOT, REPORT), "utf8"));
const matchDir = path.join(DATA_ROOT, DERIVED, "match");
const files = (await readdir(matchDir)).filter((name) => /^(BC|QC)-\d{4}-\d{4}\.json$/.test(name)).sort();
if (files.length !== 76) throw new Error(`expected 76 interval outputs, found ${files.length}`);
const outputsDigest = createHash("sha256");
const parts = [];
for (const name of files) {
  const bytes = await readFile(path.join(matchDir, name));
  outputsDigest.update(name).update(bytes);
  parts.push(JSON.parse(bytes));
}

const byProvince = {};
for (const province of ["BC", "QC"]) {
  const rows = parts.filter((part) => part.province === province).sort((a, b) => (a.interval < b.interval ? -1 : 1));
  const intervals = {};
  const totals = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, { harvest: 0, fire: 0, none: 0 }]));
  let overlapCells = 0;
  const reproduction = { assessedChanges: 0, matchedChanges: 0, assessedHectares: 0, matchedHectares: 0 };
  for (const row of rows) {
    if (!row.nationalCauseByProvincialOutcome) throw new Error(`${province} ${row.interval} has no cross-tabulation`);
    const table = {};
    for (const outcome of OUTCOMES) {
      const cell = row.nationalCauseByProvincialOutcome[outcome] ?? { harvest: 0, fire: 0, none: 0 };
      table[outcome] = Object.fromEntries(CAUSES.map((cause) => [cause, cell[cause]]));
      for (const cause of CAUSES) totals[outcome][cause] += cell[cause];
    }
    for (const outcome of Object.keys(row.nationalCauseByProvincialOutcome)) {
      if (!OUTCOMES.includes(outcome)) throw new Error(`unknown provincial outcome ${outcome}`);
    }
    intervals[row.interval] = table;
    overlapCells += row.nationalCauseOverlapCells;
    reproduction.assessedChanges += row.assessedChanges;
    reproduction.matchedChanges += row.matchedChanges;
    reproduction.assessedHectares += row.assessedHectares;
    reproduction.matchedHectares += row.matchedHectares;
  }
  if (Object.keys(intervals).length !== 38) throw new Error(`${province} has ${Object.keys(intervals).length} intervals, not 38`);
  const admitted = report.byProvince[province];
  const close = (a, b) => Math.abs(a - b) < 0.01;
  if (reproduction.assessedChanges !== admitted.counts.assessedChanges || reproduction.matchedChanges !== admitted.counts.matchedChanges
    || !close(reproduction.assessedHectares, admitted.areaWeighted.assessedHectares) || !close(reproduction.matchedHectares, admitted.areaWeighted.matchedHectares)) {
    throw new Error(`${province}: the rerun does not reproduce the admitted report`);
  }
  byProvince[province] = {
    intervals,
    totals,
    overlapCells,
    reproduction: {
      assessedChanges: reproduction.assessedChanges,
      matchedChanges: reproduction.matchedChanges,
      assessedHectares: Math.round(reproduction.assessedHectares * 100) / 100,
      matchedHectares: Math.round(reproduction.matchedHectares * 100) / 100,
    },
  };
}

const record = {
  schemaVersion: "witness-tree/phase4-provincial-cause-crosstab/1",
  status: "derived-from-admitted-run",
  runId: report.runId,
  reportSha256: await repoSha(REPORT),
  cellHectares: 0.09,
  units: "cells of 30 m (0.09 ha)",
  outcomes: OUTCOMES,
  causes: CAUSES,
  definitions: {
    cause: "What the national disturbance rasters record for the cell in the interval: a harvest year, a fire year, or neither (none). A cell with both counts under each; overlapCells counts them so the total can be reconciled.",
    outcome: "What the cell's loss patch matched in the admitted provincial matching run: the kind of the selected provincial record, or no-provincial-match. The patch is judged whole, so every cell in it takes its outcome.",
  },
  byProvince,
  inputBindings: [
    { path: REPORT, sha256: await repoSha(REPORT) },
    { path: "scripts/phase4-match-provincial.mts", sha256: await repoSha("scripts/phase4-match-provincial.mts") },
    { path: "scripts/phase4-match-provincial-crosstab.mts", sha256: await repoSha("scripts/phase4-match-provincial-crosstab.mts") },
    { path: "scripts/run-phase4-cause-crosstab.mjs", sha256: await repoSha("scripts/run-phase4-cause-crosstab.mjs") },
    { path: "lib/pipeline/matching.ts", sha256: await repoSha("lib/pipeline/matching.ts") },
  ],
  dataRootBindings: [
    { path: ATTRIBUTION, sha256: sha(await readFile(path.join(DATA_ROOT, ATTRIBUTION))) },
    { path: `${DERIVED}/match`, files: files.length, sha256: outputsDigest.digest("hex"), note: "SHA-256 over each interval output's file name then bytes, in name order." },
  ],
  basis: {
    ownerAuthorization: "On 2026-09-26 the owner approved feeding the admitted Phase 4 matching run into the cause breakdown for British Columbia and Québec, in these words: \"Proceed with all 5.\"",
    reproduction: "The rerun that produced these tables reproduced the admitted report's counts, reasons, record kinds and hectares exactly, per province.",
    separatelyReviewed: false,
  },
  limitations: [
    "A provincial match is the repository's matching policy (at least half the smaller area, within ±2 years, ±3 before 1995), not a finding of cause on the ground.",
    "A change with no national cause and no provincial record is not evidence that nothing happened: records can be missing, unpublished, outside a reporting boundary, or on private land.",
    "Alberta and Ontario have no admitted provincial records, so they are not in this table.",
  ],
};
await writeFile(path.join(ROOT, OUT), `${JSON.stringify(record, null, 1)}\n`);
console.log(`wrote ${OUT}`);
