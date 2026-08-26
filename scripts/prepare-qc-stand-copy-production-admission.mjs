import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMON_LIMITS,
  CORRECTION_ROUTES,
  DECISIONS,
  METHOD_VERSION,
  OWNER_AUTHORIZATION,
  QC_SCOPES,
  readbackPresence,
  validateQcStandCopyProductionAdmissionRecord,
} from "./check-qc-stand-copy-production-admission-readiness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARTIFACT_ROOT = "../../Witness_Tree-data";
export const OUTPUT_PATH = "data/phase1-qc-stand-copy-production-admission.json";
const PACKET_PATH = "data/phase1-downstream-admission-packet.json";
const OWNER_SCOPE_APPROVAL_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
const READBACK_VERIFIER_PATH = "scripts/verify-qc-stand-copy-readback.mjs";
const LICENSE_URL = "https://www.donneesquebec.ca/licence/#cc-by";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function binding(root, relativePath) {
  return { path: relativePath, sha256: sha256File(path.join(root, relativePath)) };
}

function fixedUtc(value) {
  if (!UTC.test(value ?? "")) throw new Error("--decided-at must be a fixed whole-second UTC instant.");
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== value.replace("Z", ".000Z")) {
    throw new Error("--decided-at must be a fixed whole-second UTC instant.");
  }
  return value;
}

function regularFile(file) {
  try {
    const info = lstatSync(file);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function completeReadbackPresence(root, artifactRoot) {
  const presence = readbackPresence(root, artifactRoot);
  const scopes = presence.scopes.map((entry, index) => {
    const scope = QC_SCOPES[index];
    const evidencePath = scope.expected.readbackEvidencePath;
    return {
      ...entry,
      readbackEvidencePath: evidencePath,
      readbackEvidencePresent: regularFile(path.join(root, evidencePath)),
    };
  });
  return {
    ...presence,
    mode: "readiness-only",
    outputPath: OUTPUT_PATH,
    scopes,
    evidenceMissingCount: scopes.filter(({ readbackEvidencePresent }) => !readbackEvidencePresent).length,
    admissionReady: scopes.every(({ readbackPresent, readbackEvidencePresent }) => readbackPresent && readbackEvidencePresent),
  };
}

export function readiness(root = ROOT, artifactRoot = ARTIFACT_ROOT) {
  return completeReadbackPresence(root, artifactRoot);
}

function requireCompleteReadbacks(root, artifactRoot) {
  const presence = completeReadbackPresence(root, artifactRoot);
  const incomplete = presence.scopes.filter(({ readbackPresent, readbackEvidencePresent }) => !readbackPresent || !readbackEvidencePresent);
  if (incomplete.length > 0) {
    throw new Error(`Cannot build admission record: complete output, sidecar, and readback evidence are required for both QC scopes; incomplete: ${incomplete.map(({ rowId }) => rowId).join(", ")}.`);
  }
  return presence;
}

function artifactBindings(root, artifactRoot, scope, evidence) {
  const expected = scope.expected;
  if (evidence.output?.path !== expected.artifactRelativePath || evidence.output?.sidecarPath !== expected.sidecarRelativePath) {
    throw new Error(`${scope.rowId} readback evidence does not bind the canonical output and sidecar paths.`);
  }
  const outputFile = path.resolve(root, artifactRoot, expected.artifactRelativePath);
  const sidecarFile = path.resolve(root, artifactRoot, expected.sidecarRelativePath);
  if (!regularFile(outputFile) || !regularFile(sidecarFile)) {
    throw new Error(`${scope.rowId} canonical output and sidecar must be regular, non-symlink files.`);
  }
  return {
    output: {
      path: expected.artifactRelativePath,
      sha256: evidence.output.sha256,
      byteLength: evidence.output.byteLength,
      layer: evidence.output.layer,
      featureCount: evidence.output.featureCount,
    },
    sidecar: {
      path: expected.sidecarRelativePath,
      sha256: evidence.output.sidecarSha256,
      byteLength: evidence.output.sidecarByteLength,
    },
  };
}

function buildRow(root, artifactRoot, scope) {
  const expected = scope.expected;
  const evidence = readJson(root, expected.readbackEvidencePath);
  const artifacts = artifactBindings(root, artifactRoot, scope, evidence);
  const modificationNotice = {
    en: "Witness Tree preserves the bound publisher values and records a deterministic derived output; the source archive is unchanged.",
    fr: "Witness Tree préserve les valeurs liées du fournisseur et consigne une sortie dérivée déterministe; l’archive source est inchangée.",
  };
  const requiredAttribution = structuredClone(expected.requiredAttribution);
  const rights = {
    licenceId: "cc-by-4.0",
    licenceVersion: "4.0",
    licenceUrl: LICENSE_URL,
    requiredAttribution,
    sourceAttribution: expected.sourceAttribution,
    modificationNotice,
    redistributionStatus: "allowed-under-cc-by-4.0-with-required-attribution-and-modification-notice",
    bulkRedistributionAllowed: true,
  };
  const correctionContactRoute = {
    ...CORRECTION_ROUTES,
    publisherListing: expected.ledger.sourceUrl,
  };
  const ledgerFields = {
    ...structuredClone(expected.ledger),
    licence: rights.licenceId,
    licenceUrl: rights.licenceUrl,
    checksum: [expected.rawArchiveSha256],
    transformations: {
      methodVersion: METHOD_VERSION,
      outputSha256: evidence.output.sha256,
      summary: "Deterministic lossless one-layer stand-copy with source-coded attributes and lineage fields preserved; no join, reprojection, repair, simplify, snap, dissolve, or semantic inference.",
    },
    requiredAttribution: structuredClone(requiredAttribution),
    redistributionStatus: rights.redistributionStatus,
    modificationNotice,
    admissionState: true,
    bulkRedistributionAllowed: true,
    correctionContactRoute,
  };
  return {
    id: scope.rowId,
    specId: scope.specId,
    evidence: {
      packet: binding(root, PACKET_PATH),
      ownerScopeApproval: binding(root, OWNER_SCOPE_APPROVAL_PATH),
      specification: binding(root, scope.specPath),
      executionApproval: binding(root, scope.executionApprovalPath),
      sourceRights: binding(root, scope.sourceRightsPath),
      readback: binding(root, expected.readbackEvidencePath),
      readbackVerifier: binding(root, READBACK_VERIFIER_PATH),
    },
    source: {
      rawArchiveSha256: expected.rawArchiveSha256,
      rawArchiveBytes: expected.rawArchiveBytes,
      archiveMember: expected.archiveMember,
      archiveMemberSha256: expected.extractedGeoPackageSha256,
      extractedGeoPackageSha256: expected.extractedGeoPackageSha256,
      extractedGeoPackageBytes: expected.extractedGeoPackageBytes,
    },
    artifacts: {
      output: {
        path: artifacts.output.path,
        sha256: artifacts.output.sha256,
        byteLength: artifacts.output.byteLength,
        layer: artifacts.output.layer,
        featureCount: artifacts.output.featureCount,
      },
      sidecar: {
        path: artifacts.sidecar.path,
        sha256: artifacts.sidecar.sha256,
        byteLength: artifacts.sidecar.byteLength,
      },
    },
    sourceRights: { licenceId: "cc-by-4.0", licenceVersion: "4.0", licenceUrl: LICENSE_URL },
    rights,
    ledgerFields,
    modificationNotice,
    plainLanguageExplanation: structuredClone(expected.ledger.plainLanguageExplanation),
    limits: structuredClone(expected.limits),
    correctionContactRoute,
    decisions: { ...DECISIONS },
  };
}

export function buildQcStandCopyProductionAdmissionRecord(decidedAt, root = ROOT, artifactRoot = ARTIFACT_ROOT) {
  fixedUtc(decidedAt);
  requireCompleteReadbacks(root, artifactRoot);
  const requiredAttribution = structuredClone(QC_SCOPES[0].expected.requiredAttribution);
  return {
    schemaVersion: "witness-tree/phase1-qc-stand-copy-production-admission/1",
    status: "owner-approved-admitted-and-release-approved",
    decisionId: "phase1-qc-stand-copy-production-admission-v1",
    decidedAt,
    ownerAuthorization: { ...OWNER_AUTHORIZATION },
    rows: QC_SCOPES.map((scope) => buildRow(root, artifactRoot, scope)),
    artifactRoot,
    requiredAttribution,
    modificationNotice: {
      en: "Witness Tree preserves the named publisher values and records deterministic derived outputs; the source archives are unchanged.",
      fr: "Witness Tree préserve les valeurs nommées du fournisseur et consigne des sorties dérivées déterministes; les archives sources sont inchangées.",
    },
    correctionContactRoute: {
      ...CORRECTION_ROUTES,
      publisherListing: QC_SCOPES[0].expected.ledger.sourceUrl,
    },
    decisions: { ...DECISIONS },
    limits: structuredClone(COMMON_LIMITS),
  };
}

function optionValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

export function main(argv = process.argv.slice(2)) {
  const decidedAt = optionValue(argv, "--decided-at");
  if (!decidedAt) {
    console.log(JSON.stringify(readiness(), null, 2));
    return;
  }
  const record = buildQcStandCopyProductionAdmissionRecord(decidedAt);
  validateQcStandCopyProductionAdmissionRecord(record, ROOT, ARTIFACT_ROOT);
  const write = argv.includes("--write");
  if (write) {
    const destination = path.join(ROOT, OUTPUT_PATH);
    if (existsSync(destination)) throw new Error(`Refusing to replace existing admission record: ${OUTPUT_PATH}.`);
    writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  console.log(JSON.stringify({
    mode: write ? "validated-and-written" : "validation-only",
    outputPath: OUTPUT_PATH,
    rows: record.rows.map(({ id }) => id),
    decisions: record.decisions,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Stopped: ${error.message}`); process.exitCode = 1; }
}
