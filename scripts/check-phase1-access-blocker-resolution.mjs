import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOCKED_IDS = [
  "bc-fta-cutblocks", "bc-harvesting-authorities", "on-fri", "on-fri-term-2",
  "bc-old-growth-bec", "bc-consolidated-cutblocks", "bc-vri", "bc-forest-operations-map",
  "sopfeu", "indian-reserves", "first-nation-reserves", "historic-treaties", "modern-treaties"
];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validatePhase1AccessBlockerResolution(matrix, ledger, root = ROOT) {
  if (matrix?.schemaVersion !== 1 || matrix.status !== "all-13-access-blocked-no-lawful-acquisition" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(matrix.reviewedAt ?? "")) throw new Error("Access-block resolution matrix must be timestamped and fail closed.");
  if (!/not an acquisition, authorization, archive, transformation, ingestion, or production-admission/i.test(matrix.scope ?? "") || !/No row has both an authoritative reusable, coherent source artifact or transaction-safe API/i.test(matrix.decision ?? "")) throw new Error("Resolution matrix cannot claim an acquisition or admission.");
  if (!Array.isArray(matrix.rankedRows) || matrix.rankedRows.length !== BLOCKED_IDS.length) throw new Error("Resolution matrix must cover every blocked production row exactly once.");
  const ids = new Set();
  for (const [index, row] of matrix.rankedRows.entries()) {
    if (row.rank !== index + 1 || !BLOCKED_IDS.includes(row.id) || ids.has(row.id)) throw new Error("Resolution matrix ranks each known blocked row exactly once.");
    ids.add(row.id);
    if (!Array.isArray(row.primaryEvidence) || !row.primaryEvidence.length || row.primaryEvidence.some((url) => typeof url !== "string" || !url.startsWith("https://"))) throw new Error(`${row.id} requires official HTTPS evidence URLs.`);
    if (typeof row.record !== "string" || !row.record.startsWith("data/") || !existsSync(path.join(root, row.record))) throw new Error(`${row.id} requires an existing machine-readable evidence record.`);
    if (typeof row.blockClass !== "string" || typeof row.verifiedFinding !== "string" || typeof row.resolution !== "string" || !row.verifiedFinding.trim() || !row.resolution.trim() || row.lawfulAcquisitionNow !== false) throw new Error(`${row.id} must state its concrete fail-closed resolution.`);
    const ledgerRow = ledger.entries?.find((entry) => entry.id === row.id);
    if (!ledgerRow || ledgerRow.evidenceState !== "access-blocked" || ledgerRow.rawCredit !== 0 || ledgerRow.productionEligible !== false) throw new Error(`${row.id} cannot be promoted by the resolution matrix.`);
  }
  return matrix;
}

export async function checkPhase1AccessBlockerResolution(file = new URL("../data/phase1-access-blocker-resolution.json", import.meta.url)) {
  const [matrix, ledger] = await Promise.all([readFile(file, "utf8").then(JSON.parse), readFile(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8").then(JSON.parse)]);
  return validatePhase1AccessBlockerResolution(matrix, ledger, path.resolve(path.dirname(fileURLToPath(file)), ".."));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const matrix = await checkPhase1AccessBlockerResolution();
  console.log(`Phase 1 access-block resolution passed: ${matrix.rankedRows.length} canonical rows remain fail-closed.`);
}
