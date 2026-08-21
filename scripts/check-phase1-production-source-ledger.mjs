import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STATES = new Map([
  ["remote-verified-archived-profiled", 1],
  ["local-verified-profiled", 0.75],
  ["partial-component", 0.25],
  ["supporting-only", 0],
  ["access-blocked", 0],
  ["in-progress-not-admitted", 0],
  ["unaddressed", 0]
]);
const PROOFS = ["licence", "attribution", "retrievalVersion", "checksum", "rawArchiveRefetch", "profile", "immutableArchive", "productionAdmission"];

export function validatePhase1ProductionSourceLedger(ledger, inventory, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  if (!ledger || ledger.schemaVersion !== 1 || ledger.status !== "blocked") throw new Error("Production source ledger must be schema-versioned and blocked.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ledger.asOf) || !ledger.notice) throw new Error("Production source ledger requires its as-of date and an explicit notice.");
  const requiredIds = inventory.entries.filter((entry) => entry.planUse === "production").map((entry) => entry.id);
  if (requiredIds.length !== 31) throw new Error("The authoritative inventory must contain exactly 31 production rows.");
  if (!Array.isArray(ledger.entries) || ledger.entries.length !== requiredIds.length) throw new Error("Ledger must contain every required production row exactly once.");
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (!requiredIds.includes(entry.id) || ids.has(entry.id)) throw new Error("Ledger must match the authoritative production-row IDs exactly.");
    ids.add(entry.id);
    if (!STATES.has(entry.evidenceState) || entry.rawCredit !== STATES.get(entry.evidenceState)) throw new Error("Every evidence state has one fixed raw-evidence credit.");
    if (entry.productionEligible !== false || typeof entry.blocker !== "string" || !entry.blocker.trim()) throw new Error("No current source may be production eligible and each needs an explicit blocker.");
    if (!Array.isArray(entry.evidenceRefs)) throw new Error("Evidence references must be an array.");
    for (const reference of entry.evidenceRefs) {
      if (typeof reference !== "string" || !reference.startsWith("data/") || !existsSync(path.join(root, reference))) throw new Error("Evidence references must name existing repository data records.");
    }
    if (!entry.proof || Object.keys(entry.proof).length !== PROOFS.length) throw new Error("Every production proof must be explicit.");
    for (const proof of PROOFS) if (typeof entry.proof[proof] !== "boolean") throw new Error(`Production proof requires boolean ${proof}.`);
    if (entry.proof.productionAdmission || PROOFS.every((proof) => entry.proof[proof])) throw new Error("A production admission cannot be inferred from archival or profile evidence.");
    if (entry.evidenceState.startsWith("remote-") && (!entry.proof.immutableArchive || !entry.proof.profile || !entry.proof.rawArchiveRefetch)) throw new Error("Remote-verified evidence requires archive, profile, and raw recovery proof.");
    if (entry.evidenceState === "local-verified-profiled" && (!entry.proof.profile || !entry.proof.rawArchiveRefetch || entry.proof.immutableArchive)) throw new Error("Local evidence must remain profile/re-fetch evidence without immutable proof.");
  }
  const totalRawCredit = ledger.entries.reduce((sum, entry) => sum + STATES.get(entry.evidenceState), 0);
  if (ledger.rawEvidenceNumerator !== totalRawCredit) throw new Error("Ledger raw-evidence numerator must be computed from its row states.");
  const progress = ledger.formalProgress;
  if (!progress || progress.baselinePercentagePoints !== 25 || progress.rawEvidenceWeightPercentagePoints !== 30 || progress.completeLedgerWeightPercentagePoints !== 45 || progress.completeLedgerWeightPercentagePoints + progress.rawEvidenceWeightPercentagePoints + progress.baselinePercentagePoints !== 100 || typeof progress.notice !== "string" || !/does not grant.*production eligibility/i.test(progress.notice)) throw new Error("Formal progress must retain its bounded 25/30/45 non-production contract.");
  const expectedProgress = progress.baselinePercentagePoints + progress.rawEvidenceWeightPercentagePoints * totalRawCredit / ledger.entries.length;
  if (progress.percentage !== Number(expectedProgress.toFixed(7))) throw new Error("Formal progress must be recomputed from the fixed baseline and raw-evidence numerator.");
  return ledger;
}

export async function checkPhase1ProductionSourceLedger(file = new URL("../data/phase1-production-source-ledger.json", import.meta.url)) {
  const [ledger, inventory] = await Promise.all([
    readFile(file, "utf8").then(JSON.parse),
    readFile(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  return validatePhase1ProductionSourceLedger(ledger, inventory);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ledger = await checkPhase1ProductionSourceLedger(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-production-source-ledger.json"));
  const counts = Object.groupBy(ledger.entries, ({ evidenceState }) => evidenceState);
  console.log(`Phase 1 production-source ledger is blocked: ${ledger.entries.length} rows, ${ledger.rawEvidenceNumerator.toFixed(2)} raw-evidence credits, formal evidence-tracking score ${ledger.formalProgress.percentage.toFixed(7)}%; ${Object.entries(counts).map(([state, entries]) => `${state}=${entries.length}`).join(", ")}.`);
}
