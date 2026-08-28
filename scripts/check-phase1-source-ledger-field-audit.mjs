import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { deepStrictEqual } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * These are the source-ledger facts named by Phase 1 of the implementation
 * prompt.  The six additional fields are the source-ledger requirements in
 * section 5.9 of the project plan.  They are intentionally enforced here,
 * rather than inferred from the coarser evidence booleans in the canonical
 * production ledger.
 */
export const REQUIRED_FIELDS = [
  "publisher",
  "datasetTitle",
  "sourceUrl",
  "licence",
  "licenceUrl",
  "editionEffectiveDate",
  "retrievalDate",
  "checksum",
  "archiveVersion",
  "coverage",
  "schema",
  "transformations",
  "requiredAttribution",
  "redistributionStatus",
  "modificationNotice",
  "admissionState",
  "datasetOriginalName",
  "plainLanguageExplanation",
  "updateCadence",
  "nextExpectedRefresh",
  "bulkRedistributionAllowed",
  "correctionContactRoute"
];

const FIELD_STATES = new Set(["verified", "missing"]);
const ALLOWED_STATUSES = new Set(["blocked", "partially-admitted", "complete"]);
export const OPTIONAL_ROW_IDS = [
  "sopfeu",
  "bc-fta-cutblocks",
  "bc-harvesting-authorities",
  "bc-vri",
  "bc-consolidated-cutblocks",
  "bc-old-growth-bec",
  "bc-forest-operations-map",
  "on-fri-term-2",
  "on-fri"
];
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OPTIONAL_ENHANCEMENTS = JSON.parse(readFileSync(path.join(DEFAULT_ROOT, "data/phase1-optional-enhancements.json"), "utf8"));

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function repositoryDataFile(reference, root, label) {
  assertCondition(typeof reference === "string" && reference.startsWith("data/"), `${label} references must be repository data paths.`);
  assertCondition(!path.isAbsolute(reference) && !reference.includes("\0") && !reference.split(/[\\/]/).some((segment) => !segment || segment === "." || segment === ".."), `${label} references must be safe repository data paths.`);
  const repositoryRoot = path.resolve(root);
  const absolute = path.resolve(repositoryRoot, reference);
  assertCondition(absolute.startsWith(`${repositoryRoot}${path.sep}`), `${label} references must stay inside the repository.`);
  let info;
  try {
    info = lstatSync(absolute);
  } catch {
    throw new Error(`${label} references missing repository file ${reference}.`);
  }
  assertCondition(info.isFile() && !info.isSymbolicLink(), `${label} references must name a regular non-symlink repository file.`);
  let resolvedRoot;
  let resolvedFile;
  try {
    resolvedRoot = realpathSync(repositoryRoot);
    resolvedFile = realpathSync(absolute);
  } catch {
    throw new Error(`${label} references an unreadable repository file ${reference}.`);
  }
  assertCondition(resolvedFile.startsWith(`${resolvedRoot}${path.sep}`), `${label} references must not traverse a symlink outside the repository.`);
  return absolute;
}

function assertExistingDataReferences(references, root, label) {
  assertCondition(Array.isArray(references) && references.length > 0, `${label} needs at least one evidence reference.`);
  for (const reference of references) repositoryDataFile(reference, root, label);
}

function readJsonPointer(document, pointer, label) {
  assertCondition(typeof pointer === "string" && (pointer === "" || pointer.startsWith("/")), `${label} needs an RFC 6901 JSON pointer.`);
  if (pointer === "") return document;
  let value = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    assertCondition(value !== null && (typeof value === "object" || Array.isArray(value)) && Object.hasOwn(value, token), `${label} points to a missing JSON value.`);
    value = value[token];
  }
  return value;
}

function assertEvidenceBinding(field, fieldName, rowId, root) {
  const binding = field.evidenceBinding;
  assertCondition(binding && typeof binding === "object" && !Array.isArray(binding), `Verified ${fieldName} on ${rowId} needs a deterministic evidence binding.`);
  assertCondition(Object.keys(binding).sort().join("\0") === ["expectedValue", "jsonPointer", "path", "sha256"].join("\0"), `Verified ${fieldName} on ${rowId} has an unexpected evidence-binding field.`);
  assertCondition(typeof binding.path === "string" && binding.path.startsWith("data/"), `Verified ${fieldName} on ${rowId} needs a repository-data binding path.`);
  assertCondition(field.evidenceRefs.includes(binding.path), `Verified ${fieldName} on ${rowId} must cite its binding path in evidenceRefs.`);
  const absolutePath = repositoryDataFile(binding.path, root, `Verified ${fieldName} on ${rowId}`);
  const bytes = readFileSync(absolutePath);
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  assertCondition(binding.sha256 === actualSha256, `Verified ${fieldName} on ${rowId} has a stale evidence-file SHA-256.`);
  let document;
  try {
    document = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`Verified ${fieldName} on ${rowId} must bind a JSON evidence record.`);
  }
  const extracted = readJsonPointer(document, binding.jsonPointer, `${rowId}.${fieldName}`);
  try {
    deepStrictEqual(extracted, binding.expectedValue);
    deepStrictEqual(field.value, binding.expectedValue);
  } catch {
    throw new Error(`Verified ${fieldName} on ${rowId} does not match its bound evidence value.`);
  }
}

function assertField(field, fieldName, rowId, root) {
  assertCondition(field && typeof field === "object" && !Array.isArray(field), `Row ${rowId} needs an object for ${fieldName}.`);
  assertCondition(FIELD_STATES.has(field.status), `Row ${rowId} has an invalid ${fieldName} status.`);
  if (field.status === "missing") {
    assertCondition(typeof field.reason === "string" && field.reason.trim(), `Missing ${fieldName} on ${rowId} needs a reason.`);
    assertCondition(!Object.hasOwn(field, "value"), `Missing ${fieldName} on ${rowId} cannot carry an asserted value.`);
    if (Object.hasOwn(field, "evidenceRefs")) {
      assertExistingDataReferences(field.evidenceRefs, root, `${rowId}.${fieldName}`);
    }
    const allowedKeys = ["reason", "status", ...(Object.hasOwn(field, "evidenceRefs") ? ["evidenceRefs"] : [])].sort();
    assertCondition(Object.keys(field).sort().join("\0") === allowedKeys.join("\0"), `Missing ${fieldName} on ${rowId} has unexpected fields.`);
    return;
  }

  assertCondition(Object.hasOwn(field, "value") && field.value !== null && field.value !== undefined, `Verified ${fieldName} on ${rowId} needs a value.`);
  if (typeof field.value === "string") assertCondition(field.value.trim(), `Verified ${fieldName} on ${rowId} needs a non-empty value.`);
  assertExistingDataReferences(field.evidenceRefs, root, `${rowId}.${fieldName}`);
  assertCondition(Object.keys(field).sort().join("\0") === ["evidenceBinding", "evidenceRefs", "status", "value"].join("\0"), `Verified ${fieldName} on ${rowId} has unexpected fields.`);
  assertEvidenceBinding(field, fieldName, rowId, root);
  assertCondition(!Object.hasOwn(field, "reason"), `Verified ${fieldName} on ${rowId} cannot carry a missing reason.`);
}

function exactIds(actual, expected, label) {
  assertCondition(Array.isArray(actual) && actual.length === expected.length, `${label} must contain exactly ${expected.length} rows.`);
  assertCondition(new Set(actual).size === expected.length, `${label} must not contain duplicate rows.`);
  assertCondition(actual.every((id, index) => id === expected[index]), `${label} must use the canonical production-row order.`);
}

function sameReferences(actual, expected, label) {
  assertCondition(Array.isArray(actual), `${label} must be an array.`);
  assertCondition(actual.length === expected.length && actual.every((reference, index) => reference === expected[index]), `${label} must match the canonical ledger evidence references exactly.`);
}

function classifyRows(optionalEnhancements, expectedIds) {
  assertCondition(optionalEnhancements && Array.isArray(optionalEnhancements.entries), "The optional-enhancement register is required for row classification.");
  assertCondition(optionalEnhancements.status === "v2-1-risk-register-not-admission", "The optional-enhancement register must remain a Version 2.1 non-admission register.");
  const registerIds = optionalEnhancements.entries.map(({ sourceId }) => sourceId);
  assertCondition(registerIds.length === OPTIONAL_ROW_IDS.length && new Set(registerIds).size === OPTIONAL_ROW_IDS.length && OPTIONAL_ROW_IDS.every((id) => registerIds.includes(id)), "The optional-enhancement register must contain the exact nine restricted-row IDs.");
  for (const entry of optionalEnhancements.entries) {
    assertCondition(expectedIds.includes(entry.sourceId), `Optional row ${entry.sourceId} is not a canonical production row.`);
    assertCondition(entry.optionalEnhancement === true && entry.phase1CoreBlocker === false && entry.productionEligible === false, `Optional row ${entry.sourceId} must remain tracked, non-blocking, and non-admitted.`);
  }
  return new Set(registerIds);
}

/**
 * Validate the field-level audit.  This is deliberately stricter than the
 * existing raw-evidence score: a true coarser proof flag cannot fill in an
 * absent licence, URL, version, attribution, or modification notice.
 */
export function validatePhase1SourceLedgerFieldAudit(audit, ledger, inventory, root = DEFAULT_ROOT, optionalEnhancements = DEFAULT_OPTIONAL_ENHANCEMENTS) {
  assertCondition(audit && audit.schemaVersion === 1, "Field audit must be schema-versioned.");
  assertCondition(ALLOWED_STATUSES.has(audit.status), "Field audit has an invalid status.");
  assertCondition(audit.asOf === "2026-08-27", "Field audit must use the current evidence date 2026-08-27.");
  assertCondition(typeof audit.notice === "string" && /fail closed/i.test(audit.notice), "Field audit needs an explicit fail-closed notice.");
  assertCondition(Array.isArray(audit.requiredFields) && audit.requiredFields.length === REQUIRED_FIELDS.length && audit.requiredFields.every((field, index) => field === REQUIRED_FIELDS[index]), "Field audit required fields must match the Phase 1 contract exactly.");
  assertCondition(ledger && ledger.schemaVersion === 1 && ["blocked", "partially-admitted"].includes(ledger.status), "The canonical production ledger must state its blocked or partial-admission status.");
  assertCondition(inventory && Array.isArray(inventory.entries), "The authoritative source inventory is required.");

  const expectedRows = inventory.entries.filter((entry) => entry.planUse === "production");
  assertCondition(expectedRows.length === 31, "The authoritative inventory must contain exactly 31 production rows.");
  const expectedIds = expectedRows.map(({ id }) => id);
  const optionalIds = classifyRows(optionalEnhancements, expectedIds);
  const coreIds = expectedIds.filter((id) => !optionalIds.has(id));
  assertCondition(coreIds.length === 22, "Version 2.1 must retain exactly 22 Phase 1 core rows.");
  assertCondition(ledger.entries.length === expectedIds.length, "The canonical production ledger must contain all 31 rows.");
  exactIds(ledger.entries.map(({ id }) => id), expectedIds, "Canonical production ledger IDs");
  exactIds(audit.rows?.map(({ id }) => id), expectedIds, "Field audit IDs");

  const ledgerById = new Map(ledger.entries.map((entry) => [entry.id, entry]));
  const seen = new Set();
  let completeRowCount = 0;
  let admittedRowCount = 0;

  for (const row of audit.rows) {
    assertCondition(row && typeof row === "object", "Each field-audit row must be an object.");
    assertCondition(!seen.has(row.id), `Duplicate field-audit row ${row.id}.`);
    seen.add(row.id);
    const ledgerRow = ledgerById.get(row.id);
    assertCondition(ledgerRow, `Field audit row ${row.id} is not in the canonical ledger.`);
    assertCondition(row.canonicalEvidenceState === ledgerRow.evidenceState, `Field audit row ${row.id} has stale evidence state.`);
    sameReferences(row.canonicalEvidenceRefs, ledgerRow.evidenceRefs, `Field audit row ${row.id} evidence references`);
    assertCondition(row.canonicalProductionEligible === ledgerRow.productionEligible && row.canonicalProductionAdmission === ledgerRow.proof?.productionAdmission, `Field audit row ${row.id} has stale production eligibility or admission.`);
    const expectedClassification = optionalIds.has(row.id) ? "optional" : "core";
    assertCondition(row.classification === expectedClassification, `Field audit row ${row.id} must be classified as ${expectedClassification} by the optional-enhancement register.`);
    assertCondition(row.fields && typeof row.fields === "object" && !Array.isArray(row.fields), `Field audit row ${row.id} needs field statuses.`);
    assertCondition(Object.keys(row.fields).length === REQUIRED_FIELDS.length && REQUIRED_FIELDS.every((field) => Object.hasOwn(row.fields, field)), `Field audit row ${row.id} must show every required field exactly once.`);

    for (const fieldName of REQUIRED_FIELDS) assertField(row.fields[fieldName], fieldName, row.id, root);
    const complete = REQUIRED_FIELDS.every((fieldName) => row.fields[fieldName].status === "verified");
    assertCondition(row.complete === complete, `Field audit row ${row.id} has a stale completeness result.`);
    if (complete) completeRowCount += 1;

    const admission = row.fields.admissionState;
    if (ledgerRow.proof.productionAdmission) assertCondition(complete && ledgerRow.productionEligible === true && admission.status === "verified" && admission.value === true, `Admitted field-audit row ${row.id} must be complete, eligible, and explicitly true.`);
    else assertCondition(ledgerRow.productionEligible === false && !(admission.status === "verified" && [true, "admitted", "production-admitted", "production-eligible"].includes(admission.value)), `Non-admitted field-audit row ${row.id} cannot claim admission or eligibility.`);
    if (admission.status === "verified" && [true, "admitted", "production-admitted", "production-eligible"].includes(admission.value)) admittedRowCount += 1;
  }

  assertCondition(audit.requiredRowCount === 31, "Field audit required row count must remain 31.");
  const coreCompleteRowCount = audit.rows.filter((row) => row.classification === "core" && row.complete).length;
  const optionalCompleteRowCount = audit.rows.filter((row) => row.classification === "optional" && row.complete).length;
  const coreAdmittedRowCount = audit.rows.filter((row) => row.classification === "core" && row.fields.admissionState.status === "verified" && [true, "admitted", "production-admitted", "production-eligible"].includes(row.fields.admissionState.value)).length;
  const optionalAdmittedRowCount = audit.rows.filter((row) => row.classification === "optional" && row.fields.admissionState.status === "verified" && [true, "admitted", "production-admitted", "production-eligible"].includes(row.fields.admissionState.value)).length;
  assertCondition(audit.coreRequiredRowCount === 22 && audit.optionalTrackedRowCount === 9, "Field audit must expose the Version 2.1 22-core/9-optional row contract.");
  assertCondition(audit.coreCompleteRowCount === coreCompleteRowCount && audit.optionalCompleteRowCount === optionalCompleteRowCount, "Field audit core/optional completeness counts must be derived from row classifications.");
  assertCondition(audit.coreAdmittedRowCount === coreAdmittedRowCount && audit.optionalAdmittedRowCount === optionalAdmittedRowCount, "Field audit core/optional admission counts must be derived from row classifications.");
  assertCondition(audit.completeRowCount === completeRowCount, "Field audit complete-row count must be derived from field statuses.");
  assertCondition(audit.admittedRowCount === admittedRowCount, "Field audit admitted-row count must be derived from admission states.");
  assertCondition(audit.phaseComplete === (coreCompleteRowCount === 22), "Field audit phase-complete state must be derived from all core required fields.");
  assertCondition(audit.productionAdmissionAllowed === (coreCompleteRowCount === 22 && coreAdmittedRowCount === 22), "Field audit production-admission state must be derived from complete/admitted core rows and fail closed.");
  if (coreCompleteRowCount < 22) {
    assertCondition(audit.status === (coreAdmittedRowCount > 0 ? "partially-admitted" : "blocked"), "A field-incomplete audit must truthfully state blocked or partial admission.");
    assertCondition(audit.phaseComplete === false && audit.productionAdmissionAllowed === false, "A field-incomplete audit cannot claim phase completion or admission.");
  }
  return audit;
}

export async function checkPhase1SourceLedgerFieldAudit(file = new URL("../data/phase1-source-ledger-field-audit.json", import.meta.url)) {
  const [audit, ledger, inventory] = await Promise.all([
    readFile(file, "utf8").then(JSON.parse),
    readFile(new URL("../data/phase1-production-source-ledger.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../data/phase1-source-inventory.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  return validatePhase1SourceLedgerFieldAudit(audit, ledger, inventory);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = await checkPhase1SourceLedgerFieldAudit(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/phase1-source-ledger-field-audit.json"));
  console.log(`Phase 1 source-ledger field audit is ${audit.status}: core ${audit.coreCompleteRowCount}/${audit.coreRequiredRowCount} complete and ${audit.coreAdmittedRowCount}/${audit.coreRequiredRowCount} admitted; optional tracked ${audit.optionalCompleteRowCount}/${audit.optionalTrackedRowCount} complete; all rows ${audit.completeRowCount}/${audit.requiredRowCount} complete; production admission allowed=${audit.productionAdmissionAllowed}.`);
}
