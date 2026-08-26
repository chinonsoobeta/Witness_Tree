import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1DownstreamAdmissionPacket } from "../scripts/check-phase1-downstream-admission-packet.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = () => JSON.parse(readFileSync(new URL("../data/phase1-downstream-admission-packet.json", import.meta.url), "utf8"));

test("binds every audited spec record while exposing only the seven ready transformation scopes", async () => {
  const packet = read();
  await validatePhase1DownstreamAdmissionPacket(packet, root);
  const ready = packet.bundles.filter(({ technicalReadiness }) => technicalReadiness === "ready-for-owner-approve-reject-defer-transformation-scope");
  assert.deepEqual(ready.map(({ id }) => id), ["ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height", "federal-electoral", "qc-current-ecoforest", "qc-original-current-inventory"]);
  assert.equal(packet.specificationBindings.length, 15);
  assert.equal(packet.bundles.find(({ id }) => id === "qc-fourth-inventory").technicalReadiness, "blocked-named-prerequisites");
});

test("rejects approval claims, a missing row, and evidence-binding drift", async () => {
  const approval = read(); approval.claims.productionAdmission = true;
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(approval, root));
  const missing = read(); missing.bundles[0].rows.pop();
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(missing, root));
  const drift = read(); drift.evidenceBindings["data/phase1-production-source-ledger.json"] = "0".repeat(64);
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(drift, root), /Checksum binding drift|boundLedgerSha256/);
  const unbound = read(); unbound.specificationBindings[0].sha256 = "f".repeat(64);
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(unbound, root), /Specification checksum binding drift/);
  const premature = read(); premature.bundles.find(({ id }) => id === "qc-fourth-inventory").ownerDecisionNow = "Approve, reject, or defer this transformation.";
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(premature, root));
});
