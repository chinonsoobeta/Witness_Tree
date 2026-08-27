import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validatePhase1ImmutablePromotionReadiness } from "../scripts/check-phase1-immutable-promotion-readiness.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const args = [read("data/phase1-immutable-promotion-readiness.json"), read("data/phase1-production-source-ledger.json"), read("data/phase1-local-profiled-promotion-preparation.json"), read("data/current-wildfire-immutable-promotion-preparation.json"), read("data/current-wildfire-owner-admission.json"), read("data/qc-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-evidence.json"), read("data/qc-fourth-inventory-immutable-promotion-preparation.json"), read("data/qc-fourth-inventory-immutable-promotion-iam-policy.json"), read("data/phase1-phase3-owner-approvals-2026-08-21.json"), read("data/phase1-nbac-profile-2026-08-27.json"), read("data/phase1-nbac-owner-authorization-2026-08-27.json"), read("data/nbac-immutable-promotion-preparation.json"), read("data/nbac-archive-iam-applied-2026-08-27.json")];

test("immutable-promotion readiness accounts for every local-profiled row without duplicate work", () => {
  assert.equal(validatePhase1ImmutablePromotionReadiness(...args), args[0]);
  assert.equal(args[0].coveredProductionRowIds.length, 10);
  assert.equal(args[0].physicalArtifactGroups.find((group) => group.id === "national-two-artifacts").physicalArtifactCount, 1);
  assert.equal(args[0].physicalArtifactGroups.find((group) => group.id === "current-wildfire-six-release-inputs").physicalArtifactCount, 6);
  assert.equal(args[0].physicalArtifactGroups.find((group) => group.id === "nbac-1972-2025").physicalArtifactCount, 1);
});

test("recorded approvals stay fail-closed without owner execution and remote evidence", () => {
  const missing = structuredClone(args[0]); missing.physicalArtifactGroups.at(-1).status = "unprepared-fail-closed";
  assert.throws(() => validatePhase1ImmutablePromotionReadiness(missing, ...args.slice(1)));
  const claim = structuredClone(args[0]); claim.claims.immutableObjectStorage = true;
  assert.throws(() => validatePhase1ImmutablePromotionReadiness(claim, ...args.slice(1)));
  const remote = structuredClone(args[7]); remote.claims.remoteObjectsExist = true;
  assert.throws(() => validatePhase1ImmutablePromotionReadiness(args[0], ...args.slice(1, 7), remote, ...args.slice(8)));
});

test("exact approval rows, commands, mode, and date reject plausible mutations", () => {
  const mutations = [
    (copy) => { copy.phase1.archiveApprovals[0].rows = []; },
    (copy) => { copy.phase1.archiveApprovals[0].rows = ["fed-2023-ridings", "made-up-row"]; },
    (copy) => { copy.phase1.archiveApprovals[0].ownerCommand = "zsh scripts/run-phase1-approved-promotion.sh --run"; },
    (copy) => { copy.phase1.archiveApprovals[1].preflight += " --plausible"; },
    (copy) => { copy.phase1.archiveApprovals[2].ownerCommandTemplate = copy.phase1.archiveApprovals[2].ownerCommandTemplate.replace("--session-ready", "--session-almost-ready"); },
    (copy) => { copy.phase1.archiveApprovals[2].retention.mode = "GOVERNANCE"; },
    (copy) => { copy.phase1.archiveApprovals[3].retention.retainUntil = "2099-08-12T00:00:00Z"; },
    (copy) => { copy.phase1.archiveApprovals[3].rows.pop(); },
  ];
  for (const mutate of mutations) {
    const approvals = structuredClone(args[9]); mutate(approvals);
    assert.throws(() => validatePhase1ImmutablePromotionReadiness(...args.slice(0, 9), approvals));
  }
});
