import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = path.join(root, "data/phase1-source-ledger-field-audit.json");
const sources = new Map();

async function source(file) {
  if (!sources.has(file)) {
    const bytes = await readFile(path.join(root, file));
    sources.set(file, { document: JSON.parse(bytes), sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return sources.get(file);
}

function pointerValue(document, pointer) {
  return pointer.slice(1).split("/").reduce((value, raw) => value[raw.replaceAll("~1", "/").replaceAll("~0", "~")], document);
}

async function bind(row, field, file, pointer) {
  const record = await source(file);
  const value = pointerValue(record.document, pointer);
  if (value === null || value === undefined || value === "") return;
  row.fields[field] = {
    status: "verified",
    value,
    evidenceRefs: [file],
    evidenceBinding: { path: file, sha256: record.sha256, jsonPointer: pointer, expectedValue: value }
  };
}

const staged = (index) => ["data/staged-acquisitions.json", `/entries/${index}`];

async function bindStaged(row, index, { schemaPointer } = {}) {
  const [file, base] = staged(index);
  for (const [field, leaf] of Object.entries({
    publisher: "publisher", datasetTitle: "datasetTitle", sourceUrl: "sourceUrl", licence: "licenceId", licenceUrl: "licenceUrl",
    archiveVersion: "sourceVersion", retrievalDate: "retrievedAt", checksum: "sha256", coverage: "temporalCoverage",
    requiredAttribution: "attribution", modificationNotice: "changesNotice", datasetOriginalName: "originalFilename"
  })) await bind(row, field, file, `${base}/${leaf}`);
  if (schemaPointer) await bind(row, "schema", schemaPointer[0], schemaPointer[1]);
}

const audit = JSON.parse(await readFile(auditPath, "utf8"));
const byId = new Map(audit.rows.map((row) => [row.id, row]));
const productionLedger = (await source("data/phase1-production-source-ledger.json")).document;
for (const row of audit.rows) {
  const index = productionLedger.entries.findIndex((entry) => entry.id === row.id);
  if (index < 0) continue;
  const entry = productionLedger.entries[index];
  row.canonicalEvidenceState = entry.evidenceState;
  row.canonicalEvidenceRefs = entry.evidenceRefs;
  row.canonicalProductionEligible = entry.productionEligible;
  row.canonicalProductionAdmission = entry.proof.productionAdmission;
  await bind(row, "admissionState", "data/phase1-production-source-ledger.json", `/entries/${index}/proof/productionAdmission`);
}

// Every mapping below is an exact JSON value in a checked-in acquisition or
// profiling record.  It deliberately records no inferred licence rights,
// refresh forecasts, contacts, transformations, or admissions.
await bindStaged(byId.get("ntems-forest-harvest"), 10, { schemaPointer: ["data/nrcan-harvest-profile.json", "/raster"] });
await bindStaged(byId.get("ntems-canopy-cover"), 9, { schemaPointer: ["data/nrcan-canopy-cover-profile.json", "/raster"] });
await bindStaged(byId.get("ntems-canopy-height"), 2, { schemaPointer: ["data/nrcan-canopy-height-profile.json", "/raster"] });

const annual = byId.get("ntems-annual-land-cover");
for (const [field, pointer] of Object.entries({ publisher: "/sources/0/publisher", datasetTitle: "/sources/0/datasetTitle", sourceUrl: "/sources/0/urlTemplate", licence: "/sources/0/licence", archiveVersion: "/sources/0/sourceVersion", coverage: "/sources/0/temporalCoverage", updateCadence: "/sources/0/updateCadence" })) await bind(annual, field, "data/acquisition-readiness.json", pointer);
await bind(annual, "requiredAttribution", "data/vlce2-remote-promotion-evidence.json", "/source/licence/attribution/en");

const qcCurrent = byId.get("qc-current-ecoforest");
for (const [field, pointer] of Object.entries({ publisher: "/sources/3/publisher", datasetTitle: "/sources/3/datasetTitle", sourceUrl: "/sources/3/url", licence: "/sources/3/licence", updateCadence: "/sources/3/updateCadence" })) await bind(qcCurrent, field, "data/acquisition-readiness.json", pointer);

await bindStaged(byId.get("ab-avi-crown"), 6, { schemaPointer: ["data/staged-geospatial-profile.json", "/sources/3/layers/0"] });
const aviPost = byId.get("ab-avi-post-harvest");
for (const [field, leaf] of Object.entries({ publisher: "publisher", sourceUrl: "sourceUrl", licence: "licenceId", licenceUrl: "licenceUrl", archiveVersion: "sourceVersion", retrievalDate: "retrievedAt", checksum: "sha256", coverage: "temporalCoverage", requiredAttribution: "attribution", modificationNotice: "changesNotice", datasetOriginalName: "originalFilename" })) await bind(aviPost, field, "data/staged-acquisitions.json", `/entries/6/${leaf}`);
await bind(aviPost, "schema", "data/staged-geospatial-profile.json", "/sources/3/layers/1");

await bindStaged(byId.get("ab-primary-land-vegetation"), 8, { schemaPointer: ["data/staged-geospatial-profile.json", "/sources/2/layers/0"] });

for (const id of ["fed-2023-ridings", "elections-canada-45th-files"]) {
  const row = byId.get(id);
  await bindStaged(row, 1, { schemaPointer: ["data/elections-canada-fed-2025-profile.json", "/layer"] });
  for (const field of ["editionEffectiveDate", "transformations", "redistributionStatus", "plainLanguageExplanation", "updateCadence", "nextExpectedRefresh", "bulkRedistributionAllowed", "correctionContactRoute"]) {
    await bind(row, field, "data/phase1-federal-electoral-production-admission.json", `/ledgerFields/${field}`);
  }
}

for (const row of audit.rows) {
  const complete = Object.values(row.fields).every((field) => field.status === "verified");
  row.complete = complete;
}
audit.completeRowCount = audit.rows.filter((row) => row.complete).length;
audit.coreCompleteRowCount = audit.rows.filter((row) => row.classification === "core" && row.complete).length;
audit.optionalCompleteRowCount = audit.rows.filter((row) => row.classification === "optional" && row.complete).length;
const admitted = (row) => row.fields.admissionState.status === "verified" && [true, "admitted", "production-admitted", "production-eligible"].includes(row.fields.admissionState.value);
audit.admittedRowCount = audit.rows.filter(admitted).length;
audit.coreAdmittedRowCount = audit.rows.filter((row) => row.classification === "core" && admitted(row)).length;
audit.optionalAdmittedRowCount = audit.rows.filter((row) => row.classification === "optional" && admitted(row)).length;
audit.phaseComplete = audit.coreCompleteRowCount === audit.coreRequiredRowCount;
audit.productionAdmissionAllowed = audit.phaseComplete && audit.coreAdmittedRowCount === audit.coreRequiredRowCount;
audit.status = audit.phaseComplete ? "complete" : audit.coreAdmittedRowCount > 0 ? "partially-admitted" : "blocked";
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
