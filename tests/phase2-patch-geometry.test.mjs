import assert from "node:assert/strict";
import test from "node:test";
import { CELL_HECTARES, ComponentAliases, PATCH_RECORD_BYTES, PatchAccumulator, readPatchRecord, writePatchRecord } from "../lib/phase2/patch-geometry.mjs";

test("alias chains resolve to the surviving id", () => {
  const aliases = new ComponentAliases();
  aliases.alias(3, 2);
  aliases.alias(2, 1);
  assert.equal(aliases.resolve(3), 1);
  assert.equal(aliases.resolve(2), 1);
  assert.equal(aliases.resolve(1), 1);
});

test("an id with no alias resolves to itself", () => {
  assert.equal(new ComponentAliases().resolve(42), 42);
});

test("runs emitted under an id that is later aliased away land on the survivor", () => {
  // This is the real ordering in the lineage: the labeller emits runs under a
  // provisional id, then discovers the merge, then finalizes under the
  // survivor. Getting this wrong invents a patch and tears a real one apart.
  const patches = new PatchAccumulator();
  patches.addRun(200, 5, 10, 12);
  patches.addRun(100, 5, 20, 21);
  patches.addAlias(200, 100);
  patches.addRun(100, 6, 10, 12);
  // In the real lineage the component record always carries the survivor, so
  // the aliased id never closes anything. Resolving from either id anyway is
  // the defensive behaviour: whichever id arrives, one patch comes out.
  const patch = patches.finish(200, 8);
  assert.equal(patch.componentId, 100, "the survivor's id is what gets stored");
  assert.equal(patch.runCount, 3);
  assert.equal(patch.cellCount, 8);
  assert.equal(patches.finish(100, 8), null, "and the component closes exactly once");
});

test("a component that was never aliased still closes", () => {
  const patches = new PatchAccumulator();
  patches.addRun(7, 0, 0, 0);
  const patch = patches.finish(7, 1);
  assert.equal(patch.cellCount, 1);
  assert.equal(patch.runCount, 1);
  assert.deepEqual([...patch.runs], [0, 0, 0]);
});

test("closing the same component twice returns null the second time", () => {
  const patches = new PatchAccumulator();
  patches.addRun(9, 1, 1, 1);
  assert.ok(patches.finish(9, 1));
  assert.equal(patches.finish(9, 1), null);
});

test("runs come back in canonical row then x order whatever order they arrived", () => {
  const patches = new PatchAccumulator();
  patches.addRun(1, 9, 50, 51);
  patches.addRun(1, 4, 80, 80);
  patches.addRun(1, 4, 10, 11);
  const patch = patches.finish(1, 5);
  assert.deepEqual([...patch.runs], [4, 10, 11, 4, 80, 80, 9, 50, 51]);
  assert.equal(patch.minRow, 4);
  assert.equal(patch.maxRow, 9);
  assert.equal(patch.minX, 10);
  assert.equal(patch.maxX, 80);
});

test("the bounding box and cell count are derived from the runs, not trusted", () => {
  const patches = new PatchAccumulator();
  patches.addRun(1, 2, 3, 7);
  // The lineage's own declared count is kept alongside so the runner can
  // compare the two and fail on a mismatch rather than silently preferring one.
  const patch = patches.finish(1, 999);
  assert.equal(patch.cellCount, 5);
  assert.equal(patch.declaredCellCount, 999);
});

test("open components are released, so memory tracks the live set", () => {
  const patches = new PatchAccumulator();
  for (let id = 0; id < 100; id += 1) patches.addRun(id, 0, id, id);
  assert.equal(patches.openCount, 100);
  for (let id = 0; id < 100; id += 1) patches.finish(id, 1);
  assert.equal(patches.openCount, 0);
  assert.equal(patches.peakOpen, 100);
});

test("a patch record round-trips through the binary layout", () => {
  const buffer = new ArrayBuffer(PATCH_RECORD_BYTES);
  const view = new DataView(buffer);
  const patch = { componentId: 24_000_000_123, cellCount: 5, runCount: 2, minRow: 10, maxRow: 11, minX: 20, maxX: 24 };
  writePatchRecord(view, 0, patch, 77);
  const back = readPatchRecord(view, 0);
  assert.equal(back.componentId, 24_000_000_123n, "component ids exceed 32 bits on a 24.9 gigacell grid");
  assert.equal(back.cellCount, 5);
  assert.equal(back.runCount, 2);
  assert.equal(back.runOffset, 77);
  assert.equal(back.maxX, 24);
});

test("a 30 m cell is 0.09 hectares", () => {
  assert.equal(CELL_HECTARES, (30 * 30) / 10_000);
});

test("addAlias merges buffers larger than the call-argument limit", () => {
  const accumulator = new PatchAccumulator();
  // 400k runs is past the spread-argument ceiling that crashed the first
  // national build, and well under a real component's peak.
  for (let row = 0; row < 400_000; row += 1) accumulator.addRun(7, row, 0, 0);
  accumulator.addRun(9, 400_000, 5, 6);
  accumulator.addAlias(9, 7);
  const patch = accumulator.finish(7, 400_002);
  assert.equal(patch.runCount, 400_001);
  assert.equal(patch.cellCount, 400_002);
  assert.equal(patch.maxRow, 400_000);
  assert.equal(patch.maxX, 6);
});
