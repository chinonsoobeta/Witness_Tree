import { createReadStream, createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PATCH_RECORD_BYTES, RUN_RECORD_BYTES, readPatchRecord } from "../lib/phase2/patch-geometry.mjs";
import { inverseLcc } from "../lib/phase2/lcc.mjs";
import { traceRings } from "../lib/phase2/rings.mjs";

// Stage 2: the binary patch store becomes newline-delimited GeoJSON for the
// tiler. Geometry is traced exactly from the runs and never simplified here;
// whatever generalization the tiles carry is applied by the tiler, at a zoom
// the method record marks as presentation only, and the run store stays the
// authoritative product.
//
// Two sequential readers run over the two files of one interval, and the
// patch stream drives the run stream forward. Runs are stored in patch order,
// so the run reader only ever moves forward and never seeks.

const DATA_ROOT = process.env.WITNESS_TREE_DATA_ROOT ?? "/Volumes/Extended_SSD/Witness_Tree-data";
const STORE = path.join(DATA_ROOT, "derived/phase2-per-cell-geometry-1984-2022-v1");

// The national grid, read back from the loss rasters rather than assumed.
const ORIGIN_X = -2660910.524;
const ORIGIN_Y = 2998848.1105;
const CELL_METRES = 30;

const COORDINATE_DECIMALS = 7; // about a centimetre; the cell is 30 m

/** A forward-only record reader over a binary file of fixed-width records. */
class RecordReader {
  constructor(file, recordBytes, recordsPerChunk = 65536) {
    this.stream = createReadStream(file, { highWaterMark: recordBytes * recordsPerChunk });
    this.iterator = this.stream[Symbol.asyncIterator]();
    this.recordBytes = recordBytes;
    this.buffer = Buffer.alloc(0);
    this.offset = 0;
  }

  /** Returns a DataView positioned at the next `count` records. */
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
    return { view: new DataView(this.buffer.buffer, this.buffer.byteOffset + at, need) };
  }

  async close() {
    this.stream.destroy();
  }
}

const round = (value) => {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
};

/** Grid vertex to [lon, lat], through the grid's own projection. */
export function vertexToLonLat(x, y) {
  const [lon, lat] = inverseLcc(ORIGIN_X + x * CELL_METRES, ORIGIN_Y - y * CELL_METRES);
  return [round(lon), round(lat)];
}

/**
 * Ray casts a half-integer point against a rectilinear ring of integer
 * vertices. The point never lies on an edge or a vertex, so there are no
 * degenerate crossings to special-case.
 */
function containsPoint(ring, px, py) {
  let inside = false;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[index + 1];
    if (ax !== bx) continue; // only vertical edges can cross a horizontal ray
    if (ay < py === by < py) continue;
    if (ax > px) inside = !inside;
  }
  return inside;
}

/**
 * Picks a point that is inside the patch and just outside the hole. Holes are
 * wound with the patch interior on the right, so stepping half a cell to the
 * right of any hole edge lands in the patch, and therefore inside whichever
 * outer ring owns the hole.
 */
function pointInsideHost(hole) {
  const [ax, ay] = hole[0];
  const [bx, by] = hole[1];
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  return [(ax + bx) / 2 - dy * 0.5, (ay + by) / 2 + dx * 0.5];
}

function ringsToCoordinates(rings) {
  // Ring one is an outer ring by construction; a patch is one connected
  // component, so any further positive-area ring is a separate outer ring only
  // where the component touches itself corner to corner. Those are emitted as
  // separate polygons in a MultiPolygon so no ring is silently dropped.
  const polygons = [];
  const outers = [];
  const holes = [];
  for (const ring of rings) {
    let area = 0;
    for (let index = 0; index < ring.length - 1; index += 1) {
      area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
    }
    if (area > 0) {
      outers.push(ring);
      polygons.push([ring.map(([x, y]) => vertexToLonLat(x, y))]);
    } else {
      holes.push(ring);
    }
  }
  if (polygons.length === 0) throw new Error("a patch traced no outer ring");
  for (const hole of holes) {
    let host = 0;
    if (polygons.length > 1) {
      const [px, py] = pointInsideHost(hole);
      host = outers.findIndex((outer) => containsPoint(outer, px, py));
      if (host === -1) throw new Error("a hole fell outside every outer ring of its patch");
    }
    polygons[host].push(hole.map(([x, y]) => vertexToLonLat(x, y)));
  }
  return polygons;
}

async function emitInterval(intervalName, output) {
  const manifest = JSON.parse(await readFile(path.join(STORE, "manifest.json"), "utf8"));
  const interval = manifest.intervals.find((entry) => entry.interval === intervalName);
  if (interval === undefined) throw new Error(`${intervalName} is not in the store manifest`);
  const patches = new RecordReader(path.join(STORE, interval.patches.fileName), PATCH_RECORD_BYTES);
  const runs = new RecordReader(path.join(STORE, interval.runs.fileName), RUN_RECORD_BYTES);
  // Stage 3's counts ride along with the geometry. The interval itself is a
  // property of the archive, not of every feature in it, and hectares are
  // cells times 0.09, so neither is repeated three hundred million times.
  const attributes = new RecordReader(path.join(STORE, interval.runs.fileName.replace(".runs.bin", ".attrs.bin")), 8);

  const sink = createWriteStream(output);
  const write = (line) =>
    sink.write(line) ? Promise.resolve() : new Promise((resolve) => sink.once("drain", resolve));

  let written = 0;
  let cells = 0;
  for (let index = 0; index < interval.patchCount; index += 1) {
    const { view } = await patches.take(1);
    const patch = readPatchRecord(view, 0);
    const runView = (await runs.take(patch.runCount)).view;
    const flat = new Uint32Array(patch.runCount * 3);
    for (let run = 0; run < patch.runCount; run += 1) {
      flat[run * 3] = runView.getUint32(run * RUN_RECORD_BYTES, true);
      flat[run * 3 + 1] = runView.getUint32(run * RUN_RECORD_BYTES + 4, true);
      flat[run * 3 + 2] = runView.getUint32(run * RUN_RECORD_BYTES + 8, true);
    }
    const polygons = ringsToCoordinates(traceRings(flat, patch.cellCount));
    const geometry =
      polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };
    const attributeView = (await attributes.take(1)).view;
    await write(
      `${JSON.stringify({
        type: "Feature",
        properties: {
          id: Number(patch.componentId),
          cells: patch.cellCount,
          harvest: attributeView.getUint32(0, true),
          fire: attributeView.getUint32(4, true),
        },
        geometry,
      })}\n`,
    );
    written += 1;
    cells += patch.cellCount;
    if (written % 500000 === 0) process.stderr.write(`  ${intervalName} ${written.toLocaleString()} features\n`);
  }
  await patches.close();
  await runs.close();
  await attributes.close();
  await new Promise((resolve) => sink.end(resolve));
  if (written !== interval.patchCount) throw new Error(`emitted ${written} of ${interval.patchCount} patches`);
  if (cells !== interval.cellCount) throw new Error(`emitted ${cells} cells against ${interval.cellCount} in the store`);
  return { features: written, cells };
}

const [, , intervalArgument, outputArgument] = process.argv;
if (intervalArgument !== undefined) {
  const started = Date.now();
  const result = await emitInterval(intervalArgument, outputArgument);
  const seconds = (Date.now() - started) / 1000;
  process.stderr.write(
    `${intervalArgument}  ${result.features.toLocaleString()} features  ${result.cells.toLocaleString()} cells  ${seconds.toFixed(1)}s\n`,
  );
}

export { emitInterval, ringsToCoordinates };
