import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvedDataRootRealPathSync, DEFAULT_DATA_ROOT, SSD_DATA_ROOT } from "./data-root.mjs";

/**
 * Phase 1's canonical raw inventory is deliberately narrower than the
 * production ledger.  It answers one question only: which exact local bytes
 * for the 22 core rows are present under the canonical external-drive root?
 *
 * It does not inspect AWS, infer archive/recovery state, or change any source
 * or admission record.  A matching local SHA-256 is local evidence only.
 */
export const INVENTORY_SCHEMA = "witness-tree/phase1-canonical-raw-inventory/1";
export const CORE_ROW_IDS = Object.freeze([
  "ntems-annual-land-cover",
  "ntems-forest-harvest",
  "ntems-canopy-cover",
  "ntems-canopy-height",
  "cwfis-current",
  "cwfis-historical",
  "bc-wildfire",
  "ab-wildfire",
  "on-fire-disturbance",
  "qc-current-ecoforest",
  "qc-original-current-inventory",
  "qc-fourth-inventory",
  "ab-avi-crown",
  "ab-avi-post-harvest",
  "ab-primary-land-vegetation",
  "fed-2023-ridings",
  "elections-canada-45th-files",
  "provincial-electoral-boundaries",
  "indian-reserves",
  "first-nation-reserves",
  "historic-treaties",
  "modern-treaties",
]);

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_PATH = path.join(REPOSITORY_ROOT, "data/phase1-canonical-raw-inventory-2026-08-27.json");
const RAW_PATH_PREFIX = "Witness_Tree-data/";
const RECORDED_ROOT_PREFIX = "../Witness_Tree-data/";
const SHA256 = /^[0-9a-f]{64}$/;
const RELATIVE_DATA_PATH = /^(?:raw|staging|work)\/[^\\]+/;
const PARTIAL_COMPONENT_ROWS = new Set(["provincial-electoral-boundaries"]);

const readJson = (relativePath) => JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));

function condition(value, message) {
  if (!value) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function dataRootRelativePath(recordedPath) {
  condition(typeof recordedPath === "string", "A local artifact path must be a string.");
  let relative = recordedPath;
  if (relative.startsWith(RECORDED_ROOT_PREFIX)) relative = relative.slice(RECORDED_ROOT_PREFIX.length);
  else if (relative.startsWith(RAW_PATH_PREFIX)) relative = relative.slice(RAW_PATH_PREFIX.length);
  else if (path.isAbsolute(relative)) throw new Error(`Absolute local artifact path is not allowed: ${recordedPath}`);
  condition(relative.startsWith("raw/") || relative.startsWith("staging/") || relative.startsWith("work/"), `Local artifact must be under raw, staging, or work: ${recordedPath}`);
  condition(!relative.includes("\0") && !relative.split(/[\\/]/).some((segment) => !segment || segment === "." || segment === ".."), `Local artifact path is unsafe: ${recordedPath}`);
  return relative.replaceAll("\\", "/");
}

function sourceReference(pathName, pointer = undefined) {
  return pointer ? { path: pathName, jsonPointer: pointer } : { path: pathName };
}

function artifact({ id, rowIds, relativePath, expectedByteLength, expectedSha256, kind = "raw-payload", canonicalPayload = true, sourceRefs = [] }) {
  condition(typeof id === "string" && id.trim(), "Artifact id is required.");
  condition(Array.isArray(rowIds) && rowIds.length > 0, `Artifact ${id} needs at least one row id.`);
  condition(SHA256.test(expectedSha256), `Artifact ${id} needs a lowercase expected SHA-256.`);
  condition(Number.isInteger(expectedByteLength) && expectedByteLength >= 0, `Artifact ${id} needs an expected byte length.`);
  return {
    id,
    rowIds: unique(rowIds),
    relativePath: dataRootRelativePath(relativePath),
    expectedByteLength,
    expectedSha256,
    kind,
    canonicalPayload,
    sourceRefs,
  };
}

function stagedArtifact(staged, sourceId, rowIds, sourceRef = "data/staged-acquisitions.json") {
  const index = staged.entries.findIndex((entry) => entry.sourceId === sourceId);
  condition(index >= 0, `No staged acquisition exists for ${sourceId}.`);
  const entry = staged.entries[index];
  return artifact({
    id: entry.id,
    rowIds,
    relativePath: entry.localPath,
    expectedByteLength: entry.byteLength,
    expectedSha256: entry.sha256,
    sourceRefs: [sourceReference(sourceRef, `/entries/${index}`)],
  });
}

function canonicalArtifactSpecs({
  staged = readJson("data/staged-acquisitions.json"),
  annualAuthorization = readJson("data/phase1-ntems-annual-land-cover-execution-authorization.json"),
  nbacProfile = readJson("data/phase1-nbac-profile-2026-08-27.json"),
  nfdbProfile = readJson("data/nfdb-poly-current-profile.json"),
  qcPreparation = readJson("data/qc-fourth-inventory-immutable-promotion-preparation.json"),
  qcArchivePreparation = readJson("data/qc-immutable-promotion-preparation.json"),
} = {}) {
  const specs = [];

  // The annual authorization is the checksum-bound local specification for
  // all 39 payloads.  It is intentionally used rather than globbing a
  // directory, which would accidentally include stale or unrelated files.
  condition(Array.isArray(annualAuthorization.inputs) && annualAuthorization.inputs.length === 39, "The annual land-cover authorization must name all 39 payloads.");
  for (const input of annualAuthorization.inputs) {
    specs.push(artifact({
      id: `ntems-annual-land-cover-${input.year}`,
      rowIds: ["ntems-annual-land-cover"],
      relativePath: input.path,
      expectedByteLength: input.byteLength,
      expectedSha256: input.sha256,
      sourceRefs: [sourceReference("data/phase1-ntems-annual-land-cover-execution-authorization.json", `/inputs/${annualAuthorization.inputs.indexOf(input)}`)],
    }));
  }

  specs.push(stagedArtifact(staged, "nrcan-ca-forest-harvest-1985-2022", ["ntems-forest-harvest"]));
  specs.push(stagedArtifact(staged, "nrcan-forest-canopy-cover-2022", ["ntems-canopy-cover"]));
  specs.push(stagedArtifact(staged, "nrcan-forest-canopy-height-2022", ["ntems-canopy-height"]));
  specs.push(stagedArtifact(staged, "cwfis-current", ["cwfis-current"]));
  specs.push(stagedArtifact(staged, "bc-wildfire", ["bc-wildfire"]));
  specs.push(stagedArtifact(staged, "ab-wildfire", ["ab-wildfire"]));
  specs.push(stagedArtifact(staged, "on-fire-disturbance", ["on-fire-disturbance"]));
  specs.push(stagedArtifact(staged, "qc-original-current-inventory", ["qc-original-current-inventory"]));
  specs.push(stagedArtifact(staged, "alberta-avi-crown", ["ab-avi-crown", "ab-avi-post-harvest"]));
  specs.push(stagedArtifact(staged, "ab-primary-land-vegetation", ["ab-primary-land-vegetation"]));
  specs.push(stagedArtifact(staged, "elections-canada-federal-electoral-districts-45th-general-election-2025-shp", ["fed-2023-ridings", "elections-canada-45th-files"]));

  // The current Québec map is in the exact archive preparation, while the
  // source-ledger row remains downstream-blocked.  It is still a canonical
  // local raw payload and belongs in this inventory.
  const qcCurrent = qcArchivePreparation.artifacts.find(({ productionSourceId }) => productionSourceId === "qc-current-ecoforest");
  condition(qcCurrent, "The Québec current-ecoforest preparation must name its raw payload.");
  specs.push(artifact({
    id: qcCurrent.id,
    rowIds: ["qc-current-ecoforest"],
    relativePath: qcCurrent.localPath,
    expectedByteLength: qcCurrent.byteLength,
    expectedSha256: qcCurrent.sha256,
    sourceRefs: [sourceReference("data/qc-immutable-promotion-preparation.json", `/artifacts/${qcArchivePreparation.artifacts.indexOf(qcCurrent)}`)],
  }));

  // CWFIS historical has two distinct source components.  Keeping the two
  // physical artifacts separate avoids implying that NFDB and NBAC are one
  // dataset or one checksum.
  specs.push(artifact({
    id: "cwfis-nfdb-poly-current",
    rowIds: ["cwfis-historical"],
    relativePath: nfdbProfile.artifact.externalStagingPath,
    expectedByteLength: nfdbProfile.artifact.bytes,
    expectedSha256: nfdbProfile.artifact.sha256,
    sourceRefs: [sourceReference("data/nfdb-poly-current-profile.json", "/artifact")],
  }));
  const nbacDir = nbacProfile.dataRootRelativeDirectory;
  const nbacArtifacts = nbacProfile.artifacts;
  specs.push(artifact({
    id: "cwfis-nbac-payload",
    rowIds: ["cwfis-historical"],
    relativePath: `${nbacDir}/${nbacArtifacts.payload.filename}`,
    expectedByteLength: nbacArtifacts.payload.byteLength,
    expectedSha256: nbacArtifacts.payload.sha256,
    sourceRefs: [sourceReference("data/phase1-nbac-profile-2026-08-27.json", "/artifacts/payload")],
  }));
  for (const [name, details] of Object.entries(nbacArtifacts).filter(([name]) => name !== "payload")) {
    specs.push(artifact({
      id: `cwfis-nbac-${name}`,
      rowIds: ["cwfis-historical"],
      relativePath: `${nbacDir}/${details.filename}`,
      expectedByteLength: details.byteLength,
      expectedSha256: details.sha256,
      kind: "supporting-record",
      canonicalPayload: false,
      sourceRefs: [sourceReference("data/phase1-nbac-profile-2026-08-27.json", `/artifacts/${name}`)],
    }));
  }

  // The fourth-inventory product is one logical row with 56 sheet payloads.
  // Five local supporting records are listed separately; the generated remote
  // manifest is not a local raw file and is therefore deliberately absent.
  condition(Array.isArray(qcPreparation.archiveSet?.payloads) && qcPreparation.archiveSet.payloads.length === 56, "The fourth-inventory preparation must name all 56 sheet payloads.");
  for (const [index, payload] of qcPreparation.archiveSet.payloads.entries()) {
    specs.push(artifact({
      id: `qc-fourth-sheet-${String(index + 1).padStart(2, "0")}`,
      rowIds: ["qc-fourth-inventory"],
      relativePath: payload.dataRootRelativePath,
      expectedByteLength: payload.byteLength,
      expectedSha256: payload.sha256,
      sourceRefs: [sourceReference("data/qc-fourth-inventory-immutable-promotion-preparation.json", `/archiveSet/payloads/${index}`)],
    }));
  }
  for (const [index, supporting] of qcPreparation.evidenceArtifacts.entries()) {
    specs.push(artifact({
      id: `qc-fourth-support-${String(index + 1).padStart(2, "0")}`,
      rowIds: ["qc-fourth-inventory"],
      relativePath: supporting.dataRootRelativePath,
      expectedByteLength: supporting.byteLength,
      expectedSha256: supporting.sha256,
      kind: "supporting-record",
      canonicalPayload: false,
      sourceRefs: [sourceReference("data/qc-fourth-inventory-immutable-promotion-preparation.json", `/evidenceArtifacts/${index}`)],
    }));
  }

  // The boundary row is intentionally partial: BC and Ontario are local
  // artifacts; Québec's 2026 file is a future edition and is reported but
  // cannot be treated as the current 2017 source.  Alberta has no local
  // artifact under the recorded lawful scope.
  specs.push(artifact({
    id: "provincial-boundaries-bc-2023",
    rowIds: ["provincial-electoral-boundaries"],
    relativePath: "staging/bc-provincial-electoral-2023/bc-provincial-electoral-districts-2023.geojson",
    expectedByteLength: 21828718,
    expectedSha256: "d2403eeb488be4ef761f7dcbc72c25f8af3a046fce9980536307ba145993f193",
    kind: "partial-current-component",
    sourceRefs: [sourceReference("data/bc-provincial-electoral-2023-profile.json")],
  }));
  specs.push(artifact({
    id: "provincial-boundaries-ontario-2022",
    rowIds: ["provincial-electoral-boundaries"],
    relativePath: "staging/on-provincial-electoral-2022/electoral-district-shapefile-2022.zip",
    expectedByteLength: 1847182,
    expectedSha256: "70fd809a4998147b228fd9275e34e569be8ae1fd67470e2f4a20761e5d1e7cae",
    kind: "partial-current-component",
    sourceRefs: [sourceReference("data/on-electoral-2022-profile.json")],
  }));
  specs.push(artifact({
    id: "provincial-boundaries-quebec-2026-future",
    rowIds: ["provincial-electoral-boundaries"],
    relativePath: "staging/qc-electoral-2026/qc-electoral-2026.geojson",
    expectedByteLength: 2380742,
    expectedSha256: "5c22379acdffc6138eb77a5aaec265d7c301cffd04eb4c0bafede68ed8651503",
    kind: "future-edition-candidate",
    canonicalPayload: false,
    sourceRefs: [sourceReference("data/qc-electoral-editions.json", "/future")],
  }));

  // The remaining four core rows have no lawful, exact local artifact in the
  // current evidence.  They remain present in the row map with zero specs.
  return specs;
}

export const CORE_ROWS_WITHOUT_LOCAL_ARTIFACT = Object.freeze([
  "indian-reserves",
  "first-nation-reserves",
  "historic-treaties",
  "modern-treaties",
]);

function assertCoreIds(rowIds) {
  assert.deepEqual(rowIds, CORE_ROW_IDS, "Canonical raw inventory rows must match the exact 22-row Phase 1 core order.");
}

function validateSourceReference(sourceRef, artifactId) {
  condition(sourceRef && typeof sourceRef === "object" && !Array.isArray(sourceRef), `Artifact ${artifactId} has an invalid source reference.`);
  const allowedKeys = Object.hasOwn(sourceRef, "jsonPointer") ? ["jsonPointer", "path"] : ["path"];
  assert.deepEqual(Object.keys(sourceRef).sort(), allowedKeys, `Artifact ${artifactId} has an unexpected source-reference field.`);
  condition(typeof sourceRef.path === "string" && sourceRef.path.startsWith("data/"), `Artifact ${artifactId} has an invalid source reference.`);
  condition(!path.isAbsolute(sourceRef.path) && !sourceRef.path.includes("\0") && !sourceRef.path.split(/[\\/]/).some((segment) => !segment || segment === "." || segment === ".."), `Artifact ${artifactId} has an unsafe source reference path.`);
  const sourcePath = path.resolve(REPOSITORY_ROOT, sourceRef.path);
  condition(sourcePath.startsWith(`${REPOSITORY_ROOT}${path.sep}`), `Artifact ${artifactId} source reference escapes the repository.`);
  let sourceInfo;
  try {
    sourceInfo = lstatSync(sourcePath);
  } catch {
    throw new Error(`Artifact ${artifactId} references a missing source record ${sourceRef.path}.`);
  }
  condition(sourceInfo.isFile() && !sourceInfo.isSymbolicLink(), `Artifact ${artifactId} source reference must be a regular non-symlink file.`);
  const resolvedSourcePath = realpathSync(sourcePath);
  const resolvedRepositoryRoot = realpathSync(REPOSITORY_ROOT);
  condition(resolvedSourcePath.startsWith(`${resolvedRepositoryRoot}${path.sep}`), `Artifact ${artifactId} source reference must not traverse a symlink outside the repository.`);
  if (Object.hasOwn(sourceRef, "jsonPointer")) condition(typeof sourceRef.jsonPointer === "string" && (sourceRef.jsonPointer === "" || sourceRef.jsonPointer.startsWith("/")), `Artifact ${artifactId} source reference needs an RFC 6901 JSON pointer.`);
}

function validateArtifactSpec(spec, rowIds = CORE_ROW_IDS) {
  condition(spec && typeof spec === "object" && !Array.isArray(spec), "Artifact specification must be an object.");
  condition(typeof spec.id === "string" && spec.id.trim(), "Artifact specification id is required.");
  condition(Array.isArray(spec.rowIds) && spec.rowIds.length > 0 && spec.rowIds.every((id) => rowIds.includes(id)), `Artifact ${spec.id} references an unknown core row.`);
  condition(new Set(spec.rowIds).size === spec.rowIds.length, `Artifact ${spec.id} must not repeat a core row id.`);
  condition(typeof spec.relativePath === "string" && !path.isAbsolute(spec.relativePath), `Artifact ${spec.id} needs a data-root-relative path.`);
  condition(RELATIVE_DATA_PATH.test(spec.relativePath), `Artifact ${spec.id} has an invalid data-root-relative path.`);
  condition(spec.relativePath.startsWith("raw/") || spec.relativePath.startsWith("staging/") || spec.relativePath.startsWith("work/"), `Artifact ${spec.id} must be under raw, staging, or work.`);
  condition(!spec.relativePath.split("/").some((segment) => !segment || segment === "." || segment === ".."), `Artifact ${spec.id} has an unsafe relative path.`);
  condition(Number.isInteger(spec.expectedByteLength) && spec.expectedByteLength >= 0, `Artifact ${spec.id} has an invalid expected byte length.`);
  condition(SHA256.test(spec.expectedSha256), `Artifact ${spec.id} has an invalid expected SHA-256.`);
  condition(typeof spec.kind === "string" && spec.kind.trim(), `Artifact ${spec.id} needs a kind.`);
  condition(typeof spec.canonicalPayload === "boolean", `Artifact ${spec.id} needs an explicit canonicalPayload flag.`);
  condition(Array.isArray(spec.sourceRefs) && spec.sourceRefs.length > 0, `Artifact ${spec.id} needs source references.`);
  for (const sourceRef of spec.sourceRefs) validateSourceReference(sourceRef, spec.id);
}

function validateDataRoot(root, { requireCanonicalRoot = false } = {}) {
  condition(typeof root === "string" && path.isAbsolute(root), "Data root must be an absolute path.");
  const resolved = approvedDataRootRealPathSync(root);
  condition(path.basename(resolved) === "Witness_Tree-data", "Data root must name Witness_Tree-data.");
  if (requireCanonicalRoot) condition(resolved === SSD_DATA_ROOT, `Data root must resolve to the canonical external SSD root ${SSD_DATA_ROOT}.`);
  condition(statSync(resolved).isDirectory(), `Data root is not a directory: ${resolved}`);
  return resolved;
}

/**
 * Hash one regular local file without reading it into memory.  The caller is
 * responsible for ensuring the containing root has the approved symlink
 * policy.  A symlinked artifact is never accepted as a local source byte.
 */
export async function observeArtifact(spec, dataRoot) {
  validateArtifactSpec(spec);
  const absolute = path.resolve(dataRoot, spec.relativePath);
  condition(absolute === dataRoot || absolute.startsWith(`${dataRoot}${path.sep}`), `Artifact ${spec.id} escapes the data root.`);
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { id: spec.id, relativePath: spec.relativePath, status: "missing", exists: false, expectedByteLength: spec.expectedByteLength, expectedSha256: spec.expectedSha256 };
    }
    return { id: spec.id, relativePath: spec.relativePath, status: "unreadable", exists: false, expectedByteLength: spec.expectedByteLength, expectedSha256: spec.expectedSha256, error: String(error?.message ?? error) };
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    return { id: spec.id, relativePath: spec.relativePath, status: "unreadable", exists: true, expectedByteLength: spec.expectedByteLength, expectedSha256: spec.expectedSha256, error: "artifact is not a regular non-symlink file" };
  }
  try {
    const resolvedRoot = realpathSync(dataRoot);
    const resolvedArtifact = realpathSync(absolute);
    condition(resolvedArtifact === path.join(resolvedRoot, spec.relativePath), `artifact resolves through a symlink: ${spec.relativePath}`);
  } catch (error) {
    return { id: spec.id, relativePath: spec.relativePath, status: "unreadable", exists: true, byteLength: info.size, expectedByteLength: spec.expectedByteLength, expectedSha256: spec.expectedSha256, error: String(error?.message ?? error) };
  }
  let digest;
  try {
    digest = await new Promise((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(absolute);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
  } catch (error) {
    return { id: spec.id, relativePath: spec.relativePath, status: "unreadable", exists: true, expectedByteLength: info.size, expectedByteLengthMatches: false, expectedSha256: spec.expectedSha256, error: String(error?.message ?? error) };
  }
  const byteLengthMatches = info.size === spec.expectedByteLength;
  const sha256Matches = digest === spec.expectedSha256;
  return {
    id: spec.id,
    relativePath: spec.relativePath,
    status: byteLengthMatches && sha256Matches ? "matched" : "mismatch",
    exists: true,
    byteLength: info.size,
    sha256: digest,
    expectedByteLength: spec.expectedByteLength,
    expectedByteLengthMatches: byteLengthMatches,
    expectedSha256: spec.expectedSha256,
    expectedSha256Matches: sha256Matches,
  };
}

function rowStatus(rowId, rowArtifacts) {
  const canonical = rowArtifacts.filter((artifact) => artifact.canonicalPayload);
  if (canonical.length === 0) return "not-staged";
  const observations = canonical.map((artifact) => artifact.observation.status);
  if (observations.every((status) => status === "matched")) {
    return PARTIAL_COMPONENT_ROWS.has(rowId) ? "partial-local-components" : "matched-local-bytes";
  }
  if (observations.some((status) => status === "mismatch" || status === "unreadable")) return "local-byte-mismatch-or-unreadable";
  return "missing-local-bytes";
}

function buildRows(specs, observations) {
  const observedById = new Map(observations.map((observation) => [observation.id, observation]));
  return CORE_ROW_IDS.map((id) => {
    const rowSpecs = specs.filter((spec) => spec.rowIds.includes(id));
    const rowArtifacts = rowSpecs.map((spec) => ({
      id: spec.id,
      relativePath: spec.relativePath,
      kind: spec.kind,
      canonicalPayload: spec.canonicalPayload,
      expectedByteLength: spec.expectedByteLength,
      expectedSha256: spec.expectedSha256,
      observation: observedById.get(spec.id),
    }));
    const canonical = rowArtifacts.filter((artifact) => artifact.canonicalPayload);
    const matching = canonical.filter(({ observation }) => observation?.status === "matched").length;
    const status = rowStatus(id, rowArtifacts);
    return {
      id,
      status,
      physicalArtifactCount: rowArtifacts.length,
      canonicalPayloadCount: canonical.length,
      matchedCanonicalPayloadCount: matching,
      artifactIds: rowArtifacts.map(({ id: artifactId }) => artifactId),
      limitations: status === "not-staged"
        ? ["No exact local artifact is recorded under the current lawful source evidence."]
        : ["Local bytes and checksums do not establish immutable archive, recovery, admission, release, or production eligibility."],
    };
  });
}

export function validateCanonicalRawInventory(document, {
  expectedRowIds = CORE_ROW_IDS,
  requireCanonicalRoot = false,
  expectedArtifacts = null,
} = {}) {
  condition(document && typeof document === "object" && !Array.isArray(document), "Canonical raw inventory must be an object.");
  condition(document.schemaVersion === INVENTORY_SCHEMA, "Canonical raw inventory schema differs.");
  condition(document.status === "local-read-only-reconciled", "Canonical raw inventory must remain local-read-only evidence.");
  condition(typeof document.observedAt === "string" && document.observedAt.trim(), "Canonical raw inventory needs an observation timestamp.");
  condition(document.dataRoot && typeof document.dataRoot === "object", "Canonical raw inventory needs its data-root record.");
  condition(typeof document.dataRoot.resolvedPath === "string" && path.isAbsolute(document.dataRoot.resolvedPath), "Canonical raw inventory resolved data root must be absolute.");
  condition(path.basename(document.dataRoot.resolvedPath) === "Witness_Tree-data", "Canonical raw inventory resolved data root must name Witness_Tree-data.");
  condition(document.dataRoot.externalOnly === true, "Canonical raw inventory must record externalOnly=true.");
  if (requireCanonicalRoot) validateDataRoot(document.dataRoot.resolvedPath, { requireCanonicalRoot: true });
  condition(document.dataRoot.canonicalPath === SSD_DATA_ROOT, "Canonical raw inventory must name the external SSD canonical path.");
  condition(document.claims && typeof document.claims === "object", "Canonical raw inventory needs explicit claims.");
  assert.deepEqual(document.claims, {
    localBytesOnly: true,
    immutableArchive: false,
    recoveryReplica: false,
    sourceLedgerAdmission: false,
    transformationAdmission: false,
    ingestion: false,
    release: false,
    productionAdmission: false,
    productionEligible: false,
  }, "Canonical raw inventory claims must remain local-only and fail closed.");
  condition(document.ledger && document.ledger.path === "data/phase1-production-source-ledger.json", "Canonical raw inventory must bind the production ledger path.");
  condition(SHA256.test(document.ledger.sha256), "Canonical raw inventory must bind the ledger SHA-256.");
  const ledgerPath = path.join(REPOSITORY_ROOT, document.ledger.path);
  let ledgerInfo;
  try {
    ledgerInfo = lstatSync(ledgerPath);
  } catch {
    throw new Error("Canonical raw inventory ledger binding file is missing.");
  }
  condition(ledgerInfo.isFile() && !ledgerInfo.isSymbolicLink(), "Canonical raw inventory ledger binding must be a regular non-symlink file.");
  const actualLedgerSha256 = createHash("sha256").update(readFileSync(ledgerPath)).digest("hex");
  condition(document.ledger.sha256 === actualLedgerSha256, "Canonical raw inventory ledger SHA-256 does not match the bound ledger file.");
  condition(Number.isInteger(document.ledger.coreRowCount) && document.ledger.coreRowCount === 22, "Canonical raw inventory must report 22 core rows.");
  assertCoreIds(document.ledger.rowIds);
  condition(Array.isArray(document.rows), "Canonical raw inventory rows are required.");
  assert.deepEqual(expectedRowIds, CORE_ROW_IDS, "The canonical validator cannot be narrowed below the 22-row Phase 1 core contract.");
  assert.deepEqual(document.rows.map(({ id }) => id), expectedRowIds, "Canonical raw inventory rows differ from the requested core row order.");
  assertCoreIds(document.rows.map(({ id }) => id));
  const artifacts = document.artifacts;
  condition(Array.isArray(artifacts), "Canonical raw inventory artifacts are required.");
  const artifactIds = artifacts.map(({ id }) => id);
  condition(new Set(artifactIds).size === artifactIds.length, "Canonical raw inventory artifact ids must be unique.");
  const expectedById = expectedArtifacts
    ? new Map(expectedArtifacts.map((spec) => [spec.id, spec]))
    : null;
  if (expectedArtifacts) {
    condition(expectedById.size === expectedArtifacts.length, "Canonical artifact specifications must use unique ids.");
    for (const spec of expectedArtifacts) validateArtifactSpec(spec, expectedRowIds);
  }
  for (const artifact of artifacts) {
    validateArtifactSpec(artifact, expectedRowIds);
    if (expectedById) {
      const expected = expectedById.get(artifact.id);
      condition(expected, `Canonical raw inventory contains an artifact outside its canonical specification: ${artifact.id}.`);
      assert.deepEqual(
        {
          id: artifact.id,
          rowIds: artifact.rowIds,
          relativePath: artifact.relativePath,
          expectedByteLength: artifact.expectedByteLength,
          expectedSha256: artifact.expectedSha256,
          kind: artifact.kind,
          canonicalPayload: artifact.canonicalPayload,
          sourceRefs: artifact.sourceRefs,
        },
        expected,
        `Artifact ${artifact.id} metadata differs from its canonical specification.`,
      );
    }
    condition(["matched", "missing", "mismatch", "unreadable"].includes(artifact.status), `Artifact ${artifact.id} has an invalid observation status.`);
    condition(typeof artifact.exists === "boolean", `Artifact ${artifact.id} needs an exists flag.`);
    if (artifact.status === "matched") {
      condition(artifact.exists === true && artifact.byteLength === artifact.expectedByteLength && artifact.sha256 === artifact.expectedSha256, `Matched artifact ${artifact.id} must expose exact observed bytes and SHA-256.`);
    }
    if (artifact.status === "missing") condition(artifact.exists === false, `Missing artifact ${artifact.id} must have exists=false.`);
  }
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const artifactIdsByRow = new Map(CORE_ROW_IDS.map((id) => [id, []]));
  for (const artifact of artifacts) {
    for (const rowId of artifact.rowIds) artifactIdsByRow.get(rowId).push(artifact.id);
  }
  for (const row of document.rows) {
    condition(Array.isArray(row.artifactIds), `Row ${row.id} needs artifact ids.`);
    assert.deepEqual(row.artifactIds, artifactIdsByRow.get(row.id), `Row ${row.id} must enumerate every artifact that names it, in canonical order.`);
    for (const id of row.artifactIds) condition(artifactById.has(id), `Row ${row.id} references missing artifact ${id}.`);
    const rowArtifacts = row.artifactIds.map((id) => artifactById.get(id));
    condition(row.physicalArtifactCount === rowArtifacts.length, `Row ${row.id} has a stale physical artifact count.`);
    const canonical = rowArtifacts.filter((artifact) => artifact.canonicalPayload !== false);
    condition(row.canonicalPayloadCount === canonical.length, `Row ${row.id} has a stale canonical payload count.`);
    condition(row.matchedCanonicalPayloadCount === canonical.filter((artifact) => artifact.status === "matched").length, `Row ${row.id} has a stale matching count.`);
    const expectedStatus = canonical.length === 0
      ? "not-staged"
      : canonical.every((artifact) => artifact.status === "matched")
        ? PARTIAL_COMPONENT_ROWS.has(row.id) ? "partial-local-components" : "matched-local-bytes"
        : canonical.some((artifact) => artifact.status === "mismatch" || artifact.status === "unreadable")
          ? "local-byte-mismatch-or-unreadable"
          : "missing-local-bytes";
    condition(row.status === expectedStatus, `Row ${row.id} has a stale status.`);
  }
  if (expectedArtifacts) {
    condition(Array.isArray(expectedArtifacts), "Expected artifact specs must be an array.");
    assert.deepEqual(artifactIds, expectedArtifacts.map(({ id }) => id), "Inventory artifact order differs from its canonical specification.");
  }
  condition(document.summary && typeof document.summary === "object" && document.summary.coreRowCount === 22, "Inventory summary must report 22 core rows.");
  condition(document.summary.matchedRowCount === document.rows.filter(({ status }) => status === "matched-local-bytes").length, "Inventory summary matched row count is stale.");
  condition(document.summary.partialRowCount === document.rows.filter(({ status }) => status === "partial-local-components" || status === "missing-local-bytes" || status === "local-byte-mismatch-or-unreadable").length, "Inventory summary partial row count is stale.");
  condition(document.summary.notStagedRowCount === document.rows.filter(({ status }) => status === "not-staged").length, "Inventory summary not-staged row count is stale.");
  condition(document.summary.physicalArtifactCount === artifacts.length, "Inventory summary physical count is stale.");
  condition(document.summary.matchedArtifactCount === artifacts.filter(({ status }) => status === "matched").length, "Inventory summary matched count is stale.");
  condition(document.summary.missingArtifactCount === artifacts.filter(({ status }) => status === "missing").length, "Inventory summary missing count is stale.");
  condition(document.summary.mismatchedOrUnreadableArtifactCount === artifacts.filter(({ status }) => status === "mismatch" || status === "unreadable").length, "Inventory summary mismatch count is stale.");
  condition(document.summary.canonicalPayloadCount === artifacts.filter(({ canonicalPayload }) => canonicalPayload).length, "Inventory summary canonical payload count is stale.");
  return document;
}

async function observeInventory(dataRoot, specs) {
  const observations = new Array(specs.length);
  const configuredConcurrency = Number.parseInt(process.env.WITNESS_TREE_RAW_INVENTORY_CONCURRENCY ?? "4", 10);
  const concurrency = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0 ? Math.min(configuredConcurrency, specs.length || 1) : 4;
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= specs.length) return;
      const spec = specs[index];
      process.stdout.write(`Hashing ${index + 1}/${specs.length} ${spec.relativePath}\n`);
      observations[index] = await observeArtifact(spec, dataRoot);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return observations;
}

export async function createCanonicalRawInventory({ dataRoot = DEFAULT_DATA_ROOT, observedAt = new Date().toISOString(), specs = canonicalArtifactSpecs() } = {}) {
  const resolvedRoot = validateDataRoot(dataRoot, { requireCanonicalRoot: true });
  for (const spec of specs) validateArtifactSpec(spec);
  condition(unique(specs.flatMap(({ rowIds }) => rowIds)).every((id) => CORE_ROW_IDS.includes(id)), "Canonical specs may reference only core rows.");
  const observations = await observeInventory(resolvedRoot, specs);
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const artifacts = specs.map((spec) => ({
    ...spec,
    ...observationById.get(spec.id),
  }));
  const rows = buildRows(specs, observations).map((row) => ({
    ...row,
    artifacts: undefined,
  }));
  const ledgerBytes = readFileSync(path.join(REPOSITORY_ROOT, "data/phase1-production-source-ledger.json"));
  const ledgerSha256 = createHash("sha256").update(ledgerBytes).digest("hex");
  const document = {
    schemaVersion: INVENTORY_SCHEMA,
    status: "local-read-only-reconciled",
    observedAt,
    notice: "Local filesystem evidence only. Exact local existence, byte length and SHA-256 do not prove immutable archive, recovery replica, source-ledger admission, transformation admission, ingestion, release, production admission or production eligibility.",
    dataRoot: { canonicalPath: SSD_DATA_ROOT, resolvedPath: resolvedRoot, externalOnly: true },
    claims: {
      localBytesOnly: true,
      immutableArchive: false,
      recoveryReplica: false,
      sourceLedgerAdmission: false,
      transformationAdmission: false,
      ingestion: false,
      release: false,
      productionAdmission: false,
      productionEligible: false,
    },
    ledger: { path: "data/phase1-production-source-ledger.json", sha256: ledgerSha256, coreRowCount: 22, rowIds: CORE_ROW_IDS },
    rows,
    artifacts,
    summary: {
      coreRowCount: 22,
      matchedRowCount: rows.filter(({ status }) => status === "matched-local-bytes").length,
      partialRowCount: rows.filter(({ status }) => status === "partial-local-components" || status === "missing-local-bytes" || status === "local-byte-mismatch-or-unreadable").length,
      notStagedRowCount: rows.filter(({ status }) => status === "not-staged").length,
      physicalArtifactCount: artifacts.length,
      matchedArtifactCount: artifacts.filter(({ status }) => status === "matched").length,
      missingArtifactCount: artifacts.filter(({ status }) => status === "missing").length,
      mismatchedOrUnreadableArtifactCount: artifacts.filter(({ status }) => status === "mismatch" || status === "unreadable").length,
      canonicalPayloadCount: artifacts.filter(({ canonicalPayload }) => canonicalPayload).length,
    },
  };
  for (const row of document.rows) delete row.artifacts;
  validateCanonicalRawInventory(document, { requireCanonicalRoot: true, expectedArtifacts: specs });
  return document;
}

function outputPathArgument(argv) {
  const index = argv.indexOf("--write");
  return index < 0 ? null : argv[index + 1] || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const output = outputPathArgument(argv);
  const dataRootArg = process.argv[process.argv.indexOf("--data-root") + 1];
  const dataRoot = process.argv.includes("--data-root") ? dataRootArg : DEFAULT_DATA_ROOT;
  const verifyBytes = argv.includes("--verify-bytes");
  const specs = canonicalArtifactSpecs();
  let inventory;
  if (output || verifyBytes) {
    inventory = await createCanonicalRawInventory({ dataRoot, specs });
  } else {
    inventory = JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
    validateCanonicalRawInventory(inventory, { expectedArtifacts: specs });
  }
  if (verifyBytes) {
    const recorded = JSON.parse(readFileSync(INVENTORY_PATH, "utf8"));
    inventory.observedAt = recorded.observedAt;
    assert.deepEqual(inventory, recorded, "Live external-SSD bytes differ from the durable canonical raw inventory.");
  } else if (output) {
    const target = path.resolve(output);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(inventory, null, 2)}\n`, { flag: "wx" });
    console.log(`Wrote ${target}`);
  }
  console.log(`Canonical Phase 1 raw inventory: ${inventory.summary.matchedRowCount}/22 rows have all expected local canonical payloads matched; ${inventory.summary.matchedArtifactCount}/${inventory.summary.physicalArtifactCount} physical artifacts matched. Archive/recovery/admission claims remain false.`);
}

export { CORE_ROW_IDS as PHASE1_CORE_ROW_IDS, canonicalArtifactSpecs };
