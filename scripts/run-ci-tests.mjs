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

// Pull the file, code and message out of each TAP failure so a receipt can carry
// them. Returns one entry per `not ok`, in stream order, so it stays aligned with
// the names in failedSubtests even when a block is missing or malformed.
function describeFailures(output) {
  const lines = output.split("\n");
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = /^not ok \d+ - (.+)$/.exec(lines[index]);
    if (header === null) continue;
    const failure = { name: header[1], file: null, line: null, code: null, error: null };
    found.push(failure);
    if (lines[index + 1] !== "  ---") continue;
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor] !== "  ..." && !/^not ok \d+ - /.test(lines[cursor])) {
      const key = /^ {2}([A-Za-z]+): ?(.*)$/.exec(lines[cursor]);
      if (key === null) { cursor += 1; continue; }
      const [, name, rest] = key;
      if (name === "error" && rest.startsWith("|")) {
        const body = [];
        cursor += 1;
        while (cursor < lines.length && /^ {4}/.test(lines[cursor])) { body.push(lines[cursor].slice(4)); cursor += 1; }
        // Bound what a single failure can put in the receipt. A stack or a diff
        // can run for pages, and the opening lines are what names the cause.
        failure.error = body.join("\n").trimEnd().slice(0, 4000);
        continue;
      }
      const value = rest.replace(/^'(.*)'$/, "$1");
      if (name === "code") failure.code = value;
      // A one-line failure writes `error: 'spawnSync python3 ENOENT'` as a plain
      // scalar; only a multi-line one opens a literal. A spawn that is refused
      // outright takes the scalar form, which is the shape this was written for.
      if (name === "error") failure.error = value.slice(0, 4000);
      // location is an absolute path; the repo-relative one is what a reader can
      // open, and what the exclusion list and the test names are written in.
      if (name === "location") {
        const at = /^(.*?):(\d+):\d+$/.exec(value);
        failure.file = path.relative(root, at ? at[1] : value);
        failure.line = at ? Number(at[2]) : null;
      }
      cursor += 1;
    }
  }
  return found;
}

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
  // The TAP stream is the evidence, but it is also ten thousand lines long and
  // a reader has to find four of them. These are repeated in the summary at the
  // very end, where a log opens.
  const failed = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
  // The name alone is not enough to act on, for two reasons discovered the hard
  // way on 2026-09-20, when 23 tests failed together, passed on the next run,
  // and the receipt could say nothing but their names.
  //
  // First, the reporter gives every file's tests one flat numbering with no file
  // boundaries, so a name does not say which file failed; the name had to be
  // grepped back across 233 files to learn that the 23 were exactly the tests
  // that spawn `python3`. Second, the failure's own message, which for a spawned
  // worker carries the child's exit status and stderr, was never recorded
  // anywhere, so the one line that would have named the cause was gone.
  //
  // TAP puts both in the YAML block after `not ok`: `location` is the file and
  // line, `code` is the errno or assertion code, and `error` is the message. The
  // block runs from `  ---` to `  ...`. A multi-line message opens a literal with
  // `error: |-` that continues while the indent stays deeper than the keys; a
  // one-line one, which is what a refused spawn produces, is a plain scalar.
  const failures = describeFailures(output);
  // spawnSync reports a child that never produced a status separately: killed by
  // a signal, or refused to start. Both look like "exit 1" downstream, and both
  // mean something other than a failed assertion, so name which.
  const abnormal = result.status === null ? `${result.signal ? `killed by ${result.signal}` : "did not start"}${result.error ? `: ${result.error.message}` : ""}` : null;
  segments.push({ kind, files: files.length, exitCode: result.status, abnormal, status: result.status !== 0 ? "failed" : skips.length ? "unavailable" : "passed", unavailableSubtests: skips, failedSubtests: failed, failures });
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

/*
 * Say what failed, last, in a handful of lines.
 *
 * On 2026-09-20 a run failed in CI and the log held no `not ok` anywhere: the
 * TAP stream stopped mid-word partway through the first segment and the job
 * ended. Nothing had crashed. `process.exit()` was discarding the rest of a
 * large asynchronous write to the pipe, so CI could report that the suite had
 * failed but never which assertion, which is the one thing a failing suite is
 * for. Setting `exitCode` and returning lets the runtime drain stdout first.
 */
for (const segment of segments) {
  if (segment.status !== "failed") continue;
  console.error(`FAILED: ${segment.kind} segment, ${segment.files} files, exit ${segment.exitCode ?? "none"}${segment.abnormal ? ` (${segment.abnormal})` : ""}`);
  for (const failure of segment.failures) {
    console.error(`  not ok - ${failure.name}`);
    const where = failure.file ? `${failure.file}${failure.line ? `:${failure.line}` : ""}` : "unknown file";
    const first = (failure.error ?? "").split("\n").find((line) => line.trim().length > 0);
    console.error(`      ${where}${failure.code ? ` ${failure.code}` : ""}${first ? `: ${first.trim()}` : ""}`);
  }
  if (segment.failures.length === 0) console.error("  no failing assertion was reported, so the segment died rather than failing a test");
}

// CI's exit code describes the portable assertions only. The receipt explicitly
// reports the full suite as unavailable; it never substitutes for owner evidence.
process.exitCode = status;
