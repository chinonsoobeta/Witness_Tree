#!/usr/bin/env node
// Checks data/phase4-provincial-cause-crosstab.json against the repository
// alone (no data root): its bindings still match, its tables add up, it
// reconciles with the admitted Phase 4 report, and it claims no review.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CROSSTAB_PATH = "data/phase4-provincial-cause-crosstab.json";
const REPORT_PATH = "data/phase4-provincial-matching-report.json";
const OUTCOMES = ["harvest", "fire", "insect", "windthrow", "no-provincial-match"];
const CAUSES = ["harvest", "fire", "none"];
const CELL_HECTARES = 0.09;

const read = (file) => readFileSync(path.join(ROOT, file));
const sha = (file) => createHash("sha256").update(read(file)).digest("hex");
const isCount = (value) => Number.isInteger(value) && value >= 0;

export function validateCauseCrosstab(record = JSON.parse(read(CROSSTAB_PATH)), report = JSON.parse(read(REPORT_PATH))) {
  const failures = [];
  const add = (message) => failures.push(message);
  if (record.schemaVersion !== "witness-tree/phase4-provincial-cause-crosstab/1") add(`schemaVersion is ${record.schemaVersion}.`);
  if (record.status !== "derived-from-admitted-run") add(`status is ${record.status}; this table is a view of the admitted run, nothing more.`);
  if (record.runId !== report.runId) add(`runId ${record.runId} is not the admitted run ${report.runId}.`);
  if (record.cellHectares !== CELL_HECTARES) add("cellHectares must be 0.09.");
  if (record.basis?.separatelyReviewed !== false) add("the table must not claim a separate review.");
  if (JSON.stringify(record.outcomes) !== JSON.stringify(OUTCOMES) || JSON.stringify(record.causes) !== JSON.stringify(CAUSES)) add("outcomes or causes changed.");
  for (const binding of record.inputBindings ?? []) {
    let current = null;
    try { current = sha(binding.path); } catch { /* reported below */ }
    if (current !== binding.sha256) add(`${binding.path} changed since the table was built; rebuild it.`);
  }
  if (!(record.inputBindings ?? []).some((binding) => binding.path === REPORT_PATH)) add("the table does not bind the admitted report.");

  for (const province of ["BC", "QC"]) {
    const entry = record.byProvince?.[province];
    if (!entry) { add(`${province} is missing.`); continue; }
    const intervals = Object.keys(entry.intervals ?? {});
    const expected = Array.from({ length: 38 }, (_, i) => `${1984 + i}-${1985 + i}`);
    if (JSON.stringify(intervals.sort()) !== JSON.stringify(expected)) add(`${province} must hold the 38 intervals 1984-1985 to 2021-2022.`);
    const totals = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, { harvest: 0, fire: 0, none: 0 }]));
    for (const [interval, table] of Object.entries(entry.intervals ?? {})) {
      if (JSON.stringify(Object.keys(table)) !== JSON.stringify(OUTCOMES)) add(`${province} ${interval} has the wrong outcomes.`);
      for (const outcome of OUTCOMES) {
        for (const cause of CAUSES) {
          const value = table[outcome]?.[cause];
          if (!isCount(value)) add(`${province} ${interval} ${outcome}/${cause} is not a cell count.`);
          else totals[outcome][cause] += value;
        }
      }
    }
    if (JSON.stringify(totals) !== JSON.stringify(entry.totals)) add(`${province} totals do not equal the sum of its intervals.`);
    const admitted = report.byProvince?.[province];
    const reproduction = entry.reproduction ?? {};
    if (reproduction.assessedChanges !== admitted?.counts.assessedChanges || reproduction.matchedChanges !== admitted?.counts.matchedChanges) {
      add(`${province} does not reproduce the admitted change counts.`);
    }
    if (Math.abs(reproduction.assessedHectares - admitted?.areaWeighted.assessedHectares) > 0.01 || Math.abs(reproduction.matchedHectares - admitted?.areaWeighted.matchedHectares) > 0.01) {
      add(`${province} does not reproduce the admitted hectares.`);
    }
    // Every assessed cell is in the table once, plus once more for each cell
    // that carries both a harvest and a fire year.
    const tableCells = OUTCOMES.reduce((sum, outcome) => sum + CAUSES.reduce((inner, cause) => inner + totals[outcome][cause], 0), 0);
    const assessedCells = Math.round(admitted?.areaWeighted.assessedHectares / CELL_HECTARES);
    if (!isCount(entry.overlapCells) || tableCells - entry.overlapCells !== assessedCells) {
      add(`${province}: the table holds ${tableCells} cells with ${entry.overlapCells} overlaps, but the run assessed ${assessedCells}.`);
    }
    // A matched record kind the admitted report never saw cannot appear here.
    for (const outcome of OUTCOMES.filter((name) => name !== "no-provincial-match")) {
      const cells = CAUSES.reduce((sum, cause) => sum + totals[outcome][cause], 0);
      if (cells > 0 && !(admitted?.matchedByRecordKind?.[outcome] > 0)) add(`${province} files cells under ${outcome}, which the admitted run never matched.`);
    }
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = validateCauseCrosstab();
  if (failures.length) {
    console.error("Phase 4 provincial cause cross-tabulation is not valid:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("Phase 4 provincial cause cross-tabulation reconciles with the admitted run for BC and Québec.");
}
