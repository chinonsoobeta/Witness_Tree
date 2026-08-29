import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, open } from "node:fs/promises";
import path from "node:path";
import { PATCH_RECORD_BYTES, RUN_RECORD_BYTES, readPatchRecord } from "../lib/phase2/patch-geometry.mjs";

// Stage 3: how many of each patch's cells also carry a recorded harvest or a
// recorded fire in the same interval.
//
// Both sides are already ordered by row, so this is a merge join and never a
// per-patch lookup into a 193936 x 128340 raster. One row of loss is expanded
// into a scratch array of patch indices, the disturbance runs for that row are
// read straight off it, and the scratch is cleared by the same cells that set
// it, so the cost is proportional to the loss cells and nothing else.
//
// What the counts do NOT mean: the disturbance rasters encode "nothing
// recorded" and "outside the mapped area" with the same zero, and they start
// in 1985 while the loss series starts in 1984. A cell with no recorded
// harvest is therefore not a cell known to be unharvested, and this stage
// records the coverage it actually had rather than implying the rest.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const STORE = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1");
const DISTURBANCE = path.join(STORE, "disturbance");
const GRID_WIDTH = 193936;

async function readRunStore(file, runCount) {
  const rows = new Uint32Array(runCount);
  const x0 = new Uint32Array(runCount);
  const x1 = new Uint32Array(runCount);
  let index = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: RUN_RECORD_BYTES * 65536 })) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let at = 0; at + RUN_RECORD_BYTES <= chunk.byteLength; at += RUN_RECORD_BYTES) {
      rows[index] = view.getUint32(at, true);
      x0[index] = view.getUint32(at + 4, true);
      x1[index] = view.getUint32(at + 8, true);
      index += 1;
    }
  }
  if (index !== runCount) throw new Error(`${file} held ${index} runs, not ${runCount}`);
  return { rows, x0, x1 };
}

/** Which patch each run belongs to, from the patch store's run counts. */
async function readPatchOwners(file, patchCount, runCount) {
  const owner = new Uint32Array(runCount);
  const cellCount = new Uint32Array(patchCount);
  const componentId = new Float64Array(patchCount);
  let patch = 0;
  let run = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: PATCH_RECORD_BYTES * 65536 })) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let at = 0; at + PATCH_RECORD_BYTES <= chunk.byteLength; at += PATCH_RECORD_BYTES) {
      const record = readPatchRecord(view, at);
      cellCount[patch] = record.cellCount;
      componentId[patch] = Number(record.componentId);
      for (let step = 0; step < record.runCount; step += 1) {
        owner[run] = patch;
        run += 1;
      }
      patch += 1;
    }
  }
  if (patch !== patchCount) throw new Error(`${file} held ${patch} patches, not ${patchCount}`);
  if (run !== runCount) throw new Error(`${file} accounted for ${run} runs, not ${runCount}`);
  return { owner, cellCount, componentId };
}

/** Groups run indices by row without a comparison sort. */
function groupByRow(rows, height) {
  const starts = new Uint32Array(height + 2);
  for (let index = 0; index < rows.length; index += 1) starts[rows[index] + 1] += 1;
  for (let row = 1; row < starts.length; row += 1) starts[row] += starts[row - 1];
  const cursor = starts.slice();
  const order = new Uint32Array(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    order[cursor[rows[index]]] = index;
    cursor[rows[index]] += 1;
  }
  return { starts, order };
}

async function accumulateYear(file, store, group, scratch, totals) {
  let scratchRow = -1;
  const clear = () => {
    if (scratchRow < 0) return;
    for (let at = group.starts[scratchRow]; at < group.starts[scratchRow + 1]; at += 1) {
      const run = group.order[at];
      scratch.fill(0, store.x0[run], store.x1[run] + 1);
    }
  };
  let matched = 0;
  for await (const chunk of createReadStream(file, { highWaterMark: RUN_RECORD_BYTES * 65536 })) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let at = 0; at + RUN_RECORD_BYTES <= chunk.byteLength; at += RUN_RECORD_BYTES) {
      const row = view.getUint32(at, true);
      const from = view.getUint32(at + 4, true);
      const to = view.getUint32(at + 8, true);
      if (row !== scratchRow) {
        if (row < scratchRow) throw new Error(`${file} is not in row order at row ${row}`);
        clear();
        scratchRow = row;
        for (let index = group.starts[row]; index < group.starts[row + 1]; index += 1) {
          const run = group.order[index];
          scratch.fill(run + 1, store.x0[run], store.x1[run] + 1);
        }
      }
      for (let x = from; x <= to; x += 1) {
        const held = scratch[x];
        if (held !== 0) {
          totals[store.owner[held - 1]] += 1;
          matched += 1;
        }
      }
    }
  }
  clear();
  return matched;
}

const yearsOf = (interval) => {
  const match = /(\d{4})-(\d{4})$/.exec(interval);
  if (match === null) throw new Error(`cannot read years from ${interval}`);
  return [Number(match[1]), Number(match[2])];
};

async function attributeInterval(entry, available) {
  const patchFile = path.join(STORE, `${entry.interval}.patches.bin`);
  const runFile = path.join(STORE, `${entry.interval}.runs.bin`);
  const store = await readRunStore(runFile, entry.runCount);
  const { owner, cellCount } = await readPatchOwners(patchFile, entry.patchCount, entry.runCount);
  store.owner = owner;
  const group = groupByRow(store.rows, 128340);
  const scratch = new Uint32Array(GRID_WIDTH);

  const harvest = new Uint32Array(entry.patchCount);
  const fire = new Uint32Array(entry.patchCount);
  const years = yearsOf(entry.interval);
  const covered = [];
  for (const [kind, totals] of [["harvest", harvest], ["fire", fire]]) {
    for (const year of years) {
      const file = path.join(DISTURBANCE, `${kind}-${year}.runs.bin`);
      if (!available.has(`${kind}-${year}`)) continue;
      await accumulateYear(file, store, group, scratch, totals);
      covered.push(`${kind}-${year}`);
    }
  }

  const payload = Buffer.allocUnsafe(entry.patchCount * 8);
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let harvestCells = 0;
  let fireCells = 0;
  let bothCells = 0;
  for (let patch = 0; patch < entry.patchCount; patch += 1) {
    const h = Math.min(harvest[patch], cellCount[patch]);
    const f = Math.min(fire[patch], cellCount[patch]);
    if (harvest[patch] > cellCount[patch] || fire[patch] > cellCount[patch]) {
      throw new Error(`patch ${patch} matched more disturbance cells than it has`);
    }
    view.setUint32(patch * 8, h, true);
    view.setUint32(patch * 8 + 4, f, true);
    harvestCells += h;
    fireCells += f;
    if (h > 0 && f > 0) bothCells += 1;
  }
  const out = path.join(STORE, `${entry.interval}.attrs.bin`);
  const handle = await open(out, "w");
  await handle.write(payload);
  await handle.close();
  return {
    interval: entry.interval,
    patchCount: entry.patchCount,
    harvestCells,
    fireCells,
    patchesWithBoth: bothCells,
    disturbanceYearsUsed: covered,
    disturbanceYearsMissing: years
      .flatMap((year) => ["harvest", "fire"].map((kind) => `${kind}-${year}`))
      .filter((key) => !available.has(key)),
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
}

const manifest = JSON.parse(await readFile(path.join(STORE, "manifest.json"), "utf8"));
const available = new Set();
for (const kind of ["harvest", "fire"]) {
  const file = path.join(DISTURBANCE, `${kind}-manifest.json`);
  const record = JSON.parse(await readFile(file, "utf8"));
  for (const year of Object.keys(record.years)) available.add(`${kind}-${year}`);
}

const results = [];
for (const entry of manifest.intervals) {
  const started = Date.now();
  const result = await attributeInterval(entry, available);
  const seconds = (Date.now() - started) / 1000;
  results.push(result);
  process.stdout.write(
    `${entry.interval.replace("detected-forest-loss-", "")}  ` +
      `${result.harvestCells.toLocaleString()} harvest cells  ` +
      `${result.fireCells.toLocaleString()} fire cells  ` +
      `${result.disturbanceYearsMissing.length} years unavailable  ${seconds.toFixed(1)}s\n`,
  );
}

await writeFile(
  path.join(STORE, "attribution-manifest.json"),
  `${JSON.stringify(
    {
      product: "phase2-per-cell-geometry-1984-2022-v1",
      stage: "attribution",
      rule:
        "counts are cells with a recorded harvest or fire in the same interval; " +
        "a zero is not evidence that none occurred, because the source rasters " +
        "encode no-record and outside-the-mapped-area identically",
      intervals: results,
    },
    null,
    2,
  )}\n`,
);
