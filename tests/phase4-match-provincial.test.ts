import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
import { matchInterval } from "../scripts/phase4-match-provincial.mts";

// A hand-built store: four loss patches on one row, a BC province mask, and
// three official records. Each patch exercises one outcome of the matching
// policy, so the expected counts can be read off the layout below.
//
//   row 10: patch 0 = x 0..9   (10 cells)  record A (2022) covers x 0..9    -> match
//           patch 1 = x 20..29 (10 cells)  record B (2019) covers x 20..29  -> outside-temporal-tolerance
//           patch 2 = x 40..49 (10 cells)  record C (2022) covers x 40..42 of 30 cells -> below-spatial-tolerance
//           patch 3 = x 60..61 (2 cells)   record D (2012) only, outside the
//                                          five-year candidate window         -> no-official-record-candidates
//           patch 4 = x 70..79 (10 cells)  outside BC                       -> not assessed
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

test("the matcher applies the repository matching policy to every assessed patch", async () => {
  const { dir, records } = await fixture();
  const result = await matchInterval({ store: dir, records, sources: ["src"], mask: path.join(dir, "mask.bin"), interval: "2021-2022", province: "BC" });
  assert.equal(result.assessedChanges, 4, "the patch outside BC is not assessed");
  assert.equal(result.matchedChanges, 1);
  assert.deepEqual(result.nonMatchReasonDistribution, {
    "below-spatial-tolerance": 1,
    "no-official-record-candidates": 1,
    "outside-temporal-tolerance": 1,
  });
  assert.deepEqual(result.matchedByRecordKind, { harvest: 1 });
  assert.equal(result.assessedHectares, 2.88, "32 assessed cells at 0.09 ha");
  assert.equal(result.matchedHectares, 0.9);
  assert.deepEqual(result.recordYearsRead, [2019, 2022]);
});

test("only years within the candidate window are read", async () => {
  const { dir, records } = await fixture();
  // Record D (2012) is ten years before 2022, outside the five-year window, so
  // it is never read and patch 3 has no candidate at all.
  const result = await matchInterval({ store: dir, records, sources: ["src"], mask: path.join(dir, "mask.bin"), interval: "2021-2022", province: "BC" });
  assert.equal(result.recordYearsRead.includes(2012), false);
  assert.equal(result.nonMatchReasonDistribution["no-official-record-candidates"], 1);
});
