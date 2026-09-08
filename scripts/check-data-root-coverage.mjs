import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REQUIRES_DATA_ROOT, REQUIRES_MACOS_RUNNER, SKIPS_WITHOUT_DATA_ROOT } from "./lib/data-root-bound-tests.mjs";
import { validateInventory } from "./check-data-root-bound-checks.mjs";

// These are the inventories read at 5549be3, not a new detached observation.
// Pin names and reasons as well as counts: swapping one unavailable check for
// another must fail even when the headline split stays the same.
export const BASELINE = Object.freeze({
  commit: "5549be3750fcae92350f0c6012629f3d5eb03fd2",
  checkScripts: 231, dataRootChecks: 30, testFiles: 334,
  dataRootTestFiles: 25, macosTestFiles: 3, partialDataRootTestFiles: 4,
  checkRegistrySha256: "f518f0febee8cadf144fe8d549c89e02c67c5a6a1d664c559dac944121a3437e",
  testRequirementsSha256: "3bd865ce5f83094907011d325b208d019e507d621b27d4126f88a29434d2d97b",
});
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function validateDataRootCoverage({ packageDocument, inventory, testFiles, requirements = [REQUIRES_DATA_ROOT, REQUIRES_MACOS_RUNNER, SKIPS_WITHOUT_DATA_ROOT] }) {
  const checks = Object.keys(packageDocument.scripts).filter((name) => name.startsWith("check:"));
  validateInventory(inventory, checks);
  assert.equal(digest(inventory.checks), BASELINE.checkRegistrySha256, "Data-root check names or detached behavior changed; review the coverage baseline");
  assert.equal(digest(requirements.map((map) => [...map])), BASELINE.testRequirementsSha256, "Unavailable test names or reasons changed; review the coverage baseline");
  assert.ok(checks.length >= BASELINE.checkScripts, "Check inventory shrank below the baseline");
  assert.ok(testFiles.length >= BASELINE.testFiles, "Test inventory shrank below the baseline");
  for (const registry of requirements) for (const name of registry.keys()) assert.ok(testFiles.includes(name), `Registered test is missing: ${name}`);
  return {
    status: "passed", scope: "static-coverage-registry", baseline: BASELINE,
    current: { checkScripts: checks.length, dataRootChecks: inventory.checks.length, otherChecks: checks.length - inventory.checks.length,
      testFiles: testFiles.length, dataRootTestFiles: requirements[0].size, macosTestFiles: requirements[1].size, partialDataRootTestFiles: requirements[2].size },
    additionalChecksOutsideDataRootRegistry: checks.length - BASELINE.checkScripts,
    empiricalCompleteness: "unavailable", // This gate never claims to have detached the SSD.
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
  console.log(JSON.stringify(validateDataRootCoverage({
    packageDocument: read("package.json"), inventory: read("data/data-root-bound-checks.json"),
    testFiles: readdirSync(new URL("../tests", import.meta.url)).filter((name) => /\.test\.(mjs|ts|tsx)$/.test(name)),
  }), null, 2));
}
