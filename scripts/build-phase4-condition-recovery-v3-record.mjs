#!/usr/bin/env node
// Writes data/phase4-condition-recovery-v3.json, the record of the v3 run: the
// v2 method with the treed-again requirement raised from three consecutive
// years to five, as the owner decided on 2026-10-03.
//
// Everything that does not depend on the rule is carried from the v2 record
// (staged inputs, masks, windows, regions, the provincial-series reproduction),
// and every figure that does is read from the v3 run output. Run it after the
// worker, with the output and its log under derived/phase4-condition-recovery-v3/.
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataRoot } from "./data-root.mjs";

export const RECORD = "data/phase4-condition-recovery-v3.json";
export const WORKER = "scripts/phase4_condition_recovery_v3.py";
export const OUTPUT_DIR = "derived/phase4-condition-recovery-v3";
export const DECISION_HEADING = "## Owner decision: five treed years, and admission, 2026-10-03";
const PROVINCES = { "british-columbia": "59", alberta: "48", ontario: "35", quebec: "24" };
const SETS = ["A", "B"];
const CELL_HECTARES = 0.09;

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A province total as the record keeps it: no cause or first-loss breakdown. */
export function recordTotal(total) {
  return Object.fromEntries(Object.entries(total).filter(([field]) => field !== "causeOfLatestLoss" && field !== "byFirstLossDecade"));
}

function regionSummary(rows, pruid) {
  const inProvince = Object.entries(rows).filter(([id, row]) => id !== "none" && row.pruid === pruid);
  const spill = Object.entries(rows).filter(([id, row]) => id !== "none" && row.pruid !== pruid);
  return {
    inProvinceRegions: inProvince.length,
    spillRows: spill.length,
    maxSpillCells: Math.max(0, ...spill.map(([, row]) => row.maskCells)),
    cellsInNoRegion: rows.none?.maskCells ?? 0,
  };
}

const pct = (part, whole) => ((part / whole) * 100).toFixed(1);
const ha = (cells) => Math.round(cells * CELL_HECTARES).toLocaleString("en-CA");

export function buildRecord({ v2, run, outputFiles, workerSha256 }) {
  if (run.method !== "condition-recovery-vlce2-classes-v3") throw new Error("Not a v3 run output.");
  if (run.confirmYears !== 5) throw new Error("The v3 run must require five treed years.");
  if (run.workerSha256 !== workerSha256) throw new Error("The run was not made by the worker in this checkout.");
  const provinces = {};
  const regions = {};
  for (const [slug, pruid] of Object.entries(PROVINCES)) {
    provinces[slug] = Object.fromEntries(SETS.map((set) => [set, recordTotal(run.provinces[slug].sets[set].total)]));
    regions[slug] = regionSummary(run.provinces[slug].sets.A.regions, pruid);
  }
  const fourProvinces = Object.fromEntries(SETS.map((set) => {
    const sum = (pick) => Object.values(provinces).reduce((n, p) => n + pick(p[set]), 0);
    return [set, {
      knownCells: sum((t) => t.knownCells),
      unknownCells: sum((t) => t.unknownCells),
      lostCells: sum((t) => t.lostCells),
      latestLossRecoveredCells: sum((t) => t.latestLoss.recoveredCells),
      anyLossRecoveredCells: sum((t) => t.anyLoss.recoveredCells),
      unconfirmedCells: sum((t) => t.latestLoss.unconfirmedCells),
    }];
  }));
  const four = fourProvinces.A;
  return {
    schema: "witness-tree/phase4-condition-recovery-v3-evidence/1",
    status: "owner-admitted",
    claims: { admitted: true, released: true, ownerReviewed: true, productionEligible: false, nfiForestClaimed: false },
    decision: {
      record: "docs/VLCE2_FOREST_MASK_DECISION.md",
      section: DECISION_HEADING.replace(/^## /, ""),
      headlineSet: "A",
      comparisonOnlySet: "B",
      note: "The owner raised the treed-again requirement from three consecutive years to five and admitted the result for publication. Set B is kept so the class choice can be re-read; it is not displayed.",
    },
    question: v2.question,
    answer:
      `Across the four provinces ${ha(four.lostCells)} ha of land was treed in one year and not the next. ` +
      `${pct(four.latestLossRecoveredCells, four.lostCells)} percent of it was treed again for at least five consecutive years after its most recent loss, ` +
      `and ${pct(four.anyLossRecoveredCells, four.lostCells)} percent after any loss. ${ha(four.unknownCells)} ha is Unknown because at least one year is unclassified or missing, ` +
      "and is excluded, not counted as zero. Treed means VLCE2 classes 210, 220 and 230 only. This measures return of tree cover, not return of the forest that was there, and it is not NFI forest.",
    run: {
      worker: WORKER,
      workerSha256,
      executedAt: run.executedAt,
      elapsedSeconds: run.elapsedSeconds,
      workers: run.workers,
      cpuCount: run.cpuCount,
      strip: run.strip,
      cellHectares: run.cellHectares,
      // The run reads the same 39 staged years as v2 and does not repeat them.
      firstYear: v2.run.firstYear,
      lastYear: v2.run.lastYear,
      confirmYears: run.confirmYears,
      causeWindowYears: run.causeWindowYears,
      treedClassSets: run.treedClassSets,
      inputsReadFrom: v2.run.inputsReadFrom,
    },
    sourceInputs: v2.sourceInputs,
    outputs: outputFiles,
    cells: null,
    cellsNote: "The v3 run wrote no per-cell strips. The site publishes province and region aggregates only.",
    provinces,
    fourProvinces,
    regions,
    regionsNote: v2.regionsNote,
    reproductions: {
      provincialAnnualSeries: v2.reproductions.provincialAnnualSeries,
      note: "The treed area of every year does not depend on the treed-again rule, so the v2 reproduction of the provincial annual series applies unchanged. The federal recovery run used the three-year rule and is not a reproduction of this one.",
    },
    notMeasured: v2.notMeasured.map((line) =>
      line.startsWith("Whether losses after 2019 recover")
        ? "Whether losses after 2017 recover. A return needs five treed years by 2022, so the 2015 to 2022 decade is too recent to judge."
        : line),
    checkedBy: "scripts/check-phase4-condition-recovery-v3.mjs",
  };
}

export function serialize(record) {
  return `${JSON.stringify(record, null, 1)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolveDataRoot();
  const file = (slug, name) => {
    const path = `${OUTPUT_DIR}/${name}`;
    const bytes = readFileSync(resolve(root, path));
    return { slug, path, byteLength: statSync(resolve(root, path)).size, sha256: sha256(bytes) };
  };
  const outputFiles = [file("condition-recovery-v3", "condition-recovery-v3.json"), file("run-log", "run.log")];
  const record = buildRecord({
    v2: JSON.parse(readFileSync(resolve(repoRoot, "data/phase4-condition-recovery-v2.json"))),
    run: JSON.parse(readFileSync(resolve(root, outputFiles[0].path))),
    outputFiles,
    workerSha256: sha256(readFileSync(resolve(repoRoot, WORKER))),
  });
  writeFileSync(resolve(repoRoot, RECORD), serialize(record));
  console.log(`wrote ${RECORD}: ${record.answer}`);
}
