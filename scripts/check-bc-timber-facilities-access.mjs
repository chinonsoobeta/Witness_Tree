#!/usr/bin/env node
// The 2026-10-28 plan amendment lets Witness Tree list BC timber processing facilities, but only
// from the survey under the Open Government Licence - British Columbia. The rights check that
// day found the facility data Access Only or all rights reserved. This check keeps the decision
// and the block honest together: the decision may not drop its limits, and the block may not
// read as open, staged or published until a recorded permission replaces it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DECISION_PATH = "data/plan-scope-decision-2026-10-28-bc-facilities.json";
export const BLOCK_PATH = "data/bc-timber-facilities-access-block.json";

const HTTPS = /^https:\/\//;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

function https(value, field) {
  if (typeof value !== "string" || !HTTPS.test(value)) fail(`${field} must be an HTTPS URL.`);
}

export function validateFacilitiesDecision(decision) {
  if (decision?.schemaVersion !== "witness-tree/plan-scope-decision/1") fail("Decision schema drifted.");
  if (decision.status !== "owner-scope-decision" || decision.decidedAt !== "2026-10-28" || decision.owner !== "Chinonso Obeta") fail("Decision must name the owner and the 2026-10-28 date.");
  // The owner's approval named #9; it is applied to this feature by a recorded interpretation.
  // The quote must stay whole, and the interpretation must stay visible until the owner confirms it.
  if (typeof decision.ownerWords !== "string" || !decision.ownerWords.includes("I approve the plan amendment for #9.")) fail("Owner words must quote the approval sentence in full.");
  if (typeof decision.interpretation !== "string" || !/#9/.test(decision.interpretation) || !/#10/.test(decision.interpretation) || !/until the owner confirms/i.test(decision.interpretation)) fail("The interpretation applying the #9 approval to #10 must be recorded until the owner confirms it.");
  if (typeof decision.ownerConfirmedInterpretation !== "boolean") fail("ownerConfirmedInterpretation must be recorded.");
  const sections = (decision.planSectionsAmended ?? []).map((entry) => entry.section).sort();
  if (sections.join(",") !== "1.3,14.2") fail("Decision must amend plan sections 1.3 and 14.2 and no others.");
  const scope = decision.scope ?? {};
  if (scope.licenceRequired !== "Open Government Licence - British Columbia") fail("Scope must require the Open Government Licence - British Columbia.");
  for (const field of ["noCause", "noLossLink", "disputeRouteGate", "externalGate"]) if (typeof scope[field] !== "string" || !scope[field].trim()) fail(`Scope ${field} is required.`);
  if (scope.provinces?.join(",") !== "BC") fail("Scope covers British Columbia only.");
  if (scope.outOfScope?.provinces?.join(",") !== "AB,ON,QC") fail("Alberta, Ontario and Québec must stay out of scope.");
  for (const [field, value] of Object.entries(decision.doesNotGrant ?? {})) if (value !== false) fail(`doesNotGrant.${field} must remain false.`);
  for (const field of ["legalSignOff", "productionRelease", "sourceRights"]) if (decision.doesNotGrant?.[field] !== false) fail(`doesNotGrant.${field} must be recorded as false.`);
  for (const [field, value] of Object.entries(decision.gateEffect ?? {})) if (value !== false) fail(`gateEffect.${field} must remain false.`);
  if (decision.premiseCheck?.record !== BLOCK_PATH) fail("Decision must point to the rights check record.");
  return decision;
}

export function validateFacilitiesAccessBlock(block) {
  if (block?.schemaVersion !== "witness-tree/bc-timber-facilities-access-block/1") fail("Access block schema drifted.");
  if (block.status !== "blocked") fail("BC timber facilities must remain blocked until written permission or an open licence is recorded.");
  if (block.decision !== DECISION_PATH) fail("Access block must name the 2026-10-28 decision.");
  if (typeof block.nonClaimNotice !== "string" || !block.nonClaimNotice.trim()) fail("Non-claim notice is required.");
  const entry = block.ledgerEntry ?? {};
  for (const field of ["catalogueUrl", "surveyPageUrl", "resourceUrl", "licenceUrl"]) https(entry[field], `Ledger ${field}`);
  if (!SHA256.test(entry.rawChecksumSha256 ?? "")) fail("Ledger checksum must be a SHA-256 digest.");
  if (!Number.isInteger(entry.byteLength) || entry.byteLength <= 0) fail("Ledger byte length is required.");
  if (typeof entry.explanation?.en !== "string" || typeof entry.explanation?.fr !== "string") fail("Ledger explanation must be bilingual.");
  if (entry.status !== "access-blocked" || entry.methodTransformVersion !== null) fail("Ledger entry must not claim a transform.");
  if (block.rights?.openLicence !== false || block.rights?.catalogueLicence !== "Access Only") fail("Rights must record Access Only and no open licence.");
  if (!/without written permission/i.test(block.rights?.officialRestriction ?? "")) fail("Written-permission restriction is required.");
  if (block.observedContents?.statusColumn !== false) fail("The missing status column must stay explicit.");
  for (const [field, value] of Object.entries(block.admission ?? {})) if (value !== false) fail(`Admission ${field} must remain false.`);
  for (const field of ["staged", "transformed", "published", "productionEligible"]) if (block.admission?.[field] !== false) fail(`Admission ${field} must be recorded as false.`);
  if (!Array.isArray(block.blockers) || block.blockers.length < 3) fail("Rights, coverage and status blockers are required.");
  if (block.requestDraft?.status !== "unsent") fail("Permission request must remain unsent until the owner sends it.");
  https(block.requestDraft?.permissionFormUrl, "Permission form URL");
  return block;
}

export async function checkBcTimberFacilities(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const read = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
  const decision = validateFacilitiesDecision(await read(DECISION_PATH));
  const block = validateFacilitiesAccessBlock(await read(BLOCK_PATH));
  // Nothing may be built under the decision while the block stands.
  const builtRecord = await readFile(path.join(root, "data/bc-timber-facilities.json"), "utf8").then(() => true, () => false);
  if (block.status === "blocked" && builtRecord) fail("data/bc-timber-facilities.json exists while the source is access-blocked.");
  return { decision, block };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { block } = await checkBcTimberFacilities();
    console.log(`BC timber facilities decision recorded; source ${block.ledgerEntry.id} remains ${block.status} (${block.rights.catalogueLicence}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
