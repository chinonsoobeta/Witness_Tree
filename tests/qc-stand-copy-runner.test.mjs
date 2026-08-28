import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resumeOutcome, validateExecutionApproval } from "../scripts/run-qc-stand-copy.mjs";

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

const resumeBinding = {
  scopeId: "qc-current-ecoforest",
  packetSha256: "p".repeat(64),
  ownerSha256: "o".repeat(64),
  specSha256: "s".repeat(64),
  spec: {
    id: "qc-current-ecoforest-stand-copy-v1",
    input: { publishedAttributes: ["geocode", "origine"] },
    prohibitedClaims: ["production admission"],
  },
  expected: { rawSha256: "r".repeat(64), rawBytes: 123, member: "source.gpkg", outputLayer: "qc_current_ecoforest_stands", featureCount: 7 },
  memberDigest: { sha256: "m".repeat(64) },
  extractedDigest: { sha256: "e".repeat(64) },
  profile: { layer: "pee_maj_prov", geometryColumn: "geom", geometryType: "MultiPolygon", crs: 32198, featureCount: 7, fields: ["geocode", "origine"], qa: { feature_count: 7 } },
};
const resumeApprovalSha256 = "a".repeat(64);
const resumeArtifactSha256 = "b".repeat(64);
const resumeFingerprintSha256 = "f".repeat(64);
const resumePlan = { binding: resumeBinding, artifact: "/tmp/qc-stand-copy.gpkg", sidecar: "/tmp/qc-stand-copy.gpkg.json", approvalSha256: resumeApprovalSha256 };
function resumeSidecar() {
  return {
    schemaVersion: "witness-tree/qc-stand-copy-sidecar/1",
    methodVersion: "qc-stand-copy-runner-v1",
    scopeId: resumeBinding.scopeId,
    specification: { id: resumeBinding.spec.id, sha256: resumeBinding.specSha256 },
    packetSha256: resumeBinding.packetSha256,
    ownerScopeApprovalSha256: resumeBinding.ownerSha256,
    executionApprovalSha256: resumeApprovalSha256,
    source: { rawArchiveSha256: resumeBinding.expected.rawSha256, rawArchiveBytes: resumeBinding.expected.rawBytes, archiveMember: resumeBinding.expected.member, archiveMemberSha256: resumeBinding.memberDigest.sha256, extractedGeoPackageSha256: resumeBinding.extractedDigest.sha256 },
    input: resumeBinding.profile,
    output: { layer: resumeBinding.expected.outputLayer, sha256: resumeArtifactSha256, schema: ["fid", "geom", "geocode", "origine", "source_fid", "output_record_id", "source_raw_sha256", "source_layer"], featureCount: resumeBinding.expected.featureCount, sourceRowFingerprintSha256: resumeFingerprintSha256, outputRowFingerprintSha256: resumeFingerprintSha256, geometryByteCopy: true },
    qa: { exactInputBindings: true, schemaCrsFeatureCountGeometryChecks: true, joins: false, reprojection: false, repair: false, simplify: false, snap: false, dissolve: false, semanticInference: false, losslessRowFingerprintMatch: true, deterministicRerunArtifactMatch: true },
    prohibitedClaims: resumeBinding.spec.prohibitedClaims,
  };
}

test("resume produces when neither output exists and skips an exact identity-bound pair", async () => {
  const absent = () => false;
  assert.deepEqual(await resumeOutcome(resumePlan, undefined, undefined, absent), { action: "produce" });
  assert.deepEqual(await resumeOutcome(resumePlan, () => resumeSidecar(), () => resumeArtifactSha256, () => true), { action: "skip", sha256: resumeArtifactSha256 });
});

test("resume refuses partial, stale, unreadable, and changed prior outputs", async () => {
  const artifactOnly = (file) => file === resumePlan.artifact;
  await assert.rejects(resumeOutcome(resumePlan, () => resumeSidecar(), () => resumeArtifactSha256, artifactOnly), /artifact exists without its sidecar/);

  const sidecarOnly = (file) => file === resumePlan.sidecar;
  await assert.rejects(resumeOutcome(resumePlan, () => resumeSidecar(), () => resumeArtifactSha256, sidecarOnly), /sidecar exists without its artifact/);

  await assert.rejects(resumeOutcome(resumePlan, () => { throw new Error("bad JSON"); }, () => resumeArtifactSha256, () => true), /prior sidecar is unreadable/);

  const staleApproval = resumeSidecar();
  staleApproval.executionApprovalSha256 = "z".repeat(64);
  await assert.rejects(resumeOutcome(resumePlan, () => staleApproval, () => resumeArtifactSha256, () => true), /authorization identity differs/);

  const staleSource = resumeSidecar();
  staleSource.source.rawArchiveSha256 = "x".repeat(64);
  await assert.rejects(resumeOutcome(resumePlan, () => staleSource, () => resumeArtifactSha256, () => true), /identity or QA contract differs/);

  await assert.rejects(resumeOutcome(resumePlan, () => resumeSidecar(), () => "d".repeat(64), () => true), /no longer matches its sidecar SHA-256/);
});

test("resume requires execution and remains absent from the preflight path", async () => {
  const source = await readFile(new URL("../scripts/run-qc-stand-copy.mjs", import.meta.url), "utf8");
  assert.match(source, /--resume requires --execute/);
  assert.match(source, /resumeOutcome/);
  assert.match(source, /refusing to overwrite existing artifact/);
});
