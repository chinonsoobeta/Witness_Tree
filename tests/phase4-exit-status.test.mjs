import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import test from "node:test";
import { validatePhase4ExitStatus } from "../scripts/check-phase4-exit-status.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase4-exit-status.json", import.meta.url), "utf8"));
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const decision = JSON.parse(readFileSync(new URL("../data/phase-scope-decision-2026-09-26.json", import.meta.url), "utf8"));
// The scope decision as it stood before the owner retired the outside review,
// so the review-required path stays tested.
const reviewDecision = { ...decision, removedCriteria: decision.removedCriteria.filter((item) => item.phase !== 4) };

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeBound(directory, name, value) {
  const absolutePath = join(directory, name);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  writeFileSync(absolutePath, bytes);
  return { path: relative(repositoryRoot, absolutePath), sha256: digest(bytes) };
}

function writePositiveBundle(directory, production = true, options = {}) {
  const scope = { provinces: ["BC", "QC"] };
  const runId = "phase4-test-admitted-run-1";
  const ownerDecision = options.ownerDecision ?? {
    isHuman: true,
    name: "Chinonso Obeta",
    role: "Content and data owner",
    decision: "approve",
    decidedAt: "2026-08-26T03:00:00Z",
    rationale: "The owner approved this exact provincial matching run and its named BC/QC production scope after reviewing the method and release boundary.",
  };
  const reviewers = options.reviewers ?? [
    { id: "bc-reviewer-1", province: "BC", isHuman: true, name: "Alexandra Chen", affiliation: "British Columbia forest data review practice", role: "Independent provincial forestry reviewer", qualification: "Forest inventory and remote-sensing review qualification", reviewedAt: "2026-08-26T04:00:00Z", independent: true, noConflict: true, decision: "approved", findings: "The BC presentation preserves the source event meaning, coverage boundary, and uncertainty without overstating matching results.", notes: "Reviewed the published method, provincial scope, and representative result rows; no blocking BC representation issue remains." },
    { id: "qc-reviewer-1", province: "QC", isHuman: true, name: "Jean Tremblay", affiliation: "Quebec forest information review practice", role: "Independent provincial forestry reviewer", qualification: "Québec inventory and remote-sensing review qualification", reviewedAt: "2026-08-26T04:30:00Z", independent: true, noConflict: true, decision: "approved", findings: "The QC presentation preserves the source event meaning, coverage boundary, and uncertainty without overstating matching results.", notes: "Reviewed the bilingual method, provincial scope, and representative result rows; no blocking QC representation issue remains." },
  ];
  const input = writeBound(directory, "provincial-input-admission.json", { schemaVersion: "test-only/provincial-input/1", status: "admitted" });
  const reasons = { "no-official-record-candidates": 1 };
  const report = writeBound(directory, "provincial-matching-report.json", {
    schemaVersion: "witness-tree/phase4-provincial-matching-report/1",
    runId,
    scope,
    status: production ? "admitted-production" : "computed-nonproduction",
    productionEligible: production,
    claims: { comparisonResultsExist: true, productionEligible: production, released: false },
    readiness: { sourceRightsVerified: true, sourceEvidenceAdmitted: true, sourceTransformationApproved: true, sourceReleaseApproved: true, changeGeometryMaterialized: true },
    inputBindings: [input],
    counts: { assessedChanges: 4, matchedChanges: 3, unmatchedChanges: 1 },
    matchRate: .75,
    nonMatchRate: .25,
    nonMatchReasonDistribution: reasons,
  });
  const admission = writeBound(directory, "provincial-matching-admission.json", {
    schemaVersion: "witness-tree/phase4-provincial-matching-admission/1",
    status: production ? "recorded-production-admission" : "prepared-nonproduction",
    claims: { admitted: production, released: false, productionEligible: production },
    reportSha256: report.sha256,
    runId,
    scope,
    ownerDecision,
    inputBindings: [input],
    sourceRightsVerified: true,
    sourceEvidenceAdmitted: true,
    sourceTransformationApproved: true,
    sourceReleaseApproved: true,
    changeGeometryMaterialized: true,
  });
  const methodsEn = writeBound(directory, "methods-en.txt", "Match rate: 75%. Non-match rate: 25%. Non-match-reason distribution: no-official-record-candidates (25%).");
  const methodsFr = writeBound(directory, "methods-fr.txt", "Taux d’appariement : 75 %. Taux de non-appariement : 25 %. Non-match-reason distribution: no-official-record-candidates (25 %).");
  const publication = writeBound(directory, "provincial-matching-publication.json", {
    schemaVersion: "witness-tree/phase4-provincial-matching-publication/1",
    status: production ? "published-bilingual-production" : "published-bilingual",
    released: production,
    productionEligible: production,
    reportSha256: report.sha256,
    admissionSha256: admission.sha256,
    methodsPagePaths: [methodsEn.path, methodsFr.path],
    matchRate: .75,
    nonMatchRate: .25,
    nonMatchReasonDistribution: reasons,
  });
  const review = options.retired ? null : writeBound(directory, "provincial-matching-outside-review.json", {
    schemaVersion: "witness-tree/phase4-provincial-matching-outside-review/1",
    status: "approved",
    reportSha256: report.sha256,
    admissionSha256: admission.sha256,
    runId,
    scope,
    provinces: ["BC", "QC"],
    reviewers,
  });
  const release = writeBound(directory, "provincial-matching-release.json", {
    schemaVersion: "witness-tree/phase4-provincial-matching-release/1",
    status: production ? "released-production" : "prepared-release",
    released: production,
    productionEligible: production,
    version: "phase4-test-release-1",
    reportSha256: report.sha256,
    admissionSha256: admission.sha256,
    publicationSha256: publication.sha256,
    ...(review ? { outsideReviewSha256: review.sha256 } : {}),
  });
  return [input, report, admission, methodsEn, methodsFr, publication, review, release].filter(Boolean);
}

function completeRecord(bundleEvidence) {
  return {
    ...record,
    status: "complete",
    completedCriteria: 4,
    percentage: 100,
    exitCriteria: record.exitCriteria.map((criterion) => criterion.id === "published-match-and-non-match-rates"
      ? { ...criterion, status: "pass", reason: "An admitted production run is published with checksum-bound rates and reasons.", evidence: bundleEvidence }
      : criterion),
    removedCheckpoints: [],
    checkpoints: ["rights-and-admission", "outside-provincial-review"].map((id) => ({ id, title: id === "rights-and-admission" ? "Rights/admission" : "Outside provincial review", status: "pass", reason: "The production evidence bundle closes this checkpoint.", evidence: bundleEvidence })),
  };
}

function retiredRecord(bundleEvidence) {
  const complete = completeRecord(bundleEvidence);
  return { ...complete, removedCheckpoints: record.removedCheckpoints, checkpoints: complete.checkpoints.filter((checkpoint) => checkpoint.id === "rights-and-admission") };
}

async function withPositiveFixture(production, callback, options = {}) {
  const parent = options.parent ?? "tests";
  const directory = mkdtempSync(join(repositoryRoot, parent, `.phase4-positive-${randomUUID()}-`));
  try {
    return await callback(writePositiveBundle(directory, production, options), directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("Phase 4 records the four literal plan criteria with an honest unweighted result", async () => {
  assert.equal(await validatePhase4ExitStatus(record), record);
  assert.equal(record.completedCriteria, 4);
  assert.equal(record.percentage, 100);
  const reporting = record.exitCriteria.find((item) => item.id === "published-match-and-non-match-rates");
  assert.equal(reporting?.status, "pass");
  // The 2026-09-26 run is admitted, published and released; the outside review was retired, not completed.
  assert.match(reporting?.reason ?? "", /admitted, published on the methods page in both languages, and released/);
  assert.match(reporting?.reason ?? "", /retired by the owner/);
  for (const path of [
    "data/phase4-provincial-matching-report.json",
    "data/phase4-provincial-matching-admission-2026-09-26.json",
    "data/phase4-provincial-matching-publication-2026-09-26.json",
    "data/phase4-provincial-matching-release-2026-09-26.json",
    "lib/phase4/methods-matching-en.ts",
    "lib/phase4/methods-matching-fr.ts",
  ]) assert.equal(reporting?.evidence.some((item) => item.path === path), true, path);
  assert.deepEqual(record.checkpoints.map((item) => [item.id, item.status]), [["rights-and-admission", "pass"]]);
  assert.deepEqual(record.removedCheckpoints, [{ id: "outside-provincial-review", decision: "data/phase-scope-decision-2026-09-26.json" }]);
});

test("Phase 4 rejects a tampered percentage, criteria, or checksum", async () => {
  await assert.rejects(validatePhase4ExitStatus({ ...record, percentage: 50 }), /unweighted/);
  await assert.rejects(validatePhase4ExitStatus({ ...record, exitCriteria: record.exitCriteria.map((item, index) => index === 0 ? { ...item, id: "rights" } : item) }), /exactly match/);
  await assert.rejects(validatePhase4ExitStatus({ ...record, exitCriteria: record.exitCriteria.map((item, index) => index === 0 ? { ...item, evidence: [{ ...item.evidence[0], sha256: "0".repeat(64) }] } : item) }), /checksum/);
});

test("Phase 4 needs the scope decision to drop the outside review", async () => {
  // Without the retirement the removed checkpoint is refused outright.
  await assert.rejects(validatePhase4ExitStatus(record, reviewDecision), /removed checkpoints must match/);
  // Restoring the review checkpoint does not help: the bundle names no review.
  const restored = {
    ...record,
    removedCheckpoints: [],
    checkpoints: [...record.checkpoints, { ...record.checkpoints[0], id: "outside-provincial-review", title: "Outside provincial review" }],
  };
  await assert.rejects(validatePhase4ExitStatus(restored, reviewDecision), /semantic evidence/);
});

test("Phase 4 evidence paths are relative regular files, not symlinks", async () => {
  const absolutePath = {
    ...record,
    exitCriteria: record.exitCriteria.map((criterion, index) => index === 0
      ? { ...criterion, evidence: [{ ...criterion.evidence[0], path: "/etc/hosts", sha256: "0".repeat(64) }] }
      : criterion),
  };
  await assert.rejects(validatePhase4ExitStatus(absolutePath), /repository-relative/);

  const directoryPath = {
    ...record,
    exitCriteria: record.exitCriteria.map((criterion, index) => index === 0
      ? { ...criterion, evidence: [{ ...criterion.evidence[0], path: "scripts", sha256: "0".repeat(64) }] }
      : criterion),
  };
  await assert.rejects(validatePhase4ExitStatus(directoryPath), /regular non-symlink/);

  const linkPath = join(fileURLToPath(new URL("../", import.meta.url)), "tests", `.phase4-evidence-${randomUUID()}`);
  symlinkSync("../lib/events/normalize.ts", linkPath);
  try {
    const symlinkEvidence = {
      ...record,
      exitCriteria: record.exitCriteria.map((criterion, index) => index === 0
        ? { ...criterion, evidence: [{ ...criterion.evidence[0], path: "tests/" + linkPath.split("/tests/")[1], sha256: "0".repeat(64) }] }
        : criterion),
    };
    await assert.rejects(validatePhase4ExitStatus(symlinkEvidence), /regular non-symlink/);
  } finally {
    unlinkSync(linkPath);
  }
});

test("Phase 4 accepts a fully bound admitted-production 4/4 completion path", async () => {
  await withPositiveFixture(true, async (bundleEvidence) => {
    const complete = completeRecord(bundleEvidence);
    assert.equal(await validatePhase4ExitStatus(complete, reviewDecision), complete);
    assert.equal(complete.completedCriteria, 4);
    assert.equal(complete.percentage, 100);
    assert.equal(complete.checkpoints.every((checkpoint) => checkpoint.status === "pass"), true);
  });
});

test("Phase 4 accepts an admitted bundle without a review once the review is retired", async () => {
  await withPositiveFixture(true, async (bundleEvidence) => {
    const retired = retiredRecord(bundleEvidence);
    assert.equal(await validatePhase4ExitStatus(retired), retired);
    // The same bundle does not satisfy the review-required path.
    await assert.rejects(validatePhase4ExitStatus(completeRecord(bundleEvidence), reviewDecision), /semantic evidence/);
  }, { retired: true });
  // A release that still names a review is refused once the review is retired,
  // so a retired requirement is never recorded as met.
  await withPositiveFixture(true, async (bundleEvidence) => {
    await assert.rejects(validatePhase4ExitStatus(retiredRecord(bundleEvidence)), /semantic evidence/);
  });
});

test("Phase 4 rejects a nonproduction numeric report and checkpoint/status tampering", async () => {
  await withPositiveFixture(false, async (bundleEvidence) => {
    const nonproduction = completeRecord(bundleEvidence);
    await assert.rejects(validatePhase4ExitStatus(nonproduction, reviewDecision), /semantic evidence/);
  });
  await withPositiveFixture(true, async (bundleEvidence) => {
    const complete = completeRecord(bundleEvidence);
    const blockedCheckpoint = { ...complete, checkpoints: complete.checkpoints.map((checkpoint, index) => index === 0 ? { ...checkpoint, status: "blocked" } : checkpoint) };
    await assert.rejects(validatePhase4ExitStatus(blockedCheckpoint, reviewDecision), /checkpoint status/);
    const brokenBinding = { ...complete, exitCriteria: complete.exitCriteria.map((criterion) => criterion.id === "published-match-and-non-match-rates" ? { ...criterion, evidence: criterion.evidence.map((item, index) => index === 7 ? { ...item, sha256: "0".repeat(64) } : item) } : criterion) };
    await assert.rejects(validatePhase4ExitStatus(brokenBinding, reviewDecision), /checksum/);
  });
});

test("Phase 4 rejects thin owner/reviewer records and placeholder identities in durable evidence", async () => {
  await withPositiveFixture(true, async (bundleEvidence) => {
    const complete = completeRecord(bundleEvidence);
    const wrongTitle = { ...complete, checkpoints: complete.checkpoints.map((checkpoint) => ({ ...checkpoint, title: "wrong title" })) };
    await assert.rejects(validatePhase4ExitStatus(wrongTitle, reviewDecision), /titles/);
  });
  await withPositiveFixture(true, async (bundleEvidence) => {
    await assert.rejects(validatePhase4ExitStatus(completeRecord(bundleEvidence), reviewDecision), /semantic evidence/);
  }, {
    parent: "scripts",
    ownerDecision: {
      isHuman: true,
      name: "Example Owner",
      role: "Content and data owner",
      decision: "approve",
      decidedAt: "2026-08-26T03:00:00Z",
      rationale: "The owner approved this exact provincial matching run and its named BC/QC production scope after reviewing the method and release boundary.",
    },
  });
  await withPositiveFixture(true, async (bundleEvidence) => {
    await assert.rejects(validatePhase4ExitStatus(completeRecord(bundleEvidence), reviewDecision), /semantic evidence/);
  }, {
    parent: "scripts",
    reviewers: [
      { id: "bc-reviewer-1", province: "BC", isHuman: true, name: "Test Reviewer", affiliation: "British Columbia forest data review practice", role: "Independent provincial forestry reviewer", qualification: "Forest inventory and remote-sensing review qualification", reviewedAt: "2026-08-26T04:00:00Z", independent: true, noConflict: true, decision: "approved", findings: "The BC presentation preserves the source event meaning, coverage boundary, and uncertainty without overstating matching results.", notes: "Reviewed the published method, provincial scope, and representative result rows; no blocking BC representation issue remains." },
      { id: "qc-reviewer-1", province: "QC", isHuman: true, name: "Jean Tremblay", affiliation: "Quebec forest information review practice", role: "Independent provincial forestry reviewer", qualification: "Québec inventory and remote-sensing review qualification", reviewedAt: "2026-08-26T04:30:00Z", independent: true, noConflict: true, decision: "approved", findings: "The QC presentation preserves the source event meaning, coverage boundary, and uncertainty without overstating matching results.", notes: "Reviewed the bilingual method, provincial scope, and representative result rows; no blocking QC representation issue remains." },
    ],
  });
});
