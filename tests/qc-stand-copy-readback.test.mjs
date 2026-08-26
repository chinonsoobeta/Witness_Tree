import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVIDENCE_SCHEMA,
  METHOD_VERSION,
  PACKET_SHA256,
  OWNER_SCOPE_APPROVAL_SHA256,
  SCOPES,
  SIDECAR_SCHEMA,
  VERIFIER_PATH,
  canonicalJson,
  preflightScope,
  sha256File,
  verifyScope,
} from "../scripts/verify-qc-stand-copy-readback.mjs";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);

function mkdirFor(file) {
  mkdirSync(path.dirname(file), { recursive: true });
}

function fixture(scopeId) {
  const root = mkdtempSync(path.join(tmpdir(), "qc-stand-copy-readback-"));
  const dataRoot = path.join(root, "data-root");
  const scope = SCOPES[scopeId];
  mkdirFor(path.join(root, scope.specPath));
  copyFileSync(path.join(REPO, scope.specPath), path.join(root, scope.specPath));
  mkdirFor(path.join(root, VERIFIER_PATH));
  copyFileSync(path.join(REPO, VERIFIER_PATH), path.join(root, VERIFIER_PATH));
  const output = path.join(dataRoot, "derived/phase1", scope.specId, scope.sourceRawSha256, METHOD_VERSION, `${scope.outputLayer}.gpkg`);
  const sidecar = `${output}.json`;
  const source = path.join(dataRoot, scope.sourceRelativePath);
  mkdirFor(output);
  mkdirFor(source);
  writeFileSync(output, Buffer.from(`synthetic ${scopeId} GeoPackage\n`));
  writeFileSync(source, Buffer.from(`synthetic ${scopeId} source GeoPackage\n`));
  const outputSha256 = sha256File(output);
  const fingerprint = "a".repeat(64);
  const sidecarRecord = {
    schemaVersion: SIDECAR_SCHEMA,
    methodVersion: METHOD_VERSION,
    scopeId,
    specification: { id: scope.specId, sha256: scope.specSha256 },
    packetSha256: PACKET_SHA256,
    ownerScopeApprovalSha256: OWNER_SCOPE_APPROVAL_SHA256,
    executionApprovalSha256: scope.executionApprovalSha256,
    source: {
      rawArchiveSha256: scope.sourceRawSha256,
      rawArchiveBytes: scope.sourceRawBytes,
      archiveMember: scope.archiveMember,
      archiveMemberSha256: scope.extractedSha256,
      extractedGeoPackageSha256: scope.extractedSha256,
    },
    input: {
      layer: scope.sourceLayer,
      geometryColumn: "geom",
      geometryType: scope.geometryType,
      crs: 32198,
      featureCount: scope.featureCount,
      fields: scope.fields,
      qa: {
        feature_count: scope.featureCount,
        distinct_fid_count: scope.featureCount,
        missing_fid_count: 0,
        missing_geometry_count: 0,
        empty_geometry_count: 0,
        invalid_geometry_count: 0,
        blank_key_count: 0,
      },
    },
    output: {
      layer: scope.outputLayer,
      sha256: outputSha256,
      schema: ["fid", "geom", ...scope.fields, "source_fid", "output_record_id", "source_raw_sha256", "source_layer"],
      featureCount: scope.featureCount,
      sourceRowFingerprintSha256: fingerprint,
      outputRowFingerprintSha256: fingerprint,
      geometryByteCopy: true,
    },
    qa: {
      exactInputBindings: true,
      schemaCrsFeatureCountGeometryChecks: true,
      joins: false,
      reprojection: false,
      repair: false,
      simplify: false,
      snap: false,
      dissolve: false,
      semanticInference: false,
      losslessRowFingerprintMatch: true,
      deterministicRerunArtifactMatch: true,
    },
    prohibitedClaims: scope.prohibitedClaims,
  };
  mkdirFor(sidecar);
  writeFileSync(sidecar, canonicalJson(sidecarRecord));
  return { root, dataRoot, scope, output, sidecar, source, sidecarRecord };
}

function commandMock(scope, calls) {
  return async (args) => {
    calls.push(args);
    assert.equal(args[0], "-ro");
    assert.equal(args.includes("-update"), false);
    const output = args.some((value) => String(value).includes(scope.outputLayer));
    if (args.includes("-so")) {
      return {
        layers: [{
          name: output ? scope.outputLayer : scope.sourceLayer,
          fidColumnName: "fid",
          featureCount: scope.featureCount,
          fields: (output ? [...scope.fields, "source_fid", "output_record_id", "source_raw_sha256", "source_layer"] : scope.fields).map((name) => ({ name })),
          geometryFields: [{ name: "geom", type: scope.geometryType, coordinateSystem: { projjson: { id: { authority: "EPSG", code: 32198 } } } }],
        }],
      };
    }
    return {
      layers: [{
        features: [{ properties: {
          feature_count: scope.featureCount,
          distinct_fid_count: scope.featureCount,
          missing_fid_count: 0,
          missing_geometry_count: 0,
          empty_geometry_count: 0,
          invalid_geometry_count: 0,
          blank_key_count: 0,
          ...(output ? { lineage_missing_count: 0, lineage_fid_mismatch_count: 0, lineage_raw_sha256_mismatch_count: 0, lineage_layer_mismatch_count: 0 } : {}),
        } }],
      }],
    };
  };
}

test("preflight reports presence only and invokes no GDAL/SQLite read", () => {
  const fixtureData = fixture("qc-current-ecoforest");
  try {
    const result = preflightScope({ root: fixtureData.root, dataRoot: fixtureData.dataRoot, scopeId: fixtureData.scope.rowId });
    assert.equal(result.mode, "preflight");
    assert.equal(result.outputPresent, true);
    assert.equal(result.sidecarPresent, true);
    assert.equal(result.sourcePresent, true);
    assert.equal(result.heavyReadPerformed, false);
    assert.equal(result.admissionClaim, false);
  } finally {
    rmSync(fixtureData.root, { recursive: true, force: true });
  }
});

test("full readback uses only injected read-only commands, binds fingerprints, and writes once", async () => {
  const fixtureData = fixture("qc-current-ecoforest");
  try {
    const calls = [];
    const result = await verifyScope({
      root: fixtureData.root,
      dataRoot: fixtureData.dataRoot,
      scopeId: fixtureData.scope.rowId,
      dependencies: {
        runOgr: commandMock(fixtureData.scope, calls),
        readSqlite: () => ({ sourceRowFingerprintSha256: "a".repeat(64), outputRowFingerprintSha256: "a".repeat(64), sourceCount: fixtureData.scope.featureCount, outputCount: fixtureData.scope.featureCount }),
      },
    });
    assert.equal(result.schemaVersion, EVIDENCE_SCHEMA);
    assert.equal(result.mode, "post-publication-readback");
    assert.equal(result.admissionClaim, false);
    assert.equal(result.productionAdmission, false);
    assert.equal(result.output.sha256, sha256File(fixtureData.output));
    assert.equal(result.output.sidecarSha256, sha256File(fixtureData.sidecar));
    assert.equal(result.qa.sourceOutputRowFingerprintMatch, true);
    assert.equal(calls.length, 4);
    assert.ok(calls.some((args) => args.some((value) => String(value).includes("ST_IsValid"))));
    assert.ok(calls.every((args) => args.includes("-ro")));
    assert.equal(existsSync(path.join(fixtureData.root, fixtureData.scope.evidencePath)), false, "default verification must not write evidence");
    await verifyScope({
      root: fixtureData.root,
      dataRoot: fixtureData.dataRoot,
      scopeId: fixtureData.scope.rowId,
      writeEvidence: true,
      evidencePath: "data/synthetic-qc-readback.json",
      dependencies: {
        runOgr: commandMock(fixtureData.scope, []),
        readSqlite: () => ({ sourceRowFingerprintSha256: "a".repeat(64), outputRowFingerprintSha256: "a".repeat(64), sourceCount: fixtureData.scope.featureCount, outputCount: fixtureData.scope.featureCount }),
      },
    });
    await assert.rejects(() => verifyScope({
      root: fixtureData.root,
      dataRoot: fixtureData.dataRoot,
      scopeId: fixtureData.scope.rowId,
      writeEvidence: true,
      evidencePath: "data/synthetic-qc-readback.json",
      dependencies: { runOgr: commandMock(fixtureData.scope, []), readSqlite: () => ({ sourceRowFingerprintSha256: "a".repeat(64), outputRowFingerprintSha256: "a".repeat(64), sourceCount: fixtureData.scope.featureCount, outputCount: fixtureData.scope.featureCount }) },
    }), /EEXIST|already exists/);
  } finally {
    rmSync(fixtureData.root, { recursive: true, force: true });
  }
});

test("readback rejects a sidecar hash or fingerprint drift", async () => {
  const fixtureData = fixture("qc-original-current-inventory");
  try {
    fixtureData.sidecarRecord.output.sourceRowFingerprintSha256 = "b".repeat(64);
    writeFileSync(fixtureData.sidecar, canonicalJson(fixtureData.sidecarRecord));
    await assert.rejects(() => verifyScope({
      root: fixtureData.root,
      dataRoot: fixtureData.dataRoot,
      scopeId: fixtureData.scope.rowId,
      dependencies: {
        runOgr: commandMock(fixtureData.scope, []),
        readSqlite: () => ({ sourceRowFingerprintSha256: "a".repeat(64), outputRowFingerprintSha256: "a".repeat(64), sourceCount: fixtureData.scope.featureCount, outputCount: fixtureData.scope.featureCount }),
      },
    }), /sidecar contract|lossless row fingerprint|drifted/);
  } finally {
    rmSync(fixtureData.root, { recursive: true, force: true });
  }
});

test("verifier is independent and has no transformation path", () => {
  const source = readFileSync(path.join(REPO, VERIFIER_PATH), "utf8");
  assert.doesNotMatch(source, /run-qc-stand-copy|ogr2ogr/);
  assert.match(source, /DatabaseSync/);
  assert.match(source, /-ro/);
  assert.match(source, /flag: "wx"/);
});
