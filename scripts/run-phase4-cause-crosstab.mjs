#!/usr/bin/env node
// The admitted runner (scripts/run-phase4-provincial-matching.mjs), pointed at
// scripts/phase4-match-provincial-crosstab.mts so each interval's output also
// carries the national-cause cross-tabulation. The admitted report binds the
// original runner by SHA-256, so it stays as it ran. Build the table from the
// outputs with scripts/build-phase4-provincial-cause-crosstab.mjs.
//
// Runs the matcher for every interval in BC and QC on a
// fixed pool of child processes, then sums the partial results into one
// whole-run report. Each child has a heap cap, so a runaway task fails on its
// own instead of taking the machine with it; the pool never exceeds --workers.
import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  work: { type: "string" },
  workers: { type: "string", default: String(Math.max(1, Math.min(8, cpus().length - 2))) },
  heap: { type: "string", default: "2048" },
} });
const W = values.work;
const SOURCES = {
  BC: ["bc-historical-fire-perimeters", "bc-fta-4-cutblocks", "bc-consolidated-cutblocks"],
  QC: ["qc-historic-wildfire-detailed", "qc-current-ecoforest"],
};
// A source is usable only once its rasterizer has written its manifest, which
// happens after every year file is complete. Matching against a source still
// being written would silently undercount.
for (const [province, sources] of Object.entries(SOURCES)) {
  for (const source of sources) {
    try { await readFile(path.join(W, "runs", province, source, "manifest.json")); } catch {
      throw new Error(`${province}/${source} has no rasterization manifest yet; refusing to match against an incomplete source`);
    }
  }
}
const intervals = Array.from({ length: 38 }, (_, i) => `${1984 + i}-${1985 + i}`);
const tasks = intervals.flatMap((interval) => ["BC", "QC"].map((province) => ({ interval, province })));
const out = path.join(W, "match");
await mkdir(out, { recursive: true });

function run({ interval, province }) {
  const file = path.join(out, `${province}-${interval}.json`);
  const args = [`--max-old-space-size=${values.heap}`, path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "scripts/phase4-match-provincial-crosstab.mts"),
    "--store", path.join(W, "store/four-province"), "--records", path.join(W, "runs", province),
    "--sources", SOURCES[province].join(","), "--mask", path.join(W, "four-province-cell-runs.bin"),
    "--interval", interval, "--province", province, "--out", file];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    child.on("close", (code) => (code === 0 ? resolve(file) : reject(new Error(`${province} ${interval} exited ${code}\n${log}`))));
  });
}

const started = Date.now();
const queue = [...tasks];
const files = [];
await Promise.all(Array.from({ length: Number(values.workers) }, async () => {
  while (queue.length) {
    const task = queue.shift();
    files.push(await run(task));
    process.stdout.write(`${files.length}/${tasks.length} ${task.province} ${task.interval}\n`);
  }
}));

const parts = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8"))));
const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
const merge = (rows, key) => rows.reduce((acc, row) => {
  for (const [k, v] of Object.entries(row[key])) acc[k] = (acc[k] ?? 0) + v;
  return acc;
}, {});
const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));
const whole = (rows) => {
  const assessed = sum(rows, "assessedChanges");
  const matched = sum(rows, "matchedChanges");
  return {
    counts: { assessedChanges: assessed, matchedChanges: matched, unmatchedChanges: assessed - matched },
    matchRate: matched / assessed,
    nonMatchRate: (assessed - matched) / assessed,
    areaWeighted: {
      assessedHectares: sum(rows, "assessedHectares"),
      matchedHectares: sum(rows, "matchedHectares"),
      matchedShare: sum(rows, "matchedHectares") / sum(rows, "assessedHectares"),
    },
    nonMatchReasonDistribution: sorted(merge(rows, "nonMatchReasonDistribution")),
    matchedByRecordKind: sorted(merge(rows, "matchedByRecordKind")),
  };
};
parts.sort((a, b) => (a.province + a.interval < b.province + b.interval ? -1 : 1));
const summary = {
  whole: whole(parts),
  byProvince: Object.fromEntries(["BC", "QC"].map((p) => [p, whole(parts.filter((r) => r.province === p))])),
  intervals: parts.map(({ province, interval, assessedChanges, matchedChanges, assessedHectares, matchedHectares, nonMatchReasonDistribution, matchedByRecordKind, seconds, peakRssMegabytes }) =>
    ({ province, interval, assessedChanges, matchedChanges, assessedHectares, matchedHectares, nonMatchReasonDistribution, matchedByRecordKind, seconds, peakRssMegabytes })),
  workers: Number(values.workers),
  heapMegabytes: Number(values.heap),
  seconds: (Date.now() - started) / 1000,
  peakRssMegabytes: Math.max(...parts.map((r) => r.peakRssMegabytes)),
};
await writeFile(path.join(out, "summary.json"), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary.whole), `${summary.seconds}s`);
