import assert from "node:assert/strict";
import test from "node:test";
import { validatePhase1ArchiveOwnerCommandReconciliation } from "../scripts/check-phase1-archive-owner-command-reconciliation.mjs";

test("owner command reconciliation keeps national and Quebec execution blocked", () => {
  const record = validatePhase1ArchiveOwnerCommandReconciliation();
  assert.equal(record.national.liveFacts.canopyHeight, "primary and recovery prefixes empty");
  assert.equal(record.national.liveFacts.federalElectoralDistricts, "primary and recovery prefixes empty");
  assert.equal(record.quebecCurrentOriginal.liveFacts, "both planned prefixes are empty on the primary and recovery buckets");
  assert.equal(record.quebecFourth.liveFacts, "planned prefix is empty on the primary and recovery buckets");
});

test("owner command record contains no provider version values", () => {
  const record = validatePhase1ArchiveOwnerCommandReconciliation();
  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /["']versionId["']\s*:/i);
  assert.doesNotMatch(serialized, /["']VersionId["']\s*:/i);
});
