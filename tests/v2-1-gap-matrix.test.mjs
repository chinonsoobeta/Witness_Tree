import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkGapMatrix, validateGapMatrix } from "../scripts/check-v2-1-gap-matrix.mjs";

const matrix = async () => JSON.parse(await readFile(new URL("../data/v2-1-live-gap-matrix.json", import.meta.url), "utf8"));

test("live Version 2.1 matrix covers the controlling checklist, phases, and overrides", async () => {
  assert.deepEqual(await checkGapMatrix(new URL("../data/v2-1-live-gap-matrix.json", import.meta.url)), { requirements: 73, section17: 58, phases: 10, amendments: 5 });
});

test("gap matrix rejects tampered bilingual labels and superseded dependencies", async () => {
  const missingFrench = await matrix();
  missingFrench.requirements[0].labels.fr = "";
  assert.throws(() => validateGapMatrix(missingFrench), /bilingual labels/);
  const supersededDependency = await matrix();
  supersededDependency.requirements.find((item) => item.id === "phase-2").dependencies.push("amendment-four-province-only");
  assert.throws(() => validateGapMatrix(supersededDependency), /depends on superseded/);
});
