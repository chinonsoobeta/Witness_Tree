#!/usr/bin/env node
/**
 * Fail-closed, read-only validator for the two Québec stand-copy outputs.
 *
 * The default command only checks whether the canonical artifact and sidecar
 * are present.  It does not hash, parse, transform, ingest, release, deploy,
 * or make an admission claim.  `--record` validates a future owner decision
 * record against the exact runner contracts and local output bytes.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PACKET_PATH = "data/phase1-downstream-admission-packet.json";
export const PACKET_SHA256 = "4859407ea256988a50873c03aa4146c8dd15e5e13f9ced47fa87a7883b404d6a";
export const OWNER_SCOPE_APPROVAL_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
export const OWNER_SCOPE_APPROVAL_SHA256 = "fda1c43d2ee23adb35907ddf012c9b64aa23e69774866c725271ed91223dffb2";
export const RUNNER_PATH = "scripts/run-qc-stand-copy.mjs";
export const METHOD_VERSION = "qc-stand-copy-runner-v1";
export const READBACK_VERIFIER_PATH = "scripts/verify-qc-stand-copy-readback.mjs";
export const READBACK_VERIFIER_METHOD_VERSION = "qc-stand-copy-independent-readback-v1";
export const CANONICAL_ARTIFACT_ROOT = "../../Witness_Tree-data";

const SHA256 = /^[0-9a-f]{64}$/;
const SPEC_SCHEMA = "witness-tree/transformation-spec/1";
const EXECUTION_APPROVAL_SCHEMA = "witness-tree/phase1-transformation-execution-approval/1";
const SIDECAR_SCHEMA = "witness-tree/qc-stand-copy-sidecar/1";
const READBACK_EVIDENCE_SCHEMA = "witness-tree/qc-stand-copy-readback-evidence/1";
const LICENSE_URL = "https://www.donneesquebec.ca/licence/#cc-by";
const LEDGER_FIELD_KEYS = [
  "archiveVersion", "bulkRedistributionAllowed", "checksum", "correctionContactRoute", "coverage", "datasetOriginalName", "datasetTitle", "editionEffectiveDate", "licence", "licenceUrl", "modificationNotice", "nextExpectedRefresh", "plainLanguageExplanation", "publisher", "redistributionStatus", "retrievalDate", "schema", "sourceUrl", "transformations", "requiredAttribution", "admissionState", "updateCadence",
];

const CURRENT_ATTRIBUTION_EN = "Source: Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers. Licensed under CC BY 4.0.";
const CURRENT_ATTRIBUTION_FR = "Source : Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers. Sous licence CC BY 4.0.";
const ORIGINAL_ATTRIBUTION_EN = "Source: Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers. Licensed under CC BY 4.0.";
const ORIGINAL_ATTRIBUTION_FR = "Source : Ministère des Ressources naturelles et des Forêts du Québec, Secteur des forêts, Direction des inventaires forestiers. Sous licence CC BY 4.0.";

export const OWNER_AUTHORIZATION = Object.freeze({
  ownerName: "Chinonso Obeta",
  statement: "I explicitly authorize ingestion, release, production admission, and deployment.",
  decision: "approve",
});

export const DECISIONS = Object.freeze({
  ingestionApproved: true,
  releaseApproved: true,
  productionAdmission: true,
  productionEligible: true,
  deploymentAuthorized: true,
});

export const COMMON_LIMITS = Object.freeze({
  en: [
    "The two artifacts preserve only the named publisher stand-map scopes; they are not a complete Québec forest-land denominator, event chronology, harvest record, or causal dataset.",
    "This validator verifies readback evidence and an owner decision record; it does not perform transformation, ingestion, release, deployment, or production admission.",
  ],
  fr: [
    "Les deux artefacts préservent seulement les périmètres nommés des cartes de peuplements du fournisseur; ils ne constituent ni un dénominateur forestier complet du Québec, ni une chronologie d’événements, ni un registre de récolte, ni un jeu de données causal.",
    "Ce validateur vérifie les preuves de relecture et une décision du propriétaire; il n’effectue ni transformation, ni ingestion, ni diffusion, ni déploiement, ni admission en production.",
  ],
});

const CURRENT_LIMITS = Object.freeze({
  en: [
    "CARTE_ECO_MAJ_PROV is a publisher current-ecoforest context map; source-coded values are not interpreted as disturbance classes, dates, harvest events, or causation.",
    "Its published footprint is local context only and does not establish complete Québec forest coverage or current real-time conditions.",
  ],
  fr: [
    "CARTE_ECO_MAJ_PROV est une carte contextuelle écoforestière à jour du fournisseur; les valeurs codées de la source ne sont pas interprétées comme des classes de perturbation, des dates, des événements de récolte ou une causalité.",
    "Son empreinte publiée est seulement un contexte local et n’établit ni une couverture forestière complète du Québec ni des conditions actuelles en temps réel.",
  ],
});

const ORIGINAL_LIMITS = Object.freeze({
  en: [
    "CARTE_ECO_ORI_PROV remains separate from the current map and the fixed fourth-inventory product; it is not a chronology or a fourth-inventory result.",
    "Publisher-coded fields and geocode are preserved as source values only; no joined meta, essence, or etage table is admitted by this scope.",
  ],
  fr: [
    "CARTE_ECO_ORI_PROV demeure distincte de la carte à jour et du produit du quatrième inventaire; elle ne constitue ni une chronologie ni un résultat du quatrième inventaire.",
    "Les champs codés du fournisseur et le géocode sont préservés seulement comme valeurs sources; aucune table meta, essence ou etage jointe n’est admise par ce périmètre.",
  ],
});

export const CORRECTION_ROUTES = Object.freeze({
  internalEn: "/en/corrections",
  internalFr: "/fr/corrections",
});

const CURRENT_FIELDS = Object.freeze([
  "geoc_maj", "geocode", "origine", "an_origine", "perturb", "an_perturb", "reb_ess1", "reb_ess2", "reb_ess3", "et_domi", "part_str", "type_couv", "gr_ess", "cl_dens", "cl_haut", "cl_age", "etagement", "couv_gaule", "cl_pent", "dep_sur", "cl_drai", "type_eco", "co_ter", "type_ter", "strate", "met_at_str", "superficie", "toponyme", "no_prg", "ver_prg", "in_maj", "shape_length", "shape_area",
]);
const ORIGINAL_FIELDS = Object.freeze([
  "geocode", "origine", "an_origine", "perturb", "an_perturb", "reb_ess1", "reb_ess2", "reb_ess3", "et_domi", "part_str", "type_couv", "gr_ess", "cl_dens", "cl_haut", "cl_age", "etagement", "couv_gaule", "cl_pent", "dep_sur", "cl_drai", "type_eco", "co_ter", "type_ter", "strate", "met_at_str", "superficie", "toponyme", "no_prg", "ver_prg", "shape_length", "shape_area",
]);

function outputSchema(fields) {
  return ["fid", "geom", ...fields, "source_fid", "output_record_id", "source_raw_sha256", "source_layer"];
}

function outputPath(specId, rawSha256, layer) {
  return `derived/phase1/${specId}/${rawSha256}/${METHOD_VERSION}/${layer}.gpkg`;
}

export const QC_SCOPES = Object.freeze([
  {
    rowId: "qc-current-ecoforest",
    sourceId: "qc-current-ecoforest",
    specId: "qc-current-ecoforest-stand-copy-v1",
    specPath: "data/transformation-specs/qc-current-ecoforest-stand-copy-v1.json",
    executionApprovalPath: "data/phase1-qc-current-ecoforest-execution-approval.json",
    sourceRightsPath: "data/coverage-geometry-admission.json",
    sourceRightsSha256: "cdc401d96348764540b37aa63e8d7dc42b8f0c343956272fd85051e62d75a2e5",
    expected: {
      specSha256: "44cdb08f033fc80040a7edf373189a0ce8c74bc3132d4e0892816fcf3f22bb1d",
      executionApprovalSha256: "35185ce3f5fc1a3ae4b66a4ac498f68a25ce5d2ed81cfd6b8d7b130b41ff0b0f",
      rawArchiveSha256: "c67c56b0c101e95bef4fbca53a06e2f1578fe38293961017f70d815209740cf1",
      rawArchiveBytes: 12399475076,
      extractedGeoPackageSha256: "4f592f99786770600bdf219e8cdae5908d9a2398ab6a9ae45662fafa2494aa00",
      extractedGeoPackageBytes: 36111704064,
      sourceRelativePath: "work/qc-current-ecoforest/2026-08-14/CARTE_ECO_MAJ_PROV.gpkg",
      archiveMember: "CARTE_ECO_MAJ_PROV.gpkg",
      layer: "pee_maj_prov",
      outputLayer: "qc_current_ecoforest_stands",
      featureCount: 9827536,
      geometryType: "MultiPolygon",
      crs: "EPSG:32198",
      crsCode: 32198,
      fields: CURRENT_FIELDS,
      prohibitedClaims: ["production admission", "complete Québec forest-land coverage", "harvest event identification", "disturbance causation", "current real-time conditions", "a change to publisher data"],
      sourceAttribution: CURRENT_ATTRIBUTION_FR,
      requiredAttribution: { en: CURRENT_ATTRIBUTION_EN, fr: CURRENT_ATTRIBUTION_FR },
      limits: CURRENT_LIMITS,
      ledger: {
        publisher: "Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers",
        datasetTitle: "CARTE_ECO_MAJ_PROV provincial current-ecoforest map",
        sourceUrl: "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Cartes_ecoforestieres_perturbations/02-Donnees/PROV/CARTE_ECO_MAJ_PROV_GPKG.zip",
        retrievalDate: "2026-08-14",
        archiveVersion: "undeclared",
        coverage: "Publisher current-ecoforest stand-map footprint only; local context and not a complete Québec forest-land denominator.",
        updateCadence: "Publisher current-ecoforest product; no fixed refresh cadence is declared.",
        datasetOriginalName: "CARTE_ECO_MAJ_PROV.gpkg",
        schema: { kind: "vector", format: "GeoPackage", layer: "pee_maj_prov", geometryType: "MultiPolygon", crs: "EPSG:32198", featureCount: 9827536, fields: CURRENT_FIELDS },
        plainLanguageExplanation: {
          en: "A bounded, lossless copy of the publisher's current-ecoforest stand polygons with source-coded attributes preserved verbatim.",
          fr: "Une copie délimitée et sans perte des peuplements de la carte écoforestière à jour du fournisseur; les attributs codés de la source sont préservés tels quels.",
        },
        editionEffectiveDate: { status: "unknown", reason: "The official current-ecoforest record does not declare a fixed edition-effective date; no date is inferred from the retrieval date or product documentation." },
        nextExpectedRefresh: { status: "unknown", reason: "The publisher does not declare a fixed next-refresh date; the official resource must be rechecked before a later release." },
      },
    },
  },
  {
    rowId: "qc-original-current-inventory",
    sourceId: "qc-original-current-inventory",
    specId: "qc-original-current-inventory-stand-copy-v1",
    specPath: "data/transformation-specs/qc-original-current-inventory-stand-copy-v1.json",
    executionApprovalPath: "data/phase1-qc-original-current-inventory-execution-approval.json",
    sourceRightsPath: "data/qc-original-current-inventory-profile.json",
    sourceRightsSha256: "109812a985ff3b7ddc89e172ddb73112f3ec96d7f0f2b80ddb28fe5616ab1be0",
    expected: {
      specSha256: "71707b702f2367d46c985e84f5f16e19ad75012c8efe71b2ff17dd8063c7ab2c",
      executionApprovalSha256: "971c7514b4f404c8892cfbb68e43687d1559c9a01bc7d1a36a5886e0aa145a40",
      rawArchiveSha256: "c10d691516569de76642dc1fc64e662f2569b5b58ab5d945b58b8b7834ba9c61",
      rawArchiveBytes: 11244667626,
      extractedGeoPackageSha256: "70539d99497de2773342611d73bf9e4fadf01f1fdbfe3ca536ad711d87916e7c",
      extractedGeoPackageBytes: 33243570176,
      sourceRelativePath: "extracted/qc-original-current-inventory/2026-08-14/CARTE_ECO_ORI_PROV.gpkg",
      archiveMember: "CARTE_ECO_ORI_PROV.gpkg",
      layer: "pee_ori_prov",
      outputLayer: "qc_original_current_inventory_stands",
      featureCount: 8387062,
      geometryType: "MultiPolygon",
      crs: "EPSG:32198",
      crsCode: 32198,
      fields: ORIGINAL_FIELDS,
      prohibitedClaims: ["production admission", "a temporal update chronology", "a fourth-inventory result", "a complete forest-land denominator", "harmonized disturbance or harvest classification"],
      sourceAttribution: ORIGINAL_ATTRIBUTION_EN,
      requiredAttribution: { en: ORIGINAL_ATTRIBUTION_EN, fr: ORIGINAL_ATTRIBUTION_FR },
      limits: ORIGINAL_LIMITS,
      ledger: {
        publisher: "Ministère des Ressources naturelles et des Forêts du Québec, Secteur des Forêts, Direction des inventaires forestiers",
        datasetTitle: "Carte écoforestière originale et résultats d’inventaire courants — provincial GeoPackage",
        sourceUrl: "https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/DONNEES_FOR_ECO_SUD/Resultats_inventaire_et_carte_ecofor/02-Donnees/PROV/CARTE_ECO_ORI_PROV_GPKG.zip",
        retrievalDate: "2026-08-14T15:15:58Z",
        archiveVersion: "undeclared",
        coverage: "Publisher original/current-inventory stand-map footprint only; local context and not a complete Québec forest-land denominator.",
        updateCadence: "The official original/current product declares no fixed refresh cadence.",
        datasetOriginalName: "CARTE_ECO_ORI_PROV.gpkg",
        schema: { kind: "vector", format: "GeoPackage", layer: "pee_ori_prov", geometryType: "MultiPolygon", crs: "EPSG:32198", featureCount: 8387062, fields: ORIGINAL_FIELDS },
        plainLanguageExplanation: {
          en: "A bounded, lossless copy of the publisher's original/current-inventory stand polygons; source-coded attributes and geocode are preserved without joins.",
          fr: "Une copie délimitée et sans perte des peuplements du produit original et courant du fournisseur; les attributs codés et le géocode sont préservés sans jointure.",
        },
        editionEffectiveDate: { status: "unknown", reason: "The official original/current product declares no publisher dataset version or fixed edition-effective date; no date is inferred." },
        nextExpectedRefresh: { status: "unknown", reason: "The publisher does not declare a fixed next-refresh date; the official resource must be rechecked before a later release." },
      },
    },
  },
].map((scope) => Object.freeze({
  ...scope,
  expected: Object.freeze({
    ...scope.expected,
    outputSchema: Object.freeze(outputSchema(scope.expected.fields)),
    artifactRelativePath: outputPath(scope.specId, scope.expected.rawArchiveSha256, scope.expected.outputLayer),
    sidecarRelativePath: `${outputPath(scope.specId, scope.expected.rawArchiveSha256, scope.expected.outputLayer)}.json`,
    readbackEvidencePath: `data/${scope.rowId}-stand-copy-readback-evidence.json`,
  }),
})));

export const REQUIRED_SOURCE_BINDINGS = Object.freeze({
  packet: { path: PACKET_PATH, sha256: PACKET_SHA256 },
  ownerScopeApproval: { path: OWNER_SCOPE_APPROVAL_PATH, sha256: OWNER_SCOPE_APPROVAL_SHA256 },
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function canonicalJson(value) {
  return `${canonical(value)}\n`;
}

export function sha256File(file) {
  const hash = createHash("sha256");
  const fd = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function exact(actual, expected, label) {
  assert.deepEqual(actual, expected, `${label} drifted.`);
}

function exactKeys(value, keys, label) {
  exact(Object.keys(value ?? {}).sort(), [...keys].sort(), `${label} keys`);
}

function object(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function nonEmpty(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string.`);
  assert.ok(value.trim(), `${label} must not be empty.`);
}

function utc(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, `${label} must be a UTC instant.`);
  assert.equal(new Date(value).toISOString(), value.replace("Z", ".000Z"), `${label} is not a valid UTC instant.`);
}

function safeRelative(value, label, allowParent = false) {
  nonEmpty(value, label);
  assert.equal(path.isAbsolute(value), false, `${label} must be relative.`);
  assert.equal(value.includes("\0"), false, `${label} contains a NUL byte.`);
  if (!allowParent) assert.equal(value.split(/[\\/]/).includes(".."), false, `${label} must not escape its root.`);
}

function regularFile(root, relativePath, label, allowParent = false) {
  safeRelative(relativePath, label, allowParent);
  const file = path.resolve(root, relativePath);
  const info = lstatSync(file);
  assert.equal(info.isFile(), true, `${label} must be a regular file.`);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symlink.`);
  return file;
}

function artifactFile(root, artifactRoot, relativePath, label) {
  safeRelative(relativePath, label);
  const rootPath = path.resolve(root, artifactRoot);
  const file = path.resolve(rootPath, relativePath);
  assert.equal(file === rootPath || file.startsWith(`${rootPath}${path.sep}`), true, `${label} must stay under artifactRoot.`);
  const info = lstatSync(file);
  assert.equal(info.isFile(), true, `${label} must be a regular file.`);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symlink.`);
  return file;
}

function hashBinding(root, value, label, expectedPath, expectedSha256) {
  object(value, label);
  exactKeys(value, ["path", "sha256"], label);
  exact(value.path, expectedPath, `${label}.path`);
  assert.match(value.sha256, SHA256, `${label}.sha256 must be a SHA-256.`);
  exact(value.sha256, expectedSha256, `${label}.sha256`);
  const file = regularFile(root, value.path, label);
  exact(sha256File(file), value.sha256, `${label} file SHA-256`);
  return file;
}

function bilingual(value, label) {
  object(value, label);
  exactKeys(value, ["en", "fr"], label);
  nonEmpty(value.en, `${label}.en`);
  nonEmpty(value.fr, `${label}.fr`);
}

function bilingualLists(value, label) {
  object(value, label);
  exactKeys(value, ["en", "fr"], label);
  for (const language of ["en", "fr"]) {
    assert.ok(Array.isArray(value[language]) && value[language].length > 0, `${label}.${language} must be a non-empty list.`);
    value[language].forEach((entry, index) => nonEmpty(entry, `${label}.${language}[${index}]`));
  }
}

function correctionRoutes(value, label) {
  object(value, label);
  exactKeys(value, ["internalEn", "internalFr", "publisherListing"], label);
  exact(value.internalEn, CORRECTION_ROUTES.internalEn, `${label}.internalEn`);
  exact(value.internalFr, CORRECTION_ROUTES.internalFr, `${label}.internalFr`);
  assert.match(value.publisherListing, /^https:\/\//, `${label}.publisherListing must be HTTPS.`);
}

function expectedScope(rowId) {
  const scope = QC_SCOPES.find(({ rowId: candidate }) => candidate === rowId);
  assert.ok(scope, `Unsupported Québec stand-copy scope: ${rowId}.`);
  return scope;
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function validateSourceRights(root, row, scope) {
  const rightsFile = hashBinding(root, row.evidence.sourceRights, `${row.id}.evidence.sourceRights`, scope.sourceRightsPath, scope.sourceRightsSha256);
  const document = readJson(rightsFile, `${row.id} source-rights evidence`);
  const expected = scope.expected;
  if (row.id === "qc-current-ecoforest") {
    const layer = document.layers?.find(({ sourceId }) => sourceId === "qc-current-ecoforest-coverage-footprint-v1");
    assert.ok(layer, "Current ecoforest source-rights evidence is missing.");
    exact(layer.licence, { id: "cc-by-4.0", url: LICENSE_URL }, `${row.id} licence evidence`);
    assert.match(layer.attribution, /Ministère des Ressources naturelles et des Forêts du Québec/i);
    assert.match(layer.attribution, /CC BY 4\.0/i);
    assert.ok(layer.inputEvidence?.some(({ checksumSha256 }) => checksumSha256 === expected.rawArchiveSha256), `${row.id} rights evidence is not bound to the raw archive.`);
  } else {
    exact(document.licence?.id, "cc-by-4.0", `${row.id} licence id`);
    exact(document.licence?.url, LICENSE_URL, `${row.id} licence URL`);
    assert.match(document.licence?.attribution ?? "", /Ministère des Ressources naturelles et des Forêts du Québec/i);
    assert.match(document.licence?.attribution ?? "", /CC BY 4\.0/i);
    exact(document.rawArchive?.sha256, expected.rawArchiveSha256, `${row.id} rights/raw archive binding`);
    exact(document.extractedGeoPackage?.sha256, expected.extractedGeoPackageSha256, `${row.id} rights/extracted binding`);
  }
  const rights = row.rights;
  exactKeys(rights, ["bulkRedistributionAllowed", "licenceId", "licenceUrl", "licenceVersion", "modificationNotice", "redistributionStatus", "requiredAttribution", "sourceAttribution"], `${row.id}.rights`);
  exact(rights.licenceId, "cc-by-4.0", `${row.id}.rights.licenceId`);
  exact(rights.licenceVersion, "4.0", `${row.id}.rights.licenceVersion`);
  exact(rights.licenceUrl, LICENSE_URL, `${row.id}.rights.licenceUrl`);
  exact(rights.requiredAttribution, expected.requiredAttribution, `${row.id}.rights.requiredAttribution`);
  exact(rights.sourceAttribution, expected.sourceAttribution, `${row.id}.rights.sourceAttribution`);
  exact(rights.redistributionStatus, "allowed-under-cc-by-4.0-with-required-attribution-and-modification-notice", `${row.id}.rights.redistributionStatus`);
  exact(rights.bulkRedistributionAllowed, true, `${row.id}.rights.bulkRedistributionAllowed`);
  bilingual(rights.modificationNotice, `${row.id}.rights.modificationNotice`);
  assert.match(rights.modificationNotice.en, /source|derived|output|unchanged|not altered/i);
  assert.match(rights.modificationNotice.fr, /source|sortie|dériv|inchangé|modif/i);
}

function validateSpecification(root, row, scope) {
  const specFile = hashBinding(root, row.evidence.specification, `${row.id}.evidence.specification`, scope.specPath, scope.expected.specSha256);
  const specification = readJson(specFile, `${row.id} specification`);
  exact(specification.schemaVersion, SPEC_SCHEMA, `${row.id} specification schema`);
  exact(specification.id, scope.specId, `${row.id} specification id`);
  exact(specification.status, "specified-not-approved-not-executed", `${row.id} specification status`);
  exact(specification.sourceBinding?.rawArchiveSha256, scope.expected.rawArchiveSha256, `${row.id} specification raw binding`);
  exact(specification.sourceBinding?.rawArchiveBytes, scope.expected.rawArchiveBytes, `${row.id} specification raw bytes`);
  exact(specification.sourceBinding?.extractedGeoPackageSha256, scope.expected.extractedGeoPackageSha256, `${row.id} specification extracted binding`);
  exact(specification.sourceBinding?.archiveMember, scope.expected.archiveMember, `${row.id} specification member`);
  exact(specification.input?.layer, scope.expected.layer, `${row.id} specification input layer`);
  exact(specification.input?.geometryType, scope.expected.geometryType, `${row.id} specification geometry type`);
  exact(specification.input?.crs, scope.expected.crs, `${row.id} specification CRS`);
  exact(specification.input?.featureCount, scope.expected.featureCount, `${row.id} specification feature count`);
  exact(specification.input?.publishedAttributes, scope.expected.fields, `${row.id} specification fields`);
  exact(specification.operation?.outputLayer, scope.expected.outputLayer, `${row.id} specification output layer`);
  exact(specification.operation?.outputCrs, scope.expected.crs, `${row.id} specification output CRS`);
  exact(specification.operation?.joins, "None. Do not join meta or other tables in this operation.", `${row.id} specification joins`);
  exact(specification.admission, { transformationApproved: false, ingestionApproved: false, releaseApproved: false, productionEligible: false }, `${row.id} specification admission boundary`);
  exact(specification.prohibitedClaims, scope.expected.prohibitedClaims, `${row.id} prohibited claims`);
  return specification;
}

function validateOwnerScopeApproval(root, row, scope) {
  const file = hashBinding(root, row.evidence.ownerScopeApproval, `${row.id}.evidence.ownerScopeApproval`, OWNER_SCOPE_APPROVAL_PATH, OWNER_SCOPE_APPROVAL_SHA256);
  const approval = readJson(file, `${row.id} owner scope approval`);
  exact(approval.schemaVersion, "witness-tree/phase1-transformation-scope-owner-approval/1", `${row.id} owner approval schema`);
  exact(approval.status, "owner-approved-transformation-scope-only", `${row.id} owner approval status`);
  const binding = approval.approvedScopes?.find(({ specId }) => specId === scope.specId);
  assert.ok(binding, `${row.id} owner scope approval is missing.`);
  exact(binding.specPath, scope.specPath, `${row.id} owner scope approval spec path`);
  exact(binding.specSha256, scope.expected.specSha256, `${row.id} owner scope approval spec SHA-256`);
  exact(binding.decision, "approve", `${row.id} owner scope approval decision`);
  exact(approval.decisionBoundary, {
    transformationScopeApproved: true,
    executionAuthorized: false,
    ingestionAuthorized: false,
    releaseAuthorized: false,
    productionAdmissionAuthorized: false,
    productionEligibilityGranted: false,
    externalMutationPerformed: false,
  }, `${row.id} owner scope approval boundary`);
  return approval;
}

function validatePacket(root, row, scope) {
  const file = hashBinding(root, row.evidence.packet, `${row.id}.evidence.packet`, PACKET_PATH, PACKET_SHA256);
  const packet = readJson(file, `${row.id} downstream packet`);
  exact(packet.schemaVersion, "witness-tree/phase1-downstream-admission-packet/2", `${row.id} packet schema`);
  exact(packet.status, "owner-transformation-scope-decision-preparation-read-only", `${row.id} packet status`);
  const binding = packet.specificationBindings?.find(({ specId }) => specId === scope.specId);
  assert.ok(binding, `${row.id} packet specification binding is missing.`);
  exact(binding.path, scope.specPath, `${row.id} packet specification path`);
  exact(binding.sha256, scope.expected.specSha256, `${row.id} packet specification SHA-256`);
  exact(binding.rows, [row.id], `${row.id} packet rows`);
  exact(packet.claims, {
    ownerDecisionCreated: false,
    transformed: false,
    ingested: false,
    released: false,
    productionAdmission: false,
    productionEligible: false,
    externalMutationPerformed: false,
  }, `${row.id} packet claims`);
  return packet;
}

function validateExecutionApproval(root, row, scope, runnerSha256) {
  const file = hashBinding(root, row.evidence.executionApproval, `${row.id}.evidence.executionApproval`, scope.executionApprovalPath, scope.expected.executionApprovalSha256);
  const approval = readJson(file, `${row.id} execution approval`);
  exact(approval.schemaVersion, EXECUTION_APPROVAL_SCHEMA, `${row.id} execution approval schema`);
  exact(approval.status, "owner-approved-execution-only", `${row.id} execution approval status`);
  exact(approval.decision, "approve", `${row.id} execution approval decision`);
  exact(approval.packet, REQUIRED_SOURCE_BINDINGS.packet, `${row.id} execution approval packet`);
  exact(approval.ownerScopeApproval, REQUIRED_SOURCE_BINDINGS.ownerScopeApproval, `${row.id} execution approval owner scope`);
  exact(approval.specification, { id: scope.specId, path: scope.specPath, sha256: scope.expected.specSha256 }, `${row.id} execution approval specification`);
  exact(approval.runner, { path: RUNNER_PATH, methodVersion: METHOD_VERSION, sha256: runnerSha256 }, `${row.id} execution approval runner`);
  exact(approval.approvedScopes, [{ specId: scope.specId, specSha256: scope.expected.specSha256, decision: "approve" }], `${row.id} execution approval scopes`);
  exact(approval.inputBinding, {
    rawArchiveSha256: scope.expected.rawArchiveSha256,
    rawArchiveBytes: scope.expected.rawArchiveBytes,
    extractedGeoPackageSha256: scope.expected.extractedGeoPackageSha256,
    extractedGeoPackageBytes: scope.expected.extractedGeoPackageBytes,
    layer: scope.expected.layer,
    geometryType: scope.expected.geometryType,
    crs: scope.expected.crs,
    featureCount: scope.expected.featureCount,
  }, `${row.id} execution approval input binding`);
  exact(approval.outputBinding, {
    artifactRelativePath: scope.expected.artifactRelativePath,
    sidecarRelativePath: scope.expected.sidecarRelativePath,
    layer: scope.expected.outputLayer,
  }, `${row.id} execution approval output binding`);
  exact(approval.decisionBoundary, {
    executionAuthorized: true,
    ingestionAuthorized: false,
    releaseAuthorized: false,
    productionAdmissionAuthorized: false,
    productionEligibilityGranted: false,
    externalMutationPerformed: false,
  }, `${row.id} execution approval boundary`);
  return { approval, file };
}

function validateSourceBinding(row, scope, sidecar) {
  exact(row.source, {
    rawArchiveSha256: scope.expected.rawArchiveSha256,
    rawArchiveBytes: scope.expected.rawArchiveBytes,
    archiveMember: scope.expected.archiveMember,
    archiveMemberSha256: scope.expected.extractedGeoPackageSha256,
    extractedGeoPackageSha256: scope.expected.extractedGeoPackageSha256,
    extractedGeoPackageBytes: scope.expected.extractedGeoPackageBytes,
  }, `${row.id} source binding`);
  exact(sidecar.source, {
    rawArchiveSha256: scope.expected.rawArchiveSha256,
    rawArchiveBytes: scope.expected.rawArchiveBytes,
    archiveMember: scope.expected.archiveMember,
    archiveMemberSha256: scope.expected.extractedGeoPackageSha256,
    extractedGeoPackageSha256: scope.expected.extractedGeoPackageSha256,
  }, `${row.id} sidecar source binding`);
}

function validateSidecar(sidecar, sidecarBytes, outputSha256, scope, row, executionApprovalSha256) {
  object(sidecar, `${row.id} sidecar`);
  exact(sidecar.schemaVersion, SIDECAR_SCHEMA, `${row.id} sidecar schema`);
  exact(sidecar.methodVersion, METHOD_VERSION, `${row.id} sidecar method`);
  exact(sidecar.scopeId, row.id, `${row.id} sidecar scope`);
  exact(sidecar.specification, { id: scope.specId, sha256: scope.expected.specSha256 }, `${row.id} sidecar specification`);
  exact(sidecar.packetSha256, PACKET_SHA256, `${row.id} sidecar packet`);
  exact(sidecar.ownerScopeApprovalSha256, OWNER_SCOPE_APPROVAL_SHA256, `${row.id} sidecar owner scope`);
  exact(sidecar.executionApprovalSha256, executionApprovalSha256, `${row.id} sidecar execution approval`);
  const expectedInput = {
    layer: scope.expected.layer,
    geometryColumn: "geom",
    geometryType: scope.expected.geometryType,
    crs: scope.expected.crsCode,
    featureCount: scope.expected.featureCount,
    fields: scope.expected.fields,
    qa: {
      feature_count: scope.expected.featureCount,
      distinct_fid_count: scope.expected.featureCount,
      missing_fid_count: 0,
      missing_geometry_count: 0,
      empty_geometry_count: 0,
      invalid_geometry_count: 0,
      blank_key_count: 0,
    },
  };
  exact(sidecar.input, expectedInput, `${row.id} sidecar input readback`);
  exact(sidecar.output?.layer, scope.expected.outputLayer, `${row.id} sidecar output layer`);
  exact(sidecar.output?.sha256, outputSha256, `${row.id} sidecar output SHA-256`);
  exact(sidecar.output?.schema, scope.expected.outputSchema, `${row.id} sidecar output schema`);
  exact(sidecar.output?.featureCount, scope.expected.featureCount, `${row.id} sidecar output feature count`);
  assert.match(sidecar.output?.sourceRowFingerprintSha256 ?? "", SHA256, `${row.id} source row fingerprint`);
  assert.match(sidecar.output?.outputRowFingerprintSha256 ?? "", SHA256, `${row.id} output row fingerprint`);
  exact(sidecar.output?.sourceRowFingerprintSha256, sidecar.output?.outputRowFingerprintSha256, `${row.id} lossless row fingerprint`);
  exact(sidecar.output?.geometryByteCopy, true, `${row.id} geometry byte-copy readback`);
  exact(sidecar.qa, {
    exactInputBindings: true,
    schemaCrsFeatureCountGeometryChecks: true,
    joins: false,
    reprojection: false,
    repair: false,
    simplify: false,
    snap: false,
    dissolve: false,
    semanticInference: false,
    losslessRowFingerprintMatch: true,
    deterministicRerunArtifactMatch: true,
  }, `${row.id} sidecar QA`);
  exact(sidecar.prohibitedClaims, scope.expected.prohibitedClaims, `${row.id} sidecar prohibited claims`);
  exact(sidecarBytes.toString("utf8"), canonicalJson(sidecar), `${row.id} sidecar canonical bytes`);
}

function unknownWithReason(value, label) {
  object(value, label);
  exactKeys(value, ["reason", "status"], label);
  exact(value.status, "unknown", `${label}.status`);
  nonEmpty(value.reason, `${label}.reason`);
  assert.match(value.reason, /unknown|not declare|declares no|not provide|not publish|not infer|inferred|recheck/i, `${label}.reason`);
}

function validateReadbackVerifier(root, row) {
  exactKeys(row.evidence.readbackVerifier, ["path", "sha256"], `${row.id}.evidence.readbackVerifier`);
  exact(row.evidence.readbackVerifier.path, READBACK_VERIFIER_PATH, `${row.id} readback verifier path`);
  const verifier = hashBinding(root, row.evidence.readbackVerifier, `${row.id}.evidence.readbackVerifier`, READBACK_VERIFIER_PATH, row.evidence.readbackVerifier.sha256);
  return { file: verifier, sha256: row.evidence.readbackVerifier.sha256 };
}

function validateReadbackEvidence(root, row, scope, verifierSha256) {
  const evidenceFile = hashBinding(root, row.evidence.readback, `${row.id}.evidence.readback`, scope.expected.readbackEvidencePath, row.evidence.readback.sha256);
  const evidence = readJson(evidenceFile, `${row.id} independent readback evidence`);
  exact(readFileSync(evidenceFile, "utf8"), canonicalJson(evidence), `${row.id} independent readback canonical bytes`);
  exactKeys(evidence, ["admissionClaim", "claims", "mode", "output", "productionAdmission", "productionEligible", "qa", "schemaVersion", "scopeId", "source", "specification", "status", "verifier"], `${row.id} independent readback evidence`);
  exact(evidence.schemaVersion, READBACK_EVIDENCE_SCHEMA, `${row.id} readback evidence schema`);
  exact(evidence.status, "complete-readback-verified", `${row.id} readback evidence status`);
  exact(evidence.mode, "post-publication-readback", `${row.id} readback evidence mode`);
  exact(evidence.scopeId, row.id, `${row.id} readback evidence scope`);
  exact(evidence.verifier, { path: READBACK_VERIFIER_PATH, sha256: verifierSha256, methodVersion: READBACK_VERIFIER_METHOD_VERSION }, `${row.id} readback verifier binding`);
  exact(evidence.specification, { id: scope.specId, path: scope.specPath, sha256: scope.expected.specSha256 }, `${row.id} readback specification binding`);
  exact(evidence.admissionClaim, false, `${row.id} readback admission claim`);
  exact(evidence.productionAdmission, false, `${row.id} readback production admission claim`);
  exact(evidence.productionEligible, false, `${row.id} readback production eligibility claim`);
  exact(evidence.claims, { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, `${row.id} readback claims`);
  exact(evidence.output.path, scope.expected.artifactRelativePath, `${row.id} readback output path`);
  exact(evidence.output.sidecarPath, scope.expected.sidecarRelativePath, `${row.id} readback sidecar path`);
  exact(evidence.output.layer, scope.expected.outputLayer, `${row.id} readback output layer`);
  exact(evidence.output.schema, scope.expected.outputSchema, `${row.id} readback output schema`);
  exact(evidence.output.crs, scope.expected.crs, `${row.id} readback output CRS`);
  exact(evidence.output.geometryType, scope.expected.geometryType, `${row.id} readback output geometry type`);
  exact(evidence.output.featureCount, scope.expected.featureCount, `${row.id} readback output feature count`);
  exact(evidence.output.sha256, row.artifacts.output.sha256, `${row.id} readback/output SHA-256`);
  exact(evidence.output.byteLength, row.artifacts.output.byteLength, `${row.id} readback/output byte length`);
  exact(evidence.output.sidecarSha256, row.artifacts.sidecar.sha256, `${row.id} readback/sidecar SHA-256`);
  exact(evidence.output.sidecarByteLength, row.artifacts.sidecar.byteLength, `${row.id} readback/sidecar byte length`);
  assert.match(evidence.output.sourceRowFingerprintSha256 ?? "", SHA256, `${row.id} readback source row fingerprint`);
  assert.match(evidence.output.outputRowFingerprintSha256 ?? "", SHA256, `${row.id} readback output row fingerprint`);
  exact(evidence.output.sourceRowFingerprintSha256, evidence.output.outputRowFingerprintSha256, `${row.id} readback lossless fingerprint`);
  exact(evidence.source.path, scope.expected.sourceRelativePath, `${row.id} readback source path`);
  exact(evidence.source.layer, scope.expected.layer, `${row.id} readback source layer`);
  exact(evidence.source.schema, ["fid", "geom", ...scope.expected.fields], `${row.id} readback source schema`);
  exact(evidence.source.crs, scope.expected.crs, `${row.id} readback source CRS`);
  exact(evidence.source.geometryType, scope.expected.geometryType, `${row.id} readback source geometry type`);
  exact(evidence.source.featureCount, scope.expected.featureCount, `${row.id} readback source feature count`);
  exact(evidence.source.sha256, scope.expected.extractedGeoPackageSha256, `${row.id} readback source SHA-256`);
  exact(evidence.qa.sourceOutputFeatureCountMatch, true, `${row.id} readback count match`);
  exact(evidence.qa.sourceOutputSchemaMatch, true, `${row.id} readback schema match`);
  exact(evidence.qa.sourceOutputCrsMatch, true, `${row.id} readback CRS match`);
  exact(evidence.qa.sourceOutputGeometryTypeMatch, true, `${row.id} readback geometry-type match`);
  exact(evidence.qa.sourceOutputRowFingerprintMatch, true, `${row.id} readback fingerprint match`);
  exact(evidence.qa.geometryValidity, true, `${row.id} readback geometry validity`);
  exact(evidence.qa.sidecarContract, true, `${row.id} readback sidecar contract`);
  exact(evidence.qa.outputAndSidecarHashes, true, `${row.id} readback output/sidecar hashes`);
  return { evidence, sha256: row.evidence.readback.sha256 };
}

function validateLedgerFields(row, scope, readback) {
  const fields = row.ledgerFields;
  object(fields, `${row.id}.ledgerFields`);
  exactKeys(fields, LEDGER_FIELD_KEYS, `${row.id}.ledgerFields`);
  const expected = scope.expected.ledger;
  exact(fields.publisher, expected.publisher, `${row.id}.ledgerFields.publisher`);
  exact(fields.datasetTitle, expected.datasetTitle, `${row.id}.ledgerFields.datasetTitle`);
  exact(fields.sourceUrl, expected.sourceUrl, `${row.id}.ledgerFields.sourceUrl`);
  exact(fields.retrievalDate, expected.retrievalDate, `${row.id}.ledgerFields.retrievalDate`);
  exact(fields.archiveVersion, expected.archiveVersion, `${row.id}.ledgerFields.archiveVersion`);
  exact(fields.coverage, expected.coverage, `${row.id}.ledgerFields.coverage`);
  exact(fields.updateCadence, expected.updateCadence, `${row.id}.ledgerFields.updateCadence`);
  exact(fields.datasetOriginalName, expected.datasetOriginalName, `${row.id}.ledgerFields.datasetOriginalName`);
  exact(fields.schema, expected.schema, `${row.id}.ledgerFields.schema`);
  exact(fields.checksum, [scope.expected.rawArchiveSha256], `${row.id}.ledgerFields.checksum`);
  unknownWithReason(fields.editionEffectiveDate, `${row.id}.ledgerFields.editionEffectiveDate`);
  unknownWithReason(fields.nextExpectedRefresh, `${row.id}.ledgerFields.nextExpectedRefresh`);
  exact(fields.editionEffectiveDate, expected.editionEffectiveDate, `${row.id}.ledgerFields.editionEffectiveDate`);
  exact(fields.nextExpectedRefresh, expected.nextExpectedRefresh, `${row.id}.ledgerFields.nextExpectedRefresh`);
  exact(fields.requiredAttribution, row.rights.requiredAttribution, `${row.id}.ledgerFields.requiredAttribution`);
  exact(fields.modificationNotice, row.rights.modificationNotice, `${row.id}.ledgerFields.modificationNotice`);
  exact(fields.redistributionStatus, row.rights.redistributionStatus, `${row.id}.ledgerFields.redistributionStatus`);
  exact(fields.licence, row.rights.licenceId, `${row.id}.ledgerFields.licence`);
  exact(fields.licenceUrl, row.rights.licenceUrl, `${row.id}.ledgerFields.licenceUrl`);
  exact(fields.bulkRedistributionAllowed, true, `${row.id}.ledgerFields.bulkRedistributionAllowed`);
  exact(fields.admissionState, true, `${row.id}.ledgerFields.admissionState`);
  exact(fields.plainLanguageExplanation, expected.plainLanguageExplanation, `${row.id}.ledgerFields.plainLanguageExplanation`);
  exactKeys(fields.correctionContactRoute, ["internalEn", "internalFr", "publisherListing"], `${row.id}.ledgerFields.correctionContactRoute`);
  exact(fields.correctionContactRoute.internalEn, CORRECTION_ROUTES.internalEn, `${row.id}.ledgerFields.correctionContactRoute.internalEn`);
  exact(fields.correctionContactRoute.internalFr, CORRECTION_ROUTES.internalFr, `${row.id}.ledgerFields.correctionContactRoute.internalFr`);
  exact(fields.correctionContactRoute.publisherListing, row.correctionContactRoute.publisherListing, `${row.id}.ledgerFields.correctionContactRoute.publisherListing`);
  exact(fields.transformations, {
    methodVersion: METHOD_VERSION,
    outputSha256: readback.evidence.output.sha256,
    summary: "Deterministic lossless one-layer stand-copy with source-coded attributes and lineage fields preserved; no join, reprojection, repair, simplify, snap, dissolve, or semantic inference.",
  }, `${row.id}.ledgerFields.transformations`);
}

function validateArtifacts(root, record, row, scope, executionApprovalSha256) {
  exactKeys(row.artifacts, ["output", "sidecar"], `${row.id}.artifacts`);
  exactKeys(row.artifacts.output, ["byteLength", "featureCount", "layer", "path", "sha256"], `${row.id}.artifacts.output`);
  exactKeys(row.artifacts.sidecar, ["byteLength", "path", "sha256"], `${row.id}.artifacts.sidecar`);
  exact(row.artifacts.output.path, scope.expected.artifactRelativePath, `${row.id} output path`);
  exact(row.artifacts.sidecar.path, scope.expected.sidecarRelativePath, `${row.id} sidecar path`);
  exact(row.artifacts.sidecar.path, `${row.artifacts.output.path}.json`, `${row.id} sidecar/output path relation`);
  exact(row.artifacts.output.layer, scope.expected.outputLayer, `${row.id} output layer`);
  exact(row.artifacts.output.featureCount, scope.expected.featureCount, `${row.id} output feature count`);
  assert.match(row.artifacts.output.sha256, SHA256, `${row.id} output SHA-256`);
  assert.match(row.artifacts.sidecar.sha256, SHA256, `${row.id} sidecar SHA-256`);
  assert.ok(Number.isInteger(row.artifacts.output.byteLength) && row.artifacts.output.byteLength > 0, `${row.id} output byte length`);
  assert.ok(Number.isInteger(row.artifacts.sidecar.byteLength) && row.artifacts.sidecar.byteLength > 0, `${row.id} sidecar byte length`);
  const outputFile = artifactFile(root, record.artifactRoot, row.artifacts.output.path, `${row.id} output`);
  const sidecarFile = artifactFile(root, record.artifactRoot, row.artifacts.sidecar.path, `${row.id} sidecar`);
  exact(statSync(outputFile).size, row.artifacts.output.byteLength, `${row.id} output bytes`);
  exact(statSync(sidecarFile).size, row.artifacts.sidecar.byteLength, `${row.id} sidecar bytes`);
  exact(sha256File(outputFile), row.artifacts.output.sha256, `${row.id} output bytes SHA-256`);
  exact(sha256File(sidecarFile), row.artifacts.sidecar.sha256, `${row.id} sidecar bytes SHA-256`);
  const sidecarBytes = readFileSync(sidecarFile);
  const sidecar = readJson(sidecarFile, `${row.id} sidecar`);
  validateSourceBinding(row, scope, sidecar);
  validateSidecar(sidecar, sidecarBytes, row.artifacts.output.sha256, scope, row, executionApprovalSha256);
  return { outputFile, sidecarFile, sidecar };
}

function validateRowMetadata(row, scope) {
  exact(row.sourceRights, { licenceId: "cc-by-4.0", licenceVersion: "4.0", licenceUrl: LICENSE_URL }, `${row.id} source rights summary`);
  bilingual(row.modificationNotice, `${row.id}.modificationNotice`);
  assert.match(row.modificationNotice.en, /source|output|derived|unchanged|not altered/i);
  assert.match(row.modificationNotice.fr, /source|sortie|dériv|inchangé|modif/i);
  bilingual(row.plainLanguageExplanation, `${row.id}.plainLanguageExplanation`);
  correctionRoutes(row.correctionContactRoute, `${row.id}.correctionContactRoute`);
  bilingualLists(row.limits, `${row.id}.limits`);
  exact(row.limits, scope.expected.limits, `${row.id}.limits`);
  exact(row.decisions, DECISIONS, `${row.id}.decisions`);
}

function validateRecordShape(record, expectedArtifactRoot) {
  object(record, "production-admission record");
  exactKeys(record, ["artifactRoot", "correctionContactRoute", "decidedAt", "decisionId", "decisions", "limits", "modificationNotice", "ownerAuthorization", "requiredAttribution", "rows", "schemaVersion", "status"], "production-admission record");
  exact(record.schemaVersion, "witness-tree/phase1-qc-stand-copy-production-admission/1", "production-admission schema");
  exact(record.status, "owner-approved-admitted-and-release-approved", "production-admission status");
  exact(record.decisionId, "phase1-qc-stand-copy-production-admission-v1", "production-admission decisionId");
  nonEmpty(record.decidedAt, "decidedAt");
  utc(record.decidedAt, "decidedAt");
  safeRelative(record.artifactRoot, "artifactRoot", true);
  if (expectedArtifactRoot !== undefined) exact(record.artifactRoot, expectedArtifactRoot, "artifactRoot");
  exact(record.ownerAuthorization, OWNER_AUTHORIZATION, "owner authorization");
  exact(record.decisions, DECISIONS, "owner decisions");
  exact(record.requiredAttribution, { en: CURRENT_ATTRIBUTION_EN, fr: CURRENT_ATTRIBUTION_FR }, "required attribution");
  bilingual(record.modificationNotice, "modificationNotice");
  assert.match(record.modificationNotice.en, /source|output|derived|unchanged|not altered/i);
  assert.match(record.modificationNotice.fr, /source|sortie|dériv|inchangé|modif/i);
  bilingualLists(record.limits, "limits");
  exact(record.limits, COMMON_LIMITS, "common limits");
  correctionRoutes(record.correctionContactRoute, "correctionContactRoute");
  assert.ok(Array.isArray(record.rows), "rows must be an array.");
  exact(record.rows.map(({ id }) => id), QC_SCOPES.map(({ rowId }) => rowId), "rows");
}

export function validateQcStandCopyProductionAdmissionRecord(record, root = ROOT, expectedArtifactRoot = CANONICAL_ARTIFACT_ROOT) {
  validateRecordShape(record, expectedArtifactRoot);
  const runnerFile = regularFile(root, RUNNER_PATH, "runner");
  const runnerSha256 = sha256File(runnerFile);
  for (const [index, row] of record.rows.entries()) {
    const scope = expectedScope(row.id);
    exactKeys(row, ["artifacts", "correctionContactRoute", "decisions", "evidence", "id", "ledgerFields", "limits", "modificationNotice", "plainLanguageExplanation", "rights", "source", "sourceRights", "specId"], `${row.id} row`);
    exact(row.specId, scope.specId, `${row.id} specification mapping`);
    exact(index, QC_SCOPES.findIndex(({ rowId }) => rowId === row.id), `${row.id} row order`);
    exactKeys(row.evidence, ["executionApproval", "ownerScopeApproval", "packet", "readback", "readbackVerifier", "sourceRights", "specification"], `${row.id}.evidence`);
    object(row.rights, `${row.id}.rights`);
    object(row.source, `${row.id}.source`);
    const specification = validateSpecification(root, row, scope);
    validatePacket(root, row, scope);
    validateOwnerScopeApproval(root, row, scope);
    const { file: executionApprovalFile } = validateExecutionApproval(root, row, scope, runnerSha256);
    const executionApprovalSha256 = sha256File(executionApprovalFile);
    exact(executionApprovalSha256, scope.expected.executionApprovalSha256, `${row.id} execution approval SHA-256`);
    validateSourceRights(root, row, scope);
    validateArtifacts(root, record, row, scope, executionApprovalSha256);
    const verifier = validateReadbackVerifier(root, row);
    const readback = validateReadbackEvidence(root, row, scope, verifier.sha256);
    exact(readback.evidence.output.sha256, row.artifacts.output.sha256, `${row.id} readback/artifact output binding`);
    validateLedgerFields(row, scope, readback);
    validateRowMetadata(row, scope);
    exact(row.sourceRights, { licenceId: "cc-by-4.0", licenceVersion: "4.0", licenceUrl: LICENSE_URL }, `${row.id} source rights summary`);
    exact(specification.prohibitedClaims, scope.expected.prohibitedClaims, `${row.id} spec/sidecar claim boundary`);
  }
  return record;
}

// Three-valued. Only the filesystem reporting nothing at the path is absence.
// A permission error, an I/O error, or a symlink loop means we could not tell,
// and "could not tell" must never be recorded as "not there".
function present(file) {
  try {
    const info = lstatSync(file);
    return info.isFile() && !info.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    return null;
  }
}

function bothPresent(a, b) {
  if (a === null || b === null) return null;
  return a && b;
}

export function readbackPresence(root = ROOT, artifactRoot = CANONICAL_ARTIFACT_ROOT) {
  safeRelative(artifactRoot, "artifactRoot", true);
  const scopes = QC_SCOPES.map((scope) => {
    const outputPath = path.resolve(root, artifactRoot, scope.expected.artifactRelativePath);
    const sidecarPath = path.resolve(root, artifactRoot, scope.expected.sidecarRelativePath);
    const outputPresent = present(outputPath);
    const sidecarPresent = present(sidecarPath);
    return {
      rowId: scope.rowId,
      specId: scope.specId,
      outputPath: path.join(artifactRoot, scope.expected.artifactRelativePath),
      sidecarPath: path.join(artifactRoot, scope.expected.sidecarRelativePath),
      outputPresent,
      sidecarPresent,
      // Named for what it measures. This is an lstat on two paths: it says
      // files exist, not that a readback was performed or that the bytes
      // match anything. Calling it readbackPresent invited the opposite
      // reading, which is the whole hazard of an existence-only mode.
      artifactFilesPresent: bothPresent(outputPresent, sidecarPresent),
    };
  });
  return {
    schemaVersion: "witness-tree/phase1-qc-stand-copy-production-admission-readiness/1",
    mode: "artifact-file-existence-only",
    verifies: "Existence of the output and sidecar paths. No byte, checksum, sidecar field, or readback record is read in this mode; pass --record to validate an admission record.",
    admissionClaim: false,
    productionAdmission: false,
    productionEligible: false,
    scopes,
    presentCount: scopes.filter(({ artifactFilesPresent }) => artifactFilesPresent === true).length,
    missingCount: scopes.filter(({ artifactFilesPresent }) => artifactFilesPresent === false).length,
    undeterminedCount: scopes.filter(({ artifactFilesPresent }) => artifactFilesPresent === null).length,
  };
}

function readRecord(root, recordPath) {
  safeRelative(recordPath, "record path");
  return JSON.parse(readFileSync(path.join(root, recordPath), "utf8"));
}

export function check(root = ROOT, recordPath = undefined) {
  if (!recordPath) return readbackPresence(root);
  const record = readRecord(root, recordPath);
  validateQcStandCopyProductionAdmissionRecord(record, root);
  return { schemaVersion: record.schemaVersion, mode: "record-validation-only", recordPath, valid: true, admissionDecisionMade: false };
}

function cli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = rootIndex < 0 ? ROOT : path.resolve(args[rootIndex + 1] ?? "");
  if (rootIndex >= 0 && !args[rootIndex + 1]) throw new Error("--root needs a directory.");
  const recordIndex = args.indexOf("--record");
  const recordPath = recordIndex < 0 ? undefined : args[recordIndex + 1];
  if (recordIndex >= 0 && !recordPath) throw new Error("--record needs a repository-relative JSON path.");
  console.log(JSON.stringify(check(root, recordPath), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(`Stopped: ${error.message}`); process.exitCode = 1; }
}
