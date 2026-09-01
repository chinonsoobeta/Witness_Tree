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
import { REQUIRES_DATA_ROOT, REQUIRES_MACOS_RUNNER } from "./lib/data-root-bound-tests.mjs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "tests");
// Discovery used to accept only .test.mjs, so the 54 TypeScript and TSX test
// files were never run by CI at all. They were not excluded for a stated
// reason; they simply fell outside the glob, which is the failure this runner
// was written to end. They run under tsx because Node can strip types but
// cannot transform JSX.
const all = readdirSync(dir).filter((name) => /\.test\.(mjs|ts|tsx)$/.test(name)).sort();
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

const inTests = (name) => path.join("tests", name);
const node = selected.filter((name) => name.endsWith(".test.mjs")).map(inTests);
const typed = selected.filter((name) => !name.endsWith(".test.mjs")).map(inTests);

// Both halves always run, and the exit status is the worst of the two: a
// failure in either must fail the job, and stopping at the first would hide
// how much else is broken.
let status = 0;
if (node.length > 0) {
  const result = spawnSync(process.execPath, ["--test", ...node], { cwd: root, stdio: "inherit" });
  status = result.status ?? 1;
}
if (typed.length > 0) {
  const tsx = path.join(root, "node_modules", ".bin", "tsx");
  const result = spawnSync(tsx, ["--test", ...typed], { cwd: root, stdio: "inherit" });
  status = status || (result.status ?? 1);
}
process.exit(status);
