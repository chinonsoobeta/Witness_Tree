import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { collectRunnerInventory, TAXONOMY_PATH, validateTaxonomy } from "../scripts/check-exit-code-taxonomy.mjs";

const root = new URL("../", import.meta.url);
const taxonomy = JSON.parse(readFileSync(new URL(TAXONOMY_PATH, root), "utf8"));

function observedWith(path, replace) {
  return collectRunnerInventory((candidate) => {
    const contents = readFileSync(new URL(candidate, root), "utf8");
    return candidate === path ? replace(contents) : contents;
  });
}

test("the exact twenty-one operator runners match the reviewed exit taxonomy", () => {
  const result = validateTaxonomy(taxonomy);
  assert.equal(result.runners, 21);
  assert.deepEqual(result.codes, [0, 1, 64, 65, 69, 70, 73, 75, 77]);
});

test("a same-code refusal message change fails the reviewed site contract", () => {
  const observed = observedWith(
    "scripts/run-nbac-approved-promotion.sh",
    (contents) => contents.replace("Could not verify the approved operator identity", "Remote operation did not start"),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("a default-code refusal message change fails the reviewed site contract", () => {
  const observed = observedWith(
    "scripts/run-postgres-tenant-isolation-drill.sh",
    (contents) => contents.replace("docker is required", "container runtime is required"),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("a same-code direct exit context change fails the reviewed site contract", () => {
  const observed = observedWith(
    "scripts/run-phase2-annual-province-zonal-v2.sh",
    (contents) => contents.replace("missing mapped extent", "mapped extent is unavailable"),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("a multiline inline Node predicate remains bound to its shell refusal", () => {
  const observed = observedWith(
    "scripts/run-phase1-archive-owner-exercise.sh",
    (contents) => contents.replace('fail "Recovery changed compliance retention."', 'fail "Recovery changed compliance retention." 70'),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("an inline Node predicate meaning change fails with the same child and parent codes", () => {
  const observed = observedWith(
    "scripts/run-phase1-approved-promotion.sh",
    (contents) => contents.replace("actual >= required ? 0 : 1", "actual > required ? 0 : 1"),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("an undocumented exit code fails closed", () => {
  const observed = observedWith(
    "scripts/run-federal-electoral-approved-promotion.sh",
    (contents) => contents.replace('fail "Usage: $0 --preflight|--run" 64', 'fail "Usage: $0 --preflight|--run" 88'),
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /undocumented exit code 88/);
});

test("an unreviewed forwarded status exit fails the site contract", () => {
  const observed = observedWith(
    "scripts/run-wildfire-derived-readback.sh",
    (contents) => `${contents}\nexit "$unreviewed_status"\n`,
  );
  assert.throws(() => validateTaxonomy(taxonomy, observed), /exit-code sites or meanings drifted/);
});

test("a stale runner inventory fails closed", () => {
  const stale = structuredClone(taxonomy);
  delete stale.runners["scripts/run-phase2-per-cell-tiles.sh"];
  assert.throws(() => validateTaxonomy(stale), /runner scope drifted/);
});
