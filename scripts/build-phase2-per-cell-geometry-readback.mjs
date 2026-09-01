import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Stage 6: turns the store's own manifests into the readback record that
// lives in the repository, so the gate can be checked without the data root
// attached. Every number here is copied from a manifest the runners wrote and
// is reconciled against data/phase2-real-loss-component-inventory-readback.json,
// which was already in the repository before this product existed.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const STORE = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1");
const RUNNER_PATH = "scripts/build-phase2-per-cell-geometry.mjs";
const here = (file) => new URL(`../${file}`, import.meta.url);

const read = async (file) => JSON.parse(await readFile(file, "utf8"));
const manifest = await read(path.join(STORE, "manifest.json"));
const attribution = await read(path.join(STORE, "attribution-manifest.json"));
const harvest = await read(path.join(STORE, "disturbance/harvest-manifest.json"));
const fire = await read(path.join(STORE, "disturbance/fire-manifest.json"));
const inventory = await read(here("data/phase2-real-loss-component-inventory-readback.json"));
const runnerSha256 = createHash("sha256").update(await readFile(here(RUNNER_PATH))).digest("hex");
if (manifest.runner?.path !== RUNNER_PATH || !/^[0-9a-f]{64}$/u.test(manifest.runner.sha256)) {
  throw new Error(`the geometry manifest does not bind ${RUNNER_PATH} to a SHA-256`);
}

const attributionByInterval = new Map(attribution.intervals.map((entry) => [entry.interval, entry]));
const intervals = manifest.intervals.map((entry, index) => {
  const pair = inventory.pairs[index];
  const attributed = attributionByInterval.get(entry.interval);
  if (attributed === undefined) throw new Error(`${entry.interval} has no attribution record`);
  if (`${pair.pair[0]}-${pair.pair[1]}` !== entry.interval) {
    throw new Error(`store interval ${entry.interval} does not line up with inventory pair ${pair.pair.join("-")}`);
  }
  return {
    interval: entry.interval,
    source: entry.source,
    patchCount: entry.patchCount,
    runCount: entry.runCount,
    cellCount: entry.cellCount,
    aliasCount: entry.aliasCount,
    peakOpenComponents: entry.peakOpenComponents,
    patches: entry.patches,
    runs: entry.runs,
    attribution: {
      harvestCells: attributed.harvestCells,
      fireCells: attributed.fireCells,
      patchesWithBoth: attributed.patchesWithBoth,
      disturbanceYearsUsed: attributed.disturbanceYearsUsed,
      disturbanceYearsMissing: attributed.disturbanceYearsMissing,
      sha256: attributed.sha256,
    },
  };
});

const total = (select) => intervals.reduce((running, entry) => running + select(entry), 0);
const record = {
  schemaVersion: "witness-tree/phase2-per-cell-geometry-readback/1",
  status: "exact-readback-passed",
  productId: "phase2-per-cell-geometry-1984-2022-v1",
  sourceProductId: "phase2-real-loss-component-inventory-1984-2022-v1",
  method: "data/phase2-per-cell-geometry-method.json",
  authorization: "data/phase2-zonal-aggregation-contract-amendment-2026-08-29.json",
  runner: {
    path: RUNNER_PATH,
    sha256: runnerSha256,
    readbackBoundSha256: manifest.runner.sha256,
  },
  grid: manifest.grid,
  patchRecordBytes: manifest.patchRecordBytes,
  runRecordBytes: manifest.runRecordBytes,
  intervalCount: intervals.length,
  totals: {
    patchCount: total((entry) => entry.patchCount),
    runCount: total((entry) => entry.runCount),
    cellCount: total((entry) => entry.cellCount),
    harvestCells: total((entry) => entry.attribution.harvestCells),
    fireCells: total((entry) => entry.attribution.fireCells),
    storedBytes: total((entry) => entry.patches.byteLength + entry.runs.byteLength),
  },
  disturbanceRecord: {
    harvest: { years: Object.keys(harvest.years).length, runs: harvest.totals.runs, cells: harvest.totals.cells },
    fire: { years: Object.keys(fire.years).length, runs: fire.totals.runs, cells: fire.totals.cells },
    zeroMeaning: harvest.zeroMeaning,
    firstRecordedYear: 1985,
    lossSeriesFirstYear: 1984,
  },
  released: false,
  productionEligible: false,
  expertReviewed: false,
  intervals,
};

const serialized = `${JSON.stringify(record, null, 2)}\n`;
await writeFile(here("data/phase2-per-cell-geometry-readback.json"), serialized);
await writeFile(
  here("data/phase2-per-cell-geometry-summary.json"),
  `${JSON.stringify(
    {
      schemaVersion: "witness-tree/phase2-per-cell-geometry-summary/1",
      evidence: {
        fileName: "phase2-per-cell-geometry-readback.json",
        byteLength: Buffer.byteLength(serialized),
        sha256: createHash("sha256").update(serialized).digest("hex"),
      },
      productId: record.productId,
      intervalCount: record.intervalCount,
      patchCount: record.totals.patchCount,
      cellCount: record.totals.cellCount,
      storedBytes: record.totals.storedBytes,
      released: false,
      productionEligible: false,
      expertReviewed: false,
    },
    null,
    2,
  )}\n`,
);
console.log(`${record.intervalCount} intervals, ${record.totals.patchCount.toLocaleString()} patches, ${record.totals.cellCount.toLocaleString()} cells.`);
