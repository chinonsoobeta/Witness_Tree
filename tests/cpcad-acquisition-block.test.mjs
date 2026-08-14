import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateCpcadAcquisitionBlock } from "../scripts/check-cpcad-acquisition-block.mjs";

const fixture = JSON.parse(await readFile(new URL("../data/cpcad-acquisition-block.json", import.meta.url), "utf8"));

test("CPCAD defect record remains fail-closed", () => {
  assert.doesNotThrow(() => validateCpcadAcquisitionBlock(fixture));
});

test("CPCAD defect record rejects a production or complete-snapshot claim", () => {
  assert.throws(() => validateCpcadAcquisitionBlock({ ...fixture, partialRetrieval: { ...fixture.partialRetrieval, complete: true } }));
  assert.throws(() => validateCpcadAcquisitionBlock({ ...fixture, staging: { ...fixture.staging, productionEligible: true } }));
});
