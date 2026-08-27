import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(".");
const script = resolve(root, "scripts/check-phase2-real-comparison-availability.mjs");

test("comparison availability remains non-numeric and non-causal", () => {
  assert.match(execFileSync("node", [script], { cwd: root, encoding: "utf8" }), /published nulls/);
});

test("comparison availability rejects a relative data-root override", () => {
  const result = spawnSync("node", [script], {
    cwd: root,
    env: { ...process.env, WITNESS_TREE_DATA_ROOT: "relative-data-root" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /absolute path/);
});

test("comparison availability rejects a symlink data-root override", () => {
  const directory = mkdtempSync(join(tmpdir(), "test-only-phase2-availability-root-"));
  const target = join(directory, "target");
  const link = join(directory, "link");
  mkdirSync(target);
  symlinkSync(target, link, "dir");
  try {
    const result = spawnSync("node", [script], {
      cwd: root,
      env: { ...process.env, WITNESS_TREE_DATA_ROOT: link },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /symlink|approved SSD root/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
