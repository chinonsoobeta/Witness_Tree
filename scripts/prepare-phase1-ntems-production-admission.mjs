import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DECISIONS,
  NTEMS_SCOPES,
  OWNER_AUTHORIZATION,
  SPECIFICATION_PATH,
  readbackPresence,
  validateNtemsProductionAdmissionRecord,
} from "./check-phase1-ntems-production-admission-readiness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = "../../Witness_Tree-data/derived/phase1";
const OUTPUT_PATH = "data/phase1-ntems-production-admission.json";
const RIGHTS_PATH = "data/phase1-ntems-rights-verification-2026-08-26.json";
const SCOPE_APPROVAL_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
const READBACK_VERIFIER_PATH = "scripts/verify-phase1-ntems-transform.mjs";
const OGL_URL = "https://open.canada.ca/en/open-government-licence-canada";
const OGL_EN = "Contains information licensed under the Open Government Licence – Canada.";
const OGL_FR = "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert – Canada.";
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const readJson = (relativePath) => JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const binding = (relativePath) => ({ path: relativePath, sha256: sha256File(path.join(ROOT, relativePath)) });
const pointerBinding = ([relativePath, jsonPointer, expectedValue]) => ({ ...binding(relativePath), jsonPointer, expectedValue });

const EXPLANATIONS = Object.freeze({
  "ntems-annual-land-cover": {
    en: "Annual 30-m NTEMS forest land-cover classifications for 1984–2022, preserved as separate source-year context rasters.",
    fr: "Classifications annuelles de la couverture terrestre forestière NTEMS à 30 m pour 1984 à 2022, conservées comme rasters contextuels distincts par année source.",
  },
  "ntems-forest-harvest": {
    en: "A 30-m NTEMS raster recording the publisher’s mapped forest-harvest year classes for 1985–2022.",
    fr: "Un raster NTEMS à 30 m présentant les classes d’année de récolte forestière cartographiées par le fournisseur pour 1985 à 2022.",
  },
  "ntems-canopy-cover": {
    en: "A 30-m NTEMS 2022 canopy-cover percentage context raster; it is not a current-condition or land-tenure claim.",
    fr: "Un raster contextuel NTEMS à 30 m du pourcentage de couvert forestier en 2022; il ne constitue pas une affirmation sur les conditions actuelles ni sur le régime foncier.",
  },
  "ntems-canopy-height": {
    en: "A 30-m NTEMS 2022 canopy-height context raster; it is not a current-condition, biomass, or causation claim.",
    fr: "Un raster contextuel NTEMS à 30 m de la hauteur du couvert en 2022; il ne constitue pas une affirmation sur les conditions actuelles, la biomasse ou la causalité.",
  },
});

function fixedUtc(value, label) {
  if (!UTC.test(value ?? "") || new Date(value).toISOString() !== value.replace("Z", ".000Z")) throw new Error(`${label} must be a fixed whole-second UTC instant.`);
  return value;
}

function sourceAttribution(scope) {
  return [...scope.rightsBindings].reverse().find(([, pointer]) => pointer.endsWith("/attribution"))?.[2] ?? OGL_EN;
}

function retrievalDate(scope, auth) {
  if (scope.specId === "ntems-annual-land-cover-v1") {
    const preparation = readJson("data/vlce2-promotion-preparation.json");
    const byYear = new Map(preparation.entries.map((entry) => [entry.year, entry]));
    const inputs = auth.inputs.map((input) => {
      const source = byYear.get(input.year);
      if (!source || path.basename(input.path) !== source.originalFilename) throw new Error(`Annual retrieval evidence is missing for ${input.year}.`);
      return { path: input.path, retrievedAt: source.retrievedAt };
    });
    return { status: "multiple-source-files", firstRetrievedAt: inputs[0].retrievedAt, lastRetrievedAt: inputs.at(-1).retrievedAt, inputs };
  }
  const staged = readJson("data/staged-acquisitions.json");
  const inputSha = auth.inputs[0].sha256;
  const entry = staged.entries.find((candidate) => candidate.sha256 === inputSha);
  if (!entry?.retrievedAt) throw new Error(`${scope.rowId} retrieval evidence is missing from staged acquisitions.`);
  return entry.retrievedAt;
}

function artifactBindings(evidence) {
  return evidence.outputs.map((output) => {
    const sidecarPath = `${output.output}.sidecar.json`;
    const sidecarFile = path.resolve(ROOT, ARTIFACT_ROOT, sidecarPath);
    return {
      readbackOutput: output.output,
      output: { path: output.output, sha256: output.outputSha256, byteLength: output.outputByteLength },
      sidecar: { path: sidecarPath, sha256: sha256File(sidecarFile), byteLength: statSync(sidecarFile).size },
    };
  });
}

function buildRow(scope, rightsRecord, specificationRecord) {
  const auth = readJson(scope.authorizationPath);
  const evidence = readJson(scope.readbackPath);
  const specification = specificationRecord.specifications.find(({ id }) => id === scope.specId);
  const dataset = rightsRecord.datasets.find(({ rowId }) => rowId === scope.rowId);
  if (!specification || !dataset) throw new Error(`Missing specification or rights dataset for ${scope.rowId}.`);
  const modificationNotice = {
    en: "Witness Tree preserves the bound source values in deterministic derived outputs; the source archives are unchanged.",
    fr: "Witness Tree préserve les valeurs sources liées dans des sorties dérivées déterministes; les archives sources demeurent inchangées.",
  };
  const requiredAttribution = { en: OGL_EN, fr: OGL_FR };
  const rights = {
    licenceId: "ogl-canada",
    licenceVersion: "2.0",
    licenceUrl: OGL_URL,
    requiredAttribution,
    sourceAttribution: sourceAttribution(scope),
    modificationNotice,
    redistributionStatus: "allowed-under-ogl-canada-2.0-with-required-attribution-and-modification-notice",
    bulkRedistributionAllowed: true,
  };
  const originalNames = auth.inputs.map(({ path: inputPath }) => path.basename(inputPath));
  const outputs = evidence.outputs.map(({ output, outputSha256 }) => ({ path: output, sha256: outputSha256 }));
  return {
    id: scope.rowId,
    specId: scope.specId,
    evidence: {
      sourceRights: scope.rightsBindings.map(pointerBinding),
      sourceProfiles: scope.profilePaths.map(binding),
      specification: binding(SPECIFICATION_PATH),
      scopeApproval: binding(SCOPE_APPROVAL_PATH),
      executionAuthorization: binding(scope.authorizationPath),
      readback: binding(scope.readbackPath),
      readbackVerifier: binding(READBACK_VERIFIER_PATH),
    },
    artifacts: artifactBindings(evidence),
    rights,
    ledgerFields: {
      publisher: dataset.publisher,
      datasetTitle: dataset.title,
      sourceUrl: dataset.sourceResourceUrl,
      licence: rights.licenceId,
      licenceUrl: rights.licenceUrl,
      editionEffectiveDate: { status: "unknown", reason: "The publisher does not declare a separate edition-effective date; the named temporal coverage is not inferred as one." },
      retrievalDate: retrievalDate(scope, auth),
      checksum: auth.inputs.map(({ sha256 }) => sha256),
      archiveVersion: scope.specId === "ntems-annual-land-cover-v1" ? "Version 2" : "undeclared",
      coverage: dataset.temporalCoverage,
      schema: { kind: "raster", specification: scope.specId, sourceContract: specification.output.schema },
      transformations: { methodVersion: specification.methodVersion, summary: "Deterministic source-grid-preserving GeoTIFF transformation with no resampling or reprojection.", outputs },
      requiredAttribution,
      redistributionStatus: rights.redistributionStatus,
      modificationNotice,
      admissionState: true,
      datasetOriginalName: originalNames.length === 1 ? originalNames[0] : { count: originalNames.length, files: originalNames },
      plainLanguageExplanation: EXPLANATIONS[scope.rowId],
      updateCadence: dataset.updateCadence,
      nextExpectedRefresh: { status: "unknown", reason: "The publisher provides no fixed next refresh date; recheck the official listing before release." },
      bulkRedistributionAllowed: true,
      correctionContactRoute: { internalEn: "/en/corrections", internalFr: "/fr/corrections", publisherListing: dataset.listingUrl },
    },
  };
}

export function buildNtemsProductionAdmissionRecord(decidedAt) {
  fixedUtc(decidedAt, "--decided-at");
  const presence = readbackPresence(ROOT);
  if (presence.missingCount) throw new Error(`Cannot build admission record: ${presence.missingCount} exact NTEMS readback file(s) are missing.`);
  const rightsRecord = readJson(RIGHTS_PATH);
  const specificationRecord = readJson(SPECIFICATION_PATH);
  return {
    schemaVersion: "witness-tree/phase1-ntems-production-admission/1",
    status: "owner-approved-admitted-and-release-approved",
    decisionId: "phase1-ntems-four-scope-production-admission-v1",
    decidedAt,
    ownerAuthorization: OWNER_AUTHORIZATION,
    rows: NTEMS_SCOPES.map((scope) => buildRow(scope, rightsRecord, specificationRecord)),
    artifactRoot: ARTIFACT_ROOT,
    requiredAttribution: { en: OGL_EN, fr: OGL_FR },
    modificationNotice: {
      en: "Witness Tree records deterministic derived outputs and leaves the bound source archives unchanged.",
      fr: "Witness Tree consigne des sorties dérivées déterministes et laisse les archives sources liées inchangées.",
    },
    decisions: DECISIONS,
    limits: [
      "Admission is limited to the four named NTEMS datasets, exact archived inputs, and deterministic outputs; it does not claim conditions beyond their named temporal coverage.",
      "OGL Canada exclusions remain in force; no personal information, official symbols, or separately owned third-party material is admitted by this record.",
      "The record approves release and deployment but does not claim that a public deployment has already occurred.",
    ],
  };
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const decidedAt = get("--decided-at");
  if (!decidedAt) {
    console.log(JSON.stringify({ mode: "readiness-only", outputPath: OUTPUT_PATH, ...readbackPresence(ROOT) }, null, 2));
    return;
  }
  const record = buildNtemsProductionAdmissionRecord(decidedAt);
  validateNtemsProductionAdmissionRecord(record, ROOT);
  if (argv.includes("--write")) {
    const destination = path.join(ROOT, OUTPUT_PATH);
    if (existsSync(destination)) throw new Error(`Refusing to replace existing admission record: ${OUTPUT_PATH}.`);
    writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  }
  console.log(JSON.stringify({ mode: argv.includes("--write") ? "validated-and-written" : "validation-only", outputPath: OUTPUT_PATH, rows: record.rows.map(({ id }) => id), decisions: record.decisions }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Stopped: ${error.message}`); process.exitCode = 1; }
}
