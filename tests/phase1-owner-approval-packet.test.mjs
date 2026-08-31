import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPhase1OwnerApprovalPacket } from "../scripts/check-phase1-owner-approval-packet.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("owner approval packet binds all 16 queue rows in dependency order without claims", async () => {
  const packet = await checkPhase1OwnerApprovalPacket();
  assert.equal(packet.rows.length, 16);
  assert.equal(packet.decisionOrder.length, 10);
  assert.equal(packet.status, "template-not-approved");
  assert.equal(packet.claims.ownerApprovalsGranted, false);
  assert.equal(packet.claims.productionEligible, false);
  assert.deepEqual(packet.decisionOrder.map((step) => step.step), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(Object.hasOwn(packet.baseline, "asOf"), false);
});

test("packet rejects row omission, phase collapse, approval claims, and exact-key drift", async () => {
  const original = read("data/phase1-owner-approval-packet.json");

  const omission = structuredClone(original);
  omission.rows = omission.rows.filter((id) => id !== "qc-fourth-inventory");
  await assert.rejects(() => checkPhase1OwnerApprovalPacketWith(omission), /16-row queue|Packet must cover/);

  const phaseCollapse = structuredClone(original);
  delete phaseCollapse.decisionOrder[0].irreversibleArchiveRetention;
  await assert.rejects(() => checkPhase1OwnerApprovalPacketWith(phaseCollapse), /missing irreversibleArchiveRetention/);

  const approval = structuredClone(original);
  approval.claims.ownerApprovalsGranted = true;
  await assert.rejects(() => checkPhase1OwnerApprovalPacketWith(approval), /fail-closed|false/);

  const rewrittenHistoricalBaseline = structuredClone(original);
  rewrittenHistoricalBaseline.baseline.asOf = "2026-08-22";
  await assert.rejects(() => checkPhase1OwnerApprovalPacketWith(rewrittenHistoricalBaseline), /historical owner queue baseline/);

  const keyDrift = structuredClone(original);
  keyDrift.exactBindings["current-wildfire-archive-gate"].objectKeys[0] = "raw/cwfis-current/not-the-approved-key.zip";
  await assert.rejects(() => checkPhase1OwnerApprovalPacketWith(keyDrift), /object keys drifted/);
});

async function checkPhase1OwnerApprovalPacketWith(packet) {
  return checkPhase1OwnerApprovalPacket(undefined, packet);
}
