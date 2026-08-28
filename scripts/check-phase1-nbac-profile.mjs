import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { approvedDataRootRealPathSync, resolveDataRoot, SSD_DATA_ROOT } from "./data-root.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORD = path.join(ROOT, "data/phase1-nbac-profile-2026-08-27.json");
const SHA = /^[a-f0-9]{64}$/;
const FIELDS = ["YEAR", "NFIREID", "BASRC", "FIREMAPS", "FIREMAPM", "FIRECAUS", "HS_SDATE", "HS_EDATE", "AG_SDATE", "AG_EDATE", "CAPDATE", "POLY_HA", "ADJ_HA", "ADJ_FLAG", "ADMIN_NAME", "ADMIN_DIV", "PRESCRIBED", "VERSION", "GID"];
const EXPECTED_SOURCE = {
  publisher: "Natural Resources Canada, Canadian Forest Service",
  catalogueUuid: "537a1fd0-698e-4a7b-85a1-e02581ae78b2",
  catalogueUrl: "https://cwfis.cfs.nrcan.gc.ca/en/catalogue/results/537a1fd0-698e-4a7b-85a1-e02581ae78b2",
  artifactUrl: "https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp.zip",
  metadataUrl: "https://cwfis.cfs.nrcan.gc.ca/downloads/nbac/NBAC_1972to2025_20260513_shp_metadata.pdf",
  edition: "NBAC 1972-2025, 20260513",
  lastModified: "2026-05-22T16:27:30Z",
  etag: "6a1083f2-4aed18d2",
};
const EXPECTED_ARTIFACTS = {
  payload: {
    filename: "NBAC_1972to2025_20260513_shp.zip",
    byteLength: 1257052370,
    sha256: "c42740eb9d2fe3991a27344d0c33927705ec3e78c277efc5311b502439cb2165",
    zipIntegrity: "passed",
  },
  metadata: {
    filename: "NBAC_1972to2025_20260513_shp_metadata.pdf",
    byteLength: 3483845,
    sha256: "cc04f0392921cf43723351ad1b1ed5e4794432724d95421db63dd92c33a4fca9",
  },
  catalogueSnapshot: {
    filename: "cwfis-catalogue-537a1fd0-698e-4a7b-85a1-e02581ae78b2.json",
    byteLength: 73615,
    sha256: "c38c3555da665884201e07c5c0b0a1dd46afb042b9b39466569ff6e39ac105c9",
  },
  geospatialProfile: {
    filename: "geospatial-profile.json",
    byteLength: 3212,
    sha256: "fb95cc162d23920008708ca856f147f7bd4eb9cd2e3234af2dd7e73990eab1a7",
  },
};

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains missing or unexpected fields`);
}

export function validatePhase1NbacProfile(record) {
  exactKeys(record, ["artifacts", "componentId", "dataRootRelativeDirectory", "evidenceState", "licence", "profile", "retrievedAt", "schemaVersion", "source", "sourceId", "status"], "NBAC profile");
  assert.equal(record.schemaVersion, "witness-tree/phase1-nbac-profile/1");
  assert.equal(record.status, "local-verified-profiled");
  assert.equal(record.sourceId, "cwfis-historical");
  assert.equal(record.componentId, "nrcan-nbac-1972-2025");
  assert.equal(record.retrievedAt, "2026-08-27");
  assert.equal(record.dataRootRelativeDirectory, "raw/nrcan-nbac-1972-2025/2026-08-27");
  exactKeys(record.source, Object.keys(EXPECTED_SOURCE), "NBAC publisher source");
  assert.deepEqual(record.source, EXPECTED_SOURCE, "NBAC publisher/catalogue/edition binding differs");
  exactKeys(record.licence, ["name", "noEndorsement", "requiredCitation", "url"], "NBAC licence");
  assert.equal(record.licence.name, "Open Government Licence - Canada");
  assert.equal(record.licence.url, "https://open.canada.ca/en/open-government-licence-canada");
  assert.match(record.licence.requiredCitation, /^Canadian Forest Service\. National Burned Area Composite/);
  assert.equal(record.licence.noEndorsement, true);
  exactKeys(record.artifacts, Object.keys(EXPECTED_ARTIFACTS), "NBAC artifacts");
  for (const [id, expected] of Object.entries(EXPECTED_ARTIFACTS)) {
    exactKeys(record.artifacts[id], Object.keys(expected), `NBAC ${id} artifact`);
    assert.deepEqual(record.artifacts[id], expected, `NBAC ${id} artifact binding differs`);
    assert.match(record.artifacts[id].sha256, SHA);
  }
  assert.equal(record.artifacts.payload.zipIntegrity, "passed");
  exactKeys(record.profile, ["bounds", "emptyGeometryCount", "fields", "featureCount", "geometryType", "invalidGeometryCount", "invalidGeometryPolicy", "invalidGeometryReasons", "layer", "missingGeometryCount", "missingYearCount", "toolchain", "yearRange"], "NBAC geospatial profile");
  assert.equal(record.artifacts.geospatialProfile.filename, "geospatial-profile.json");
  assert.equal(record.artifacts.geospatialProfile.byteLength, 3212);
  assert.match(record.artifacts.geospatialProfile.sha256, SHA);
  assert.deepEqual(record.profile.toolchain, { pyogrio: "0.13.0", gdal: "3.12.4" });
  assert.equal(record.profile.layer, "NBAC_merged_1972_to_2025_20260513");
  assert.equal(record.profile.geometryType, "Polygon");
  assert.equal(record.profile.featureCount, 52610);
  assert.deepEqual(record.profile.yearRange, [1972, 2025]);
  assert.equal(record.profile.missingYearCount, 0);
  assert.deepEqual(record.profile.fields, FIELDS);
  assert.deepEqual(record.profile.bounds, [-2307184.843699999, -716411.5524000004, 2998755.321999997, 2764440.964400001]);
  assert.deepEqual([record.profile.missingGeometryCount, record.profile.emptyGeometryCount, record.profile.invalidGeometryCount], [0, 0, 49]);
  assert.deepEqual(record.profile.invalidGeometryReasons, { "Ring Self-intersection": 49 });
  assert.equal(record.profile.invalidGeometryPolicy, "quarantine; no silent repair");
  exactKeys(record.evidenceState, ["checksumVerified", "downloaded", "immutableArchive", "ingested", "primaryObjectReadback", "productionAdmitted", "productionEligible", "profiled", "published", "refetchable", "released", "transformed"], "NBAC evidence state");
  assert.deepEqual(record.evidenceState, { downloaded: true, checksumVerified: true, profiled: true, refetchable: true, primaryObjectReadback: true, immutableArchive: false, transformed: false, ingested: false, released: false, published: false, productionAdmitted: false, productionEligible: false });
  return record;
}

function hash(file) {
  const descriptor = openSync(file, "r");
  const digest = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      digest.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
}

export function verifyPhase1NbacProfileBytes(record, dataRoot = resolveDataRoot()) {
  validatePhase1NbacProfile(record);
  assert.equal(typeof dataRoot, "string", "NBAC data root must be a string");
  assert(!dataRoot.includes("\0") && path.isAbsolute(dataRoot), "NBAC data root must be an absolute path");
  const approvedRoot = approvedDataRootRealPathSync(dataRoot);
  assert.equal(path.resolve(approvedRoot), SSD_DATA_ROOT, `NBAC bytes must be verified from the approved SSD root ${SSD_DATA_ROOT}`);
  const rootInfo = lstatSync(approvedRoot);
  assert(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), "Approved NBAC data root must be a real directory");
  const directory = path.join(approvedRoot, record.dataRootRelativeDirectory);
  const directoryInfo = lstatSync(directory);
  assert(directoryInfo.isDirectory() && !directoryInfo.isSymbolicLink(), "NBAC artifact directory must be a real directory");
  assert.equal(realpathSync(directory), directory, "NBAC artifact directory cannot traverse symlinked ancestors");
  const payload = path.join(directory, record.artifacts.payload.filename);
  for (const artifact of Object.values(record.artifacts)) {
    const file = path.join(directory, artifact.filename);
    const info = lstatSync(file);
    assert(!info.isSymbolicLink(), `${artifact.filename} must be a regular file, not a symlink`);
    assert(info.isFile(), `${artifact.filename} must be a regular file`);
    assert.equal(info.size, artifact.byteLength, `${artifact.filename} byte length differs`);
    assert.equal(hash(file), artifact.sha256, `${artifact.filename} SHA-256 differs`);
  }
  try {
    execFileSync("unzip", ["-t", payload], { stdio: "ignore" });
  } catch (error) {
    throw new Error(`NBAC payload ZIP integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return record;
}

export function checkPhase1NbacProfile(file = RECORD) {
  return validatePhase1NbacProfile(JSON.parse(readFileSync(file, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const record = checkPhase1NbacProfile();
  if (process.argv.includes("--verify-bytes")) verifyPhase1NbacProfileBytes(record);
  console.log(`NBAC local profile passed: ${record.profile.featureCount} features, ${record.profile.invalidGeometryCount} quarantined invalid geometries.`);
}
