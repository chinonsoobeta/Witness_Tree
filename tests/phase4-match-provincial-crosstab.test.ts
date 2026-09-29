import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { matchInterval } from "../scripts/phase4-match-provincial-crosstab.mts";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { matchInterval as admittedMatchInterval } from "../scripts/phase4-match-provincial.mts";

// The same hand-built store as tests/phase4-match-provincial.test.ts: five
// patches on one row, a BC province mask, and four official records.
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "p4-match-"));
  const patches = [[0, 9], [20, 29], [40, 49], [60, 61], [70, 79]];
  const patchBytes = Buffer.alloc(40 * patches.length);
  const runBytes = Buffer.alloc(12 * patches.length);
  patches.forEach(([a, b], i) => {
    patchBytes.writeBigUInt64LE(BigInt(i + 1), i * 40);
    patchBytes.writeUInt32LE(b - a + 1, i * 40 + 8);
    patchBytes.writeUInt32LE(1, i * 40 + 12);
    runBytes.writeUInt32LE(10, i * 12);
    runBytes.writeUInt32LE(a, i * 12 + 4);
    runBytes.writeUInt32LE(b, i * 12 + 8);
  });
  await writeFile(path.join(dir, "detected-forest-loss-2021-2022.patches.bin"), patchBytes);
  await writeFile(path.join(dir, "detected-forest-loss-2021-2022.runs.bin"), runBytes);
  const run16 = (rows: number[][]) => {
    const out = Buffer.alloc(16 * rows.length);
    rows.forEach((r, i) => r.forEach((v, j) => out.writeUInt32LE(v, i * 16 + j * 4)));
    return out;
  };
  // BC is province 0; x 70..79 belongs to province 1.
  await writeFile(path.join(dir, "mask.bin"), run16([[10, 0, 69, 0], [10, 70, 79, 1]]));
  const records = path.join(dir, "records");
  await mkdir(path.join(records, "src"), { recursive: true });
  const years = new Uint16Array([0, 2022, 2019, 2022, 2012]);
  await writeFile(path.join(records, "record-year.u16"), Buffer.from(years.buffer));
  await writeFile(path.join(records, "record-kind.u8"), Buffer.from([0, 0, 1, 0, 0]));
  await writeFile(path.join(records, "record-kinds.json"), JSON.stringify(["harvest", "fire"]));
  // Record C covers 30 cells in all, 3 of them on patch 2.
  const cells = BigUint64Array.from([0, 10, 10, 30, 2].map(BigInt));
  await writeFile(path.join(records, "src", "record-cells.u64"), Buffer.from(cells.buffer));
  await writeFile(path.join(records, "src", "2022.runs.bin"), run16([[10, 0, 9, 1], [10, 40, 42, 3], [11, 40, 66, 3]]));
  await writeFile(path.join(records, "src", "2019.runs.bin"), run16([[10, 20, 29, 2]]));
  await writeFile(path.join(records, "src", "2012.runs.bin"), run16([[10, 60, 61, 4]]));
  return { dir, records };
}


test("each patch's national cause is filed under what it matched provincially", async () => {
  const { dir, records } = await fixture();
  // Harvest cells, then fire cells, per patch, as the per-cell store holds them.
  const attrs = Buffer.alloc(8 * 5);
  [[6, 0], [0, 4], [0, 0], [1, 1], [5, 5]].forEach(([harvest, fire], i) => {
    attrs.writeUInt32LE(harvest, i * 8);
    attrs.writeUInt32LE(fire, i * 8 + 4);
  });
  await writeFile(path.join(dir, "detected-forest-loss-2021-2022.attrs.bin"), attrs);
  const result = await matchInterval({ store: dir, records, sources: ["src"], mask: path.join(dir, "mask.bin"), interval: "2021-2022", province: "BC" });
  // Patch 0 matches harvest record A; patches 1 to 3 match nothing; patch 4 is
  // outside BC and is not assessed, so its cells appear nowhere.
  assert.deepEqual(result.nationalCauseByProvincialOutcome, {
    harvest: { harvest: 6, fire: 0, none: 4 },
    "no-provincial-match": { harvest: 1, fire: 5, none: 16 },
  });
  assert.equal(result.nationalCauseOverlapCells, 0);
});

test("the cross-tabulating copy matches exactly as the admitted matcher does", async () => {
  const { dir, records } = await fixture();
  const options = { store: dir, records, sources: ["src"], mask: path.join(dir, "mask.bin"), interval: "2021-2022", province: "BC" as const };
  const copy = await matchInterval(options);
  const admitted = await admittedMatchInterval(options);
  for (const key of ["assessedChanges", "matchedChanges", "unmatchedChanges", "assessedHectares", "matchedHectares", "nonMatchReasonDistribution", "matchedByRecordKind", "recordYearsRead"] as const) {
    assert.deepEqual(copy[key], admitted[key], key);
  }
});

test("without the per-cell attributes there is no cross-tabulation, not a zero one", async () => {
  const { dir, records } = await fixture();
  const result = await matchInterval({ store: dir, records, sources: ["src"], mask: path.join(dir, "mask.bin"), interval: "2021-2022", province: "BC" });
  assert.equal(result.nationalCauseByProvincialOutcome, null);
  assert.equal(result.nationalCauseOverlapCells, null);
});
