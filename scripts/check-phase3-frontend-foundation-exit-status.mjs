import { readFile } from "node:fs/promises";
import { validateExitStatus } from "./exit-status-contract.mjs";

// Wording is taken verbatim from the controlling plan, section 16, Phase 3 exit criteria.
const CRITERIA = new Map([
  ["budgets-pass-in-ci", "Every performance and accessibility budget in section 12.7 passes in CI"],
  ["usability-eight-of-ten-in-each-language", "8 of 10 participants complete 4 of 5 core tasks unassisted in each language"],
  ["french-page-count-equals-english-with-zero-missing-strings", "French page count equals English page count, with zero missing strings"],
  ["figure-without-provenance-fails-the-type-check", "A test that renders a figure without provenance fails the type check"],
  ["unknown-renders-an-en-dash-and-a-reason-never-a-zero", "A test that renders an unknown value produces an en dash and a reason, never a zero"],
]);

export async function validatePhase3FrontendFoundationExitStatus(record) {
  return validateExitStatus(record, { schemaVersion: "witness-tree/phase3-frontend-foundation-exit-status/1", phase: 3, criteria: CRITERIA });
}

export async function checkPhase3FrontendFoundationExitStatus(file = new URL("../data/phase3-frontend-foundation-exit-status.json", import.meta.url)) {
  return validatePhase3FrontendFoundationExitStatus(JSON.parse(await readFile(file, "utf8")));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = await checkPhase3FrontendFoundationExitStatus();
  console.log(`Phase 3 formal exit status: ${record.completedCriteria}/${record.totalCriteria} (${record.percentage}%); ${record.ownerBlockers.length} ${record.ownerBlockers.length === 1 ? "criterion remains" : "criteria remain"} owner-blocked.`);
}
