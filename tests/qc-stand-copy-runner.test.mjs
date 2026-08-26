import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateExecutionApproval } from "../scripts/run-qc-stand-copy.mjs";

const binding = {
  packetSha256: "p".repeat(64),
  ownerSha256: "o".repeat(64),
  specSha256: "s".repeat(64),
  spec: { id: "qc-current-ecoforest-stand-copy-v1", input: { layer: "pee_maj_prov", geometryType: "MultiPolygon", crs: "EPSG:32198", featureCount: 7 } },
  extractedDigest: { bytes: 456 },
  expected: { rawSha256: "r".repeat(64), extractedSha256: "e".repeat(64), rawBytes: 123, outputLayer: "qc_current_ecoforest_stands" },
};
const runnerSha256 = "x".repeat(64);
function approval(overrides = {}) {
  return {
    schemaVersion: "witness-tree/phase1-transformation-execution-approval/1",
    status: "owner-approved-execution-only",
    decision: "approve",
    packet: { sha256: binding.packetSha256 },
    ownerScopeApproval: { sha256: binding.ownerSha256 },
    specification: { sha256: binding.specSha256 },
    runner: { methodVersion: "qc-stand-copy-runner-v1", sha256: runnerSha256 },
    approvedScopes: [{ specId: binding.spec.id, specSha256: binding.specSha256, decision: "approve" }],
    inputBinding: { rawArchiveSha256: binding.expected.rawSha256, extractedGeoPackageSha256: binding.expected.extractedSha256, rawArchiveBytes: 123, extractedGeoPackageBytes: 456, layer: "pee_maj_prov", geometryType: "MultiPolygon", crs: "EPSG:32198", featureCount: 7 },
    outputBinding: { artifactRelativePath: `derived/phase1/${binding.spec.id}/${binding.expected.rawSha256}/qc-stand-copy-runner-v1/qc_current_ecoforest_stands.gpkg`, sidecarRelativePath: `derived/phase1/${binding.spec.id}/${binding.expected.rawSha256}/qc-stand-copy-runner-v1/qc_current_ecoforest_stands.gpkg.json`, layer: "qc_current_ecoforest_stands" },
    decisionBoundary: { executionAuthorized: true, ingestionAuthorized: false, releaseAuthorized: false, productionAdmissionAuthorized: false, productionEligibilityGranted: false, externalMutationPerformed: false },
    ...overrides,
  };
}

test("execution approval is a separate exact gate", () => {
  assert.throws(() => validateExecutionApproval(null, binding, runnerSha256), /schema|status|decision/i);
  assert.throws(() => validateExecutionApproval(approval({ runner: { methodVersion: "qc-stand-copy-runner-v1", sha256: "0".repeat(64) } }), binding, runnerSha256), /exact runner/i);
  assert.throws(() => validateExecutionApproval(approval({ outputBinding: { ...approval().outputBinding, artifactRelativePath: "derived/wrong.gpkg" } }), binding, runnerSha256), /canonical output/i);
  assert.throws(() => validateExecutionApproval(approval({ decisionBoundary: { ...approval().decisionBoundary, ingestionAuthorized: true } }), binding, runnerSha256), /boundary/i);
  assert.equal(validateExecutionApproval(approval(), binding, runnerSha256), true);
});

test("runner source contains no path to silently admit output", async () => {
  const source = await readFile(new URL("../scripts/run-qc-stand-copy.mjs", import.meta.url), "utf8");
  assert.match(source, /--execute/);
  assert.match(source, /--execution-approval/);
  assert.match(source, /deterministic rerun/i);
  assert.match(source, /productionAdmissionAuthorized/);
  assert.match(source, /ST_IsValid/);
  assert.doesNotMatch(source, /--force/);
});
