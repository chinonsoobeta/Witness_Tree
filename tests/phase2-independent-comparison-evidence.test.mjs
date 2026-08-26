import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const script = resolve(root, "scripts/check-phase2-independent-comparison-evidence.mts");
const tsx = resolve(root, "node_modules/.bin/tsx");
const contractPath = "data/phase2-validation-comparison-contract.json";
const requiredInputIds = ["provincial-harvest-statistics", "nbac-1972-2025", "hansen-global-forest-change"];
const ownerAuthorization = { ownerName: "Chinonso Obeta", statement: "I explicitly authorize ingestion, release, production admission, and deployment.", decision: "approve" };

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function binding(path, bytes) {
  return { path, sha256: digest(bytes), byteLength: bytes.length };
}

function writeBoundFile(directory, name, bytes) {
  const path = join(directory, name);
  writeFileSync(path, bytes);
  return binding(path, bytes);
}

function runValidator(evidencePath) {
  return spawnSync(tsx, [script, "--evidence", evidencePath], { cwd: root, encoding: "utf8" });
}

function runRejected(evidencePath, evidence) {
  writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = runValidator(evidencePath);
  assert.notEqual(result.status, 0, "invalid comparison evidence unexpectedly passed");
  return `${result.stderr}\n${result.stdout}`;
}

function withDirectory(callback) {
  // Generated fixtures are explicitly test-only metadata/artifact paths; they
  // exercise the schema only and are not checked-in real evidence.
  const directory = mkdtempSync(join(tmpdir(), "test-only-phase2-independent-comparison-evidence-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function v2Scope() {
  return {
    annualProvinceYearRequirement: "per-province-per-year",
    baselineYears: { first: 1984, last: 2022 },
    provinces: ["BC", "AB", "ON", "QC"],
    promptAmendment: { status: "none-bound" },
  };
}

function writeRealContractFixture(directory) {
  const scope = v2Scope();
  const contract = writeBoundFile(directory, "test-only-real-comparison-contract.json", Buffer.from(JSON.stringify({
    schemaVersion: "witness-tree/phase2-independent-comparison-contract/2",
    status: "owner-approved-real-comparison-contract",
    scope: { annualProvinceYearRequirement: scope.annualProvinceYearRequirement, baselineYears: scope.baselineYears, provinces: scope.provinces },
    claims: { comparisonResultsExist: false, likeForLikeClaim: false, productAccuracyClaim: false, productionEligible: false, externalAction: false },
  })));
  const terms = {
    method: { schemaVersion: "1", version: "1", methodVersion: "real-method-v1", method: "deterministic method parameters" },
    mask: { schemaVersion: "1", version: "1", mask: { nodataPolicy: "preserve" } },
    boundary: { schemaVersion: "1", version: "1", boundary: { edition: "edition-v1" } },
    resampling: { schemaVersion: "1", version: "1", resampling: { grid: "exact" } },
    area: { schemaVersion: "1", version: "1", area: { unit: "hectare", aggregation: "fractional-area" } },
    uncertainty: { schemaVersion: "1", version: "1", uncertainty: { method: "documented" } },
  };
  const contracts = {};
  for (const [id, document] of Object.entries(terms)) {
    contracts[id] = writeBoundFile(directory, `test-only-${id}-contract.json`, Buffer.from(JSON.stringify(document)));
  }
  return { scope, contract, contracts };
}

function writeSourceFixture(directory, id, index, { synthetic = true } = {}) {
  const rawDirectory = join(directory, "Witness_Tree-data", "raw", id);
  mkdirSync(rawDirectory, { recursive: true });
  const rawPath = join(rawDirectory, `${id}.zip`);
  const rawBytes = synthetic
    ? Buffer.from(`PK\x03\x04synthetic-source-buffer:${id}`)
    : Buffer.from(`PK\x03\x04admitted-source-payload:${id}`);
  writeFileSync(rawPath, rawBytes);
  const profileDocument = {
    schemaVersion: "real-source-profile-v1",
    status: "locally-staged-source-profile",
    sourceId: id,
    testOnly: true,
    raw: { localPath: rawPath, byteLength: rawBytes.length, sha256: digest(rawBytes) },
  };
  const profile = writeBoundFile(directory, `test-only-${index}-${id}-profile.json`, Buffer.from(JSON.stringify(profileDocument)));
  const artifact = { path: rawPath, ...binding(rawPath, rawBytes), format: "zip", role: id === "hansen-global-forest-change" ? "tile" : "primary" };
  const admissionDocument = {
    schemaVersion: "witness-tree/phase2-comparison-input-admission/2",
    status: "owner-approved-limited-comparison-input",
    ownerAuthorization,
    input: { id, profile, artifacts: [artifact] },
    claims: { comparisonInputAdmitted: true, sourceInputReleased: false, productionEligible: false },
  };
  const admission = writeBoundFile(directory, `test-only-${index}-${id}-admission.json`, Buffer.from(JSON.stringify(admissionDocument)));
  return { id, sourceKind: "real-source-artifact", profile, artifacts: [artifact], admission };
}

function syntheticV2Envelope(directory) {
  const contracts = writeRealContractFixture(directory);
  const inputs = requiredInputIds.map((id, index) => writeSourceFixture(directory, id, index));
  return {
    schemaVersion: "witness-tree/phase2-independent-comparison-evidence/1",
    status: "completed",
    comparisonScope: contracts.scope,
    contract: contracts.contract,
    contracts: contracts.contracts,
    inputs,
    harvestComparisons: [],
    nbacComparisons: [],
    ntemsHansenCrossCheck: {},
    witnessTree: {},
    publication: {},
    claims: {},
  };
}

function completeV2Envelope(directory) {
  const contracts = writeRealContractFixture(directory);
  const inputs = requiredInputIds.map((id, index) => writeSourceFixture(directory, id, index, { synthetic: false }));
  const harvestKeys = contracts.scope.provinces.flatMap((province) => contracts.scope.baselineYears.first <= contracts.scope.baselineYears.last
    ? Array.from({ length: contracts.scope.baselineYears.last - contracts.scope.baselineYears.first + 1 }, (_, offset) => `${province}:${contracts.scope.baselineYears.first + offset}`)
    : []).sort();
  const allRowKeys = [...harvestKeys, "NBAC:2022", "Hansen:cross-check"].sort();
  const explanation = { en: "Test-only computed comparison row.", fr: "Ligne de comparaison calculée réservée au test." };
  const uncertainty = { basis: "Test-only fixture uses a documented unquantified treatment.", contractId: "uncertainty", status: "not-quantified" };
  const harvestComparisons = harvestKeys.map((key, index) => {
    const [province, yearText] = key.split(":");
    const year = Number(yearText);
    const witnessTreeHectares = 1000 + index;
    const provincialPublishedHectares = 900 + index;
    return {
      province,
      year,
      status: "computed",
      witnessTreeHectares,
      provincialPublishedHectares,
      absoluteDifferenceHectares: Math.abs(witnessTreeHectares - provincialPublishedHectares),
      relativeDifference: (witnessTreeHectares - provincialPublishedHectares) / provincialPublishedHectares,
      publication: "published",
      explanation,
      uncertainty,
      lineage: { comparisonKey: key, referenceInputId: "provincial-harvest-statistics", witnessTreeOutputId: "provincial-harvest-comparison" },
    };
  });
  const nbacComparisons = [{
    year: 2022,
    status: "computed",
    witnessTreeHectares: 700,
    nbacHectares: 650,
    absoluteDifferenceHectares: 50,
    relativeDifference: 50 / 650,
    publication: "published",
    explanation,
    uncertainty,
    lineage: { comparisonKey: "NBAC:2022", referenceInputId: "nbac-1972-2025", witnessTreeOutputId: "nbac-2022-comparison" },
  }];
  const ntemsHansenCrossCheck = {
    fixtureStatus: "real-source-cross-check",
    role: "independent-cross-check-not-source",
    status: "completed",
    sampleSize: 1,
    resultClaims: "cross-check-only",
    productionEligible: false,
    uncertainty,
    lineage: { comparisonKey: "Hansen:cross-check", referenceInputId: "hansen-global-forest-change", witnessTreeOutputId: "hansen-cross-check" },
  };

  const outputDefinitions = [
    ["provincial-harvest-comparison", "provincial-harvest-output.bin"],
    ["nbac-2022-comparison", "nbac-2022-output.bin"],
    ["hansen-cross-check", "hansen-cross-check-output.bin"],
  ];
  const derivedDirectory = join(directory, "Witness_Tree-data", "derived");
  mkdirSync(derivedDirectory, { recursive: true });
  const outputs = outputDefinitions.map(([id, filename]) => {
    const artifact = writeBoundFile(derivedDirectory, filename, Buffer.from(`test-only-output:${id}`));
    const record = writeBoundFile(directory, `test-only-${id}-record.json`, Buffer.from(JSON.stringify({
      schemaVersion: "witness-tree/phase2-comparison-output/1",
      status: "recorded-comparison-output",
      released: false,
      productionEligible: false,
      output: artifact,
    })));
    return { id, artifact, record };
  });
  const aggregateRows = harvestKeys.map((key) => {
    const [province, yearText] = key.split(":");
    return { key, kind: "provincial-harvest", province, year: Number(yearText), referenceInputId: "provincial-harvest-statistics", witnessTreeOutputId: "provincial-harvest-comparison" };
  });
  aggregateRows.push(
    { key: "NBAC:2022", kind: "nbac", year: 2022, referenceInputId: "nbac-1972-2025", witnessTreeOutputId: "nbac-2022-comparison" },
    { key: "Hansen:cross-check", kind: "hansen", name: "cross-check", referenceInputId: "hansen-global-forest-change", witnessTreeOutputId: "hansen-cross-check" },
  );
  const aggregate = writeBoundFile(directory, "test-only-comparison-aggregate.json", Buffer.from(JSON.stringify({
    schemaVersion: "witness-tree/phase2-comparison-aggregate/1",
    status: "recorded-comparison-aggregate",
    claims: { comparisonResultsExist: true, productionEligible: false, released: false },
    rows: aggregateRows,
  })));
  const readback = writeBoundFile(directory, "test-only-output-readback.json", Buffer.from(JSON.stringify({
    schemaVersion: "witness-tree/phase2-v21-raster-readback-evidence/1",
    status: "local-readback-passed-nonproduction",
    comparisonAggregate: aggregate,
    outputs: outputs.map(({ artifact }) => ({ raster: artifact })),
  })));
  const admission = writeBoundFile(directory, "test-only-witness-tree-admission.json", Buffer.from(JSON.stringify({
    schemaVersion: "witness-tree/phase2-admission-record/1",
    status: "recorded-admission",
    claims: { admitted: true, released: false, productionEligible: false },
    evidenceBindings: {
      rasterReadback: readback,
      comparisonAggregate: aggregate,
      methodParameters: contracts.contracts.method,
    },
    artifactBindings: outputs.map(({ artifact }) => ({ ...artifact, kind: "comparison-output" })),
  })));
  const witnessTree = {
    claims: { admitted: true, released: false, productionEligible: false },
    admissionRecord: admission,
    comparisonAggregate: aggregate,
    outputReadbackEvidence: readback,
    outputs,
  };
  const pageText = (language) => [`<html lang="${language}">`, ...allRowKeys.map((key) => `<div data-row-key="${key}">${key}</div>`), "</html>"].join("\n");
  const enPage = writeBoundFile(derivedDirectory, "test-only-comparison-en.html", Buffer.from(pageText("en")));
  const frPage = writeBoundFile(derivedDirectory, "test-only-comparison-fr.html", Buffer.from(pageText("fr")));
  const publicationMetadataDocument = {
    schemaVersion: "witness-tree/phase2-comparison-publication/1",
    status: "published-bilingual",
    claims: { comparisonResultsExist: true, productAccuracyClaim: false, released: false, productionEligible: false },
    enPath: "/en/methods",
    frPath: "/fr/methodes",
    publishedAt: "2026-08-25T00:00:00Z",
    rowKeys: allRowKeys,
    enPage,
    frPage,
  };
  const metadata = writeBoundFile(directory, "test-only-comparison-publication-metadata.json", Buffer.from(JSON.stringify(publicationMetadataDocument)));
  return {
    schemaVersion: "witness-tree/phase2-independent-comparison-evidence/1",
    status: "completed",
    comparisonScope: contracts.scope,
    contract: contracts.contract,
    contracts: contracts.contracts,
    inputs,
    harvestComparisons,
    nbacComparisons,
    ntemsHansenCrossCheck,
    witnessTree,
    publication: { status: "published-bilingual", enPath: "/en/methods", frPath: "/fr/methodes", enPage, frPage, metadata, publishedAt: "2026-08-25T00:00:00Z" },
    claims: { comparisonResultsExist: true, comparisonResultsPublished: true, causalAttributionClaim: false, likeForLikeClaim: false, productAccuracyClaim: false, sourceInputsReleased: false, released: false, productionEligible: false },
  };
}

test("default mode reports the current incomplete comparison availability", () => {
  const output = JSON.parse(execFileSync(tsx, [script], { cwd: root, encoding: "utf8" }));
  assert.equal(output.status, "ready-missing-inputs-and-results");
  assert.equal(output.formalPhase2ComparisonGateComplete, false);
  assert.deepEqual(output.missingInputs.map(({ id }) => id), [
    "ca-forest-harvest-1985-2022",
    "nfdb-polygons-current",
    "nbac-1972-2025",
    "hansen-global-forest-change",
  ]);
  assert.deepEqual(output.missingResults.map(({ kind }) => kind), ["provincial-harvest", "nbac-burned-area", "hansen-cross-check"]);
  assert.deepEqual(output.completedResults, { provincialHarvestRows: 0, nbacRows: 0, hansenCrossCheck: 0 });
  assert.equal(output.requiredResults.provincialHarvestRows, 4 * 39);
  assert.deepEqual(output.claims, { comparisonResultsExist: false, productAccuracyClaim: false, released: false, productionEligible: false });
});

test("accepts a complete 156-row annual matrix plus NBAC and Hansen cross-check when every lineage key is admitted", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "test-only-complete-comparison-evidence.json");
    const envelope = completeV2Envelope(directory);
    writeFileSync(evidencePath, JSON.stringify(envelope));
    const result = runValidator(evidencePath);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "completed");
    assert.equal(summary.provincialHarvestRows, 156);
    assert.equal(summary.nbacRows, 1);
    assert.deepEqual(summary.hansenCrossCheck, { status: "completed", sampleSize: 1, resultClaims: "cross-check-only" });
  });
});

test("rejects a row that points at another admitted output even when that output ID exists", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "test-only-lineage-mismatch-evidence.json");
    const envelope = completeV2Envelope(directory);
    envelope.harvestComparisons[0].lineage.witnessTreeOutputId = "nbac-2022-comparison";
    assert.match(runRejected(evidencePath, envelope), /aggregate output differs/);
  });
});

test("rejects an evidence path reached through a parent symlink", () => {
  withDirectory((directory) => {
    const envelopePath = join(directory, "test-only-symlink-evidence.json");
    writeFileSync(envelopePath, JSON.stringify(completeV2Envelope(directory)));
    const symlinkParent = join(directory, "test-only-symlink-parent");
    symlinkSync(directory, symlinkParent, "dir");
    const result = runValidator(join(symlinkParent, "test-only-symlink-evidence.json"));
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /symlink parent/);
  });
});

test("rejects publication metadata that does not bind the page checksum", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "test-only-publication-checksum-evidence.json");
    const envelope = completeV2Envelope(directory);
    const metadataPath = envelope.publication.metadata.path;
    const metadataDocument = JSON.parse(readFileSync(metadataPath, "utf8"));
    metadataDocument.enPage.sha256 = "0".repeat(64);
    const metadataBytes = Buffer.from(JSON.stringify(metadataDocument));
    writeFileSync(metadataPath, metadataBytes);
    envelope.publication.metadata = binding(metadataPath, metadataBytes);
    assert.match(runRejected(evidencePath, envelope), /English publication metadata\/page checksum differs/);
  });
});

test("rejects the old four-row synthetic v1 envelope", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "comparison-evidence.json");
    const oldEnvelope = {
      schemaVersion: "witness-tree/phase2-independent-comparison-evidence/1",
      status: "completed",
      contract: binding(contractPath, readFileSync(resolve(root, contractPath))),
      inputs: requiredInputIds.map((id) => ({ id, path: "synthetic.bin", sha256: "0".repeat(64), byteLength: 1, admission: { path: "admission.json", sha256: "1".repeat(64), byteLength: 1 } })),
      harvestComparisons: [{ province: "BC", year: 2022 }],
      nbacComparisons: [],
      ntemsHansenCrossCheck: {},
      publication: {},
      claims: {},
    };
    assert.match(runRejected(evidencePath, oldEnvelope), /missing or unexpected fields|schema version differs/);
  });
});

test("rejects synthetic source buffers even when source metadata and admission JSON are supplied", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "comparison-evidence.json");
    assert.match(runRejected(evidencePath, syntheticV2Envelope(directory)), /synthetic|illustrative|comparison contract|real source artifact/);
  });
});

test("rejects metadata-only source linkage even when a separate payload binding is present", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "comparison-evidence.json");
    const envelope = syntheticV2Envelope(directory);
    const input = envelope.inputs[0];
    const profilePath = input.profile.path;
    const metadataOnly = Buffer.from(JSON.stringify({ schemaVersion: "real-source-profile-v1", status: "locally-staged-source-profile", sourceId: input.id }));
    writeFileSync(profilePath, metadataOnly);
    input.profile = binding(profilePath, metadataOnly);
    assert.match(runRejected(evidencePath, envelope), /must enumerate its raw artifact bytes|metadata-only/);
  });
});

test("rejects unsupported nulls before any completion claim is evaluated", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "comparison-evidence.json");
    const envelope = {
      claims: null,
      comparisonScope: null,
      contract: null,
      contracts: null,
      harvestComparisons: null,
      inputs: null,
      nbacComparisons: null,
      ntemsHansenCrossCheck: null,
      publication: null,
      schemaVersion: "witness-tree/phase2-independent-comparison-evidence/1",
      status: "completed",
      witnessTree: null,
    };
    assert.match(runRejected(evidencePath, envelope), /unsupported null/);
  });
});

test("rejects the checked-in illustrative contract instead of treating four 2022 rows as annual evidence", () => {
  withDirectory((directory) => {
    const evidencePath = join(directory, "comparison-evidence.json");
    const envelope = {
      claims: {},
      comparisonScope: v2Scope(),
      contract: binding(contractPath, readFileSync(resolve(root, contractPath))),
      contracts: {},
      harvestComparisons: [],
      inputs: [],
      nbacComparisons: [],
      ntemsHansenCrossCheck: {},
      publication: {},
      schemaVersion: "witness-tree/phase2-independent-comparison-evidence/1",
      status: "completed",
      witnessTree: {},
    };
    assert.match(runRejected(evidencePath, envelope), /cannot be synthetic or illustrative|comparison contract schema differs/);
  });
});

test("package-facing invocation remains read-only and leaves the illustrative contract unchanged", () => {
  const before = readFileSync(resolve(root, contractPath), "utf8");
  execFileSync(tsx, [script], { cwd: root, stdio: "pipe" });
  assert.equal(readFileSync(resolve(root, contractPath), "utf8"), before);
});
