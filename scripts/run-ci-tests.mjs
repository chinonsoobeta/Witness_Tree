// Runs the test suite that CI can actually run.
//
// CI ran four named test files and nothing else, so 190 test files could fail on
// `main` indefinitely. That is not hypothetical: flipping two exit criteria in #62
// left three tests pinning the old counts, and the pull request merged green.
//
// Almost the whole suite is data-independent. Only the files listed below read the
// Witness Tree data root, which exists on the owner's SSD and not on a runner. They
// are excluded by name, with the reason attached, so that the exclusion stays
// visible and reviewable instead of being implied by an absent glob.
//
// A file may be added here only because it needs the data root. Adding one because
// it fails is how a suite stops meaning anything.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRES_DATA_ROOT = new Map([
  ["phase1-owner-decision-queue.test.mjs", "Reads recorded artifacts under the data root to confirm the queue matches bytes on disk."],
  ["phase1-phase3-owner-approvals.test.mjs", "Resolves approval evidence paths through the data root."],
  ["wildfire-derived-readback.test.mjs", "Reads derived wildfire outputs from the data root."],
  ["federal-electoral-approved-promotion.test.mjs", "Resolves the approved data root at module load through approvedDataRootRealPath, and drives the promotion runner against it."],
  ["phase1-federal-electoral-output-verification.test.mjs", "Verifies the federal electoral GeoPackage under the data root, including a byte-for-byte deterministic regeneration."],
  ["phase1-nrcan-cover-processing-gate.test.mjs", "Profiles the NRCan canopy cover raster from the data root."],
  ["phase2-v21-expert-review-evidence.test.mjs", "Reads raw/nrcan-ca-forest-harvest-1985-2022 from the data root."],
  ["phase2-v21-real-review-packet-raster-readback-evidence.test.mjs", "Reads derived/phase2-v21-review-packet-v1 from the data root."],
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "tests");
const all = readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).sort();
const excluded = all.filter((name) => REQUIRES_DATA_ROOT.has(name));
const selected = all.filter((name) => !REQUIRES_DATA_ROOT.has(name));

const missing = [...REQUIRES_DATA_ROOT.keys()].filter((name) => !all.includes(name));
if (missing.length > 0) {
  console.error(`Exclusion list names test files that no longer exist: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Running ${selected.length} of ${all.length} test files.`);
for (const name of excluded) console.log(`  skipped (needs data root): ${name} - ${REQUIRES_DATA_ROOT.get(name)}`);

const result = spawnSync(process.execPath, ["--test", ...selected.map((name) => path.join("tests", name))], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
