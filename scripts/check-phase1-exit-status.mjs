import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_GATES = [
  ["complete-production-ledger", "fail"],
  ["raw-file-archive-recovery", "fail"],
  ["coverage-geometry", "pass"],
  ["corruption-validation-suite", "pass"]
];

function nonEmptyString(value, name) {
  assert.equal(typeof value, "string", `${name} must be a string.`);
  assert.ok(value.trim(), `${name} must not be empty.`);
}

function validateEvidence(evidence, name, root, verifyHashes, { allowControllingPlanPath = false } = {}) {
  assert.ok(Array.isArray(evidence) && evidence.length > 0, `${name} requires evidence.`);
  for (const [index, item] of evidence.entries()) {
    nonEmptyString(item?.path, `${name}.evidence[${index}].path`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/, `${name}.evidence[${index}].sha256 must be a SHA-256 hex digest.`);
    const isControllingPlan = allowControllingPlanPath && item.path === "../work/witness-tree-plan.md";
    assert.ok(!path.isAbsolute(item.path) && (!item.path.includes("..") || isControllingPlan), `${name}.evidence[${index}].path must stay inside the repository.`);
    if (verifyHashes) {
      const actual = createHash("sha256").update(readFileSync(path.join(root, item.path))).digest("hex");
      assert.equal(actual, item.sha256, `${name}.evidence[${index}] no longer matches its recorded SHA-256.`);
    }
  }
}

export function validatePhase1ExitStatus(record, { root = ROOT, verifyHashes = true } = {}) {
  assert.equal(record?.schemaVersion, "phase1-exit-status/v1");
  assert.match(record.asOf, /^\d{4}-\d{2}-\d{2}$/);
  const requirements = record.requirementsEvidence;
  assert.deepEqual(requirements?.sections, ["Phase 1 — Exit criteria", "Verified completion checkpoint through 2026-08-25"]);
  validateEvidence([requirements], "requirementsEvidence", path.resolve(root, ".."), verifyHashes, { allowControllingPlanPath: true });

  const exit = record.formalExit;
  assert.equal(exit?.method, "unweighted-four-gate-count");
  assert.ok(Array.isArray(exit.gates) && exit.gates.length === REQUIRED_GATES.length, "Formal exit must have exactly four gates.");
  assert.deepEqual(exit.gates.map(({ id, status }) => [id, status]), REQUIRED_GATES, "The report must retain the authoritative current gate results.");
  for (const gate of exit.gates) {
    nonEmptyString(gate.requirement, `${gate.id}.requirement`);
    nonEmptyString(gate.reason, `${gate.id}.reason`);
    nonEmptyString(gate.label?.en, `${gate.id}.label.en`);
    nonEmptyString(gate.label?.fr, `${gate.id}.label.fr`);
    validateEvidence(gate.evidence, gate.id, root, verifyHashes);
  }
  const passed = exit.gates.filter(({ status }) => status === "pass").length;
  assert.equal(exit.passed, passed, "Passed gates must be derived from gate statuses.");
  assert.equal(exit.total, REQUIRED_GATES.length, "Formal exit denominator is always four gates.");
  assert.equal(exit.ratio, `${passed}/${REQUIRED_GATES.length}`, "Formal exit ratio must be derived from gate statuses.");
  assert.equal(exit.status, passed === REQUIRED_GATES.length ? "complete" : "incomplete", "Complete status is allowed only when all four gates pass.");
  nonEmptyString(exit.completionRule, "formalExit.completionRule");
  assert.match(exit.completionRule, /only when every one.*four.*passes/i, "Completion rule must remain fail closed.");
  assert.doesNotMatch(JSON.stringify(exit), /39\.2741935/, "Historical raw-evidence tracking must not enter formal exit coverage.");

  const historical = record.historicalRawEvidenceTracking;
  assert.equal(historical?.value, 40.9677419);
  assert.equal(historical.unit, "percent");
  assert.equal(historical.status, "current-non-exit-tracker");
  assert.equal(historical.excludedFromFormalExitCalculation, true);
  nonEmptyString(historical.reason, "historicalRawEvidenceTracking.reason");
  assert.match(historical.reason, /not Phase 1 exit coverage|not.*production completion/i);
  validateEvidence(historical.evidence, "historicalRawEvidenceTracking", root, verifyHashes);
  return { status: exit.status, passed, total: REQUIRED_GATES.length, ratio: exit.ratio };
}

export function checkPhase1ExitStatus() {
  const record = JSON.parse(readFileSync(path.join(ROOT, "data/phase1-exit-status.json"), "utf8"));
  return validatePhase1ExitStatus(record);
}

if (process.argv[1]?.endsWith("check-phase1-exit-status.mjs")) {
  const result = checkPhase1ExitStatus();
  console.log(`Phase 1 formal exit status: ${result.status}; ${result.ratio} unweighted gates pass.`);
}
