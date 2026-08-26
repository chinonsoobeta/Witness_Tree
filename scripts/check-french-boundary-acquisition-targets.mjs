import { readFile } from "node:fs/promises";

const EXPECTED = new Map([
  ["elections-canada-fed-2023-fr", { boundaryKind: "FED", publisher: "Elections Canada", licenceId: "ogl-canada-2.0", currentForRankings: true }],
  ["statcan-2021-census-divisions-cbf-fr", { boundaryKind: "CD", publisher: "Statistics Canada", licenceId: "statcan-open-licence", currentForRankings: null }],
  ["statcan-2021-census-subdivisions-cbf-fr", { boundaryKind: "CSD", publisher: "Statistics Canada", licenceId: "statcan-open-licence", currentForRankings: null }],
]);

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

function https(value, field) {
  required(value, field);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) throw new Error(`${field} must be HTTPS.`);
  return parsed;
}

export function validateFrenchBoundaryAcquisitionTargets(record) {
  if (record?.schemaVersion !== "witness-tree/french-boundary-acquisition-targets/1" || record.status !== "planning-only-not-staged") throw new Error("French boundary targets must remain a planning-only not-staged record.");
  required(record.notice, "notice");
  if (!/No target has been downloaded, hashed, profiled, archived, transformed, ingested, or admitted to production/.test(record.notice)) throw new Error("French boundary notice must retain every non-admission boundary.");
  if (!Array.isArray(record.targets) || record.targets.length !== EXPECTED.size) throw new Error("French FED, CD, and CSD targets are all required.");
  const ids = new Set();
  for (const target of record.targets) {
    const expected = EXPECTED.get(target.id);
    if (!expected || ids.has(target.id)) throw new Error("French boundary target IDs must be exact and unique.");
    ids.add(target.id);
    if (target.boundaryKind !== expected.boundaryKind || target.language !== "fr" || target.publisher !== expected.publisher || target.licenceId !== expected.licenceId || target.currentForRankings !== expected.currentForRankings) throw new Error(`${target.id} metadata drifted.`);
    if (target.status !== "not-staged" || target.downloaded !== false || target.sha256 !== null || target.profiled !== false || target.productionEligible !== false) throw new Error(`${target.id} must remain not staged and non-admitting.`);
    const catalogue = https(target.catalogueUrl, `${target.id} catalogue URL`);
    required(target.edition, `${target.id} edition`);
    if (target.id === "elections-canada-fed-2023-fr") {
      if (catalogue.hostname !== "open.canada.ca") throw new Error("French FED must retain the Open Canada catalogue.");
      const artifact = https(target.artifactUrl, `${target.id} artifact URL`);
      if (artifact.hostname !== "ftp.maps.canada.ca") throw new Error("French FED must retain the Elections Canada artifact host.");
      if (!target.artifactUrl.endsWith("/CF_CA_2023_FR-SHP.zip")) throw new Error("French FED must retain the authoritative 2023 French SHP target.");
    } else if (catalogue.hostname !== "www12.statcan.gc.ca" || target.artifactUrl !== null || target.artifactSelectionStatus !== "not-selected-from-authoritative-form") {
      throw new Error(`${target.id} must not guess a French artifact filename before the authoritative form selection is recorded.`);
    }
  }
  return record;
}

export async function checkFrenchBoundaryAcquisitionTargets(file = new URL("../data/french-boundary-acquisition-targets.json", import.meta.url)) {
  return validateFrenchBoundaryAcquisitionTargets(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkFrenchBoundaryAcquisitionTargets();
  console.log(`French boundary acquisition targets passed for ${record.targets.length} not-staged targets.`);
}
