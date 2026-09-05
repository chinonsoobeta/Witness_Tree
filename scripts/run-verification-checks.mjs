import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ciPackageChecks } from "./check-ci-check-coverage.mjs";
import { classifyFailure, dataRootAvailable } from "./check-data-root-bound-checks.mjs";
import { resolveDataRoot } from "./data-root.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

export function checkOutcome({ name, exitCode, output, registry, dataRoot, attached }) {
  const entry = registry.find((item) => item.name === name);
  const failure = exitCode === 0 ? null : classifyFailure(output, dataRoot);
  // A real contradiction wins even if the same output also mentions absence.
  if (exitCode !== 0) return { name, status: failure === "data-root-unavailable" ? "unavailable" : "failed", exitCode, reason: failure };
  if (entry && !attached) {
    if (entry.whenDetached === "degrades" && output.includes(entry.announces)) {
      return { name, status: "unavailable", exitCode, reason: "The repository checks ran, but their external bytes were unavailable." };
    }
    return { name, status: "failed", exitCode, reason: "A registered data-root check passed without the required absence disclosure." };
  }
  return { name, status: "passed", exitCode, reason: null };
}

export function verificationSummary(results) {
  const counts = { passed: 0, failed: 0, unavailable: 0 };
  for (const result of results) {
    assert.ok(Object.hasOwn(counts, result.status));
    counts[result.status] += 1;
  }
  const status = counts.failed ? "failed" : counts.unavailable ? "unavailable" : "passed";
  return { status, counts, exitCode: status === "failed" ? 1 : status === "unavailable" ? 2 : 0 };
}

function main() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const registry = JSON.parse(readFileSync(new URL("../data/data-root-bound-checks.json", import.meta.url), "utf8")).checks;
  const names = process.argv.length > 2 ? process.argv.slice(2) : ciPackageChecks(ci);
  assert.ok(names.length > 0 && new Set(names).size === names.length, "Name each check once");
  for (const name of names) assert.ok(name.startsWith("check:") && Object.hasOwn(pkg.scripts, name), `Unknown check: ${name}`);
  const dataRoot = resolveDataRoot();
  const attached = dataRootAvailable(dataRoot);
  const outputDir = path.join(root, "outputs");
  mkdirSync(outputDir, { recursive: true });
  assert.equal(realpathSync(outputDir), path.join(realpathSync(root), "outputs"), "Receipt output must remain in the repository");
  const startedAt = new Date().toISOString();
  const results = [];
  for (const name of names) {
    const child = spawnSync("npm", ["run", "--silent", name], { cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
    const output = `${child.stdout ?? ""}${child.stderr ?? ""}`;
    const result = checkOutcome({ name, exitCode: child.status, output, registry, dataRoot, attached });
    // Full diagnostics are preserved locally; only status metadata is emitted.
    writeFileSync(path.join(outputDir, `check-${startedAt.replaceAll(":", "-")}-${name.replaceAll(":", "-")}.log`), output, { flag: "wx" });
    results.push(result);
    console.log(JSON.stringify(result));
  }
  const summary = verificationSummary(results);
  const receipt = { schemaVersion: "witness-tree/check-run/1", startedAt, completedAt: new Date().toISOString(), dataRoot, dataRootPresent: attached, ...summary, results };
  const output = path.join(outputDir, `check-run-${startedAt.replaceAll(":", "-")}.json`);
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ ...summary, receipt: output }));
  process.exitCode = summary.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
