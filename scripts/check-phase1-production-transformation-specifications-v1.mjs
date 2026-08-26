import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex");
const expected = [
  ["ntems-annual-land-cover-v1", ["ntems-annual-land-cover"], "phase1-ntems-annual-land-cover-v1", "annual-land-cover-{year}.tif"],
  ["ntems-forest-harvest-v1", ["ntems-forest-harvest"], "phase1-ntems-forest-harvest-v1", "forest-harvest-year-1985-2022.tif"],
  ["ntems-canopy-cover-v1", ["ntems-canopy-cover"], "phase1-ntems-canopy-cover-v1", "canopy-cover-2022.tif"],
  ["ntems-canopy-height-v1", ["ntems-canopy-height"], "phase1-ntems-canopy-height-v1", "canopy-height-2022.tif"],
  ["federal-electoral-districts-2023-v1", ["fed-2023-ridings", "elections-canada-45th-files"], "phase1-federal-electoral-districts-2023-v1", "federal-electoral-districts-2023.gpkg"]
];
export function validatePhase1ProductionTransformationSpecificationsV1(record = read("data/phase1-production-transformation-specifications-v1.json")) {
  assert.equal(record.status, "unapproved-specification-only");
  assert.equal(record.specifications.length, expected.length);
  const ids = expected.map(([id]) => id);
  assert.deepEqual(record.specifications.map(({ id }) => id), ids);
  for (const [index, spec] of record.specifications.entries()) {
    const [id, sourceLedgerRows, methodVersion, outputName] = expected[index];
    assert.equal(spec.id, id);
    assert.deepEqual(spec.sourceLedgerRows, sourceLedgerRows);
    assert.equal(spec.methodVersion, methodVersion);
    assert.equal(spec.output.checksumSha256, null, `${spec.id} must not claim an output checksum before execution`);
    assert.match(spec.output.path, new RegExp(`/${methodVersion}/`));
    assert.ok(spec.output.path.endsWith(`/${outputName}`));
    assert.ok(spec.output.path.includes("/derived/phase1/"));
    assert.ok(spec.inputBindings.length >= 2); assert.ok(spec.qaGates.length >= 3); assert.ok(spec.prohibitedClaims.includes("production-admitted"));
    assert.ok(spec.exclusions.length >= 2); assert.match(spec.geometryAndGrid.geometryPolicy, /No |do not /i);
    for (const input of spec.inputBindings) assert.equal(hash(input.path), input.sha256, `${spec.id} binding drift: ${input.path}`);
  }
  const federal = record.specifications.at(-1); assert.deepEqual(federal.sourceLedgerRows, ["fed-2023-ridings", "elections-canada-45th-files"]);
  assert.deepEqual(record.specifications[0].selection.includeClassValues, [0, 20, 31, 32, 33, 40, 50, 80, 81, 100, 210, 220, 230, 255]);
  assert.equal(record.specifications[1].inputVersion.includes("c6f41dff46d91812874672edb53233dac4126952132ad6d1131ad47b11ad7aad"), true);
  assert.equal(record.specifications[2].inputVersion.includes("80c37461f4deccfdfffc26124e9064d53a94dde660b9f96194445870393af130"), true);
  assert.equal(record.specifications[3].inputVersion.includes("86282401706ac1bd60fb3ed55c14ef6f2ae689decfbd9db178a725912522e124"), true);
  assert.match(federal.selection.identifier, /FED_NUM/);
  assert.equal(federal.geometryAndGrid.geometryPolicy.includes("352 source polygon features"), true);
  assert.equal(federal.geometryAndGrid.geometryPolicy.includes("343 distinct FED_NUM values"), true);
  assert.deepEqual(record.ownerDecisionReadiness.readyForOwnerDecision, ids);
  assert.match(record.ownerDecisionReadiness.decisionRequired, /does not approve ingestion, release, or production admission/);
  assert.equal(record.ownerDecisionReadiness.residualBlockers.includes("Every source ledger row has productionAdmission false."), true);
  return record;
}
if (import.meta.main) validatePhase1ProductionTransformationSpecificationsV1();
