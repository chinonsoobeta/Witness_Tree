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

// Fields below were already exact values in checked-in records and were simply
// never bound. Nothing here is inferred. Each staged pairing was corroborated by
// finding that entry's SHA-256 inside a file the row's own ledger entry lists in
// evidenceRefs, rather than by name similarity, which is a trap here: staged
// entry 14 is CARTE_ECO_ORI_PROV, a product the QC profile explicitly
// distinguishes from the CARTE_ECO_MAJ_PROV archive of qc-current-ecoforest.
//
// The rights, refresh, contact, transformation and plain-language fields stay
// missing on every row below. Values that could be read as supplying them exist,
// and each one is a derivation rather than a statement: a catalogue publication
// date is not a declared edition, a project refresh schedule is not a publisher
// cadence, and a project reading of a licence is not a redistribution grant.
const stagedFields = { publisher: "publisher", datasetTitle: "datasetTitle", sourceUrl: "sourceUrl", licenceUrl: "licenceUrl", archiveVersion: "sourceVersion", modificationNotice: "changesNotice" };
async function bindStagedSubset(row, index, fields) {
  for (const field of fields) await bind(row, field, "data/staged-acquisitions.json", `/entries/${index}/${stagedFields[field]}`);
}

await bindStagedSubset(byId.get("cwfis-current"), 0, ["datasetTitle", "archiveVersion", "modificationNotice"]);
await bindStagedSubset(byId.get("bc-wildfire"), 12, ["datasetTitle", "archiveVersion", "modificationNotice"]);
await bindStagedSubset(byId.get("ab-wildfire"), 13, ["publisher", "datasetTitle", "sourceUrl", "licenceUrl", "archiveVersion", "modificationNotice"]);
await bindStagedSubset(byId.get("on-fire-disturbance"), 15, ["publisher", "datasetTitle", "sourceUrl", "licenceUrl", "archiveVersion", "modificationNotice"]);
await bindStagedSubset(byId.get("qc-original-current-inventory"), 14, ["datasetTitle", "modificationNotice"]);
// The row's own profile carries the same literal and is listed in its evidenceRefs, so it is the closer binding.
await bind(byId.get("qc-original-current-inventory"), "archiveVersion", "data/qc-original-current-inventory-profile.json", "/retrieval/sourceVersion");

// data/phase1-ntems-rights-verification-2026-08-26.json is keyed by rowId and its
// sourceResourceUrl matches each staged sourceUrl byte for byte. It is the only
// record that states a publisher cadence for these four rows. Its
// bulkRedistributionAllowed... claim is deliberately not bound: it is this
// project's reading of a licence, not the publisher's grant.
for (const [id, index] of [["ntems-forest-harvest", 1], ["ntems-canopy-cover", 2], ["ntems-canopy-height", 3]]) {
  await bind(byId.get(id), "updateCadence", "data/phase1-ntems-rights-verification-2026-08-26.json", `/datasets/${index}/updateCadence`);
}
await bind(byId.get("ntems-annual-land-cover"), "licenceUrl", "data/vlce2-remote-promotion-evidence.json", "/source/licence/url");

// Coverage layer 6 records the exact CARTE_ECO_MAJ_PROV archive URL of
// acquisition-readiness source 3, so its licence URL and attribution are
// statements about this row's source rather than about the derived footprint.
for (const [field, pointer] of Object.entries({ licenceUrl: "/layers/6/licence/url", requiredAttribution: "/layers/6/attribution" })) {
  await bind(byId.get("qc-current-ecoforest"), field, "data/coverage-geometry-admission.json", pointer);
}

// acquisition-readiness source 5 is keyed alberta-avi-crown and its url equals
// staged entry 6 exactly. ab-avi-post-harvest is the second layer of that same
// archive, and is deliberately left missing: reading the catalogue cadence onto
// it would be an inference about a layer the catalogue entry does not name.
await bind(byId.get("ab-avi-crown"), "updateCadence", "data/acquisition-readiness.json", "/sources/5/updateCadence");

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
