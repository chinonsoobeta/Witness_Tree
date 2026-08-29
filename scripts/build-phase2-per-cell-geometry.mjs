import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { PATCH_RECORD_BYTES, PatchAccumulator, RUN_RECORD_BYTES, writePatchRecord } from "../lib/phase2/patch-geometry.mjs";

// One reader per volume. The SSD holding this data measures 137 MB/s on a
// single sequential stream and 101 MB/s aggregate across six, so fanning out
// readers makes this slower, not faster. The line scanner keeps up with the
// device on one thread, which is why there is no worker pool here.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const LINEAGE = path.join(DATA_ROOT, "derived/phase2-real-loss-component-inventory-1984-2022-v1");
const OUT = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1");

const KEY_RECORD = Buffer.from('"record":"');
const KEY_ROW = Buffer.from('"row":');
const KEY_X0 = Buffer.from('"x0":');
const KEY_X1 = Buffer.from('"x1":');
const KEY_CELL_COUNT = Buffer.from('"cellCount":');
const KEY_COMPONENT_ID = Buffer.from('"componentId":');
const KEY_FROM = Buffer.from('"fromComponentId":');
const KEY_TO = Buffer.from('"toComponentId":');

function readUint(buffer, from) {
  let value = 0;
  let index = from;
  while (index < buffer.length) {
    const code = buffer[index];
    if (code < 48 || code > 57) break;
    value = value * 10 + (code - 48);
    index += 1;
  }
  return value;
}

/** Reads an integer that must be present; a missing key is a corrupt line. */
function field(line, key) {
  const at = line.indexOf(key);
  if (at === -1) throw new Error(`Lineage line is missing ${key}: ${line.toString("utf8").slice(0, 200)}`);
  return readUint(line, at + key.length);
}

class ChunkedWriter {
  constructor(stream, recordBytes, recordsPerFlush) {
    this.stream = stream;
    this.recordBytes = recordBytes;
    this.buffer = Buffer.allocUnsafe(recordBytes * recordsPerFlush);
    this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    this.offset = 0;
    this.hash = createHash("sha256");
    this.records = 0;
  }

  get room() {
    return this.buffer.byteLength - this.offset;
  }

  async flush() {
    if (this.offset === 0) return;
    const slice = this.buffer.subarray(0, this.offset);
    this.hash.update(slice);
    if (!this.stream.write(Buffer.from(slice))) await new Promise((resolve) => this.stream.once("drain", resolve));
    this.offset = 0;
  }

  async ensure(bytes) {
    if (this.room < bytes) await this.flush();
  }

  async close() {
    await this.flush();
    await new Promise((resolve, reject) => this.stream.end((error) => (error ? reject(error) : resolve())));
    return this.hash.digest("hex");
  }
}

async function buildInterval(fileName, expected) {
  const source = path.join(LINEAGE, "components", fileName);
  const stem = fileName.replace(".components.jsonl", "");
  const patchesPath = path.join(OUT, `${stem}.patches.bin`);
  const runsPath = path.join(OUT, `${stem}.runs.bin`);

  const patchWriter = new ChunkedWriter(createWriteStream(patchesPath), PATCH_RECORD_BYTES, 65536);
  const runWriter = new ChunkedWriter(createWriteStream(runsPath), RUN_RECORD_BYTES, 262144);
  const accumulator = new PatchAccumulator();

  let runOffset = 0;
  let patchCount = 0;
  let cellTotal = 0;
  let runTotal = 0;
  let aliasCount = 0;
  let declaredMismatch = 0;
  let bytes = 0;
  let carry = Buffer.alloc(0);
  const started = Date.now();

  const sourceHash = createHash("sha256");

  for await (const chunk of createReadStream(source, { highWaterMark: 1 << 26 })) {
    bytes += chunk.length;
    sourceHash.update(chunk);
    const buffer = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let start = 0;
    while (true) {
      const newline = buffer.indexOf(10, start);
      if (newline === -1) break;
      const line = buffer.subarray(start, newline);
      start = newline + 1;
      const recordAt = line.indexOf(KEY_RECORD);
      if (recordAt === -1) continue;
      const kind = line[recordAt + KEY_RECORD.length];
      if (kind === 114) {
        // run
        accumulator.addRun(field(line, KEY_COMPONENT_ID), field(line, KEY_ROW), field(line, KEY_X0), field(line, KEY_X1));
      } else if (kind === 99) {
        // component
        const patch = accumulator.finish(field(line, KEY_COMPONENT_ID), field(line, KEY_CELL_COUNT));
        if (patch === null) throw new Error(`Component ${field(line, KEY_COMPONENT_ID)} closed with no runs in ${fileName}.`);
        if (patch.cellCount !== patch.declaredCellCount) declaredMismatch += 1;
        await patchWriter.ensure(PATCH_RECORD_BYTES);
        writePatchRecord(patchWriter.view, patchWriter.offset, patch, runOffset);
        patchWriter.offset += PATCH_RECORD_BYTES;
        patchWriter.records += 1;
        for (let index = 0; index < patch.runCount; index += 1) {
          await runWriter.ensure(RUN_RECORD_BYTES);
          runWriter.view.setUint32(runWriter.offset, patch.runs[index * 3], true);
          runWriter.view.setUint32(runWriter.offset + 4, patch.runs[index * 3 + 1], true);
          runWriter.view.setUint32(runWriter.offset + 8, patch.runs[index * 3 + 2], true);
          runWriter.offset += RUN_RECORD_BYTES;
          runWriter.records += 1;
        }
        runOffset += patch.runCount;
        runTotal += patch.runCount;
        cellTotal += patch.cellCount;
        patchCount += 1;
      } else if (kind === 97) {
        // alias
        accumulator.addAlias(field(line, KEY_FROM), field(line, KEY_TO));
        aliasCount += 1;
      }
    }
    carry = buffer.subarray(start);
  }
  if (carry.length > 0 && carry.some((byte) => byte !== 10)) throw new Error(`${fileName} ended mid-line.`);

  const patchesSha256 = await patchWriter.close();
  const runsSha256 = await runWriter.close();
  const seconds = (Date.now() - started) / 1000;

  if (accumulator.openCount !== 0) throw new Error(`${fileName} left ${accumulator.openCount} components open; the lineage is truncated or a component record is missing.`);

  const result = {
    interval: stem.replace("detected-forest-loss-", ""),
    source: { fileName, sha256: sourceHash.digest("hex"), byteLength: bytes },
    patchCount,
    runCount: runTotal,
    cellCount: cellTotal,
    aliasCount,
    peakOpenComponents: accumulator.peakOpen,
    declaredCellCountMismatches: declaredMismatch,
    patches: { fileName: path.basename(patchesPath), sha256: patchesSha256, byteLength: patchCount * PATCH_RECORD_BYTES },
    runs: { fileName: path.basename(runsPath), sha256: runsSha256, byteLength: runTotal * RUN_RECORD_BYTES },
    seconds: Number(seconds.toFixed(2)),
    readMBps: Number((bytes / 1e6 / seconds).toFixed(1)),
  };

  // The lineage inventory recorded these counts when it labelled the raster.
  // Reproducing them from the geometry is the whole reason the labelling was
  // done first, so a mismatch stops the run rather than being noted.
  if (expected) {
    if (result.patchCount !== expected.connectedComponentCount) throw new Error(`${stem}: ${result.patchCount} patches against ${expected.connectedComponentCount} in the lineage inventory.`);
    if (result.cellCount !== expected.lossCellCount) throw new Error(`${stem}: ${result.cellCount} cells against ${expected.lossCellCount} in the lineage inventory.`);
    if (result.source.sha256 !== expected.componentLineageSha256) throw new Error(`${stem}: the component lineage checksum drifted.`);
  }
  if (declaredMismatch !== 0) throw new Error(`${stem}: ${declaredMismatch} components disagree with their own declared cellCount.`);

  return result;
}

export async function buildPerCellGeometry({ only } = {}) {
  const inventory = JSON.parse(await readFile(path.join(LINEAGE, "inventory.json"), "utf8"));
  await mkdir(OUT, { recursive: true });
  const pairs = inventory.pairs.filter((pair) => !only || only.includes(pair.componentLineage.fileName));
  const results = [];
  for (const pair of pairs) {
    const expected = { connectedComponentCount: pair.inventory.connectedComponentCount, lossCellCount: pair.inventory.lossCellCount, componentLineageSha256: pair.componentLineage.sha256 };
    const result = await buildInterval(pair.componentLineage.fileName, expected);
    results.push(result);
    console.log(`${result.interval}  ${result.patchCount.toLocaleString()} patches  ${result.runCount.toLocaleString()} runs  ${result.cellCount.toLocaleString()} cells  ${result.seconds}s  ${result.readMBps} MB/s`);
  }
  return results;
}

if (process.argv[1]?.endsWith("build-phase2-per-cell-geometry.mjs")) {
  const only = process.argv.slice(2).filter((argument) => argument.endsWith(".jsonl"));
  const results = await buildPerCellGeometry({ only: only.length ? only : undefined });
  const manifest = {
    schemaVersion: "witness-tree/phase2-per-cell-geometry/1",
    method: "data/phase2-per-cell-geometry-method.json",
    grid: { width: 193936, height: 128340, pixelWidth: 30, pixelHeight: -30, originX: -2660910.524, originY: 2998848.1105 },
    patchRecordBytes: PATCH_RECORD_BYTES,
    runRecordBytes: RUN_RECORD_BYTES,
    productionEligible: false,
    released: false,
    expertReviewed: false,
    intervals: results,
    totals: {
      patchCount: results.reduce((sum, entry) => sum + entry.patchCount, 0),
      runCount: results.reduce((sum, entry) => sum + entry.runCount, 0),
      cellCount: results.reduce((sum, entry) => sum + entry.cellCount, 0),
    },
  };
  await writeFile(path.join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\n${manifest.totals.patchCount.toLocaleString()} patches, ${manifest.totals.cellCount.toLocaleString()} cells, ${results.length} intervals.`);
}
