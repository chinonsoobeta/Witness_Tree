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
import { mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
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
const unavailable = excluded.map((name) => ({ test: name, status: "unavailable", requirement: labelFor(name), reason: reasonFor(name), exitCode: null }));
for (const entry of unavailable) console.log(JSON.stringify(entry));

const inTests = (name) => path.join("tests", name);
const node = selected.filter((name) => name.endsWith(".test.mjs")).map(inTests);
const typed = selected.filter((name) => !name.endsWith(".test.mjs")).map(inTests);

// Both halves always run, and the exit status is the worst of the two: a
// failure in either must fail the job, and stopping at the first would hide
// how much else is broken.
let status = 0;
const segments = [];
const startedAt = new Date().toISOString();
function runSegment(command, files, kind) {
  const result = spawnSync(command, ["--test", "--test-reporter=tap", ...files], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  const skips = [...output.matchAll(/^\s*ok \d+ - (.+?) # SKIP(?: (.*))?$/gm)].map((match) => ({ name: match[1], reason: match[2] ?? "Test declared its own skip", status: "unavailable" }));
  segments.push({ kind, files: files.length, exitCode: result.status, status: result.status !== 0 ? "failed" : skips.length ? "unavailable" : "passed", unavailableSubtests: skips });
  return result.status ?? 1;
}
if (node.length > 0) {
  status = runSegment(process.execPath, node, "javascript");
}
if (typed.length > 0) {
  const tsx = path.join(root, "node_modules", ".bin", "tsx");
  const typedStatus = runSegment(tsx, typed, "typescript");
  status = status || typedStatus;
}
const outputDir = path.join(root, "outputs");
mkdirSync(outputDir, { recursive: true });
if (realpathSync(outputDir) !== path.join(realpathSync(root), "outputs")) throw new Error("Test receipt must remain in the repository");
const receipt = {
  schemaVersion: "witness-tree/portable-test-run/1", startedAt, completedAt: new Date().toISOString(),
  status: status ? "failed" : unavailable.length || segments.some((entry) => entry.status === "unavailable") ? "unavailable" : "passed",
  portableExecutionStatus: status ? "failed" : "passed", totalFiles: all.length, executedFiles: selected.length,
  unavailable, segments,
};
const output = path.join(outputDir, `test-run-${startedAt.replaceAll(":", "-")}.json`);
writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ status: receipt.status, portableExecutionStatus: receipt.portableExecutionStatus, unavailableFiles: unavailable.length, receipt: output }));
// CI's exit code describes the portable assertions only. The receipt explicitly
// reports the full suite as unavailable; it never substitutes for owner evidence.
process.exit(status);
