import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { CANONICAL_LOSS_SOURCES, realDetectedChangeEvent } from "../scripts/phase2-real-patch-contract.mjs";
import { validatePatchEventPreflight } from "../scripts/check-phase2-real-patch-event-execution-preflight.mjs";

const record = JSON.parse(await readFile(new URL("../data/phase2-real-patch-event-execution-preflight.json", import.meta.url), "utf8"));
const summary = JSON.parse(await readFile(new URL("../data/phase2-real-loss-component-inventory-summary.json", import.meta.url), "utf8"));

test("exact component totals fit the conservative 2 TiB patch-event envelope", () => {
  const result = validatePatchEventPreflight(structuredClone(record), structuredClone(summary));
  assert.equal(result.storagePreflight.totalStorageBoundBytes, 2_054_037_754_582);
  assert.equal(result.storagePreflight.headroomBytes, 144_985_500_970);
  assert.equal(result.storagePreflight.passes, true);
});

test("event byte envelopes cover canonical opposite grid corners", () => {
  const gridCells = 193936 * 128340;
  for (const [fromYear, toYear, sourceLossSha256] of [CANONICAL_LOSS_SOURCES[0], CANONICAL_LOSS_SOURCES.at(-1)]) {
    for (const cellIndices of [[0, 1], [gridCells - 2, gridCells - 1]]) {
      const event = realDetectedChangeEvent({ fromYear, toYear, sourceLossSha256, cellIndices });
      assert.ok(Buffer.byteLength(JSON.stringify(event)) <= 4096 + 512 * cellIndices.length);
    }
  }
});

test("runtime remains blocked and storage, totals, caps, and admission drift fail closed", () => {
  assert.equal(record.runtimePreflight.passes, false);
  assert.equal(record.nationalExecutionAdmitted, false);
  for (const mutate of [
    value => { value.exactInputTotals.lossCellCount++; },
    value => { value.storagePreflight.maximumEventBytesPerCell--; },
    value => { value.storagePreflight.headroomBytes++; },
    value => { value.runtimePreflight.passes = true; },
    value => { value.boundedPilot.maximumSeconds = 1801; },
    value => { value.nationalExecutionAdmitted = true; },
    value => { value.productionEligible = true; },
  ]) {
    const changed = structuredClone(record);
    mutate(changed);
    assert.throws(() => validatePatchEventPreflight(changed, structuredClone(summary)));
  }
});
