import { readFile } from "node:fs/promises";

const EXPECTED_IDS = new Set(["sopfeu", "bc-fta-cutblocks", "bc-harvesting-authorities", "bc-vri", "bc-consolidated-cutblocks", "bc-old-growth-bec", "bc-forest-operations-map", "on-fri", "on-fri-term-2"]);
const REDISTRIBUTION = new Set(["access-only", "permission-required", "partly-access-only", "unverified-redistribution"]);

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
}

export function validatePhase1OptionalEnhancements(record, inventory) {
  if (record?.schemaVersion !== "witness-tree/phase1-optional-enhancements/1" || record.status !== "v2-1-risk-register-not-admission") throw new Error("Optional-enhancement record must be Version 2.1 risk-only evidence.");
  required(record.notice, "notice");
  if (!/cannot block the national baseline, Big Four summaries, public launch, or Phase 1 core completion/.test(record.notice)) throw new Error("Optional-enhancement notice must retain the V2.1 core boundary.");
  if (!Array.isArray(record.entries) || record.entries.length !== EXPECTED_IDS.size) throw new Error("Every restricted optional source must be recorded exactly once.");
  const inventoryIds = new Set(inventory?.entries?.map((entry) => entry.id));
  const ids = new Set();
  for (const entry of record.entries) {
    if (!EXPECTED_IDS.has(entry.sourceId) || ids.has(entry.sourceId) || !inventoryIds.has(entry.sourceId)) throw new Error("Optional source IDs must be exact, unique, and present in the source inventory.");
    ids.add(entry.sourceId);
    required(entry.jurisdiction, `${entry.sourceId} jurisdiction`);
    required(entry.rightsBlocker, `${entry.sourceId} rights blocker`);
    if (!REDISTRIBUTION.has(entry.redistributionStatus) || entry.optionalEnhancement !== true || entry.phase1CoreBlocker !== false || entry.productionEligible !== false) throw new Error(`${entry.sourceId} must remain restricted, optional, non-core, and non-production.`);
  }
  const score = record.historicalEvidenceScore;
  if (!score || score.percentage !== 39.2741935 || score.status !== "historical-not-v2-1-phase-completion") throw new Error("Historical evidence score must remain historical and cannot become a V2.1 completion score.");
  return record;
}

export async function checkPhase1OptionalEnhancements(file = new URL("../data/phase1-optional-enhancements.json", import.meta.url), inventoryFile = new URL("../data/phase1-source-inventory.json", import.meta.url)) {
  const [record, inventory] = await Promise.all([readFile(file, "utf8"), readFile(inventoryFile, "utf8")]);
  return validatePhase1OptionalEnhancements(JSON.parse(record), JSON.parse(inventory));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase1OptionalEnhancements();
  console.log(`Phase 1 optional-enhancement gate passed for ${record.entries.length} restricted sources.`);
}
