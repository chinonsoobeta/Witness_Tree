import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digest,
  resolveInputPath,
  validateCanonicalWorkflow,
  validateCompletedResults,
  workflow,
} from "./check-phase2-v21-expert-review-workflow.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const evidenceSchema = "witness-tree/phase2-v21-expert-review-evidence/1";
const workflowPath = "data/phase2-v21-expert-review-workflow.json";
const provinces = ["BC", "AB", "ON", "QC"];

function readJson(path) {
  return JSON.parse(readFileSync(resolveInputPath(path), "utf8"));
}

function binding(path, bytes) {
  return { path, sha256: digest(bytes), byteLength: bytes.length };
}

function readBoundJson(value, label) {
  assert(value && typeof value === "object", `${label} binding is required`);
  assert.deepEqual(Object.keys(value).sort(), ["byteLength", "path", "sha256"], `${label} binding fields differ`);
  assert.equal(typeof value.path === "string" && value.path.trim().length > 0, true, `${label} path is required`);
  assert.match(value.sha256, /^[a-f0-9]{64}$/, `${label} SHA-256 is invalid`);
  assert.equal(Number.isSafeInteger(value.byteLength) && value.byteLength > 0, true, `${label} byte length is invalid`);
  const bytes = readFileSync(resolveInputPath(value.path));
  assert.equal(bytes.length, value.byteLength, `${label} byte length differs`);
  assert.equal(digest(bytes), value.sha256, `${label} SHA-256 differs`);
  return { bytes, document: JSON.parse(bytes) };
}

function expectedCounts() {
  return {
    assigned: 400,
    completed: 400,
    perProvince: Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: 100 }])),
  };
}

function validateExpertReviewEvidence(evidence, { requireRepositoryEvidence = false } = {}) {
  assert.deepEqual(Object.keys(evidence ?? {}).sort(), ["claims", "counts", "packet", "results", "reviewerRoster", "schemaVersion", "status", "workflow"], "expert-review evidence contains missing or unexpected fields");
  assert.equal(evidence?.schemaVersion, evidenceSchema, "expert-review evidence schema version differs");
  assert.equal(evidence?.status, "completed", "expert-review evidence must be completed");
  assert.deepEqual(evidence?.claims, {
    expertReviewCompleted: true,
    productAccuracyClaim: false,
    admittedInputs: false,
    productionEligible: false,
    released: false,
  }, "expert-review evidence claim boundary differs");
  assert.deepEqual(evidence?.counts, expectedCounts(), "expert-review counts must be exactly 400 and 100 per province");

  const assignment = validateCanonicalWorkflow();
  assert.deepEqual(evidence.workflow, binding(workflowPath, readFileSync(resolve(root, workflowPath))), "evidence must bind the existing workflow contract");
  const packet = readBoundJson(workflow.packet, "workflow packet");
  assert.deepEqual(evidence.packet, workflow.packet, "evidence packet binding differs from the workflow contract");
  assert.equal(packet.document.schemaVersion, "witness-tree/phase2-v21-real-review-packet/1");
  assert.equal(packet.document.status, "local-real-raster-candidates-no-review-results");
  assert.equal(packet.document.productionEligible, false);
  assert.equal(packet.document.released, false);
  assert.equal(packet.document.samples.length, assignment.assigned, "workflow packet sample count differs");

  const roster = readBoundJson(evidence.reviewerRoster, "approved reviewer roster");
  const results = readBoundJson(evidence.results, "completed review results");
  if (requireRepositoryEvidence) {
    for (const [label, value] of [["approved reviewer roster", evidence.reviewerRoster], ["completed review results", evidence.results]]) {
      const segments = value.path.split(/[\\/]/);
      assert.equal(value.path.startsWith("data/") && !value.path.includes("\0") && segments[0] === "data" && segments.slice(1).every((segment) => segment && segment !== "." && segment !== ".."), true, `${label} must be durable repository data evidence`);
    }
  }
  assert.deepEqual(results.document.packet, evidence.packet, "completed results must bind the evidence packet");
  assert.deepEqual(results.document.reviewerRoster, evidence.reviewerRoster, "completed results must bind the evidence roster");
  const summary = validateCompletedResults(results.document, evidence.reviewerRoster.path);
  assert.equal(summary.totalAssigned, 400);
  assert.equal(summary.totalCompleted, 400);
  for (const province of provinces) assert.equal(summary.provinces[province].completed, 100, `${province} review count differs`);

  // Keep the local variable explicit: reading the roster above is part of the
  // evidence validation, and validateCompletedResults checks its qualifications
  // and province coverage before accepting any result row.
  assert.equal(Array.isArray(roster.document.reviewers), true);
  return {
    status: "completed",
    totalAssigned: summary.totalAssigned,
    totalCompleted: summary.totalCompleted,
    provinces: Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: summary.provinces[province].completed }])),
    claims: evidence.claims,
  };
}

function main() {
  const assignment = validateCanonicalWorkflow();
  const evidenceFlag = process.argv.indexOf("--evidence");
  if (evidenceFlag === -1) {
    console.log(JSON.stringify({
      status: "ready-no-completion-evidence",
      totalAssigned: assignment.assigned,
      totalCompleted: 0,
      provinces: Object.fromEntries(provinces.map((province) => [province, { assigned: 100, completed: 0 }])),
    }, null, 2));
    return;
  }
  assert(evidenceFlag + 1 < process.argv.length, "--evidence requires a JSON path");
  const result = validateExpertReviewEvidence(readJson(process.argv[evidenceFlag + 1]));
  console.log(JSON.stringify(result, null, 2));
}

export { expectedCounts, validateExpertReviewEvidence };

if (process.argv[1] && resolve(process.argv[1]) === resolveInputPath("scripts/check-phase2-v21-expert-review-evidence.mjs")) main();
