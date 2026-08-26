import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase1TransformationScopeOwnerApproval } from "./check-phase1-transformation-scope-owner-approval.mjs";
import { buildGdalTranslateArgs } from "./run-phase1-ntems-transform.mjs";
import { validateAuthorization as validateTransformAuthorization, validateEvidenceRecord } from "./verify-phase1-ntems-transform.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPECIFICATION_PATH = "data/phase1-production-transformation-specifications-v1.json";
const RIGHTS_VERIFICATION_PATH = "data/phase1-ntems-rights-verification-2026-08-26.json";
const SCOPE_APPROVAL_PATH = "data/phase1-transformation-scope-owner-approval-2026-08-25.json";
const READBACK_VERIFIER_PATH = "scripts/verify-phase1-ntems-transform.mjs";
const TRANSFORM_RUNNER_PATH = "scripts/run-phase1-ntems-transform.mjs";
const CANONICAL_ARTIFACT_ROOT = "../../Witness_Tree-data/derived/phase1";
const OGL_URL = "https://open.canada.ca/en/open-government-licence-canada";
const OGL_EN = "Contains information licensed under the Open Government Licence – Canada.";
const OGL_FR = "Contient des informations octroyées sous licence en vertu de la Licence du gouvernement ouvert – Canada.";
const SHA256 = /^[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export const EXPLANATIONS = Object.freeze({
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

export const NTEMS_SCOPES = Object.freeze([
  {
    rowId: "ntems-annual-land-cover",
    specId: "ntems-annual-land-cover-v1",
    authorizationPath: "data/phase1-ntems-annual-land-cover-execution-authorization.json",
    readbackPath: "data/ntems-annual-land-cover-v1-readback-evidence-2026-08-26.json",
    profilePaths: ["data/vlce2-remote-promotion-evidence.json", "data/raster-grid.json", "data/raster-defects.json"],
    rightsBindings: [
      ["data/vlce2-remote-promotion-evidence.json", "/source/licence/id", "ogl-canada"],
      ["data/vlce2-remote-promotion-evidence.json", "/source/licence/url", OGL_URL],
      ["data/vlce2-remote-promotion-evidence.json", "/source/licence/attribution/en", OGL_EN],
      ["data/vlce2-remote-promotion-evidence.json", "/source/licence/attribution/fr", OGL_FR],
      [RIGHTS_VERIFICATION_PATH, "/licence/version", "2.0"],
      [RIGHTS_VERIFICATION_PATH, "/datasets/0/recordId", "2785c103-9c2d-429b-9f3d-89f5cd9ea94d"],
      [RIGHTS_VERIFICATION_PATH, "/datasets/0/licenceId", "ogl-canada"],
    ],
  },
  {
    rowId: "ntems-forest-harvest",
    specId: "ntems-forest-harvest-v1",
    authorizationPath: "data/phase1-ntems-forest-harvest-execution-authorization.json",
    readbackPath: "data/ntems-forest-harvest-v1-readback-evidence-2026-08-26.json",
    profilePaths: ["data/nrcan-harvest-profile.json", "data/nrcan-harvest-remote-archive-evidence.json"],
    rightsBindings: [
      ["data/staged-acquisitions.json", "/entries/10/licenceId", "ogl-canada"],
      ["data/staged-acquisitions.json", "/entries/10/licenceVersion", "2.0"],
      ["data/staged-acquisitions.json", "/entries/10/licenceUrl", OGL_URL],
      ["data/staged-acquisitions.json", "/entries/10/attribution", "Contains information licensed under the Open Government Licence – Canada. When using this data, please cite: Hermosilla, T., M.A. Wulder, J.C. White, N.C. Coops, G.W. Hobart, L.B. Campbell, 2016. Mass data processing of time series Landsat imagery: pixels to data products for forest monitoring. International Journal of Digital Earth 9(11), 1035–1054. https://doi.org/10.1080/17538947.2016.1187673."],
      [RIGHTS_VERIFICATION_PATH, "/datasets/1/recordId", "87e35bf0-b734-4c4e-9eb6-e08ffe80e3fe"],
      [RIGHTS_VERIFICATION_PATH, "/datasets/1/licenceId", "ogl-canada"],
    ],
  },
  {
    rowId: "ntems-canopy-cover",
    specId: "ntems-canopy-cover-v1",
    authorizationPath: "data/phase1-ntems-canopy-cover-execution-authorization.json",
    readbackPath: "data/ntems-canopy-cover-v1-readback-evidence-2026-08-26.json",
    profilePaths: ["data/nrcan-canopy-cover-profile.json", "data/immutable-promotions.json"],
    rightsBindings: [
      ["data/staged-acquisitions.json", "/entries/9/licenceId", "ogl-canada"],
      ["data/staged-acquisitions.json", "/entries/9/licenceVersion", "2.0"],
      ["data/staged-acquisitions.json", "/entries/9/licenceUrl", OGL_URL],
      ["data/staged-acquisitions.json", "/entries/9/attribution", "Contains information licensed under the Open Government Licence – Canada. When using this data, please cite: Matasci, G., Hermosilla, T., Wulder, M.A., White, J.C., Coops, N.C., Hobart, G.W., Bolton, D.K., Tompalski, P., Bater, C.W., 2018. Three decades of forest structural dynamics over Canada's forested ecosystems using Landsat time-series and lidar plots. Remote Sensing of Environment, 216, 697–714. https://doi.org/10.1016/j.rse.2018.07.024."],
      [RIGHTS_VERIFICATION_PATH, "/datasets/2/recordId", "5b905ab8-44dc-42b4-ad5b-3b1dde8423ab"],
      [RIGHTS_VERIFICATION_PATH, "/datasets/2/licenceId", "ogl-canada"],
    ],
  },
  {
    rowId: "ntems-canopy-height",
    specId: "ntems-canopy-height-v1",
    authorizationPath: "data/phase1-ntems-canopy-height-execution-authorization.json",
    readbackPath: "data/ntems-canopy-height-v1-readback-evidence-2026-08-26.json",
    profilePaths: ["data/nrcan-canopy-height-profile.json", "data/nrcan-canopy-height-remote-archive-evidence.json"],
    rightsBindings: [
      ["data/staged-acquisitions.json", "/entries/2/licenceId", "ogl-canada"],
      ["data/staged-acquisitions.json", "/entries/2/licenceVersion", "2.0"],
      ["data/staged-acquisitions.json", "/entries/2/licenceUrl", OGL_URL],
      ["data/staged-acquisitions.json", "/entries/2/attribution", "Contains information licensed under the Open Government Licence – Canada. When using this data, please cite: Matasci et al. (2018), https://doi.org/10.1016/j.rse.2018.07.024."],
      [RIGHTS_VERIFICATION_PATH, "/datasets/3/recordId", "016d2624-30b4-45f3-87d7-30b06c6a30ca"],
      [RIGHTS_VERIFICATION_PATH, "/datasets/3/licenceId", "ogl-canada"],
    ],
  },
]);

const RECORD_KEYS = [
  "artifactRoot",
  "decidedAt",
  "decisionId",
  "limits",
  "modificationNotice",
  "ownerAuthorization",
  "requiredAttribution",
  "rows",
  "schemaVersion",
  "status",
  "decisions",
];
const ROW_KEYS = ["artifacts", "evidence", "id", "ledgerFields", "rights", "specId"];
const EVIDENCE_KEYS = ["executionAuthorization", "readback", "readbackVerifier", "scopeApproval", "sourceProfiles", "sourceRights", "specification"];
const BINDING_KEYS = ["path", "sha256"];
const POINTER_BINDING_KEYS = ["expectedValue", "jsonPointer", "path", "sha256"];
const RIGHTS_KEYS = ["bulkRedistributionAllowed", "licenceId", "licenceUrl", "licenceVersion", "modificationNotice", "redistributionStatus", "requiredAttribution", "sourceAttribution"];
const LEDGER_FIELD_KEYS = [
  "archiveVersion",
  "bulkRedistributionAllowed",
  "checksum",
  "correctionContactRoute",
  "coverage",
  "datasetOriginalName",
  "datasetTitle",
  "editionEffectiveDate",
  "licence",
  "licenceUrl",
  "modificationNotice",
  "nextExpectedRefresh",
  "plainLanguageExplanation",
  "publisher",
  "redistributionStatus",
  "retrievalDate",
  "schema",
  "sourceUrl",
  "transformations",
  "requiredAttribution",
  "admissionState",
  "updateCadence",
];

const readJson = (root, relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

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

function safeRelative(value, label, allowParent = false) {
  nonEmpty(value, label);
  assert.equal(path.isAbsolute(value), false, `${label} must be relative.`);
  assert.equal(value.includes("\0"), false, `${label} contains a NUL byte.`);
  if (!allowParent) assert.equal(value.split(/[\\/]/).includes(".."), false, `${label} must not escape the repository.`);
}

function regularFile(root, relativePath, label, allowParent = false) {
  safeRelative(relativePath, label, allowParent);
  const resolvedRoot = realpathSync(root);
  const file = path.resolve(resolvedRoot, relativePath);
  if (!allowParent) assert.ok(file.startsWith(`${resolvedRoot}${path.sep}`), `${label} escaped the repository root.`);
  const info = lstatSync(file);
  assert.equal(info.isFile(), true, `${label} must be a regular file.`);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symlink.`);
  if (!allowParent) assert.equal(realpathSync(file), file, `${label} must not traverse a symlink.`);
  return file;
}

function binding(root, value, label) {
  exactKeys(value, BINDING_KEYS, label);
  const file = regularFile(root, value.path, `${label}.path`);
  assert.match(value.sha256, SHA256, `${label}.sha256 must be a SHA-256.`);
  assert.equal(sha256File(file), value.sha256, `${label} SHA-256 drifted.`);
  return file;
}

function pointerValue(document, pointer, label) {
  assert.equal(typeof pointer, "string", `${label} JSON pointer is required.`);
  assert.ok(pointer === "" || pointer.startsWith("/"), `${label} must use an RFC 6901 JSON pointer.`);
  let value = document;
  for (const rawToken of pointer === "" ? [] : pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(value !== null && typeof value === "object" && Object.hasOwn(value, token), `${label} points to no value.`);
    value = value[token];
  }
  return value;
}

function pointerBinding(root, value, label) {
  exactKeys(value, POINTER_BINDING_KEYS, label);
  const file = binding(root, { path: value.path, sha256: value.sha256 }, label);
  const document = JSON.parse(readFileSync(file, "utf8"));
  exact(pointerValue(document, value.jsonPointer, label), value.expectedValue, `${label} value`);
  return file;
}

function utc(value, label) {
  assert.match(value, UTC, `${label} must be a fixed UTC instant.`);
  assert.equal(new Date(value).toISOString(), value.replace("Z", ".000Z"), `${label} is not a valid UTC instant.`);
}

function nonEmptyBilingual(value, label) {
  object(value, label);
  exactKeys(value, ["en", "fr"], label);
  nonEmpty(value.en, `${label}.en`);
  nonEmpty(value.fr, `${label}.fr`);
}

function unknownWithReason(value, label) {
  object(value, label);
  exactKeys(value, ["reason", "status"], label);
  assert.equal(value.status, "unknown", `${label}.status must be unknown.`);
  nonEmpty(value.reason, `${label}.reason`);
  assert.match(value.reason, /unknown|not declared|not publish|no fixed|not infer|cannot infer|unavailable/i, `${label}.reason must explain the unknown.`);
}

function expectedScope(rowId) {
  const scope = NTEMS_SCOPES.find(({ rowId: candidate }) => candidate === rowId);
  assert.ok(scope, `Unsupported NTEMS row: ${rowId}.`);
  return scope;
}

function validateRecordShape(record, expectedArtifactRoot) {
  object(record, "production-admission record");
  exactKeys(record, RECORD_KEYS, "production-admission record");
  assert.equal(record.schemaVersion, "witness-tree/phase1-ntems-production-admission/1");
  assert.equal(record.status, "owner-approved-admitted-and-release-approved");
  assert.equal(record.decisionId, "phase1-ntems-four-scope-production-admission-v1");
  utc(record.decidedAt, "decidedAt");
  safeRelative(record.artifactRoot, "artifactRoot", true);
  exact(record.artifactRoot, expectedArtifactRoot, "artifactRoot");
  exact(record.ownerAuthorization, OWNER_AUTHORIZATION, "owner authorization");
  exact(record.decisions, DECISIONS, "decisions");
  nonEmptyBilingual(record.requiredAttribution, "requiredAttribution");
  exact(record.requiredAttribution, { en: OGL_EN, fr: OGL_FR }, "requiredAttribution");
  nonEmptyBilingual(record.modificationNotice, "modificationNotice");
  assert.match(record.modificationNotice.en, /Witness Tree|derived|output|transform/i);
  assert.match(record.modificationNotice.fr, /Witness Tree|dériv|sortie|transform/i);
  assert.ok(Array.isArray(record.limits) && record.limits.length > 0, "limits must explain the bounded claims.");
  record.limits.forEach((limit, index) => nonEmpty(limit, `limits[${index}]`));
  assert.ok(Array.isArray(record.rows), "rows must be an array.");
  exact(record.rows.map(({ id }) => id), NTEMS_SCOPES.map(({ rowId }) => rowId), "rows");
  return record;
}

function validateAuthorization(root, row, scope, spec) {
  const authPath = binding(root, row.evidence.executionAuthorization, `${row.id}.evidence.executionAuthorization`);
  assert.equal(row.evidence.executionAuthorization.path, scope.authorizationPath, `${row.id} authorization path is not canonical.`);
  const auth = JSON.parse(readFileSync(authPath, "utf8"));
  validateTransformAuthorization(auth, root, [row.specId]);
  exact(auth.schemaVersion, "witness-tree/phase1-ntems-execution-authorization/1", `${row.id} authorization schema`);
  exact(auth.status, "approved-owner-local-execution", `${row.id} authorization status`);
  exact(auth.decisionId, "phase1-ntems-raster-execution-v1", `${row.id} authorization decisionId`);
  exact(auth.ownerDecision, {
    decision: "approve",
    ownerName: OWNER_AUTHORIZATION.ownerName,
    statement: "You can execute them when complete.",
    scope: `This record selects ${row.specId} from the four NTEMS raster scopes within the seven approved Phase 1 transformation scopes.`,
  }, `${row.id} authorization owner decision`);
  utc(auth.createdAt, `${row.id} authorization.createdAt`);
  exact(auth.boundary, {
    localOnly: true,
    externalMutation: false,
    ingestion: false,
    release: false,
    productionAdmission: false,
    productionEligible: false,
    overwriteExisting: false,
  }, `${row.id} authorization boundary`);
  exactKeys(auth.runner, ["path", "sha256"], `${row.id} authorization runner`);
  exact(auth.runner.path, TRANSFORM_RUNNER_PATH, `${row.id} authorization runner path`);
  binding(root, auth.runner, `${row.id} authorization runner`);
  assert.ok(Array.isArray(auth.specifications) && auth.specifications.length === 1, `${row.id} authorization specification count`);
  exact(auth.specifications[0], {
    id: row.specId,
    path: SPECIFICATION_PATH,
    sha256: row.evidence.specification.sha256,
  }, `${row.id} authorization specification binding`);
  assert.ok(Array.isArray(auth.inputs) && auth.inputs.length > 0, `${row.id} authorization inputs`);
  exact(spec.sourceLedgerRows, [row.id], `${row.id} source ledger row mapping`);
  return auth;
}

function validateSharedEvidence(root, row) {
  exact(row.evidence.scopeApproval.path, SCOPE_APPROVAL_PATH, `${row.id} scope approval path`);
  const approvalFile = binding(root, row.evidence.scopeApproval, `${row.id}.evidence.scopeApproval`);
  const approval = JSON.parse(readFileSync(approvalFile, "utf8"));
  validatePhase1TransformationScopeOwnerApproval(approval, root);
  const approvedScope = approval.approvedScopes.find(({ specId }) => specId === row.specId);
  assert.ok(approvedScope, `${row.id} is missing from the validated owner scope approval.`);
  exact(approvedScope.rows, [row.id], `${row.id} owner-approved ledger rows`);
  exact(approvedScope.specPath, row.evidence.specification.path, `${row.id} owner-approved specification path`);
  exact(approvedScope.specSha256, row.evidence.specification.sha256, `${row.id} owner-approved specification SHA-256`);
  exact(approvedScope.decision, "approve", `${row.id} owner scope decision`);
  exact(row.evidence.readbackVerifier.path, READBACK_VERIFIER_PATH, `${row.id} readback verifier path`);
  binding(root, row.evidence.readbackVerifier, `${row.id}.evidence.readbackVerifier`);
}

function validateSpecification(root, row, scope) {
  const specFile = binding(root, row.evidence.specification, `${row.id}.evidence.specification`);
  assert.equal(row.evidence.specification.path, SPECIFICATION_PATH, `${row.id} specification path is not canonical.`);
  const specRecord = JSON.parse(readFileSync(specFile, "utf8"));
  exact(specRecord.schemaVersion, "witness-tree/phase1-production-transformation-specifications/1", "specification schema");
  const specification = specRecord.specifications?.find(({ id }) => id === row.specId);
  assert.ok(specification, `Missing specification ${row.specId}.`);
  exact(specification.sourceLedgerRows, [row.id], `${row.id} specification row mapping`);
  assert.equal(specification.output?.checksumSha256, null, `${row.id} specification must be the unexecuted contract.`);
  exact(specification.inputBindings.map(({ path: value }) => value), scope.profilePaths, `${row.id} specification profile paths`);
  exact(row.evidence.sourceProfiles.map(({ path: value }) => value), scope.profilePaths, `${row.id} source profile paths`);
  for (const [index, profile] of row.evidence.sourceProfiles.entries()) {
    binding(root, profile, `${row.id}.evidence.sourceProfiles`);
    exact(profile.sha256, specification.inputBindings[index].sha256, `${row.id} source profile SHA-256/specification ${index}`);
  }
  return { specRecord, specification };
}

function validateSourceRights(root, row, scope) {
  assert.ok(Array.isArray(row.evidence.sourceRights), `${row.id}.evidence.sourceRights must be an array.`);
  exact(row.evidence.sourceRights.map(({ path: value, jsonPointer }) => [value, jsonPointer]), scope.rightsBindings.map(([file, pointer]) => [file, pointer]), `${row.id} source rights pointers`);
  for (const [index, right] of row.evidence.sourceRights.entries()) {
    const expected = scope.rightsBindings[index];
    pointerBinding(root, right, `${row.id}.evidence.sourceRights[${index}]`);
    exact(right.expectedValue, expected[2], `${row.id} source rights value ${index}`);
  }
  const rightsRecord = readJson(root, RIGHTS_VERIFICATION_PATH);
  exact(rightsRecord.schemaVersion, "witness-tree/phase1-ntems-rights-verification/1", "NTEMS rights schema");
  exact(rightsRecord.status, "read-only-official-rights-verified", "NTEMS rights status");
  utc(rightsRecord.verifiedAt, "NTEMS rights verifiedAt");
  exact(rightsRecord.licence.id, "ogl-canada", "NTEMS rights licence id");
  exact(rightsRecord.licence.version, "2.0", "NTEMS rights licence version");
  exact(rightsRecord.licence.url, OGL_URL, "NTEMS rights licence URL");
  assert.ok(rightsRecord.licence.permissions.includes("distribute"), "NTEMS rights must include distribution permission.");
  assert.ok(rightsRecord.licence.requirements.length > 0, "NTEMS rights requirements must be recorded.");
  assert.ok(rightsRecord.licence.exclusions.includes("third-party rights the information provider is not authorized to license"), "NTEMS rights exclusions must retain the third-party-rights limit.");
  exact(rightsRecord.ownerAuthority.ownerName, OWNER_AUTHORIZATION.ownerName, "NTEMS rights owner");
  exact(rightsRecord.ownerAuthority.releaseAuthorizationStatement, OWNER_AUTHORIZATION.statement, "NTEMS rights owner authorization");
  exact(rightsRecord.claims, {
    rightsVerifiedForNamedInputs: true,
    bulkRedistributionAllowedSubjectToLicenceRequirementsAndExclusions: true,
    thirdPartyRightsClearedBeyondPublisherOffer: false,
    officialEndorsementClaimed: false,
    externalMutationPerformed: false,
    productionAdmission: false,
    productionEligible: false,
  }, "NTEMS rights claims");
  const dataset = rightsRecord.datasets.find(({ rowId }) => rowId === row.id);
  assert.ok(dataset, `${row.id} is missing from the NTEMS rights record.`);
  exact(dataset.licenceId, "ogl-canada", `${row.id} rights dataset licence`);
  assert.match(dataset.listingUrl, /^https:\/\/open\.canada\.ca\/data\//, `${row.id} official listing URL`);
  assert.match(dataset.sourceResourceUrl, /^https:\/\/opendata\.nfis\.org\//, `${row.id} official resource URL`);
  const sourceAttribution = row.evidence.sourceRights.find(({ jsonPointer }) => jsonPointer.endsWith("/attribution"))?.expectedValue ?? OGL_EN;
  exactKeys(row.rights, RIGHTS_KEYS, `${row.id}.rights`);
  exact(row.rights.licenceId, "ogl-canada", `${row.id} licenceId`);
  exact(row.rights.licenceVersion, "2.0", `${row.id} licenceVersion`);
  exact(row.rights.licenceUrl, OGL_URL, `${row.id} licenceUrl`);
  exact(row.rights.requiredAttribution, { en: OGL_EN, fr: OGL_FR }, `${row.id} requiredAttribution`);
  exact(row.rights.sourceAttribution, sourceAttribution, `${row.id} source attribution`);
  exact(row.rights.redistributionStatus, "allowed-under-ogl-canada-2.0-with-required-attribution-and-modification-notice", `${row.id} redistributionStatus`);
  assert.equal(row.rights.bulkRedistributionAllowed, true, `${row.id} bulk redistribution must be allowed under OGL.`);
  nonEmptyBilingual(row.rights.modificationNotice, `${row.id}.rights.modificationNotice`);
  assert.match(row.rights.modificationNotice.en, /Witness Tree|derived|output|transform/i);
  assert.match(row.rights.modificationNotice.fr, /Witness Tree|dériv|sortie|transform/i);
  return { rightsRecord, dataset };
}

function validateReadback(root, row, scope, auth) {
  const readbackFile = binding(root, row.evidence.readback, `${row.id}.evidence.readback`);
  exact(row.evidence.readback.path, scope.readbackPath, `${row.id} canonical readback path`);
  const evidence = JSON.parse(readFileSync(readbackFile, "utf8"));
  validateEvidenceRecord(evidence);
  exact(evidence.schemaVersion, "witness-tree/phase1-ntems-transformation-readback-evidence/1", `${row.id} readback schema`);
  assert.ok(["partial-readback-verified", "complete-readback-verified"].includes(evidence.status), `${row.id} readback status`);
  exact(evidence.authorization.path, row.evidence.executionAuthorization.path, `${row.id} readback authorization path`);
  exact(evidence.authorization.sha256, row.evidence.executionAuthorization.sha256, `${row.id} readback authorization SHA-256`);
  exact(evidence.authorization.createdAt, auth.createdAt, `${row.id} readback authorization timestamp`);
  exact(evidence.runner, auth.runner, `${row.id} readback runner`);
  exact(evidence.specifications, [{ id: row.specId, path: SPECIFICATION_PATH, sha256: row.evidence.specification.sha256 }], `${row.id} readback specification binding`);
  exact(evidence.sourceRecord, { path: SPECIFICATION_PATH, sha256: row.evidence.specification.sha256 }, `${row.id} readback source record`);
  object(evidence.counts, `${row.id} readback counts`);
  assert.equal(evidence.counts.expected, evidence.counts.verified + evidence.counts.missing, `${row.id} readback counts`);
  assert.equal(evidence.counts.expected, auth.inputs.length, `${row.id} readback must cover every authorized input`);
  assert.equal(evidence.counts.verified, evidence.outputs.length, `${row.id} readback verified count`);
  assert.equal(evidence.counts.missing, 0, `${row.id} production admission requires complete readback`);
  exact(evidence.status, "complete-readback-verified", `${row.id} complete readback status`);
  exact(evidence.claims, { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, `${row.id} readback claims`);
  assert.ok(Array.isArray(evidence.outputs) && evidence.outputs.length > 0, `${row.id} readback outputs`);
  exact(evidence.outputs.map(({ input }) => input), auth.inputs.map(({ path: value }) => value), `${row.id} readback input bindings`);
  for (const output of evidence.outputs) {
    exact(output.status, "verified", `${row.id} readback output status`);
    exact(output.specification, row.specId, `${row.id} readback output specification`);
    assert.match(output.outputSha256, SHA256, `${row.id} readback output SHA-256`);
    assert.match(output.sidecarSha256, SHA256, `${row.id} readback sidecar SHA-256`);
    assert.ok(Number.isInteger(output.outputByteLength) && output.outputByteLength > 0, `${row.id} readback output byte length`);
    assert.equal(output.sourcePixelChecksum, output.outputPixelChecksum, `${row.id} source/output pixel checksum`);
  }
  exact(row.artifacts.map(({ readbackOutput }) => readbackOutput), evidence.outputs.map(({ output }) => output), `${row.id} artifact/readback output paths`);
  return evidence;
}

function artifactFile(root, artifactRoot, relativePath, label) {
  safeRelative(relativePath, label);
  const resolvedRoot = realpathSync(path.resolve(root, artifactRoot));
  const file = path.resolve(resolvedRoot, relativePath);
  assert.ok(file.startsWith(`${resolvedRoot}${path.sep}`), `${label} escaped the canonical artifact root.`);
  const info = lstatSync(file);
  assert.equal(info.isFile(), true, `${label} must be a regular file.`);
  assert.equal(info.isSymbolicLink(), false, `${label} must not be a symlink.`);
  assert.equal(realpathSync(file), file, `${label} must not traverse a symlink.`);
  return file;
}

function canonicalOutputPath(scope, specification, auth, index) {
  const input = auth.inputs[index];
  const inputSha = scope.specId === "ntems-annual-land-cover-v1" ? specification.inputBindings[0].sha256 : input.sha256;
  const name = scope.specId === "ntems-annual-land-cover-v1"
    ? `annual-land-cover-${input.year}.tif`
    : scope.specId === "ntems-forest-harvest-v1"
      ? "forest-harvest-year-1985-2022.tif"
      : scope.specId === "ntems-canopy-cover-v1"
        ? "canopy-cover-2022.tif"
        : "canopy-height-2022.tif";
  return `${scope.specId}/${inputSha}/${specification.methodVersion}/${name}`;
}

function expectedClassSemantics(root, scope, input) {
  if (scope.specId === "ntems-canopy-cover-v1") return "continuous-0-100";
  if (scope.specId === "ntems-canopy-height-v1") return "continuous-0-62.503";
  if (scope.specId === "ntems-forest-harvest-v1") return "published-class-values-bound";
  const defects = readJson(root, "data/raster-defects.json");
  return defects.defects.some(({ year }) => year === input.year) ? "unknown-empty-rat" : "published-class-values-bound";
}

function validateArtifacts(root, artifactRoot, row, evidence, scope, specification, auth) {
  assert.ok(Array.isArray(row.artifacts) && row.artifacts.length === evidence.outputs.length, `${row.id} must bind every readback output.`);
  for (const [index, artifact] of row.artifacts.entries()) {
    exactKeys(artifact, ["output", "readbackOutput", "sidecar"], `${row.id}.artifacts[${index}]`);
    exact(artifact.readbackOutput, evidence.outputs[index].output, `${row.id} artifact readback path ${index}`);
    exactKeys(artifact.output, ["byteLength", "path", "sha256"], `${row.id}.artifacts[${index}].output`);
    exactKeys(artifact.sidecar, ["byteLength", "path", "sha256"], `${row.id}.artifacts[${index}].sidecar`);
    assert.equal(artifact.sidecar.path, `${artifact.output.path}.sidecar.json`, `${row.id} sidecar path ${index}`);
    assert.match(artifact.output.sha256, SHA256, `${row.id} output SHA-256 ${index}`);
    assert.match(artifact.sidecar.sha256, SHA256, `${row.id} sidecar SHA-256 ${index}`);
    assert.ok(Number.isInteger(artifact.output.byteLength) && artifact.output.byteLength > 0, `${row.id} output byte length ${index}`);
    assert.ok(Number.isInteger(artifact.sidecar.byteLength) && artifact.sidecar.byteLength > 0, `${row.id} sidecar byte length ${index}`);
    const output = evidence.outputs[index];
    const canonicalPath = canonicalOutputPath(scope, specification, auth, index);
    exact(output.output, canonicalPath, `${row.id} canonical output path ${index}`);
    exact(artifact.output.path, canonicalPath, `${row.id} artifact canonical output path ${index}`);
    exact(artifact.sidecar.path, `${canonicalPath}.sidecar.json`, `${row.id} artifact canonical sidecar path ${index}`);
    const specificationOutput = scope.specId === "ntems-annual-land-cover-v1"
      ? `../Witness_Tree-data/derived/phase1/${scope.specId}/{remote-evidence-sha256}/${specification.methodVersion}/annual-land-cover-{year}.tif`
      : `../Witness_Tree-data/derived/phase1/${canonicalPath}`;
    exact(specification.output.path, specificationOutput, `${row.id} specification output contract ${index}`);
    exact(artifact.output.sha256, output.outputSha256, `${row.id} output SHA-256/readback ${index}`);
    exact(artifact.output.byteLength, output.outputByteLength, `${row.id} output byte length/readback ${index}`);
    exact(artifact.sidecar.sha256, output.sidecarSha256, `${row.id} sidecar SHA-256/readback ${index}`);
    const outputFile = artifactFile(root, artifactRoot, artifact.output.path, `${row.id} output`);
    const sidecarFile = artifactFile(root, artifactRoot, artifact.sidecar.path, `${row.id} sidecar`);
    exact(statSync(outputFile).size, artifact.output.byteLength, `${row.id} output bytes ${index}`);
    exact(statSync(sidecarFile).size, artifact.sidecar.byteLength, `${row.id} sidecar bytes ${index}`);
    exact(sha256File(outputFile), artifact.output.sha256, `${row.id} output content ${index}`);
    exact(sha256File(sidecarFile), artifact.sidecar.sha256, `${row.id} sidecar content ${index}`);
    const sidecarBytes = readFileSync(sidecarFile);
    let sidecar;
    try { sidecar = JSON.parse(sidecarBytes); } catch { throw new Error(`${row.id} sidecar ${index} is not valid JSON.`); }
    exactKeys(sidecar, ["claims", "command", "createdAt", "inputBindings", "methodVersion", "output", "outputByteLength", "outputSha256", "qa", "schemaVersion", "specId", "toolVersions"], `${row.id} sidecar ${index}`);
    exact(sidecar.schemaVersion, "witness-tree/phase1-ntems-transformation-sidecar/1", `${row.id} sidecar schema ${index}`);
    exact(sidecar.specId, row.specId, `${row.id} sidecar spec ${index}`);
    exact(sidecar.methodVersion, specification.methodVersion, `${row.id} sidecar method ${index}`);
    exact(sidecar.createdAt, auth.createdAt, `${row.id} sidecar timestamp ${index}`);
    exact(sidecar.output, { path: canonicalPath, format: "GTiff" }, `${row.id} sidecar output ${index}`);
    exact(sidecar.outputSha256, artifact.output.sha256, `${row.id} sidecar output SHA-256 ${index}`);
    exact(sidecar.outputByteLength, artifact.output.byteLength, `${row.id} sidecar output bytes ${index}`);
    const expectedInputBinding = { ...auth.inputs[index], classSemantics: expectedClassSemantics(root, scope, auth.inputs[index]) };
    exact(sidecar.inputBindings, [expectedInputBinding], `${row.id} sidecar input binding ${index}`);
    const dataType = scope.specId.includes("canopy") ? "Float32" : scope.specId.includes("harvest") ? "UInt16" : "Byte";
    exact(sidecar.command, buildGdalTranslateArgs(`data-root/${auth.inputs[index].path}/${auth.inputs[index].member}`, `output-root/${canonicalPath}`, dataType), `${row.id} sidecar command ${index}`);
    exactKeys(sidecar.toolVersions, ["gdalInfo", "gdalTranslate", "gdalsrsinfo"], `${row.id} sidecar tool versions ${index}`);
    Object.values(sidecar.toolVersions).forEach((value, toolIndex) => nonEmpty(value, `${row.id} sidecar tool version ${index}.${toolIndex}`));
    exact(sidecar.qa, {
      source: { classSemantics: expectedInputBinding.classSemantics },
      outputMetadataChecked: true,
      outputChecksumChecked: true,
      noResamplingOrReprojection: true,
      noOverwrite: true,
      sourcePixelChecksum: output.sourcePixelChecksum,
      outputPixelChecksum: output.outputPixelChecksum,
    }, `${row.id} sidecar QA ${index}`);
    exact(sidecar.claims, { transformed: true, ingested: false, released: false, productionAdmission: false, productionEligible: false, externalMutationPerformed: false }, `${row.id} sidecar claims ${index}`);
    exact(Buffer.compare(sidecarBytes, Buffer.from(`${JSON.stringify(sidecar, null, 2)}\n`)), 0, `${row.id} deterministic sidecar bytes ${index}`);
  }
}

function expectedRetrievalDate(root, scope, auth) {
  if (scope.specId === "ntems-annual-land-cover-v1") {
    const preparation = readJson(root, "data/vlce2-promotion-preparation.json");
    const byYear = new Map(preparation.entries.map((entry) => [entry.year, entry]));
    const inputs = auth.inputs.map((input) => {
      const source = byYear.get(input.year);
      assert.ok(source, `Annual retrieval evidence is missing for ${input.year}.`);
      exact(path.basename(input.path), source.originalFilename, `Annual retrieval filename ${input.year}`);
      return { path: input.path, retrievedAt: source.retrievedAt };
    });
    return { status: "multiple-source-files", firstRetrievedAt: inputs[0].retrievedAt, lastRetrievedAt: inputs.at(-1).retrievedAt, inputs };
  }
  const staged = readJson(root, "data/staged-acquisitions.json");
  const entry = staged.entries.find((candidate) => candidate.sha256 === auth.inputs[0].sha256);
  assert.ok(entry?.retrievedAt, `${scope.rowId} retrieval evidence is missing from staged acquisitions.`);
  return entry.retrievedAt;
}

function validateLedgerFields(root, row, specification, auth, dataset, scope, evidence) {
  exactKeys(row.ledgerFields, LEDGER_FIELD_KEYS, `${row.id}.ledgerFields`);
  for (const key of ["publisher", "datasetTitle", "sourceUrl", "licence", "licenceUrl", "archiveVersion", "coverage", "schema", "datasetOriginalName", "retrievalDate", "redistributionStatus"]) {
    if (typeof row.ledgerFields[key] === "string") nonEmpty(row.ledgerFields[key], `${row.id}.ledgerFields.${key}`);
    else object(row.ledgerFields[key], `${row.id}.ledgerFields.${key}`);
  }
  assert.ok(typeof row.ledgerFields.checksum === "string" || (Array.isArray(row.ledgerFields.checksum) && row.ledgerFields.checksum.length > 0), `${row.id}.ledgerFields.checksum is required.`);
  if (typeof row.ledgerFields.checksum === "string") assert.match(row.ledgerFields.checksum, SHA256, `${row.id}.ledgerFields.checksum`);
  else row.ledgerFields.checksum.forEach((value, index) => assert.match(value, SHA256, `${row.id}.ledgerFields.checksum[${index}]`));
  exact(row.ledgerFields.checksum, auth.inputs.map(({ sha256 }) => sha256), `${row.id}.ledgerFields.checksum`);
  exact(row.ledgerFields.publisher, dataset.publisher, `${row.id}.ledgerFields.publisher`);
  exact(row.ledgerFields.datasetTitle, dataset.title, `${row.id}.ledgerFields.datasetTitle`);
  exact(row.ledgerFields.sourceUrl, dataset.sourceResourceUrl, `${row.id}.ledgerFields.sourceUrl`);
  exact(row.ledgerFields.updateCadence, dataset.updateCadence, `${row.id}.ledgerFields.updateCadence`);
  exact(row.ledgerFields.retrievalDate, expectedRetrievalDate(root, scope, auth), `${row.id}.ledgerFields.retrievalDate`);
  exact(row.ledgerFields.archiveVersion, scope.specId === "ntems-annual-land-cover-v1" ? "Version 2" : "undeclared", `${row.id}.ledgerFields.archiveVersion`);
  exact(row.ledgerFields.coverage, dataset.temporalCoverage, `${row.id}.ledgerFields.coverage`);
  exact(row.ledgerFields.schema, { kind: "raster", specification: scope.specId, sourceContract: specification.output.schema }, `${row.id}.ledgerFields.schema`);
  const originalNames = auth.inputs.map(({ path: inputPath }) => path.basename(inputPath));
  exact(row.ledgerFields.datasetOriginalName, originalNames.length === 1 ? originalNames[0] : { count: originalNames.length, files: originalNames }, `${row.id}.ledgerFields.datasetOriginalName`);
  nonEmptyBilingual(row.ledgerFields.plainLanguageExplanation, `${row.id}.ledgerFields.plainLanguageExplanation`);
  exact(row.ledgerFields.plainLanguageExplanation, EXPLANATIONS[row.id], `${row.id}.ledgerFields.plainLanguageExplanation`);
  unknownWithReason(row.ledgerFields.editionEffectiveDate, `${row.id}.ledgerFields.editionEffectiveDate`);
  unknownWithReason(row.ledgerFields.nextExpectedRefresh, `${row.id}.ledgerFields.nextExpectedRefresh`);
  exact(row.ledgerFields.requiredAttribution, row.rights.requiredAttribution, `${row.id}.ledgerFields.requiredAttribution`);
  exact(row.ledgerFields.modificationNotice, row.rights.modificationNotice, `${row.id}.ledgerFields.modificationNotice`);
  exact(row.ledgerFields.redistributionStatus, row.rights.redistributionStatus, `${row.id}.ledgerFields.redistributionStatus`);
  exact(row.ledgerFields.licence, row.rights.licenceId, `${row.id}.ledgerFields.licence`);
  exact(row.ledgerFields.licenceUrl, row.rights.licenceUrl, `${row.id}.ledgerFields.licenceUrl`);
  exact(row.ledgerFields.bulkRedistributionAllowed, true, `${row.id}.ledgerFields.bulkRedistributionAllowed`);
  exact(row.ledgerFields.admissionState, true, `${row.id}.ledgerFields.admissionState`);
  exactKeys(row.ledgerFields.correctionContactRoute, ["internalEn", "internalFr", "publisherListing"], `${row.id}.ledgerFields.correctionContactRoute`);
  exact(row.ledgerFields.correctionContactRoute.internalEn, "/en/corrections", `${row.id} internal English correction route`);
  exact(row.ledgerFields.correctionContactRoute.internalFr, "/fr/corrections", `${row.id} internal French correction route`);
  exact(row.ledgerFields.correctionContactRoute.publisherListing, dataset.listingUrl, `${row.id} publisher correction route`);
  object(row.ledgerFields.transformations, `${row.id}.ledgerFields.transformations`);
  exact(row.ledgerFields.transformations, {
    methodVersion: specification.methodVersion,
    summary: "Deterministic source-grid-preserving GeoTIFF transformation with no resampling or reprojection.",
    outputs: evidence.outputs.map(({ output, outputSha256 }) => ({ path: output, sha256: outputSha256 })),
  }, `${row.id}.ledgerFields.transformations`);
}

export function validateNtemsProductionAdmissionRecord(record, root = ROOT, expectedArtifactRoot = CANONICAL_ARTIFACT_ROOT) {
  validateRecordShape(record, expectedArtifactRoot);
  for (const [index, row] of record.rows.entries()) {
    const scope = expectedScope(row.id);
    exactKeys(row, ROW_KEYS, `${row.id} row`);
    assert.equal(row.specId, scope.specId, `${row.id} specification mapping`);
    exact(row.evidence && Object.keys(row.evidence).sort(), EVIDENCE_KEYS.sort(), `${row.id} evidence`);
    object(row.rights, `${row.id}.rights`);
    object(row.ledgerFields, `${row.id}.ledgerFields`);
    validateSharedEvidence(root, row);
    const { specification } = validateSpecification(root, row, scope);
    const { rightsRecord, dataset } = validateSourceRights(root, row, scope);
    const auth = validateAuthorization(root, row, scope, specification);
    assert.ok(Date.parse(record.decidedAt) >= Date.parse(rightsRecord.verifiedAt), `${row.id} admission decision predates rights verification.`);
    assert.ok(Date.parse(record.decidedAt) >= Date.parse(auth.createdAt), `${row.id} admission decision predates execution authorization.`);
    const evidence = validateReadback(root, row, scope, auth);
    validateArtifacts(root, record.artifactRoot, row, evidence, scope, specification, auth);
    validateLedgerFields(root, row, specification, auth, dataset, scope, evidence);
    assert.equal(index, NTEMS_SCOPES.findIndex(({ rowId }) => rowId === row.id), `${row.id} row order`);
  }
  return record;
}

export function readbackPresence(root = ROOT) {
  const scopes = NTEMS_SCOPES.map(({ rowId, specId, readbackPath }) => {
    let present = false;
    try {
      regularFile(root, readbackPath, `${rowId} readback evidence`);
      present = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { rowId, specId, present, files: present ? [readbackPath] : [] };
  });
  return {
    schemaVersion: "witness-tree/phase1-ntems-production-admission-readiness/1",
    // Honest about its reach. This mode lstats four evidence JSON files under
    // data/. It opens no raster, reads no sidecar, and verifies no checksum,
    // so a present evidence file here is not evidence that the artifact it
    // describes exists or matches. The byte-level path needs --record.
    mode: "readback-evidence-file-existence-only",
    verifies: "Existence of the four readback evidence files in the repository. No derived raster, sidecar, or checksum under the data root is read in this mode; pass --record to validate an admission record against the artifact bytes.",
    admissionClaim: false,
    scopes,
    presentCount: scopes.filter(({ present }) => present).length,
    missingCount: scopes.filter(({ present }) => !present).length,
  };
}

export function check(root = ROOT, recordPath = undefined) {
  if (!recordPath) return readbackPresence(root);
  const recordFile = regularFile(root, recordPath, "record path");
  const record = JSON.parse(readFileSync(recordFile, "utf8"));
  validateNtemsProductionAdmissionRecord(record, root);
  return { schemaVersion: record.schemaVersion, mode: "record-validation-only", recordPath, valid: true, admissionDecisionMade: false };
}

function cli() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--record");
  const recordPath = index < 0 ? undefined : args[index + 1];
  if (index >= 0 && !recordPath) throw new Error("--record needs a repository-relative JSON path.");
  console.log(JSON.stringify(check(ROOT, recordPath), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
