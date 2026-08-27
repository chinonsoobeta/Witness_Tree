import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1DownstreamAdmissionPacket } from "../scripts/check-phase1-downstream-admission-packet.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = () => JSON.parse(readFileSync(new URL("../data/phase1-downstream-admission-packet.json", import.meta.url), "utf8"));
const registryUrl = new URL("../data/phase1-transformation-spec-registry.json", import.meta.url);
const readRegistry = () => JSON.parse(readFileSync(registryUrl, "utf8"));

// Specification checksums live in a registry the validator reads from disk, so a
// drift case cannot be produced by mutating the packet in memory any more. The
// original bytes are captured and restored in a finally block, so a failing
// assertion still leaves the working tree exactly as it was found.
async function withTamperedRegistry(mutate, assertion) {
  const original = readFileSync(registryUrl, "utf8");
  try {
    const tampered = JSON.parse(original);
    mutate(tampered);
    writeFileSync(registryUrl, `${JSON.stringify(tampered, null, 2)}\n`);
    await assertion();
  } finally {
    writeFileSync(registryUrl, original);
  }
}

test("binds every audited spec record while exposing only the seven ready transformation scopes", async () => {
  const packet = read();
  await validatePhase1DownstreamAdmissionPacket(packet, root);
  const ready = packet.bundles.filter(({ technicalReadiness }) => technicalReadiness === "ready-for-owner-approve-reject-defer-transformation-scope");
  assert.deepEqual(ready.map(({ id }) => id), ["ntems-annual-land-cover", "ntems-forest-harvest", "ntems-canopy-cover", "ntems-canopy-height", "federal-electoral", "qc-current-ecoforest", "qc-original-current-inventory"]);
  assert.equal(readRegistry().specificationBindings.length, 15);
  assert.equal(packet.bundles.find(({ id }) => id === "qc-fourth-inventory").technicalReadiness, "blocked-named-prerequisites");
});

test("rejects approval claims, a missing row, and evidence-binding drift", async () => {
  const approval = read(); approval.claims.productionAdmission = true;
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(approval, root));
  const missing = read(); missing.bundles[0].rows.pop();
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(missing, root));
  const drift = read(); drift.evidenceBindings["data/phase1-production-source-ledger.json"] = "0".repeat(64);
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(drift, root), /Checksum binding drift|boundLedgerSha256/);
  await withTamperedRegistry(
    (registry) => { registry.specificationBindings[0].sha256 = "f".repeat(64); },
    () => assert.rejects(validatePhase1DownstreamAdmissionPacket(read(), root), /Specification checksum binding drift/),
  );
  const premature = read(); premature.bundles.find(({ id }) => id === "qc-fourth-inventory").ownerDecisionNow = "Approve, reject, or defer this transformation.";
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(premature, root));
});
