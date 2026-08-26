import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePhase2AdmissionRecordTemplate, validateRecordedPhase2AdmissionRecord } from "./check-phase2-admission-record-template.mjs";
import { validatePhase2V21ProvinceZonalPilotEvidence } from "./check-phase2-v21-province-zonal-pilot-evidence.mjs";
import { validatePhase2V21RasterReadbackEvidence } from "./check-phase2-v21-raster-readback-evidence.mjs";
import { validateExpertReviewEvidence } from "./check-phase2-v21-expert-review-evidence.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const TSX = resolve(ROOT, "node_modules/.bin/tsx");
const COMPARISON_VALIDATOR = resolve(ROOT, "scripts/check-phase2-independent-comparison-evidence.mts");
const CRITERIA = [
  "admitted-v21-national-baseline",
  "expert-review-100-per-province",
  "published-independent-comparisons",
  "admitted-boundary-aggregates",
];
const OPEN_EVIDENCE = {
  "expert-review-100-per-province": "data/phase2-v21-real-review-packet-evidence.json",
  "published-independent-comparisons": "data/phase2-real-comparison-availability.json",
};
const COMPLETION_SCHEMAS = {
  "expert-review-100-per-province": "witness-tree/phase2-v21-expert-review-evidence/1",
  "published-independent-comparisons": "witness-tree/phase2-independent-comparison-evidence/1",
};
const WORDS = ["zero", "one", "two", "three", "four"];

function resolveEvidencePath(relativePath) {
  assert.equal(typeof relativePath, "string", "evidence path must be a string.");
  assert.ok(relativePath.startsWith("data/"), "evidence path must stay under repository data/.");
  assert.equal(relativePath.includes("\0"), false, "evidence path must not contain NUL.");
  assert.equal(relativePath.split(/[\\/]/).some((segment) => segment === "." || segment === ".." || segment === ""), false, "evidence path must not traverse directories.");
  const root = realpathSync(ROOT);
  const candidate = resolve(root, relativePath);
  assert.ok(candidate.startsWith(`${root}/`), "evidence path escaped the repository.");
  const info = lstatSync(candidate);
  assert.equal(info.isFile(), true, "evidence path must name a regular file.");
  assert.equal(info.isSymbolicLink(), false, "evidence path must not be a symlink.");
  assert.equal(realpathSync(candidate), candidate, "evidence path must not traverse a symlink.");
  return candidate;
}
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
const readJsonAt = (path) => JSON.parse(readFileSync(resolveEvidencePath(path), "utf8"));
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, `${label} drifted.`);

function requireEvidencePath(criterion) {
  assert.equal(typeof criterion?.evidence, "string", `${criterion?.id ?? "criterion"} evidence path is required.`);
  assert.ok(criterion.evidence.trim(), `${criterion.id} evidence path is required.`);
  return criterion.evidence;
}

function readAdmissionRecord(path, raster, template) {
  const sourcePaths = [
    "data/phase2-source-input-admission-vlce2-1984-2022.json",
    "data/phase2-source-input-admission-statcan-2021-provinces-territories-cbf.json",
  ];
  const sourceRecords = new Map(sourcePaths.map((sourcePath) => [sourcePath, readJson(sourcePath)]));
  return validateRecordedPhase2AdmissionRecord(readJsonAt(path), template, raster, sourceRecords);
}

function validateBaselineAndBoundary(criteria) {
  const raster = readJson("data/phase2-v21-raster-readback-evidence.json");
  validatePhase2V21RasterReadbackEvidence(raster);

  const aggregates = readJson("data/phase2-v21-province-zonal-pilot-evidence.json");
  validatePhase2V21ProvinceZonalPilotEvidence(aggregates, raster);

  const template = readJson("data/phase2-admission-record.template.json");
  validatePhase2AdmissionRecordTemplate(
    template,
    readJson("data/phase2-owner-admission-packet.json"),
    raster,
    aggregates,
    readJson("data/phase2-method-parameters.json"),
    readJson("data/boundary-editions.json"),
    readJson("data/vlce2-remote-promotion-evidence.json"),
  );
  const baselinePath = requireEvidencePath(criteria[0]);
  const boundaryPath = requireEvidencePath(criteria[3]);
  exact(resolveEvidencePath(boundaryPath), resolveEvidencePath(baselinePath), "baseline and boundary admission evidence path");
  const admission = readAdmissionRecord(baselinePath, raster, template);

  return {
    baseline: admission.claims.admitted === true && admission.claims.formalGate1Complete === true,
    boundary: admission.claims.admitted === true && admission.claims.formalGate4Complete === true,
  };
}

function validateExpertCompletion(path) {
  const evidence = readJsonAt(path);
  if (evidence.schemaVersion !== COMPLETION_SCHEMAS["expert-review-100-per-province"] || evidence.status !== "completed") return false;
  validateExpertReviewEvidence(evidence, { requireRepositoryEvidence: true });
  return true;
}

function validateComparisonCompletion(path) {
  const result = execFileSync(TSX, [COMPARISON_VALIDATOR, "--evidence", resolveEvidencePath(path)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const summary = JSON.parse(result);
  assert.equal(summary.status, "completed", "comparison completion validator returned a non-completed result.");
  return true;
}

function validateCompletionCriterion(criterion) {
  const path = requireEvidencePath(criterion);
  const evidence = readJsonAt(path);
  const expectedSchema = COMPLETION_SCHEMAS[criterion.id];

  if (evidence.schemaVersion !== expectedSchema || evidence.status !== "completed") {
    exact(resolveEvidencePath(path), resolveEvidencePath(OPEN_EVIDENCE[criterion.id]), `${criterion.id} open evidence path`);
    return false;
  }

  return criterion.id === "expert-review-100-per-province"
    ? validateExpertCompletion(path)
    : validateComparisonCompletion(path);
}

function expectedStatus(completed) {
  return `${WORDS[completed]}-of-four-formal-exit-criteria`;
}

export function validatePhase2FormalExitStatus(record) {
  assert.equal(record?.schemaVersion, "witness-tree/phase2-formal-exit-status/1");
  assert.equal(Array.isArray(record.criteria), true, "Phase 2 formal exit must contain criteria.");
  assert.equal(record.criteria.length, CRITERIA.length, "Phase 2 formal exit must contain exactly four criteria.");
  exact(record.criteria.map((criterion) => criterion?.id), CRITERIA, "Phase 2 criterion ids");

  const admissionResults = validateBaselineAndBoundary(record.criteria);
  const derived = [
    admissionResults.baseline,
    validateCompletionCriterion(record.criteria[1]),
    validateCompletionCriterion(record.criteria[2]),
    admissionResults.boundary,
  ];
  exact(record.criteria.map((criterion) => criterion.complete), derived, "Phase 2 criterion completion");

  const completed = derived.filter(Boolean).length;
  exact(record.formalExit, { completed, total: CRITERIA.length, percentage: completed / CRITERIA.length * 100 }, "Phase 2 formal exit");
  assert.equal(record.status, expectedStatus(completed), "Phase 2 status must be derived from the four criteria.");
  exact(record.claims, { productionEligible: false, released: false, formalPhaseComplete: completed === CRITERIA.length }, "Phase 2 claims");

  return { status: record.status, completed, total: CRITERIA.length, percentage: completed / CRITERIA.length * 100 };
}

export function checkPhase2FormalExitStatus() {
  return validatePhase2FormalExitStatus(readJson("data/phase2-formal-exit-status.json"));
}

if (process.argv[1] && resolve(process.argv[1]) === THIS_FILE) {
  const result = checkPhase2FormalExitStatus();
  console.log(`Phase 2 formal exit is ${result.completed}/${result.total}; evidence-derived criteria remain nonproduction and release-gated.`);
}
