import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { approvalTemplate, buildEvidence, validateApproval, validateEvidence, validateHead, validateRetention } from "../scripts/check-wildfire-derived-manifest-retention.mjs";
import { expectedObjects } from "../scripts/check-wildfire-derived-recovery.mjs";

const head = (name, version) => ({ ContentLength: expectedObjects()[name].byteLength, ChecksumType: "FULL_OBJECT", ChecksumCRC64NVME: "AAAAAAAAAAA=", VersionId: version });
const retention = () => ({ Retention: { Mode: "COMPLIANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } });
const approved = () => ({ ...approvalTemplate(), status: "owner-approved", approved: true });

test("manifest-retention approval is limited to the two exact manifests", () => {
  const value = approved();
  assert.equal(validateApproval(value), true);
  assert.deepEqual(value.targetObjectNames, ["bcManifest", "ontarioManifest"]);
  value.targetObjectNames.push("bcPayload");
  assert.throws(() => validateApproval(value), /targetObjectNames is not exact/);
});

test("heads and retention fail closed on drift", () => {
  assert.equal(validateHead(head("bcManifest", "bc-manifest-version"), "bcManifest"), true);
  assert.equal(validateRetention(retention(), "bcManifest"), true);
  assert.throws(() => validateHead({ ...head("bcManifest", "v"), ContentLength: 1 }, "bcManifest"), /byte length/);
  assert.throws(() => validateRetention({ Retention: { Mode: "GOVERNANCE", RetainUntilDate: "2033-08-12T00:00:00Z" } }, "bcManifest"), /COMPLIANCE/);
});

test("redacted evidence binds all exact heads and only the two manifest retentions", () => {
  const heads = { bcPayload: head("bcPayload", "bc-payload-version"), bcManifest: head("bcManifest", "bc-manifest-version"), ontarioPayload: head("ontarioPayload", "on-payload-version"), ontarioManifest: head("ontarioManifest", "on-manifest-version") };
  const evidence = buildEvidence(approved(), heads, { bcPayload: retention(), bcManifest: retention(), ontarioPayload: retention(), ontarioManifest: retention() });
  assert.equal(evidence.status, "completed");
  assert.deepEqual(Object.keys(evidence.objectRetention).sort(), ["bcManifest", "bcPayload", "ontarioManifest", "ontarioPayload"]);
  assert.doesNotMatch(JSON.stringify(evidence), /bc-manifest-version|on-manifest-version|AAAAAAAAAAA=/);
});

test("captured owner-run evidence is exact and tamper resistant", () => {
  const evidence = JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-manifest-retention-evidence.json", import.meta.url), "utf8"));
  const approval = JSON.parse(readFileSync(new URL("../data/current-wildfire-derived-manifest-retention-owner-approval.json", import.meta.url), "utf8"));
  assert.equal(validateEvidence(evidence, approval), true);
  assert.throws(() => validateEvidence({ ...evidence, productionEligible: true }, approval), /cannot authorize production/);
});
