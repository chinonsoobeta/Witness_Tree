// The shared inventory of tests that portable CI cannot execute.
//
// It lives in its own module because scripts/run-ci-tests.mjs executes the whole
// suite at import time, and scripts/check-data-root-test-currency.mjs needs the
// same inventory without running anything.

// The Witness Tree data root lives on the owner's SSD and cannot exist on a runner.
export const REQUIRES_DATA_ROOT = new Map([
  ["phase1-owner-decision-queue.test.mjs", "Reads recorded artifacts under the data root to confirm the queue matches bytes on disk."],
  ["phase1-phase3-owner-approvals.test.mjs", "Resolves approval evidence paths through the data root."],
  ["wildfire-derived-readback.test.mjs", "Reads derived wildfire outputs from the data root."],
  ["federal-electoral-approved-promotion.test.mjs", "Resolves the approved data root at module load through approvedDataRootRealPath, and drives the promotion runner against it."],
  ["phase1-federal-electoral-output-verification.test.mjs", "Verifies the federal electoral GeoPackage under the data root, including a byte-for-byte deterministic regeneration."],
  ["phase1-nrcan-cover-processing-gate.test.mjs", "Profiles the NRCan canopy cover raster from the data root."],
  ["phase2-v21-expert-review-evidence.test.mjs", "Reads raw/nrcan-ca-forest-harvest-1985-2022 from the data root."],
  ["phase2-v21-real-review-packet-raster-readback-evidence.test.mjs", "Reads derived/phase2-v21-review-packet-v2 from the data root."],
  ["phase1-bc-ontario-row-audit.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-current-state-completion-audit.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-production-source-ledger.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-source-ledger-decision-readiness.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-ntems-readback-bytes.test.mjs", "Reads raw/nrcan-ca-forest-harvest-1985-2022 from the data root."],
  ["phase2-real-comparison-availability.test.mjs", "Its checker opens comparison inputs under the data root."],
  ["phase2-v21-real-review-packet.test.mjs", "Its checker opens the v21 review packet under the data root."],
  ["nfd-harvest-statistics.test.mjs", "Reads and re-derives the checksum-bound official NFD CSV profile from the owner SSD data root."],
  ["phase1-approved-promotion-runner.test.mjs", "Drives run-phase1-approved-promotion.sh, which resolves the data root."],
  ["alberta-plvi-immutable-promotion-preparation.test.mjs", "Drives run-alberta-plvi-approved-promotion.sh, which resolves the data root."],
  ["current-wildfire-immutable-promotion-preparation.test.mjs", "Drives run-current-wildfire-approved-promotion.sh, which resolves the data root."],
  ["phase1-remaining-actions-audit.test.mjs", "Its checker resolves recorded artifacts through the data root."],
  ["qc-ecoforest-reconciliation.test.mjs", "Resolves the data root and reconciles against bytes under it."],
  ["qc-immutable-promotion-preparation.test.mjs", "Resolves the data root and prepares against bytes under it."],
  ["qc-reconciled-main-runner.test.mjs", "Resolves the data root and runs against bytes under it."],
  ["wildfire-derived-recovery.test.mjs", "Reads derived wildfire outputs from the data root."],
  ["wildfire-derived-recovery-owner-wrapper.test.mjs", "Resolves the data root before invoking the recovery runner."],
]);

// These drive owner-run zsh runners written for the owner's macOS device. They
// depend on BSD tooling and macOS file ownership or mode semantics, so Linux CI
// cannot execute them without changing the environment they are meant to test.
export const REQUIRES_MACOS_RUNNER = new Map([
  ["archive-existing-key-recovery.test.mjs", "archive-existing-key-recovery.sh reads sizes with the BSD-only `stat -f %z`."],
  ["phase1-archive-owner-exercise.test.mjs", "Drives run-phase1-archive-owner-exercise.sh, which depends on macOS shell tooling."],
  ["phase1-canopy-completion-recovery.test.mjs", "Asserts on an attestation failure that a macOS owner-and-mode-600 check reaches first."],
]);

export const TEST_REQUIREMENTS = Object.freeze({
  dataRoot: "data-root",
  macosRunner: "macos-runner",
});

export const OWNER_BOUND_TEST_GROUPS = Object.freeze([
  Object.freeze({ requirement: TEST_REQUIREMENTS.dataRoot, tests: REQUIRES_DATA_ROOT }),
  Object.freeze({ requirement: TEST_REQUIREMENTS.macosRunner, tests: REQUIRES_MACOS_RUNNER }),
]);

export function ownerBoundTestInventory() {
  const inventory = new Map();
  for (const { requirement, tests } of OWNER_BOUND_TEST_GROUPS) {
    for (const [name, reason] of tests) {
      if (inventory.has(name)) throw new Error(`${name} is listed under more than one owner-bound test requirement`);
      inventory.set(name, Object.freeze({ requirement, reason }));
    }
  }
  return new Map([...inventory].sort(([left], [right]) => left.localeCompare(right)));
}

// Where the owner-local run of those tests records what it proved. Declared here,
// not in the runner, so the CI-side currency gate can read the receipt without
// importing a module that resolves the data root.
export const RECEIPT_PATH = "data/data-root-test-run-receipt.json";
export const RECEIPT_SCHEMA = "witness-tree/data-root-test-run-receipt/2";
