import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  END_YEAR,
  START_YEAR,
  TARGET_PROVINCES,
  aggregateNfdRows,
  exactDecimal,
  expectedFrameKeys,
  parseNfdCsv,
} from "../lib/phase2/nfd-harvest-statistics.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profilePath = resolve(repoRoot, "data/nfd-harvest-statistics-profile.json");
const DEFAULT_DATA_ROOT = resolve(repoRoot, "../../Witness_Tree-data");
const SHA256 = /^[a-f0-9]{64}$/;
const RAW_PREFIX = "raw/nfd-harvest-statistics/2026-08-27/";
const ROW_KEYS = [
  "province",
  "year",
  "areaHectares",
  "areaHectaresExact",
  "knownAreaHectares",
  "knownAreaHectaresExact",
  "sourceRowCount",
  "knownAreaRowCount",
  "blankAreaRowCount",
  "qualifierCounts",
  "missingness",
  "likeForLikeClaim",
];

function configuredDataRoot(dataRoot = process.env.WITNESS_TREE_DATA_ROOT ?? DEFAULT_DATA_ROOT) {
  assert(isAbsolute(dataRoot), "NFD data root must be absolute");
  return resolve(dataRoot);
}
function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertRawBinding(file, dataRoot, verifyBytes) {
  assert(file && typeof file === "object" && !Array.isArray(file), "raw file binding must be an object");
  assert(typeof file.relativePath === "string" && file.relativePath.startsWith(RAW_PREFIX), `${file.id} path is not bound to the NFD snapshot`);
  assert(Number.isSafeInteger(file.byteLength) && file.byteLength > 0, `${file.id} byte length is invalid`);
  assert.match(file.sha256, SHA256, `${file.id} SHA-256 is invalid`);
  if (!verifyBytes) return;
  const path = resolve(dataRoot, file.relativePath);
  const prefix = `${dataRoot}/`;
  assert(path.startsWith(prefix) && !relative(dataRoot, path).startsWith(".."), `${file.id} escapes the configured data root`);
  const info = lstatSync(path);
  assert(info.isFile() && !info.isSymbolicLink(), `${file.id} must be a regular file`);
  const bytes = readFileSync(path);
  assert.equal(bytes.length, file.byteLength, `${file.id} byte length drifted`);
  assert.equal(digest(bytes), file.sha256, `${file.id} SHA-256 drifted`);
}

function validateAggregateRow(row, expectedKey) {
  assert.deepEqual(Object.keys(row), ROW_KEYS, `${expectedKey} row keys drifted`);
  assert.equal(`${row.province}:${row.year}`, expectedKey);
  assert(TARGET_PROVINCES.includes(row.province), `${expectedKey} province is outside the fixed frame`);
  assert(Number.isSafeInteger(row.year) && row.year >= START_YEAR && row.year <= END_YEAR, `${expectedKey} year is outside the fixed frame`);
  for (const field of ["sourceRowCount", "knownAreaRowCount", "blankAreaRowCount"]) {
    assert(Number.isSafeInteger(row[field]) && row[field] >= 0, `${expectedKey} ${field} is invalid`);
  }
  assert(row.knownAreaHectares === null || (typeof row.knownAreaHectares === "number" && Number.isFinite(row.knownAreaHectares) && row.knownAreaHectares >= 0), `${expectedKey} known area is invalid`);
  assert.equal(typeof row.knownAreaHectaresExact, "string", `${expectedKey} known exact area is required`);
  assert.equal(exactDecimal(row.knownAreaHectaresExact), row.knownAreaHectaresExact, `${expectedKey} known exact area is not canonical`);
  assert.equal(Number(row.knownAreaHectaresExact), row.knownAreaHectares, `${expectedKey} known area arithmetic drifted`);
  assert(row.areaHectares === null || (typeof row.areaHectares === "number" && Number.isFinite(row.areaHectares) && row.areaHectares >= 0), `${expectedKey} complete area is invalid`);
  assert(row.areaHectaresExact === null || typeof row.areaHectaresExact === "string", `${expectedKey} complete exact area is invalid`);
  if (row.areaHectaresExact !== null) {
    assert.equal(exactDecimal(row.areaHectaresExact), row.areaHectaresExact, `${expectedKey} complete exact area is not canonical`);
    assert.equal(Number(row.areaHectaresExact), row.areaHectares, `${expectedKey} complete area arithmetic drifted`);
  }

  assert(row.qualifierCounts && typeof row.qualifierCounts === "object" && !Array.isArray(row.qualifierCounts), `${expectedKey} qualifier counts are required`);
  let qualifierCountTotal = 0;
  for (const [qualifier, count] of Object.entries(row.qualifierCounts)) {
    assert(["U", "a", "u", "E", "e", "n", "p", "s", "r"].includes(qualifier), `${expectedKey} has an unknown qualifier`);
    assert(Number.isSafeInteger(count) && count > 0, `${expectedKey} qualifier count is invalid`);
    qualifierCountTotal += count;
  }
  assert.equal(qualifierCountTotal, row.sourceRowCount, `${expectedKey} qualifier arithmetic drifted`);
  assert(row.missingness && typeof row.missingness === "object" && !Array.isArray(row.missingness), `${expectedKey} missingness is required`);
  assert(["complete", "complete-with-not-applicable", "partial-unknown", "no-source-rows"].includes(row.missingness.state), `${expectedKey} missingness state is invalid`);
  assert(Number.isSafeInteger(row.missingness.unknownAreaRowCount) && row.missingness.unknownAreaRowCount >= 0, `${expectedKey} unknown-area count is invalid`);
  assert(Number.isSafeInteger(row.missingness.notApplicableRowCount) && row.missingness.notApplicableRowCount >= 0, `${expectedKey} not-applicable count is invalid`);
  assert(Array.isArray(row.missingness.unknownQualifiers), `${expectedKey} unknown qualifier list is invalid`);
  assert.equal(row.sourceRowCount, row.knownAreaRowCount + row.blankAreaRowCount, `${expectedKey} source/blank arithmetic drifted`);
  assert.equal(row.blankAreaRowCount, row.missingness.unknownAreaRowCount + row.missingness.notApplicableRowCount, `${expectedKey} missingness arithmetic drifted`);
  assert.equal(row.missingness.unknownQualifiers.every((qualifier) => ["U", "u", "s", "r"].includes(qualifier)), true, `${expectedKey} unknown qualifier classification drifted`);
  assert.equal(row.likeForLikeClaim, false, `${expectedKey} must not claim like-for-like comparison`);
  const expectedState = row.sourceRowCount === 0
    ? "no-source-rows"
    : row.missingness.unknownAreaRowCount > 0
      ? "partial-unknown"
      : row.missingness.notApplicableRowCount > 0
        ? "complete-with-not-applicable"
        : "complete";
  assert.equal(row.missingness.state, expectedState, `${expectedKey} missingness state arithmetic drifted`);
  assert.equal(row.areaHectaresExact === null, row.sourceRowCount === 0 || row.missingness.unknownAreaRowCount > 0, `${expectedKey} complete area must remain null when unknown`);
}

export function validateNfdHarvestStatisticsProfile(profile, { verifyBytes = true, dataRoot = configuredDataRoot() } = {}) {
  assert(profile && typeof profile === "object" && !Array.isArray(profile), "NFD profile is required");
  assert.equal(profile.schemaVersion, "witness-tree/nonproduction-nfd-harvest-statistics-profile/1");
  assert.equal(profile.status, "nonproduction-profiled-transform");
  assert.equal(profile.sourceId, "nfd-area-harvested-en-fr");
  assert.equal(profile.productionEligible, false);
  assert.equal(profile.localProfileTransform, true);
  assert.equal(profile.immutableArchive, false);
  assert.equal(profile.ingestionAdmitted, false);
  assert.equal(profile.released, false);
  assert.equal(profile.comparison?.likeForLikeClaim, false);
  assert.equal(profile.comparison?.causalAttributionClaim, false);
  assert.equal(profile.raw?.snapshot, "2026-08-27");
  assert.equal(profile.raw?.csvRowCount, 12816);
  assert.equal(profile.raw?.csvColumnCount, 15);
  assert.equal(profile.raw?.files?.length, 3);
  for (const file of profile.raw.files) assertRawBinding(file, dataRoot, verifyBytes);
  assert.deepEqual(profile.frame?.provinces, TARGET_PROVINCES);
  assert.equal(profile.frame?.startYear, START_YEAR);
  assert.equal(profile.frame?.endYear, END_YEAR);
  assert.equal(profile.frame?.expectedRowCount, 156);
  assert(Array.isArray(profile.frame?.rows), "NFD frame rows are required");
  assert.equal(profile.frame.rows.length, 156);
  const keys = profile.frame.rows.map((row) => `${row.province}:${row.year}`);
  assert.deepEqual(keys, expectedFrameKeys());
  profile.frame.rows.forEach((row, index) => validateAggregateRow(row, keys[index]));
  assert.equal(profile.frame.digest?.algorithm, "sha256");
  assert.equal(profile.frame.digest?.canonicalization, "UTF-8 JSON.stringify(frame.rows)");
  assert.match(profile.frame.digest?.value ?? "", SHA256);
  assert.equal(digest(Buffer.from(JSON.stringify(profile.frame.rows), "utf8")), profile.frame.digest.value, "NFD frame digest drifted");

  if (verifyBytes) {
    const csv = profile.raw.files.find((file) => file.id === "nfd-area-harvested-csv");
    const computedRows = aggregateNfdRows(parseNfdCsv(readFileSync(resolve(dataRoot, csv.relativePath), "utf8")));
    assert.deepEqual(computedRows, profile.frame.rows, "NFD aggregate arithmetic or semantics drifted from the bound CSV");
  }
  return profile;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  validateNfdHarvestStatisticsProfile(profile);
  console.log(`NFD nonproduction harvest-statistics profile passed for ${profile.frame.rows.length} BC/AB/ON/QC province-year rows.`);
}
