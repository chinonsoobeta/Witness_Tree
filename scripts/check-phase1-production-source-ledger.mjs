import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate as validateFederalAdmission } from "./check-phase1-federal-electoral-production-admission.mjs";
import { NBAC_ARCHIVE_RECEIPT_PATH, validateNbacArchiveReceipt } from "./check-nbac-archive-receipt.mjs";
import { validatePhase1NbacProfile } from "./check-phase1-nbac-profile.mjs";
import { validateNtemsProductionAdmissionRecord } from "./check-phase1-ntems-production-admission-readiness.mjs";
import { validateQcStandCopyProductionAdmissionRecord } from "./check-qc-stand-copy-production-admission-readiness.mjs";

const STATES = new Map([
  ["remote-verified-archived-profiled", 1],
  ["production-admitted", 1],
  ["local-verified-profiled", 0.75],
  ["partial-component", 0.25],
  ["supporting-only", 0],
  ["access-blocked", 0],
  ["in-progress-not-admitted", 0],
  ["unaddressed", 0]
]);
const PROOFS = ["licence", "attribution", "retrievalVersion", "checksum", "rawArchiveRefetch", "profile", "immutableArchive", "productionAdmission"];
const ADMISSION_RECORD = /production-admission[^/]*\.json$/;
const EVIDENCE_REFERENCE_ERROR = "Evidence references must name existing repository data records and must be safe repository-relative paths to regular non-symlink files.";

function containedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function validateEvidenceReference(root, reference) {
  if (
    typeof reference !== "string"
    || reference.includes("\0")
    || path.isAbsolute(reference)
    || path.posix.isAbsolute(reference)
    || path.win32.isAbsolute(reference)
    || !reference.startsWith("data/")
  ) throw new Error(EVIDENCE_REFERENCE_ERROR);
  const segments = reference.split(/[\\/]/);
  if (segments[0] !== "data" || segments.slice(1).some((segment) => !segment || segment === "." || segment === "..")) throw new Error(EVIDENCE_REFERENCE_ERROR);

  const repositoryRoot = path.resolve(root);
  const file = path.resolve(repositoryRoot, reference);
  if (!containedPath(repositoryRoot, file)) throw new Error(EVIDENCE_REFERENCE_ERROR);
  let rootReal;
  let fileReal;
  try {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(EVIDENCE_REFERENCE_ERROR);
    rootReal = realpathSync(repositoryRoot);
    fileReal = realpathSync(file);
  } catch (error) {
    if (error.message === EVIDENCE_REFERENCE_ERROR) throw error;
    throw new Error(EVIDENCE_REFERENCE_ERROR);
  }
  if (!containedPath(rootReal, fileReal)) throw new Error(EVIDENCE_REFERENCE_ERROR);
  return file;
}

function sameSet(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function validateAdmissionRecord(record, root) {
  if (record?.schemaVersion === "witness-tree/phase1-production-admission/1") {
    validateFederalAdmission(record, root);
    return record.rows;
  }
  if (record?.schemaVersion === "witness-tree/phase1-ntems-production-admission/1") {
    validateNtemsProductionAdmissionRecord(record, root);
    return record.rows.map(({ id }) => id);
  }
  if (record?.schemaVersion === "witness-tree/phase1-qc-stand-copy-production-admission/1") {
    validateQcStandCopyProductionAdmissionRecord(record, root);
    return record.rows.map(({ id }) => id);
  }
  throw new Error(`Unsupported Phase 1 production-admission schema: ${record?.schemaVersion ?? "missing"}.`);
}

export function validatePhase1ProductionSourceLedger(ledger, inventory, root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), suppliedNbacProfile) {
  if (!ledger || ledger.schemaVersion !== 1 || !["blocked", "partially-admitted", "admitted"].includes(ledger.status)) throw new Error("Production source ledger must be schema-versioned and truthfully state its admission status.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ledger.asOf) || !ledger.notice) throw new Error("Production source ledger requires its as-of date and an explicit notice.");
  const requiredIds = inventory.entries.filter((entry) => entry.planUse === "production").map((entry) => entry.id);
  if (requiredIds.length !== 31) throw new Error("The authoritative inventory must contain exactly 31 production rows.");
  if (!Array.isArray(ledger.entries) || ledger.entries.length !== requiredIds.length) throw new Error("Ledger must contain every required production row exactly once.");
  const ids = new Set();
  const admissionReferences = new Map();
  const unadmittedAdmissionRows = new Set();
  for (const entry of ledger.entries) {
    if (!requiredIds.includes(entry.id) || ids.has(entry.id)) throw new Error("Ledger must match the authoritative production-row IDs exactly.");
    ids.add(entry.id);
    if (!STATES.has(entry.evidenceState) || entry.rawCredit !== STATES.get(entry.evidenceState)) throw new Error("Every evidence state has one fixed raw-evidence credit.");
    if (typeof entry.blocker !== "string" || !entry.blocker.trim()) throw new Error("Each source needs an explicit row or phase-level blocker statement.");
    if (!Array.isArray(entry.evidenceRefs)) throw new Error("Evidence references must be an array.");
    const rowAdmissionReferences = [];
    for (const reference of entry.evidenceRefs) {
      validateEvidenceReference(root, reference);
      if (ADMISSION_RECORD.test(reference)) {
        rowAdmissionReferences.push(reference);
        const admission = admissionReferences.get(reference) ?? { rows: new Set() };
        admission.rows.add(entry.id);
        admissionReferences.set(reference, admission);
      }
    }
    if (!entry.proof || Object.keys(entry.proof).length !== PROOFS.length) throw new Error("Every production proof must be explicit.");
    for (const proof of PROOFS) if (typeof entry.proof[proof] !== "boolean") throw new Error(`Production proof requires boolean ${proof}.`);
    if (entry.proof.productionAdmission) {
      if (entry.evidenceState !== "production-admitted" || entry.productionEligible !== true || !PROOFS.every((proof) => entry.proof[proof]) || rowAdmissionReferences.length !== 1) throw new Error("Production admission requires the admitted state, complete proof, eligibility, and exactly one admission record.");
    } else if (entry.evidenceState === "production-admitted" || entry.productionEligible !== false || PROOFS.every((proof) => entry.proof[proof])) throw new Error("Production eligibility or admission cannot be inferred from archival or profile evidence.");
    if (!entry.proof.productionAdmission && rowAdmissionReferences.length > 0) for (const reference of rowAdmissionReferences) unadmittedAdmissionRows.add(`${entry.id} (${reference})`);
    if (entry.evidenceState.startsWith("remote-") && (!entry.proof.immutableArchive || !entry.proof.profile || !entry.proof.rawArchiveRefetch)) throw new Error("Remote-verified evidence requires archive, profile, and raw recovery proof.");
    if (entry.evidenceState === "local-verified-profiled" && (!entry.proof.profile || !entry.proof.rawArchiveRefetch || entry.proof.immutableArchive)) throw new Error("Local evidence must remain profile/re-fetch evidence without immutable proof.");
  }
  const nbacEntry = ledger.entries.find(({ id }) => id === "cwfis-historical");
  const nbacProfileReference = "data/phase1-nbac-profile-2026-08-27.json";
  const nbacAuthorizationReference = "data/phase1-nbac-owner-authorization-2026-08-27.json";
  if (!nbacEntry.evidenceRefs.includes(nbacProfileReference) || !nbacEntry.evidenceRefs.includes(nbacAuthorizationReference) || !nbacEntry.evidenceRefs.includes(NBAC_ARCHIVE_RECEIPT_PATH)) throw new Error("NBAC ledger row must bind the exact profile, owner-authorization, and primary-readback receipt records.");
  const nbacProfile = validatePhase1NbacProfile(suppliedNbacProfile ?? JSON.parse(readFileSync(validateEvidenceReference(root, nbacProfileReference), "utf8")));
  const nbacReceipt = validateNbacArchiveReceipt(JSON.parse(readFileSync(validateEvidenceReference(root, NBAC_ARCHIVE_RECEIPT_PATH), "utf8")));
  if (nbacProfile.evidenceState.primaryObjectReadback !== nbacReceipt.claims.primaryObjectReadback || nbacReceipt.claims.immutablePrimaryArchive || nbacReceipt.claims.universalArchiveRecovery || nbacReceipt.operationBoundary.recoveryReplicaVerified || nbacEntry.proof.immutableArchive) throw new Error("NBAC primary-readback receipt must remain separate from immutable archive and recovery proof.");
  if (nbacReceipt.payload.byteLength !== nbacProfile.artifacts.payload.byteLength || nbacReceipt.payload.sha256 !== nbacProfile.artifacts.payload.sha256) throw new Error("NBAC primary-readback receipt must bind the exact profiled payload bytes.");
  const expectedNbacProof = {
    licence: true,
    attribution: true,
    retrievalVersion: true,
    checksum: nbacProfile.evidenceState.checksumVerified,
    rawArchiveRefetch: nbacProfile.evidenceState.refetchable,
    profile: nbacProfile.evidenceState.profiled,
    immutableArchive: nbacProfile.evidenceState.immutableArchive,
    productionAdmission: nbacProfile.evidenceState.productionAdmitted,
  };
  if (nbacEntry.evidenceState !== nbacProfile.status || Object.keys(expectedNbacProof).some((key) => nbacEntry.proof[key] !== expectedNbacProof[key]) || nbacEntry.productionEligible !== nbacProfile.evidenceState.productionEligible) throw new Error("NBAC ledger proof, state, or eligibility differs from the exact validated profile.");
  const admittedIds = ledger.entries.filter((entry) => entry.proof.productionAdmission).map((entry) => entry.id);
  const validatedAdmissionRecords = new Map();
  for (const [reference, admission] of admissionReferences) {
    const record = JSON.parse(readFileSync(validateEvidenceReference(root, reference), "utf8"));
    validatedAdmissionRecords.set(reference, { admission, recordRows: validateAdmissionRecord(record, root) });
  }
  if (unadmittedAdmissionRows.size > 0) throw new Error(`Admission-looking evidence references are not allowed on unadmitted ledger rows: ${[...unadmittedAdmissionRows].join(", ")}.`);
  const admittedByRecord = new Set();
  for (const [reference, { admission, recordRows }] of validatedAdmissionRecords) {
    const recordIds = new Set(recordRows);
    if (!sameSet(recordIds, admission.rows) || recordIds.size !== recordRows.length || [...admission.rows].some((id) => !ledger.entries.find((entry) => entry.id === id)?.proof.productionAdmission)) throw new Error(`Production-admission record ${reference} must exactly match ledger rows referencing it with productionAdmission proof.`);
    for (const id of recordRows) {
      if (admittedByRecord.has(id)) throw new Error(`Production-admission row is duplicated across records: ${id}.`);
      const entry = ledger.entries.find((candidate) => candidate.id === id);
      if (!entry?.proof.productionAdmission || !entry.evidenceRefs.includes(reference)) throw new Error(`Production-admission record is not exactly bound to ledger row: ${id}.`);
      admittedByRecord.add(id);
    }
  }
  if (JSON.stringify(admittedIds) !== JSON.stringify(admittedIds.filter((id) => admittedByRecord.has(id))) || admittedByRecord.size !== admittedIds.length) throw new Error("Admitted ledger rows must match the exact validated admission records.");
  const expectedStatus = admittedIds.length === 0 ? "blocked" : admittedIds.length === ledger.entries.length ? "admitted" : "partially-admitted";
  if (ledger.status !== expectedStatus) throw new Error("Ledger admission status does not match admitted rows.");
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
  console.log(`Phase 1 production-source ledger is ${ledger.status}: ${ledger.entries.length} rows, ${ledger.rawEvidenceNumerator.toFixed(2)} raw-evidence credits, formal evidence-tracking score ${ledger.formalProgress.percentage.toFixed(7)}%; ${Object.entries(counts).map(([state, entries]) => `${state}=${entries.length}`).join(", ")}.`);
}
