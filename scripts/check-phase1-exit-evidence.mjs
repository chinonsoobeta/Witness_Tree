import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPhase1CorruptionGate } from "./check-phase1-corruption-gate.mjs";
import { validateAcquisitionReadiness } from "./check-acquisition-readiness.mjs";
import { validateStagedAcquisitions } from "./check-staged-acquisitions.mjs";
import { validateStagedGeospatialProfile } from "./check-staged-geospatial-profile.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHA256 = /^[a-f0-9]{64}$/i;
const SOURCE_LEDGER_FIELDS = [
  "datasetNameOriginal",
  "publisher",
  "catalogueUrl",
  "licenceId",
  "attribution",
  "sourceVersion",
  "effectiveDate",
  "retrievedAt",
  "rawChecksumSha256",
  "updateCadence",
  "nextExpectedRefresh",
  "redistributionTerms",
  "coverageLimits",
  "correctionsContact",
];
const PROVINCES = new Set(["BC", "AB", "ON", "QC"]);

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));

function hasRequiredLedgerFields(entry) {
  return SOURCE_LEDGER_FIELDS.every((field) => typeof entry?.[field] === "string" && entry[field].trim())
    && typeof entry?.explanation?.en === "string" && entry.explanation.en.trim()
    && typeof entry?.explanation?.fr === "string" && entry.explanation.fr.trim();
}

function assessLedger(ledger, candidates) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const candidateIds = Array.isArray(candidates?.entries) ? candidates.entries.map(({ id }) => id) : [];
  const byId = new Map(entries.map((entry) => [entry?.id, entry]));
  const missingCandidateIds = candidateIds.filter((id) => !byId.has(id));
  const incompleteEntries = entries.filter((entry) => !hasRequiredLedgerFields(entry) || entry.status === "example").map((entry) => entry?.id ?? "<missing-id>");
  const complete = ledger?.status !== "example"
    && candidateIds.length > 0
    && missingCandidateIds.length === 0
    && incompleteEntries.length === 0;
  return {
    id: "complete-source-ledger",
    complete,
    evidenceRefs: ["data/source-ledger.json", "data/source-candidates.json"],
    observed: { ledgerStatus: ledger?.status ?? null, ledgerEntries: entries.length, minimumCandidateEntries: candidateIds.length, missingCandidateIds, incompleteEntries },
    reason: complete
      ? "The source ledger covers the current minimum candidate registry with non-example entries and every required Phase 1 field."
      : "The canonical source ledger is explicitly example-only or does not cover every current candidate with complete non-example lineage fields.",
  };
}

function assessArchive(staged, ledgerComplete) {
  const entries = Array.isArray(staged?.entries) ? staged.entries : [];
  const checksumEntries = entries.filter((entry) => SHA256.test(entry?.sha256 ?? ""));
  const immutableEntries = entries.filter((entry) => entry?.immutableObjectStorage === true);
  const immutableManifest = existsSync(path.join(ROOT, "data/immutable-promotions.json"));
  const complete = ledgerComplete
    && entries.length > 0
    && checksumEntries.length === entries.length
    && immutableEntries.length === entries.length
    && immutableManifest;
  return {
    id: "reproducible-raw-archive",
    complete,
    evidenceRefs: ["data/staged-acquisitions.json", "data/immutable-promotions.json"],
    observed: { stagedEntries: entries.length, checksumEntries: checksumEntries.length, immutableEntries: immutableEntries.length, immutableManifest },
    reason: complete
      ? "Every ledger-backed raw file has checksum, immutable archive, and recovery evidence."
      : "The current records show local staging only; immutable archive and recovery evidence for the complete production source set is absent.",
  };
}

async function assessCoverageGeometry() {
  const relativePath = "data/coverage-geometry-admission.json";
  const absolutePath = path.join(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return {
      id: "coverage-geometry",
      complete: false,
      evidenceRefs: [relativePath],
      observed: { artifactPresent: false, baselineProvinces: [] },
      reason: "No coverage-geometry admission artifact exists in the authoritative worktree.",
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Coverage geometry artifact is not valid JSON: ${error.message}`);
  }
  const baselineProvinces = [...new Set((Array.isArray(manifest.layers) ? manifest.layers : [])
    .filter((layer) => layer?.coverageRole === "national-baseline-land-base")
    .map((layer) => layer?.province))]
    .filter((province) => PROVINCES.has(province));
  const complete = manifest.status === "complete" && baselineProvinces.length === PROVINCES.size;
  return {
    id: "coverage-geometry",
    complete,
    evidenceRefs: [relativePath],
    observed: { artifactPresent: true, status: manifest.status ?? null, baselineProvinces },
    reason: complete
      ? "A complete coverage-geometry artifact assigns a baseline geometry to BC, Alberta, Ontario, and Québec."
      : "A coverage artifact exists but does not prove complete four-province baseline geometry with the required status.",
  };
}

export function evaluatePhase1ExitEvidence({ ledger, candidates, staged, coverageGeometry, corruptionGate, asOf }) {
  const requirements = [
    assessLedger(ledger, candidates),
    assessArchive(staged, requirementsLedgerComplete(ledger, candidates)),
    coverageGeometry,
    {
      id: "corruption-rejection",
      complete: corruptionGate?.status === "passed" && Array.isArray(corruptionGate.probes) && corruptionGate.probes.length > 0 && corruptionGate.probes.every(({ rejected }) => rejected === true),
      evidenceRefs: ["scripts/check-phase1-corruption-gate.mjs", "tests/phase1-corruption-gate.test.mjs"],
      observed: { status: corruptionGate?.status ?? null, probes: corruptionGate?.probes?.length ?? 0 },
      reason: corruptionGate?.status === "passed"
        ? "Synthetic corruption probes are rejected by the acquisition, staging, and geometry gates."
        : "The corruption gate did not prove rejection of deliberately altered evidence.",
    },
  ];
  const completed = requirements.filter(({ complete }) => complete).length;
  return {
    schemaVersion: 1,
    phase: 1,
    status: completed === requirements.length ? "complete" : "blocked",
    asOf: asOf ?? new Date().toISOString().slice(0, 10),
    notice: "This is a four-criterion exit audit, not a production-readiness percentage. A green criterion never grants source selection, ingestion, release, or production eligibility.",
    completedCriteria: completed,
    totalCriteria: requirements.length,
    percentage: Number(((completed / requirements.length) * 100).toFixed(2)),
    requirements,
  };
}

function requirementsLedgerComplete(ledger, candidates) {
  return assessLedger(ledger, candidates).complete;
}

export async function checkPhase1ExitEvidence(asOf) {
  const [ledger, candidates, staged, acquisitionReadiness, geospatialProfile, corruptionGate, coverageGeometry] = await Promise.all([
    readJson("data/source-ledger.json"),
    readJson("data/source-candidates.json"),
    readJson("data/staged-acquisitions.json"),
    readJson("data/acquisition-readiness.json"),
    readJson("data/staged-geospatial-profile.json"),
    (async () => runPhase1CorruptionGate({
      acquisitionReadiness: await readJson("data/acquisition-readiness.json"),
      stagedAcquisitions: await readJson("data/staged-acquisitions.json"),
      geospatialProfile: await readJson("data/staged-geospatial-profile.json"),
    }))(),
    assessCoverageGeometry(),
  ]);
  validateAcquisitionReadiness(acquisitionReadiness);
  validateStagedAcquisitions(staged);
  validateStagedGeospatialProfile(geospatialProfile);
  return evaluatePhase1ExitEvidence({ ledger, candidates, staged, coverageGeometry, corruptionGate, asOf });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const audit = await checkPhase1ExitEvidence();
  console.log(`Phase 1 exit audit: ${audit.completedCriteria}/${audit.totalCriteria} criteria complete (${audit.percentage}%), status=${audit.status}.`);
  for (const requirement of audit.requirements) console.log(`${requirement.complete ? "PASS" : "BLOCKED"} ${requirement.id}: ${requirement.reason}`);
}
