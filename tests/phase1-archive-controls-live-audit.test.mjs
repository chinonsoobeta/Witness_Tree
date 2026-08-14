import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1ArchiveControlsLiveAudit } from "../scripts/check-phase1-archive-controls-live-audit.mjs";

const record = JSON.parse(readFileSync(new URL("../data/phase1-archive-controls-live-audit.json", import.meta.url), "utf8"));

test("live archive-control audit is redacted, blocked, and approval-gated", () => {
  assert.equal(validatePhase1ArchiveControlsLiveAudit(record), record);
  assert.throws(() => validatePhase1ArchiveControlsLiveAudit({ ...record, productionEligible: true }), /non-production/);
  assert.throws(() => validatePhase1ArchiveControlsLiveAudit({ ...record, remediation: record.remediation.map((item) => item.id === "access-logging" ? { ...item, approvalRequired: false } : item) }), /require approval/);
  assert.throws(() => validatePhase1ArchiveControlsLiveAudit({ ...record, observed: { ...record.observed, lifecycle: "configured" } }), /explicit/);
});
