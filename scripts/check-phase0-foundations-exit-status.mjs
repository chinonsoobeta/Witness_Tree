import { readFile } from "node:fs/promises";
import { validateExitStatus } from "./exit-status-contract.mjs";

// Wording is taken verbatim from the controlling plan, section 16, Phase 0 exit criteria.
const CRITERIA = new Map([
  ["forest-definition-published-bilingually", "The forest definition is published in the glossary in English and French"],
  ["confidence-rules-generate-bilingual-explanations", "The confidence rule set produces a generated explanation for every rule, in both languages, verified by a unit test"],
  ["source-ledger-rejects-missing-licence", "The source ledger rejects a test dataset that is missing a licence identifier"],
  ["legal-signoff-recorded-in-decision-log", "Legal sign-off is recorded in the decision log"],
  ["engagement-contact-route-answers-within-five-business-days", "The engagement contact route answers a test message within 5 business days"],
  ["product-name-resolves-from-one-token", "The product name resolves from one token, proven by a test"],
  // The plan's final Phase 0 bullet joins two separately testable gates: registration, which only the owner can
  // complete, and the identifier rule, which a checker can prove. Phases 7 and 8 already count at this grain.
  // Collapsing them into one criterion would hide a gate that passes behind one that cannot.
  ["both-names-registered-in-both-languages", "Both names are registered in both languages"],
  ["no-persistent-identifier-contains-the-product-name", "no persistent identifier contains the product name"],
]);

// The two halves must still reconstruct the plan's sentence, so the split cannot drift into a rewrite.
export const PLAN_BULLET = "Both names are registered in both languages, and no persistent identifier contains the product name";
export const SPLIT_CLAUSES = ["both-names-registered-in-both-languages", "no-persistent-identifier-contains-the-product-name"];

export async function validatePhase0FoundationsExitStatus(record) {
  return validateExitStatus(record, { schemaVersion: "witness-tree/phase0-foundations-exit-status/1", phase: 0, criteria: CRITERIA });
}

export async function checkPhase0FoundationsExitStatus(file = new URL("../data/phase0-foundations-exit-status.json", import.meta.url)) {
  return validatePhase0FoundationsExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase0FoundationsExitStatus();
  console.log(`Phase 0 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); ${record.ownerBlockers.length} ${record.ownerBlockers.length === 1 ? "criterion remains" : "criteria remain"} owner-blocked.`);
}
