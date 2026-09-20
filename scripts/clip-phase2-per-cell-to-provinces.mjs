import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PATCH_RECORD_BYTES, RUN_RECORD_BYTES, readPatchRecord, writePatchRecord } from "../lib/phase2/patch-geometry.mjs";

// The national per-cell store, cut down to the cells of BC, AB, ON and QC.
//
// The yearly patch archives were built for all of Canada, so the map drew
// patches in Saskatchewan, New Brunswick and the territories while every
// figure beside it spoke of four provinces. This keeps only the loss cells the
// province figures count, using the province cell runs built by
// build-phase2-four-province-cell-runs.py, which rasterize each province by
// the worker's own centre rule. A patch that crosses a province border keeps
// its inside cells and its component id; a patch wholly outside is dropped.
//
// The anchor is exact, not approximate: for every interval, the cells kept in
// each province must equal that province's annualLossCells in the admitted
// span aggregate. The run fails, and writes nothing it could be mistaken for a
// finished product, if any province is off by a single cell.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const SOURCE = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1");
const OUT = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-four-province-v1");
const MASK = path.join(DATA_ROOT, "derived/phase2-four-province-cell-runs-v1/four-province-cell-runs.bin");
const SPANS = new URL("../data/phase3-province-interval-spans-1984-2022.json", import.meta.url);
const HEIGHT = 128340;
const PROVINCES = [
  { code: "BC", pruid: "59" },
  { code: "AB", pruid: "48" },
  { code: "ON", pruid: "35" },
  { code: "QC", pruid: "24" },
];

/** A forward-only record reader over a binary file of fixed-width records. */
class RecordReader {
  constructor(file, recordBytes, recordsPerChunk = 65536) {
    this.stream = createReadStream(file, { highWaterMark: recordBytes * recordsPerChunk });
    this.iterator = this.stream[Symbol.asyncIterator]();
    this.recordBytes = recordBytes;
    this.buffer = Buffer.alloc(0);
    this.offset = 0;
  }

  async take(count) {
    const need = count * this.recordBytes;
    if (this.buffer.length - this.offset < need) {
      let held = this.buffer.subarray(this.offset);
      while (held.length < need) {
        const next = await this.iterator.next();
        if (next.done) throw new Error(`record store ended ${need - held.length} bytes early`);
        held = held.length === 0 ? next.value : Buffer.concat([held, next.value]);
      }
      this.buffer = held;
      this.offset = 0;
    }
    const at = this.offset;
    this.offset += need;
    return new DataView(this.buffer.buffer, this.buffer.byteOffset + at, need);
  }

  close() {
    this.stream.destroy();
  }
}

/** A sequential writer that hashes what it writes. */
class HashedWriter {
  constructor(file) {
    this.sink = createWriteStream(file, { flags: "wx" });
    this.hash = createHash("sha256");
    this.bytes = 0;
  }

  async write(buffer) {
    this.hash.update(buffer);
    this.bytes += buffer.length;
    if (!this.sink.write(buffer)) await new Promise((resolve) => this.sink.once("drain", resolve));
  }

  async close() {
    await new Promise((resolve, reject) => this.sink.end((error) => (error ? reject(error) : resolve())));
    const written = { sha256: this.hash.digest("hex"), byteLength: this.bytes };
    // Read the file back: a hash of what was handed to the stream proves
    // nothing about what reached the disk.
    const onDisk = createHash("sha256");
    for await (const chunk of createReadStream(this.sink.path)) onDisk.update(chunk);
    if (onDisk.digest("hex") !== written.sha256) throw new Error(`${this.sink.path} on disk differs from what was written`);
    return written;
  }
}

/** Loads the province runs and indexes them by row. */
export async function loadMask(file) {
  const bytes = await readFile(file);
  const count = bytes.length / 16;
  if (!Number.isInteger(count)) throw new Error(`${file} is not a whole number of 16-byte records`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const x0 = new Uint32Array(count);
  const x1 = new Uint32Array(count);
  const province = new Uint8Array(count);
  const rowStart = new Uint32Array(HEIGHT + 1);
  let lastRow = 0;
  for (let index = 0; index < count; index += 1) {
    const row = view.getUint32(index * 16, true);
    if (row < lastRow) throw new Error("province runs are not in row order");
    for (let fill = lastRow + 1; fill <= row; fill += 1) rowStart[fill] = index;
    lastRow = row;
    x0[index] = view.getUint32(index * 16 + 4, true);
    x1[index] = view.getUint32(index * 16 + 8, true);
    province[index] = view.getUint32(index * 16 + 12, true);
  }
  for (let fill = lastRow + 1; fill <= HEIGHT; fill += 1) rowStart[fill] = count;
  return { x0, x1, province, rowStart };
}

/**
 * Intersects one loss run with the province runs of its row. Appends the kept
 * pieces to `out` as row, x0, x1 triples and adds each piece's cells to
 * `perProvince`. Pieces from neighbouring provinces that touch are joined, so
 * the ring tracer never sees two runs abutting in one row.
 */
export function clipRun(mask, row, a, b, out, perProvince) {
  let low = mask.rowStart[row];
  let high = mask.rowStart[row + 1];
  // First province run whose end reaches a.
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (mask.x1[mid] < a) low = mid + 1;
    else high = mid;
  }
  const end = mask.rowStart[row + 1];
  for (let index = low; index < end && mask.x0[index] <= b; index += 1) {
    const from = Math.max(a, mask.x0[index]);
    const to = Math.min(b, mask.x1[index]);
    perProvince[mask.province[index]] += to - from + 1;
    const last = out.length - 3;
    if (last >= 0 && out[last] === row && out[last + 2] + 1 === from) out[last + 2] = to;
    else out.push(row, from, to);
  }
}

async function clipInterval(entry, mask, anchors, intervalIndex) {
  const patches = new RecordReader(path.join(SOURCE, entry.patches.fileName), PATCH_RECORD_BYTES);
  const runs = new RecordReader(path.join(SOURCE, entry.runs.fileName), RUN_RECORD_BYTES);
  const attrs = new RecordReader(path.join(SOURCE, entry.runs.fileName.replace(".runs.bin", ".attrs.bin")), 8);
  const patchOut = new HashedWriter(path.join(OUT, entry.patches.fileName));
  const runOut = new HashedWriter(path.join(OUT, entry.runs.fileName));
  const keptPatchOriginalIndex = new HashedWriter(path.join(OUT, entry.runs.fileName.replace(".runs.bin", ".source-index.bin")));

  const perProvince = [0, 0, 0, 0];
  let keptPatches = 0;
  let cutPatches = 0;
  let droppedPatches = 0;
  let keptRuns = 0;
  let keptCells = 0;
  let sourceCells = 0;
  const patchBuffer = Buffer.alloc(PATCH_RECORD_BYTES);
  const patchView = new DataView(patchBuffer.buffer, patchBuffer.byteOffset, PATCH_RECORD_BYTES);
  const indexBuffer = Buffer.alloc(4);

  for (let index = 0; index < entry.patchCount; index += 1) {
    const patch = readPatchRecord(await patches.take(1), 0);
    const runView = await runs.take(patch.runCount);
    await attrs.take(1); // kept in step; attribution is recomputed on the clipped cells
    sourceCells += patch.cellCount;
    const kept = [];
    let sourceRunCells = 0;
    for (let run = 0; run < patch.runCount; run += 1) {
      const row = runView.getUint32(run * RUN_RECORD_BYTES, true);
      const a = runView.getUint32(run * RUN_RECORD_BYTES + 4, true);
      const b = runView.getUint32(run * RUN_RECORD_BYTES + 8, true);
      sourceRunCells += b - a + 1;
      clipRun(mask, row, a, b, kept, perProvince);
    }
    if (sourceRunCells !== patch.cellCount) throw new Error(`patch ${index} runs hold ${sourceRunCells} cells, not ${patch.cellCount}`);
    if (kept.length === 0) {
      droppedPatches += 1;
      continue;
    }
    let cells = 0;
    let minRow = Infinity;
    let maxRow = -1;
    let minX = Infinity;
    let maxX = -1;
    const runBuffer = Buffer.alloc((kept.length / 3) * RUN_RECORD_BYTES);
    for (let at = 0, out = 0; at < kept.length; at += 3, out += RUN_RECORD_BYTES) {
      const [row, from, to] = [kept[at], kept[at + 1], kept[at + 2]];
      cells += to - from + 1;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (from < minX) minX = from;
      if (to > maxX) maxX = to;
      runBuffer.writeUInt32LE(row, out);
      runBuffer.writeUInt32LE(from, out + 4);
      runBuffer.writeUInt32LE(to, out + 8);
    }
    if (cells < patch.cellCount) cutPatches += 1;
    const runCount = kept.length / 3;
    writePatchRecord(patchView, 0, { componentId: patch.componentId, cellCount: cells, runCount, minRow, maxRow, minX, maxX }, keptRuns);
    await patchOut.write(Buffer.from(patchBuffer)); // a copy: the stream holds the buffer until it drains
    await runOut.write(runBuffer);
    indexBuffer.writeUInt32LE(index, 0);
    await keptPatchOriginalIndex.write(Buffer.from(indexBuffer));
    keptRuns += runCount;
    keptCells += cells;
    keptPatches += 1;
  }
  patches.close();
  runs.close();
  attrs.close();
  if (sourceCells !== entry.cellCount) throw new Error(`${entry.interval} source held ${sourceCells} cells, manifest ${entry.cellCount}`);

  const anchorCheck = PROVINCES.map((province, index) => ({
    code: province.code,
    keptCells: perProvince[index],
    spanAggregateAnnualLossCells: anchors[province.pruid][intervalIndex],
    equal: perProvince[index] === anchors[province.pruid][intervalIndex],
  }));
  const result = {
    interval: entry.interval,
    source: { patchCount: entry.patchCount, runCount: entry.runCount, cellCount: entry.cellCount },
    patchCount: keptPatches,
    runCount: keptRuns,
    cellCount: keptCells,
    patchesCutAtABorder: cutPatches,
    patchesDropped: droppedPatches,
    patches: { fileName: entry.patches.fileName, ...(await patchOut.close()) },
    runs: { fileName: entry.runs.fileName, ...(await runOut.close()) },
    sourceIndex: {
      fileName: entry.runs.fileName.replace(".runs.bin", ".source-index.bin"),
      meaning: "for each kept patch, its index in the national store, as uint32 little-endian",
      ...(await keptPatchOriginalIndex.close()),
    },
    provinces: anchorCheck,
  };
  if (keptCells !== perProvince.reduce((sum, value) => sum + value, 0)) throw new Error("kept cells do not add up across provinces");
  return result;
}

export async function main(intervals) {
  const manifest = JSON.parse(await readFile(path.join(SOURCE, "manifest.json"), "utf8"));
  const spans = JSON.parse(await readFile(SPANS, "utf8"));
  const anchors = Object.fromEntries(spans.boundariesSummed.map((entry) => [entry.boundaryId, entry.annualLossCells]));
  const mask = await loadMask(MASK);
  await mkdir(OUT, { recursive: true });
  for (const name of intervals) {
    const intervalIndex = manifest.intervals.findIndex((entry) => entry.interval === name);
    if (intervalIndex === -1) throw new Error(`${name} is not in the national store`);
    const started = Date.now();
    const result = await clipInterval(manifest.intervals[intervalIndex], mask, anchors, intervalIndex);
    result.seconds = (Date.now() - started) / 1000;
    const receipt = path.join(OUT, `${name}.clip.json`);
    await writeFile(receipt, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
    const off = result.provinces.filter((province) => !province.equal);
    process.stderr.write(
      `${name}  kept ${result.patchCount.toLocaleString()} of ${result.source.patchCount.toLocaleString()} patches, ` +
        `${result.cellCount.toLocaleString()} of ${result.source.cellCount.toLocaleString()} cells, ` +
        `${off.length === 0 ? "all four provinces equal the span aggregate" : `MISMATCH ${JSON.stringify(off)}`}  ${result.seconds.toFixed(1)}s\n`,
    );
    if (off.length > 0) process.exitCode = 1;
  }
}

/** Assembles the clipped store's manifest from the per-interval receipts, in the national order. */
export async function writeManifest() {
  const national = JSON.parse(await readFile(path.join(SOURCE, "manifest.json"), "utf8"));
  const mask = JSON.parse(await readFile(`${MASK}.json`, "utf8"));
  const intervals = [];
  for (const entry of national.intervals) {
    const receipt = JSON.parse(await readFile(path.join(OUT, `${entry.interval}.clip.json`), "utf8"));
    if (receipt.provinces.some((province) => !province.equal)) throw new Error(`${entry.interval} does not match the span aggregate`);
    intervals.push({
      interval: entry.interval,
      patchCount: receipt.patchCount,
      runCount: receipt.runCount,
      cellCount: receipt.cellCount,
      patchesCutAtABorder: receipt.patchesCutAtABorder,
      patchesDropped: receipt.patchesDropped,
      provinces: receipt.provinces,
      patches: receipt.patches,
      runs: receipt.runs,
      sourceIndex: receipt.sourceIndex,
      nationalSource: { patches: entry.patches, runs: entry.runs, cellCount: entry.cellCount },
    });
  }
  const manifest = {
    schemaVersion: national.schemaVersion,
    product: "phase2-per-cell-geometry-1984-2022-four-province-v1",
    derivedFrom: "phase2-per-cell-geometry-1984-2022-v1",
    method: national.method,
    clip: {
      script: "scripts/clip-phase2-per-cell-to-provinces.mjs",
      rule: "keep a loss cell only when the province cell runs place it in BC, AB, ON or QC; a patch keeps its component id and its inside cells, and is dropped when none are inside",
      provinceCellRuns: { path: mask.output.path, byteLength: mask.output.byteLength, sha256: mask.output.sha256 },
      anchor: "for every interval and province, kept cells equal annualLossCells in data/phase3-province-interval-spans-1984-2022.json",
      allIntervalsMatchAnchor: true,
    },
    grid: national.grid,
    patchRecordBytes: national.patchRecordBytes,
    runRecordBytes: national.runRecordBytes,
    productionEligible: false,
    released: false,
    expertReviewed: false,
    intervals,
  };
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

if (process.argv[2] === "--manifest") await writeManifest();
else if (process.argv.length > 2) await main(process.argv.slice(2));
