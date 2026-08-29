import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePhase1DownstreamAdmissionPacket } from "../scripts/check-phase1-downstream-admission-packet.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = () => JSON.parse(readFileSync(new URL("../data/phase1-downstream-admission-packet.json", import.meta.url), "utf8"));
const registryUrl = new URL("../data/phase1-transformation-spec-registry.json", import.meta.url);
const readRegistry = () => JSON.parse(readFileSync(registryUrl, "utf8"));

// Specification checksums live in a registry the validator reads from disk, so a
// drift case cannot be produced by mutating the packet in memory any more. The
// tampered bytes are therefore written into a throwaway root rather than over the
// repository's own file: `node --test` runs test files in parallel processes, and
// four other test files copy or read that exact registry out of the repository, so
// an in-place tamper made them read the sentinel checksum and fail with an
// unrelated "scope specification checksum drift" for however long the window was
// open. The validator resolves everything it reads through its `root` argument,
// and every one of those paths is under `data/`, so the throwaway root only needs
// a `data/` directory: each entry is symlinked back to the repository, except the
// registry, which is a real file holding the tampered bytes.
async function withTamperedRegistry(mutate, assertion) {
  const repoData = path.join(root, "data");
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "downstream-packet-registry-"));
  try {
    const temporaryData = path.join(temporaryRoot, "data");
    mkdirSync(temporaryData);
    const registryName = path.basename(registryUrl.pathname);
    for (const entry of readdirSync(repoData)) {
      if (entry !== registryName) symlinkSync(path.join(repoData, entry), path.join(temporaryData, entry));
    }
    const tampered = JSON.parse(readFileSync(registryUrl, "utf8"));
    mutate(tampered);
    writeFileSync(path.join(temporaryData, registryName), `${JSON.stringify(tampered, null, 2)}\n`);
    await assertion(temporaryRoot);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
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
    (tamperedRoot) => assert.rejects(validatePhase1DownstreamAdmissionPacket(read(), tamperedRoot), /Specification checksum binding drift/),
  );
  const premature = read(); premature.bundles.find(({ id }) => id === "qc-fourth-inventory").ownerDecisionNow = "Approve, reject, or defer this transformation.";
  await assert.rejects(validatePhase1DownstreamAdmissionPacket(premature, root));
});
