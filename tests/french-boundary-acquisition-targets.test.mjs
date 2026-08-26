import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateFrenchBoundaryAcquisitionTargets } from "../scripts/check-french-boundary-acquisition-targets.mjs";

const record = JSON.parse(readFileSync(new URL("../data/french-boundary-acquisition-targets.json", import.meta.url), "utf8"));

test("French FED, CD, and CSD targets remain catalogue-backed and not staged", () => {
  assert.equal(validateFrenchBoundaryAcquisitionTargets(record), record);
  assert.deepEqual(record.targets.map((target) => target.boundaryKind), ["FED", "CD", "CSD"]);
  assert.equal(record.targets.every((target) => target.productionEligible === false && target.sha256 === null), true);
});

test("French boundary targets reject guessed filenames, downloads, or production inference", () => {
  const cd = record.targets.find((target) => target.boundaryKind === "CD");
  assert.throws(() => validateFrenchBoundaryAcquisitionTargets({ ...record, targets: record.targets.map((target) => target === cd ? { ...target, artifactUrl: "https://example.test/lcd_000b21a_f.zip" } : target) }), /must not guess/);
  assert.throws(() => validateFrenchBoundaryAcquisitionTargets({ ...record, targets: record.targets.map((target) => target.boundaryKind === "FED" ? { ...target, catalogueUrl: "https://open.canada.ca.evil.test/catalogue" } : target) }), /Open Canada catalogue/);
  assert.throws(() => validateFrenchBoundaryAcquisitionTargets({ ...record, targets: record.targets.map((target) => target === cd ? { ...target, downloaded: true } : target) }), /not staged and non-admitting/);
  assert.throws(() => validateFrenchBoundaryAcquisitionTargets({ ...record, targets: record.targets.map((target) => target === cd ? { ...target, productionEligible: true } : target) }), /not staged and non-admitting/);
});
