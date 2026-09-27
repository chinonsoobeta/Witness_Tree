// Phase 4: match one interval's detected-change patches in one province
// against that province's official records, and write the partial counts.
//
// Detected changes are the per-cell loss patches of the four-province store.
// A patch belongs to the province holding most of its cells. Official records
// are the cell runs written by scripts/phase4_rasterize_records.py, one file
// per event year. A record is a candidate for a patch when they share at least
// one cell and its event year lies within CANDIDATE_WINDOW_YEARS of the
// patch's observation year; the window is wider than the matching tolerance so
// that date mismatches are observable as rejections rather than silence.
//
// Every patch is judged by lib/pipeline/matching.ts and every non-match is
// keyed by lib/phase4/provincial-matching.ts, the same code the report uses.
//
// Memory is bounded: the interval's runs are held as typed arrays, overlaps
// are counted in a fixed-capacity open-addressing table that refuses to grow
// past MAX_PAIRS rather than swapping, and record runs are streamed.
import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { matchDetectedChange, type OfficialRecordCandidate } from "../lib/pipeline/matching";
import { nonMatchReasonKey } from "../lib/phase4/provincial-matching";

export const CANDIDATE_WINDOW_YEARS = 5;
const WIDTH = 193936;
const HEIGHT = 128340;
const PATCH_BYTES = 40;
const RUN_BYTES = 12;
const RECORD_RUN_BYTES = 16;
const REC_BITS = 2 ** 23;
const MAX_PAIRS = 2 ** 26;
const PROVINCE_INDEX = { BC: 0, QC: 3 } as const;
const hectares = (cells: number) => (cells * 9) / 100;

/** Counts (patch, record) cell overlaps in typed arrays. */
class PairCounter {
  keys: Float64Array;
  counts: Uint32Array;
  size = 0;
  constructor(capacity = 2 ** 20) {
    this.keys = new Float64Array(capacity).fill(-1);
    this.counts = new Uint32Array(capacity);
  }
  private slot(key: number, keys: Float64Array) {
    const mask = keys.length - 1;
    const hi = Math.floor(key / REC_BITS);
    const lo = key - hi * REC_BITS;
    let at = (Math.imul(hi, 0x9e3779b1) ^ Math.imul(lo, 0x85ebca77)) & mask;
    while (keys[at] !== -1 && keys[at] !== key) at = (at + 1) & mask;
    return at;
  }
  add(key: number) {
    if (this.size * 10 >= this.keys.length * 7) this.grow();
    const at = this.slot(key, this.keys);
    if (this.keys[at] === -1) {
      this.keys[at] = key;
      this.size += 1;
    }
    this.counts[at] += 1;
  }
  get(key: number) {
    return this.counts[this.slot(key, this.keys)];
  }
  private grow() {
    const capacity = this.keys.length * 2;
    if (capacity > MAX_PAIRS) throw new Error(`more than ${MAX_PAIRS * 0.7} overlapping pairs: refusing to grow further`);
    const oldKeys = this.keys;
    const oldCounts = this.counts;
    this.keys = new Float64Array(capacity).fill(-1);
    this.counts = new Uint32Array(capacity);
    for (let i = 0; i < oldKeys.length; i += 1) {
      if (oldKeys[i] === -1) continue;
      const at = this.slot(oldKeys[i], this.keys);
      this.keys[at] = oldKeys[i];
      this.counts[at] = oldCounts[i];
    }
  }
  sortedKeys() {
    const out = new Float64Array(this.size);
    let n = 0;
    for (const key of this.keys) if (key !== -1) out[n++] = key;
    return out.sort();
  }
}

async function* fixedRecords(file: string, bytes: number) {
  let carry: Buffer = Buffer.alloc(0);
  for await (const chunk of createReadStream(file, { highWaterMark: bytes * 65536 })) {
    const data = carry.length ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer);
    const whole = data.length - (data.length % bytes);
    yield new DataView(data.buffer, data.byteOffset, whole);
    carry = data.subarray(whole);
  }
  if (carry.length) throw new Error(`${file} ends mid-record`);
}

export async function matchInterval(options: {
  store: string; records: string; sources: string[]; mask: string; interval: string; province: "BC" | "QC";
}) {
  const started = Date.now();
  const [from, to] = options.interval.split("-").map(Number);
  const observationYear = to;
  const base = path.join(options.store, `detected-forest-loss-${options.interval}`);

  // Patches, then the owner and extent of every run.
  const patchBytes = await readFile(`${base}.patches.bin`);
  const patchCount = patchBytes.length / PATCH_BYTES;
  const cellCount = new Uint32Array(patchCount);
  const patchView = new DataView(patchBytes.buffer, patchBytes.byteOffset, patchBytes.length);
  let runTotal = 0;
  for (let p = 0; p < patchCount; p += 1) {
    cellCount[p] = patchView.getUint32(p * PATCH_BYTES + 8, true);
    runTotal += patchView.getUint32(p * PATCH_BYTES + 12, true);
  }
  const rows = new Uint32Array(runTotal);
  const x0 = new Uint32Array(runTotal);
  const x1 = new Uint32Array(runTotal);
  const owner = new Uint32Array(runTotal);
  {
    let run = 0;
    let p = 0;
    let left = patchCount ? patchView.getUint32(12, true) : 0;
    for await (const view of fixedRecords(`${base}.runs.bin`, RUN_BYTES)) {
      for (let at = 0; at < view.byteLength; at += RUN_BYTES) {
        while (left === 0) { p += 1; left = patchView.getUint32(p * PATCH_BYTES + 12, true); }
        rows[run] = view.getUint32(at, true);
        x0[run] = view.getUint32(at + 4, true);
        x1[run] = view.getUint32(at + 8, true);
        owner[run] = p;
        run += 1;
        left -= 1;
      }
    }
    if (run !== runTotal) throw new Error(`${base}.runs.bin held ${run} runs, not ${runTotal}`);
  }
  // Runs grouped by row without a comparison sort.
  const starts = new Uint32Array(HEIGHT + 2);
  for (let r = 0; r < runTotal; r += 1) starts[rows[r] + 1] += 1;
  for (let r = 1; r < starts.length; r += 1) starts[r] += starts[r - 1];
  const order = new Uint32Array(runTotal);
  { const cursor = starts.slice(); for (let r = 0; r < runTotal; r += 1) order[cursor[rows[r]]++] = r; }

  const scratch = new Int32Array(WIDTH);
  let scratchRow = -1;
  const fillRow = (row: number) => {
    if (row === scratchRow) return;
    if (scratchRow >= 0) for (let i = starts[scratchRow]; i < starts[scratchRow + 1]; i += 1) scratch.fill(0, x0[order[i]], x1[order[i]] + 1);
    scratchRow = row;
    if (row < HEIGHT) for (let i = starts[row]; i < starts[row + 1]; i += 1) scratch.fill(order[i] + 1, x0[order[i]], x1[order[i]] + 1);
  };
  const reset = () => fillRow(HEIGHT);

  // Province of each patch: the one holding most of its cells.
  const target = PROVINCE_INDEX[options.province];
  const inTarget = new Uint32Array(patchCount);
  const inOther = new Uint32Array(patchCount);
  for await (const view of fixedRecords(options.mask, RECORD_RUN_BYTES)) {
    for (let at = 0; at < view.byteLength; at += RECORD_RUN_BYTES) {
      const row = view.getUint32(at, true);
      if (starts[row] === starts[row + 1]) continue;
      fillRow(row);
      const province = view.getUint32(at + 12, true);
      const counts = province === target ? inTarget : inOther;
      for (let x = view.getUint32(at + 4, true), end = view.getUint32(at + 8, true); x <= end; x += 1) {
        const held = scratch[x];
        if (held !== 0) counts[owner[held - 1]] += 1;
      }
    }
  }
  reset();
  const assessed = new Uint8Array(patchCount);
  let assessedCount = 0;
  let ties = 0;
  for (let p = 0; p < patchCount; p += 1) {
    if (inTarget[p] > inOther[p]) { assessed[p] = 1; assessedCount += 1; }
    else if (inTarget[p] > 0 && inTarget[p] === inOther[p]) ties += 1;
  }

  // Record metadata.
  // Copied into their own buffers so the typed views are aligned.
  const own = (bytes: Buffer) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  const recordYear = new Uint16Array(own(await readFile(path.join(options.records, "record-year.u16"))));
  const recordKind = new Uint8Array(await readFile(path.join(options.records, "record-kind.u8")));
  const kindNames = JSON.parse(await readFile(path.join(options.records, "record-kinds.json"), "utf8")) as string[];
  // Each source was rasterized on its own; a record belongs to exactly one.
  const recordCells = new Float64Array(recordYear.length);
  for (const source of options.sources) {
    const cells = new BigUint64Array(own(await readFile(path.join(options.records, source, "record-cells.u64"))));
    for (let rec = 0; rec < cells.length; rec += 1) {
      const value = Number(cells[rec]);
      if (value !== 0) recordCells[rec] += value;
    }
  }
  if (recordYear.length >= REC_BITS) throw new Error("too many records for the pair key");

  // Overlaps with every record year in the candidate window.
  const pairs = new PairCounter();
  const yearsRead: number[] = [];
  const yearFiles = [];
  for (let year = observationYear - CANDIDATE_WINDOW_YEARS; year <= observationYear + CANDIDATE_WINDOW_YEARS; year += 1) {
    for (const source of options.sources) yearFiles.push({ year, file: path.join(options.records, source, `${year}.runs.bin`) });
  }
  for (const { year, file } of yearFiles) {
    try { await access(file); } catch { continue; }
    if (!yearsRead.includes(year)) yearsRead.push(year);
    let lastRow = -1;
    for await (const view of fixedRecords(file, RECORD_RUN_BYTES)) {
      for (let at = 0; at < view.byteLength; at += RECORD_RUN_BYTES) {
        const row = view.getUint32(at, true);
        if (row < lastRow) throw new Error(`${file} is not in row order`);
        lastRow = row;
        if (starts[row] === starts[row + 1]) continue;
        fillRow(row);
        const rec = view.getUint32(at + 12, true);
        for (let x = view.getUint32(at + 4, true), end = view.getUint32(at + 8, true); x <= end; x += 1) {
          const held = scratch[x];
          if (held === 0) continue;
          const p = owner[held - 1];
          if (assessed[p]) pairs.add(p * REC_BITS + rec);
        }
      }
    }
    reset();
  }

  // Judge every assessed patch with the repository's matching policy.
  const reasons: Record<string, number> = {};
  const matchedByKind: Record<string, number> = {};
  let matched = 0;
  let withCandidates = 0;
  // Area weighting, as context beside the count-based rates the gate uses.
  let assessedCells = 0;
  let matchedCells = 0;
  const keys = pairs.sortedKeys();
  let k = 0;
  for (let p = 0; p < patchCount; p += 1) {
    if (!assessed[p]) continue;
    const candidates: OfficialRecordCandidate[] = [];
    while (k < keys.length && Math.floor(keys[k] / REC_BITS) === p) {
      const rec = keys[k] - p * REC_BITS;
      candidates.push({
        id: String(rec),
        eventYear: recordYear[rec],
        geometryHectares: hectares(recordCells[rec]),
        intersectionHectares: hectares(pairs.get(keys[k])),
      });
      k += 1;
    }
    candidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (candidates.length) withCandidates += 1;
    assessedCells += cellCount[p];
    const result = matchDetectedChange({ id: String(p), observationYear, geometryHectares: hectares(cellCount[p]) }, candidates);
    if (result.selectedMatch) {
      matched += 1;
      matchedCells += cellCount[p];
      const kind = kindNames[recordKind[Number(result.selectedMatch.candidate.id)]];
      matchedByKind[kind] = (matchedByKind[kind] ?? 0) + 1;
    } else {
      const key = nonMatchReasonKey(candidates.length, result);
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  if (k !== keys.length) throw new Error("overlap pairs refer to patches outside the assessed set");

  return {
    interval: options.interval,
    province: options.province,
    observationYear,
    fromYear: from,
    assessedChanges: assessedCount,
    matchedChanges: matched,
    unmatchedChanges: assessedCount - matched,
    changesWithCandidates: withCandidates,
    assessedHectares: hectares(assessedCells),
    matchedHectares: hectares(matchedCells),
    nonMatchReasonDistribution: Object.fromEntries(Object.entries(reasons).sort(([a], [b]) => (a < b ? -1 : 1))),
    matchedByRecordKind: Object.fromEntries(Object.entries(matchedByKind).sort(([a], [b]) => (a < b ? -1 : 1))),
    patchesTiedBetweenProvinces: ties,
    overlapPairs: pairs.size,
    recordYearsRead: yearsRead,
    seconds: (Date.now() - started) / 1000,
    peakRssMegabytes: Math.round(process.memoryUsage().rss / 2 ** 20),
  };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const { values } = parseArgs({ options: {
    store: { type: "string" }, records: { type: "string" }, sources: { type: "string" }, mask: { type: "string" },
    interval: { type: "string" }, province: { type: "string" }, out: { type: "string" },
  } });
  const result = await matchInterval({ ...(values as Omit<Parameters<typeof matchInterval>[0], "sources">), sources: String(values.sources).split(",") });
  await writeFile(values.out as string, `${JSON.stringify(result, null, 1)}\n`);
  console.log(`${result.province} ${result.interval}: ${result.matchedChanges}/${result.assessedChanges} matched, ${result.seconds}s, ${result.peakRssMegabytes} MB`);
}
