import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const STAGING_PATH = /^\.\.\/Witness_Tree-data\/raw\/[a-z0-9._-]+\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9._-]+$/;

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

export function validateStagedAcquisitions(manifest) {
  if (!manifest || manifest.status !== "local-staging") throw new Error("Manifest must remain local-staging.");
  required(manifest.notice, "Notice");
  if (!/not immutable object storage/i.test(manifest.notice) || !/not .*production/i.test(manifest.notice)) throw new Error("Notice must retain staging limitations.");
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) throw new Error("At least one verified staging entry is required.");
  const ids = new Set();
  for (const entry of manifest.entries) {
    for (const field of ["id", "sourceId", "datasetTitle", "publisher", "catalogueUrl", "sourceUrl", "localPath", "verifiedAt", "sha256", "licenceId", "temporalCoverage", "attributionState"]) required(entry?.[field], field);
    if (ids.has(entry.id)) throw new Error("Staging entry ids must be unique.");
    ids.add(entry.id);
    if (!entry.catalogueUrl.startsWith("https://") || !entry.sourceUrl.startsWith("https://")) throw new Error("Staging source URLs must use HTTPS.");
    if (!STAGING_PATH.test(entry.localPath) || entry.localPath.includes("/../")) throw new Error("Local path must remain in the separate staging tree.");
    if (!TIMESTAMP.test(entry.verifiedAt) || Number.isNaN(new Date(entry.verifiedAt).getTime())) throw new Error("Verified time must be a UTC timestamp.");
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0) throw new Error("Byte length must be a positive safe integer.");
    if (!SHA256.test(entry.sha256)) throw new Error("SHA-256 is required.");
    if (entry.zipIntegrity !== "passed") throw new Error("ZIP integrity must pass before recording an entry.");
    if (!["pending-review", "metadata-verified"].includes(entry.attributionState)) throw new Error("Attribution state is invalid.");
    if (entry.attributionState === "metadata-verified") {
      for (const field of ["attribution", "licenceUrl", "changesNotice"]) required(entry[field], field);
      if (!entry.licenceUrl.startsWith("https://")) throw new Error("Verified licence URL must use HTTPS.");
    }
    if (entry.immutableObjectStorage !== false || entry.productionEligible !== false) throw new Error("Local staging must never claim immutability or production eligibility.");
  }
  return manifest;
}

export async function checkStagedAcquisitions(file = new URL("../data/staged-acquisitions.json", import.meta.url)) {
  return validateStagedAcquisitions(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await checkStagedAcquisitions(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/staged-acquisitions.json"));
  console.log(`Staged acquisition evidence passed for ${manifest.entries.length} verified local ${manifest.entries.length === 1 ? "file" : "files"}.`);
}
