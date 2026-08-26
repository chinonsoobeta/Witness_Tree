import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATEGORIES = ["national-baseline", "fire", "british-columbia", "quebec", "alberta", "ontario", "electoral-boundaries", "indigenous-boundaries", "excluded"];
const USES = new Set(["production", "reference", "excluded"]);
const REQUIRED = ["id", "category", "name", "purpose", "planUse", "evidence", "ownerRole", "missing", "externalDependency"];

export function validatePhase1SourceInventory(inventory) {
  if (!inventory || inventory.status !== "planning-inventory") throw new Error("Inventory must be planning-inventory.");
  if (!Array.isArray(inventory.entries) || !inventory.entries.length) throw new Error("Inventory requires entries.");
  const ids = new Set();
  const categories = new Set();
  for (const entry of inventory.entries) {
    for (const key of REQUIRED) if (typeof entry?.[key] !== "string" || !entry[key].trim()) throw new Error(`Entry requires ${key}.`);
    if (ids.has(entry.id)) throw new Error(`Duplicate id: ${entry.id}.`); ids.add(entry.id);
    if (!CATEGORIES.includes(entry.category)) throw new Error(`Unknown category: ${entry.category}.`); categories.add(entry.category);
    if (!USES.has(entry.planUse)) throw new Error(`Unknown plan use: ${entry.planUse}.`);
    if (entry.category === "excluded" && entry.planUse !== "excluded") throw new Error("Excluded entries must be excluded.");
    if (entry.planUse !== "excluded" && (!entry.ownerRole || !entry.missing || !entry.externalDependency)) throw new Error("Unresolved entries require an owner role, missing evidence, and external dependency.");
  }
  for (const category of CATEGORIES) if (!categories.has(category)) throw new Error(`Missing required category: ${category}.`);
  return inventory;
}

export async function checkPhase1SourceInventory(file = new URL("../data/phase1-source-inventory.json", import.meta.url)) {
  return validatePhase1SourceInventory(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inventory = await checkPhase1SourceInventory(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-source-inventory.json"));
  console.log(`Phase 1 source inventory passed for ${inventory.entries.length} plan records.`);
}
