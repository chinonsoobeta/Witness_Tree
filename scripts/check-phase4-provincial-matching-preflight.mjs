import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { relative, resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REQUIRED = new Set([
  "data/phase1-production-source-ledger.json", "data/coverage-geometry-admission.json",
  "data/qc-original-current-inventory-profile.json", "data/qc-fourth-inventory-evidence.json",
  "data/phase2-v21-province-zonal-pilot-evidence.json", "data/phase2-real-national-execution-evidence.json",
]);
const hash = async (path) => createHash("sha256").update(await readFile(resolve(ROOT, path))).digest("hex");

export async function validatePhase4ProvincialMatchingPreflight(record) {
  if (record?.schemaVersion !== "witness-tree/phase4-provincial-matching-preflight/1" || record.status !== "blocked-no-numeric-results" || record.province !== "QC") throw new Error("Phase 4 matching preflight must record its blocked Québec state.");
  if (!Array.isArray(record.inputBindings) || record.inputBindings.length !== REQUIRED.size) throw new Error("Phase 4 matching preflight requires the exact checksum-bound inputs.");
  const paths = new Set();
  for (const item of record.inputBindings) {
    if (!REQUIRED.has(item?.path) || paths.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256 ?? "")) throw new Error("Phase 4 matching preflight input binding is invalid.");
    const target = resolve(ROOT, item.path);
    if (relative(ROOT, target).startsWith("..") || await hash(item.path) !== item.sha256) throw new Error(`Phase 4 matching preflight checksum does not match: ${item.path}.`);
    paths.add(item.path);
  }
  if (record.result?.matchRate !== null || record.result?.nonMatchRate !== null || record.result?.nonMatchReasonDistribution !== null || record.result?.productionEligible !== false) throw new Error("Blocked Phase 4 matching cannot publish numeric results or production eligibility.");
  if (!Array.isArray(record.blockers) || record.blockers.length < 4 || record.blockers.some((value) => typeof value !== "string" || !value.trim())) throw new Error("Phase 4 matching preflight requires concrete blockers.");
  const ledger = JSON.parse(await readFile(resolve(ROOT, "data/phase1-production-source-ledger.json"), "utf8"));
  for (const id of ["qc-current-ecoforest", "qc-original-current-inventory", "qc-fourth-inventory"]) {
    const row = ledger.entries.find((entry) => entry.id === id);
    if (!row || row.proof?.productionAdmission !== false || row.productionEligible !== false) throw new Error("The preflight is stale against Québec source admission state.");
  }
  const pilot = JSON.parse(await readFile(resolve(ROOT, "data/phase2-v21-province-zonal-pilot-evidence.json"), "utf8"));
  const national = JSON.parse(await readFile(resolve(ROOT, "data/phase2-real-national-execution-evidence.json"), "utf8"));
  if (pilot.result?.nationalPerCellGeometryMaterialized !== false || !national.limitations?.some((value) => /No patch vectorization or normalized events/.test(value))) throw new Error("The preflight must retain the Phase 2 geometry blocker.");
  return record;
}

export async function checkPhase4ProvincialMatchingPreflight(file = new URL("../data/phase4-provincial-matching-preflight.json", import.meta.url)) {
  return validatePhase4ProvincialMatchingPreflight(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await checkPhase4ProvincialMatchingPreflight();
  console.log("Phase 4 provincial matching preflight: blocked without numeric results.");
}
