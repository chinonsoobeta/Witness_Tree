#!/usr/bin/env node

/*
 * Merge the four per-province cumulative parts into one canonical artifact.
 *
 * The cumulative pass is run as one process per province so the four bounded
 * windows decode in parallel. That is a scheduling decision, not a method
 * decision: each province is summarized independently in the annual worker
 * too, and no statistic here crosses a provincial boundary. This merge
 * therefore concatenates rather than recomputes, and it refuses anything that
 * would make the concatenation a lie: a missing province, a duplicate, a part
 * that read a different number of annual pairs, or parts that disagree about
 * the exact input rasters they read.
 *
 * Province order is fixed rather than taken from the filesystem, so the merged
 * bytes are stable no matter what order the parts happened to finish in.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const OUT_DIR = path.join(DATA_ROOT, "derived", "phase2-cumulative-province-zonal-v1");
const PARTS_DIR = path.join(OUT_DIR, "parts");
const OUTPUT = path.join(OUT_DIR, "cumulative-province-zonal-1984-2022.json");
const SIDECAR = path.join(OUT_DIR, "cumulative-province-zonal-1984-2022.provenance.json");
const ORDER = ["BC", "AB", "ON", "QC"];

const fail = (message) => {
  console.error(`FAIL merge: ${message}`);
  process.exit(1);
};

if (existsSync(OUTPUT) || existsSync(SIDECAR)) {
  fail("refusing to replace an existing merged cumulative artifact");
}

const rows = [];
const sidecars = [];
for (const province of ORDER) {
  const rowsPath = path.join(PARTS_DIR, `cumulative-${province}.json`);
  const sidecarPath = path.join(PARTS_DIR, `cumulative-${province}.provenance.json`);
  if (!existsSync(rowsPath) || !existsSync(sidecarPath)) fail(`missing part for ${province}`);
  const part = JSON.parse(readFileSync(rowsPath, "utf8"));
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
  if (!Array.isArray(part) || part.length !== 1) fail(`${province} part must hold exactly one row`);
  if (part[0].province !== province) fail(`${province} part holds ${part[0].province}`);
  rows.push(part[0]);
  sidecars.push({ province, sidecar });
}

const pairCounts = new Set(sidecars.map(({ sidecar }) => sidecar.execution.annualPairCount));
if (pairCounts.size !== 1) fail(`parts read different pair counts: ${[...pairCounts].join(", ")}`);
const [pairCount] = [...pairCounts];
if (pairCount !== 38) fail(`expected 38 annual pairs, parts read ${pairCount}`);

// Every part must have read byte-identical inputs, or the four rows are not
// four views of one dataset and must not be published as one table.
const fingerprint = ({ sidecar }) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        sidecar.input.baselineForestMask.sha256,
        sidecar.input.mappedExtent.sha256,
        sidecar.input.boundaries.sha256,
        sidecar.input.annualLossRasters.map((entry) => entry.sha256),
        sidecar.input.grid,
      ]),
    )
    .digest("hex");
const fingerprints = new Set(sidecars.map(fingerprint));
if (fingerprints.size !== 1) fail("parts disagree about the exact inputs they read");

const workers = new Set(sidecars.map(({ sidecar }) => sidecar.execution.worker.sha256));
if (workers.size !== 1) fail("parts were produced by different worker bytes");

const first = sidecars[0].sidecar;
const merged = {
  ...first,
  input: { ...first.input, targetProvinces: ORDER },
  execution: {
    ...first.execution,
    featureCount: ORDER.length,
    maskRasterizationCount: sidecars.reduce((total, { sidecar }) => total + sidecar.execution.maskRasterizationCount, 0),
    processedWindowCount: sidecars.reduce((total, { sidecar }) => total + sidecar.execution.processedWindowCount, 0),
    elapsedSeconds: Math.max(...sidecars.map(({ sidecar }) => sidecar.execution.elapsedSeconds)),
    wallClockNote:
      "The four provinces ran concurrently. elapsedSeconds is the longest single province, not their sum.",
    startedAt: sidecars.map(({ sidecar }) => sidecar.execution.startedAt).sort()[0],
    completedAt: sidecars.map(({ sidecar }) => sidecar.execution.completedAt).sort().at(-1),
    perProvince: sidecars.map(({ province, sidecar }) => ({
      province,
      startedAt: sidecar.execution.startedAt,
      completedAt: sidecar.execution.completedAt,
      elapsedSeconds: sidecar.execution.elapsedSeconds,
      processedWindowCount: sidecar.execution.processedWindowCount,
    })),
  },
  rows,
};

writeFileSync(OUTPUT, `${JSON.stringify(rows, null, 1)}\n`);
writeFileSync(SIDECAR, `${JSON.stringify(merged, null, 1)}\n`);
const digest = createHash("sha256").update(readFileSync(OUTPUT)).digest("hex");
console.log(`merged ${rows.length} province rows across ${pairCount} annual pairs`);
console.log(`output   ${OUTPUT}`);
console.log(`sha256   ${digest}`);
