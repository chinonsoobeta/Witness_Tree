import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { historicalNfdOutcome, validateAudit, verifyAudit } from "../scripts/check-phase2-nfd-official-recovery-audit.mjs";

const auditPath = new URL("../data/phase2-nfd-official-recovery-audit-2026-08-27.json", import.meta.url);

function readAudit() {
  return JSON.parse(readFileSync(auditPath, "utf8"));
}

function writeTemporaryAudit(audit) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "witness-tree-nfd-recovery-audit-"));
  const file = path.join(directory, "audit.json");
  writeFileSync(file, `${JSON.stringify(audit)}\n`, { mode: 0o600 });
  return { directory, file };
}

test("the official NFD recovery audit is structurally valid and retains all 118 rows as pending", () => {
  const result = verifyAudit({ auditPath });

  assert.equal(result.externalVerified, false);
  assert.equal(result.audit.status, "completed-no-safe-exact-replacements");
  assert.equal(result.audit.target.pendingRows, 118);
  assert.deepEqual(result.audit.target.byProvince, { BC: 30, AB: 30, ON: 29, QC: 29 });
  assert.deepEqual(result.audit.summary, {
    officialCandidateCoverageRows: 118,
    historicalAllTenureRoundedCandidateRows: 104,
    laterLimitedScopeCandidateRows: 14,
    safeExactReplacementRows: 0,
    remainingPendingRows: 118,
  });
  assert.equal(result.audit.claims.recoveryPassComplete, true);
  assert.equal(result.audit.claims.missingValuesImputed, false);
  assert.equal(result.audit.claims.nfdRowsReplaced, false);
  assert.equal(result.audit.claims.formalIndependentComparisonGateComplete, false);
  assert.equal(result.audit.claims.productionEligible, false);
});

test("the audit rejects inflated replacement and downstream phase claims", () => {
  const mutations = [
    ["an exact replacement period", (audit) => { audit.periodFindings[0].safeExactReplacement = true; }],
    ["a nonzero replacement count", (audit) => { audit.summary.safeExactReplacementRows = 118; }],
    ["an imputation claim", (audit) => { audit.claims.missingValuesImputed = true; }],
    ["an NFD replacement claim", (audit) => { audit.claims.nfdRowsReplaced = true; }],
    ["a completed independent comparison gate", (audit) => { audit.claims.formalIndependentComparisonGateComplete = true; }],
    ["a publication claim", (audit) => { audit.claims.published = true; }],
    ["an admission claim", (audit) => { audit.claims.admitted = true; }],
    ["a release claim", (audit) => { audit.claims.released = true; }],
    ["a production-eligibility claim", (audit) => { audit.claims.productionEligible = true; }],
  ];

  for (const [label, mutate] of mutations) {
    const candidate = readAudit();
    mutate(candidate);
    assert.throws(() => validateAudit(candidate), undefined, label);
  }
});

test("the audit rejects pending-row, province, period, and summary count drift", () => {
  const mutations = [
    ["pending-row count", (audit) => { audit.target.pendingRows -= 1; }],
    ["province coverage count", (audit) => { audit.target.byProvince.BC -= 1; }],
    ["period row count", (audit) => { audit.periodFindings[0].rowCount -= 1; }],
    ["period boundary", (audit) => {
      audit.periodFindings[0].startYear += 1;
      audit.periodFindings[0].endYear += 1;
    }],
    ["period scope", (audit) => { audit.periodFindings[0].candidateScope = "unknown"; }],
    ["period precision", (audit) => { audit.periodFindings[0].precisionHectares = 0.5; }],
    ["candidate coverage summary", (audit) => { audit.summary.officialCandidateCoverageRows -= 1; }],
    ["remaining-pending summary", (audit) => { audit.summary.remainingPendingRows -= 1; }],
  ];

  for (const [label, mutate] of mutations) {
    const candidate = readAudit();
    mutate(candidate);
    assert.throws(() => validateAudit(candidate), undefined, label);
  }
});

test("candidate coverage accounts for 104 historical and 14 later rows and rejects an unbound candidate", () => {
  const audit = readAudit();
  const rowsByCandidate = audit.periodFindings.reduce((counts, period) => {
    counts[period.candidate] = (counts[period.candidate] ?? 0) + period.rowCount;
    return counts;
  }, {});

  assert.deepEqual(rowsByCandidate, {
    "statcan-table-2.10-2018": 104,
    "nrcan-forest-statistical-profile-f1e8c437": 14,
  });
  assert.equal(validateAudit(audit), audit);

  const unbound = structuredClone(audit);
  unbound.periodFindings[0].candidate = "invented-official-source";
  assert.throws(() => validateAudit(unbound), /candidate is not bound/i);

  const coverageDrift = structuredClone(audit);
  coverageDrift.periodFindings[4].candidate = "statcan-table-2.10-2018";
  assert.throws(() => validateAudit(coverageDrift), /period recovery contract|historical|later|summary|equal/i);
});

test("repository binding path and hash drift fail closed during verification", () => {
  const mutations = [
    ["NFD profile path", (audit) => {
      audit.target.nfdProfile.repositoryPath = audit.target.fractionalComparisonReceipt.repositoryPath;
    }, /NFD profile (?:byte length|SHA-256) differs/i],
    ["NFD profile hash", (audit) => {
      audit.target.nfdProfile.sha256 = "0".repeat(64);
    }, /NFD profile SHA-256 differs/i],
    ["fractional receipt path", (audit) => {
      audit.target.fractionalComparisonReceipt.repositoryPath = audit.target.nfdProfile.repositoryPath;
    }, /fractional comparison receipt (?:byte length|SHA-256) differs/i],
    ["fractional receipt hash", (audit) => {
      audit.target.fractionalComparisonReceipt.sha256 = "0".repeat(64);
    }, /fractional comparison receipt SHA-256 differs/i],
  ];

  for (const [label, mutate, error] of mutations) {
    const candidate = readAudit();
    mutate(candidate);
    const temporary = writeTemporaryAudit(candidate);
    try {
      assert.throws(() => verifyAudit({ auditPath: temporary.file }), error, label);
    } finally {
      rmSync(temporary.directory, { recursive: true, force: true });
    }
  }
});

test("historical NFD findings and parsed unknown semantics fail closed", () => {
  const audit = readAudit();
  audit.officialSources[0].versionFindings[2].completeRowTotals["BC:2019"] += 1;
  assert.throws(() => validateAudit(audit), /completeRowTotals|deep-equal|137243/i);

  const wrongMember = readAudit();
  wrongMember.officialSources[0].versionFindings[0].archiveMember = wrongMember.officialSources[0].versionFindings[1].archiveMember;
  assert.throws(() => validateAudit(wrongMember), /archive-member associations drifted/i);

  const header = "Year,ISO,Area (hectares),Data qualifier\n";
  assert.deepEqual(historicalNfdOutcome(Buffer.from(`${header}2019,BC,,u\n`)), {
    presentTargetRows: 1,
    partialUnknownRows: 1,
    completeRows: 0,
    absentRows: 117,
    unknownCellCount: 1,
    completeRowKeys: [],
    completeRowTotals: {},
  });
  assert.deepEqual(historicalNfdOutcome(Buffer.from(`${header}2019,BC,137243,a\n`)).completeRowTotals, { "BC:2019": 137243 });
});
