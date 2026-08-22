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
    "remote-verified-archived-profiled": 7,
    "local-verified-profiled": 9,
    "partial-component": 2,
    "access-blocked": 13,
  });
  assert.equal(state.ledger.rawEvidenceNumerator, 14.25);
  assert.equal(state.ledger.formalEvidenceTrackingPercentage, 38.7903226);
  assert.equal(state.ledger.immutableArchiveCompleteRows, 7);
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
  assert.match(combined, /14\.25\/31 raw credits/i);
  assert.match(combined, /38\.7903226% formal evidence tracking/i);
  assert.match(combined, /7 immutable rows/i);
  assert.match(combined, /0\/6 machine-verifiable and 6\/6 attested-only/i);
});

test("all canonical summaries label superseded Phase 1 totals as historical", () => {
  const stale = /14\.75\/31|15\.00\/31|39\.516129%|(?:11\/31.{0,50}immutable|immutable.{0,50}11\/31)|10 immutable rows|owner gate is 4\/6/i;
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
  assert.doesNotMatch(output, /remains 14\.75\/31/i);
  assert.match(output, /14\.25\/31 raw credits/);
  assert.match(output, /38\.7903226% formal evidence tracking/);
  assert.match(output, /7\/31 immutable/);
  assert.match(output, /0\/31 production admitted or eligible/);
});

test("remaining implementation gaps cover the exact production ledger", () => {
  const ledger = read("data/phase1-production-source-ledger.json");
  const audit = read("data/phase1-remaining-actions-audit.json");
  const gapRows = [...new Set(audit.localImplementationAudit.gaps.flatMap(({ rows }) => rows))].sort();
  assert.equal(gapRows.length, 31);
  assert.deepEqual(gapRows, ledger.entries.map(({ id }) => id).sort());
});
