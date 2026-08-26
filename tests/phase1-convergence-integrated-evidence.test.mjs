import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const canonicalSummaryFiles = ["data", "docs"].flatMap((root) =>
  readdirSync(new URL(`../${root}`, import.meta.url), { recursive: true })
    .map((file) => `${root}/${file}`)
    .filter((file) => /\.(json|md)$/.test(file)),
);
const currentFacingCodeFiles = ["app", "components", "lib", "scripts"].flatMap((root) =>
  readdirSync(new URL(`../${root}`, import.meta.url), { recursive: true })
    .map((file) => `${root}/${file}`)
    .filter((file) => /\.(mjs|js|ts|tsx)$/.test(file)),
);

test("integrated Phase 1 evidence remains additive and fail-closed across convergence records", () => {
  const state = read("data/phase1-current-state-completion-audit.json");
  const ledger = read("data/phase1-production-source-ledger.json");
  const harvest = read("data/nrcan-harvest-remote-archive-evidence.json");
  const canopy = read("data/nrcan-canopy-height-remote-archive-evidence.json");
  const national = read("data/phase1-national-archive-finalization-audit.json");
  const alternatives = read("data/phase1-bec-public-alternative-exhaustion.json");
  const copyright = read("data/phase1-bc-copyright-permission-form-package.json");
  const replies = read("data/phase1-outreach-reply-audit.json");

  assert.deepEqual(state.ledger.evidenceStateCounts, {
    "remote-verified-archived-profiled": 16,
    "partial-component": 2,
    "access-blocked": 13,
  });
  assert.equal(state.ledger.rawEvidenceNumerator, 16.5);
  assert.equal(state.ledger.formalEvidenceTrackingPercentage, 40.9677419);
  assert.equal(state.ledger.immutableArchiveCompleteRows, 16);
  assert.equal(state.ledger.productionAdmissionCompleteRows, 0);
  assert.equal(state.ledger.productionEligibleRows, 0);

  const harvestRow = ledger.entries.find(({ id }) => id === "ntems-forest-harvest");
  assert.equal(harvestRow.evidenceState, "remote-verified-archived-profiled");
  assert.equal(harvestRow.proof.immutableArchive, true);
  assert.equal(harvestRow.productionEligible, false);
  assert.equal(harvest.claims.ownerSourceLedgerDecision, false);
  assert.equal(harvest.claims.productionEligible, false);
  assert.equal(canopy.claims.immutableArchive, true);
  assert.equal(canopy.claims.ownerSourceAdmission, false);
  assert.equal(canopy.claims.productionEligible, false);

  assert.equal(national.liveReadOnly.multipart.canopy.partCount, 155);
  assert.equal(national.privateResumeState.matchingMode600RecordFoundInControlledRoots, true);
  assert.equal(national.privateResumeState.offlineValidationPassed, true);
  assert.equal(national.privateResumeState.recordContentsRetainedInRepository, false);
  assert.equal(national.privateResumeState.recordIdentifiersRecorded, false);
  assert.equal(national.ownerRun.safeCommandAvailable, false);
  assert.equal(national.ownerRun.command, null);
  assert.deepEqual(national.claims, {
    canopyMultipartFinalized: false,
    federalArtifactPromoted: false,
    harvestPromotionPerformed: false,
    remoteMutationPerformed: false,
    productionEligible: false,
  });

  assert.equal(alternatives.status, "no-complete-public-artifact");
  assert.equal(alternatives.exhaustion.rawEvidenceCreditImpact, 0);
  assert.equal(alternatives.exhaustion.productionEligibilityImpact, 0);
  assert.equal(alternatives.routes.every(({ completeArtifact }) => completeArtifact === false), true);

  assert.deepEqual(copyright.canonicalRowIds, ["bc-vri", "bc-forest-operations-map", "bc-old-growth-bec"]);
  assert.equal(copyright.impact.formsSubmitted, true);
  assert.deepEqual(copyright.impact.submittedCanonicalRowIds, ["bc-forest-operations-map"]);
  assert.equal(copyright.impact.permissionGranted, false);
  assert.equal(copyright.impact.rawEvidenceCreditImpact, 0);
  assert.equal(copyright.formFieldMap.find(({ field }) => field === "websiteSourceUrl").preparedValue, null);
  assert.equal(copyright.formFieldMap.find(({ field }) => field === "websiteNumberOfCopies").preparedValue, null);
  assert.equal(copyright.sourceEvidence.fee.amount, null);
  assert.equal(copyright.sourceEvidence.fee.paid, false);

  assert.equal(replies.counts.substantiveReplyRecords, 8);
  const affectedRows = new Set(replies.substantiveReplies.flatMap(({ canonicalRowIds }) => canonicalRowIds));
  assert.equal(affectedRows.size, 8);
  assert.equal(replies.counts.accessBlockedRowsWithSubstantiveReply, 8);
  assert.equal(replies.counts.partialRowsWithSubstantiveReply, 0);

  for (const file of [
    "data/phase1-archive-live-readback-2026-08-20.json",
    "data/phase1-archive-owner-command-reconciliation-2026-08-20.json",
    "data/current-wildfire-derived-live-recovery-guard-2026-08-20.json",
  ]) assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `${file} must remain integrated`);
});

test("canonical wildfire summaries reject superseded readback and score claims", () => {
  const files = [
    "data/phase1-source-inventory.json",
    "data/phase1-remaining-actions-audit.json",
    "docs/CURRENT_WILDFIRE_IMMUTABLE_PROMOTION.md",
    "docs/PHASE1_ARCHIVE_LIVE_READBACK_2026-08-20.md",
  ];
  const combined = files.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n");
  for (const stale of [
    /primary-live-proof-integrated/i,
    /covers exact-version readback/i,
    /verified primary and recovery readbacks for these four/i,
    /15\.00\/31|39\.516129%|10 immutable rows|owner gate is 4\/6/i,
  ]) assert.doesNotMatch(combined, stale);
  assert.match(combined, /14\.75\/31 raw credits/i);
  assert.match(combined, /39\.2741935% formal evidence tracking/i);
  assert.match(combined, /9 immutable rows/i);
  assert.match(combined, /0\/6 machine-verifiable and 6\/6 attested-only/i);
});

test("all canonical summaries label superseded Phase 1 totals as historical", () => {
  const stale = /15\.00\/31|39\.516129%|10 immutable rows|owner gate is 4\/6/i;
  for (const file of [...canonicalSummaryFiles, ...currentFacingCodeFiles]) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (!stale.test(lines[index])) continue;
      const context = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
      assert.match(context, /\b(historical|older|prior|preceding|at the time)\b/i, `${file}:${index + 1} must label superseded totals as historical`);
    }
  }
});

test("repository-wide current-facing records do not request superseded archive approvals", () => {
  const staleApproval = /fresh owner approval for (?:the exact canopy-height|both exact payloads)|already-prepared-blocked-pending-separate-approvals|ownerRunCommand"\s*:\s*"BLOCKED|remain blocked pending their separate owner approvals|execution remains blocked pending separate exact-artifact|runs remain blocked behind exact preconditions|blocked until all four independent approvals/i;
  for (const file of [...canonicalSummaryFiles, ...currentFacingCodeFiles]) {
    const contents = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const templateSuperseded = file === "data/phase1-owner-approval-packet.json" && /supersededArchiveApprovalState[\s\S]*phase1-phase3-owner-approvals/.test(contents);
    const lines = contents.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      if (!staleApproval.test(lines[index])) continue;
      const context = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
      assert.ok(templateSuperseded || /\b(historical|older|prior|preceding|at the time|supersed)/i.test(context), `${file}:${index + 1} has a stale current approval requirement`);
    }
  }
});

test("owner packet current action order executes recorded approvals instead of requesting them again", () => {
  const packet = readFileSync(new URL("../docs/PHASE1_OWNER_APPROVAL_PACKET.md", import.meta.url), "utf8");
  assert.doesNotMatch(packet, /## Simplest owner action order/);
  const currentOrder = packet.split("## Current owner execution and readback order")[1]?.split("## Dependency-order copy/paste blocks")[0] ?? "";
  assert.match(currentOrder, /archive approval is recorded/i);
  assert.match(currentOrder, /all four approvals are recorded/i);
  assert.match(currentOrder, /normal archive-control exercise approval is also recorded/i);
  assert.doesNotMatch(currentOrder, /\|\s*[1-6]\s*\|\s*Approve\b/i);
});

test("current-facing Phase 1 docs cannot regress to pre-QC archive state", () => {
  const completion = readFileSync(new URL("../docs/PHASE1_CURRENT_STATE_COMPLETION_AUDIT.md", import.meta.url), "utf8");
  const downstream = readFileSync(new URL("../docs/PHASE1_IMMUTABLE_DOWNSTREAM_PREFLIGHT.md", import.meta.url), "utf8");
  const readiness = readFileSync(new URL("../docs/PHASE1_IMMUTABLE_PROMOTION_READINESS.md", import.meta.url), "utf8");
  const packet = readFileSync(new URL("../docs/PHASE1_OWNER_APPROVAL_PACKET.md", import.meta.url), "utf8");
  const remaining = readFileSync(new URL("../docs/PHASE1_REMAINING_ACTIONS_AUDIT.md", import.meta.url), "utf8");
  const approvals = readFileSync(new URL("../docs/PHASE1_PHASE3_OWNER_APPROVALS_2026-08-21.md", import.meta.url), "utf8");
  const qcPreparation = readFileSync(new URL("../docs/QC_IMMUTABLE_PROMOTION_PREPARATION.md", import.meta.url), "utf8");

  assert.match(completion, /Fifteen remotely archived rows/);
  assert.doesNotMatch(completion, /Five locally verified rows/);
  assert.doesNotMatch(completion, /Seven remotely archived rows|Seven locally verified rows/);
  assert.match(downstream, /audits all nine remotely archived Phase 1 rows/);
  assert.match(downstream, /Eight rows remain blocked/);
  assert.doesNotMatch(downstream, /audits all seven remotely archived Phase 1 rows|Six rows remain blocked/);
  assert.match(readiness, /seven current `local-verified-profiled` rows plus the two remotely verified Québec/);
  assert.doesNotMatch(readiness, /all 9 current `local-verified-profiled`/);

  const currentOrder = packet.split("## Current owner execution and readback order")[1]?.split("## Dependency-order copy/paste blocks")[0] ?? "";
  assert.doesNotMatch(currentOrder, /active Québec current\/original run|capture and validate its private\/redacted|\+0\.50[^\n]*\+2\/31[^\n]*Québec/i);
  assert.doesNotMatch(packet, /DO_NOT_RUN=zsh scripts\/run-qc-approved-multipart-promotion\.sh --run/);
  assert.doesNotMatch(remaining, /derived from the authoritative Phase 1 convergence records at `4466a14`|Québec current\/original archive promotion and attestation|Complete the owner-local run, then capture/);
  assert.match(remaining, /reconciled through Phase 1 evidence head `9bf5baa2ecc51ce4c039531e798bfb6418e3baaf`/);
  assert.match(remaining, /remaining seven gap groups/);
  assert.doesNotMatch(remaining, /remaining six gap groups/);

  for (const contents of [approvals, qcPreparation]) {
    assert.doesNotMatch(contents, /zsh scripts\/run-qc-approved-multipart-promotion\.sh --run/);
    assert.doesNotMatch(contents, /attestation[^\n]{0,80}(?:intentionally )?pending|IAM is ready, but no S3 call|next storage step remains owner-local/i);
  }
  assert.match(approvals, /no-execution statement is historical[\s\S]*Québec current\/original was later run, verified, retained, and integrated/i);
  assert.match(qcPreparation, /Current status:[\s\S]*redacted attestation is integrated[\s\S]*Do not repeat the upload or attestation capture/i);
  assert.match(qcPreparation, /mode-600 private pair remains outside Git/i);
  assert.doesNotMatch(qcPreparation, /A separate owner decision is still required to record archival admission in the source ledger\./i);
  assert.match(qcPreparation, /Québec source-ledger decisions are already recorded[\s\S]*only downstream transformation, ingestion, release, and production decisions remain/i);
  assert.match(packet, /Five rows have supplied non-admitting scope decisions:[^\n]*two national rows and two Québec current\/original rows[^\n]*Alberta PLVI/i);
});

test("canonical summaries retain the FOM-only submitted state without implying permission", () => {
  const combined = canonicalSummaryFiles.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n");
  for (const stale of [
    /copyright form is unsent/i,
    /shared copyright form is unsent/i,
    /unsent BC copyright form package/i,
    /seven substantive replies/i,
    /FOM[^\n]{0,80}draft[^\n]{0,40}not sent/i,
  ]) assert.doesNotMatch(combined, stale);
  assert.match(combined, /FOM-only form[^\n]{0,120}(?:submitted|submission)/i);
  assert.match(combined, /permission and (?:authorized )?access remain pending/i);
});

test("partial-ledger outreach checker reports only the current canonical totals", () => {
  const output = execFileSync(process.execPath, [new URL("../scripts/check-partial-ledger-owner-review-outreach.mjs", import.meta.url).pathname], { encoding: "utf8" });
  assert.match(output, /14\.75\/31 raw credits/);
  assert.match(output, /39\.2741935% formal evidence tracking/);
  assert.match(output, /9\/31 immutable/);
  assert.match(output, /0\/31 production admitted or eligible/);
});

test("remaining implementation gaps cover the exact production ledger", () => {
  const ledger = read("data/phase1-production-source-ledger.json");
  const audit = read("data/phase1-remaining-actions-audit.json");
  const gapRows = [...new Set(audit.localImplementationAudit.gaps.flatMap(({ rows }) => rows))].sort();
  assert.equal(gapRows.length, 31);
  assert.deepEqual(gapRows, ledger.entries.map(({ id }) => id).sort());
});
