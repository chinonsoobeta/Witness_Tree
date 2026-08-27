// Runs the test suite that CI can actually run.
//
// CI ran four named test files and nothing else, so 190 test files could fail on
// `main` indefinitely. That is not hypothetical: flipping two exit criteria in #62
// left three tests pinning the old counts, and the pull request merged green.
//
// Most of the suite is environment-independent. The files listed below are not,
// for one of exactly two reasons, and each is excluded by name with the specific
// reason attached, so the exclusion stays visible and reviewable instead of being
// implied by an absent glob.
//
// A file may be added here only because it needs the data root or macOS runner
// semantics, and only after checking which. Adding one because it fails is how a
// suite stops meaning anything.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Witness Tree data root lives on the owner's SSD and cannot exist on a runner.
const REQUIRES_DATA_ROOT = new Map([
  ["phase1-owner-decision-queue.test.mjs", "Reads recorded artifacts under the data root to confirm the queue matches bytes on disk."],
  ["phase1-phase3-owner-approvals.test.mjs", "Resolves approval evidence paths through the data root."],
  ["wildfire-derived-readback.test.mjs", "Reads derived wildfire outputs from the data root."],
  ["federal-electoral-approved-promotion.test.mjs", "Resolves the approved data root at module load through approvedDataRootRealPath, and drives the promotion runner against it."],
  ["phase1-federal-electoral-output-verification.test.mjs", "Verifies the federal electoral GeoPackage under the data root, including a byte-for-byte deterministic regeneration."],
  ["phase1-nrcan-cover-processing-gate.test.mjs", "Profiles the NRCan canopy cover raster from the data root."],
  ["phase2-v21-expert-review-evidence.test.mjs", "Reads raw/nrcan-ca-forest-harvest-1985-2022 from the data root."],
  ["phase2-v21-real-review-packet-raster-readback-evidence.test.mjs", "Reads derived/phase2-v21-review-packet-v1 from the data root."],
  ["phase1-bc-ontario-row-audit.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-current-state-completion-audit.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-production-source-ledger.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-source-ledger-decision-readiness.test.mjs", "Stats the admitted federal-electoral GeoPackage under the data root."],
  ["phase1-ntems-readback-bytes.test.mjs", "Reads raw/nrcan-ca-forest-harvest-1985-2022 from the data root."],
  ["phase2-real-comparison-availability.test.mjs", "Its checker opens comparison inputs under the data root."],
  ["phase2-v21-real-review-packet.test.mjs", "Its checker opens the v21 review packet under the data root."],
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

// These drive owner-run zsh runners written for the owner's macOS device against
// real AWS. They use BSD-only tooling such as `stat -f %z` and depend on macOS
// file-mode and ownership semantics, so they cannot pass on a Linux runner. The
// runners are not made portable: they only ever execute on that one machine, and
// rewriting a security-sensitive runner for an environment it never runs in would
// add risk for no benefit.
const REQUIRES_MACOS_RUNNER = new Map([
  ["archive-existing-key-recovery.test.mjs", "archive-existing-key-recovery.sh reads sizes with the BSD-only `stat -f %z`."],
  ["phase1-archive-owner-exercise.test.mjs", "Drives run-phase1-archive-owner-exercise.sh, which depends on macOS shell tooling."],
  ["phase1-canopy-completion-recovery.test.mjs", "Asserts on an attestation failure that a macOS owner-and-mode-600 check reaches first."],
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "tests");
const all = readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort();
const reasonFor = (name) => REQUIRES_DATA_ROOT.get(name) ?? REQUIRES_MACOS_RUNNER.get(name);
const labelFor = (name) => (REQUIRES_DATA_ROOT.has(name) ? "needs data root" : "needs macOS runner");
const excluded = all.filter((name) => reasonFor(name) !== undefined);
const selected = all.filter((name) => reasonFor(name) === undefined);

const missing = [...REQUIRES_DATA_ROOT.keys(), ...REQUIRES_MACOS_RUNNER.keys()].filter((name) => !all.includes(name));
if (missing.length > 0) {
  console.error(`Exclusion list names test files that no longer exist: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Running ${selected.length} of ${all.length} test files.`);
for (const name of excluded) console.log(`  skipped (${labelFor(name)}): ${name} - ${reasonFor(name)}`);

const result = spawnSync(process.execPath, ["--test", ...selected.map((name) => path.join("tests", name))], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
