import assert from "node:assert/strict";
import test from "node:test";
import { validatePhase1ArchiveOwnerCommandReconciliation } from "../scripts/check-phase1-archive-owner-command-reconciliation.mjs";
import { readFileSync } from "node:fs";
const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const canonicalRecord = read("phase1-archive-owner-command-reconciliation-2026-08-20.json");
const canonicalApprovals = read("phase1-phase3-owner-approvals-2026-08-21.json");

test("owner command reconciliation recognizes approvals but keeps completion blocked", () => {
  const record = validatePhase1ArchiveOwnerCommandReconciliation();
  assert.equal(record.national.historicalObservationsAtCapture.canopyHeight, "primary and recovery prefixes empty");
  assert.match(record.quebecCurrentOriginal.historicalObservationsAtCapture, /2026-08-20.*not a current readback/);
  assert.match(record.quebecFourth.historicalObservationsAtCapture, /2026-08-20.*not a current readback/);
});

test("owner command record contains no provider version values", () => {
  const record = validatePhase1ArchiveOwnerCommandReconciliation();
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /["']versionId["']\s*:/i);
  assert.doesNotMatch(serialized, /["']VersionId["']\s*:/i);
});

test("reconciliation rejects changed commands, controls, and archive exercise claims", () => {
  for (const mutate of [
    (copy) => { copy.national.ownerRunCommand += " --all"; },
    (copy) => { copy.quebecCurrentOriginal.localPreflightCommand = "true"; },
    (copy) => { copy.quebecFourth.requiredApprovals.exactArtifactSet = false; },
    (copy) => { copy.quebecFourth.executeTemplate = copy.quebecFourth.executeTemplate.replace("2033", "2099"); },
    (copy) => { copy.archiveControl.ownerCommand += " --force"; },
    (copy) => { copy.archiveControl.completionEvidence = true; },
  ]) {
    const record = structuredClone(canonicalRecord); mutate(record);
    assert.throws(() => validatePhase1ArchiveOwnerCommandReconciliation(record, canonicalApprovals));
  }
});
